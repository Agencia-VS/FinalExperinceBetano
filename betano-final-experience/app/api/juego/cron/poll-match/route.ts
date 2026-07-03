import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchMatchSnapshot } from "@/lib/juego/apifootball";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const POLL_INTERVAL_MS = 15_000;
const MAX_RUN_MS = 4.5 * 60_000;
const LOCK_TTL_MIN = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const fixtureId = process.env.APIFOOTBALL_FIXTURE_ID;
  if (!fixtureId) {
    return NextResponse.json({ error: "Falta APIFOOTBALL_FIXTURE_ID." }, { status: 500 });
  }

  const admin = createAdmin();
  const ownerId = crypto.randomUUID();

  const { data: claimed, error: claimErr } = await admin.rpc("juego_try_claim_poll", {
    p_owner: ownerId,
    p_ttl_min: LOCK_TTL_MIN,
  });
  if (claimErr) {
    console.error("[poll-match] claim:", claimErr.message);
    return NextResponse.json({ error: "No se pudo tomar el lock." }, { status: 500 });
  }
  if (!claimed) return NextResponse.json({ skipped: "poller ya en ejecución" });

  const { data: st } = await admin
    .from("juego_match_state")
    .select("match_status, kickoff_at, predictions_locked")
    .eq("id", 1)
    .maybeSingle();
  if (st?.match_status === "finished") {
    await releaseLock(admin, ownerId);
    return NextResponse.json({ skipped: "partido finalizado" });
  }
  if (st?.kickoff_at && Date.now() < new Date(st.kickoff_at).getTime() - 30 * 60_000) {
    await releaseLock(admin, ownerId);
    return NextResponse.json({ skipped: "aún falta para el kickoff" });
  }

  const started = Date.now();
  let iterations = 0;
  let lastStatus = st?.match_status ?? "scheduled";
  // Track locally so we only write `predictions_locked = true` once per run.
  let alreadyLocked = st?.predictions_locked ?? false;

  while (Date.now() - started < MAX_RUN_MS) {
    iterations++;
    try {
      const snap = await fetchMatchSnapshot(fixtureId);
      const prevStatus = lastStatus;
      lastStatus = snap.match_status;

      const { home_team, away_team, kickoff_at, ...snapshotRow } = snap;
      await admin.from("juego_match_snapshots").insert(snapshotRow);

      // Lock whenever the match is live/in-progress and the flag is still false.
      // This covers both the normal scheduled→live transition AND the re-entry
      // case where a previous run set match_status but failed to set the lock.
      const shouldLock =
        !alreadyLocked &&
        snap.match_status !== "scheduled" &&
        snap.match_status !== "finished";
      if (shouldLock) alreadyLocked = true;

      await admin
        .from("juego_match_state")
        .update({
          match_status: snap.match_status,
          predictions_locked: shouldLock ? true : undefined,
          home_team,
          away_team,
          kickoff_at: kickoff_at ?? undefined,
          polling_owner: ownerId,
          lock_expires_at: new Date(Date.now() + LOCK_TTL_MIN * 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);

      const { error: rpcErr } = await admin.rpc("juego_recompute_scores");
      if (rpcErr) console.error("[poll-match] recompute:", rpcErr.message);

      console.info(
        `[poll-match] iter ${iterations} status=${snap.match_status} ` +
          `${snap.home_score}-${snap.away_score} corners=${snap.corners_total} ` +
          `am=${snap.yellow_cards_total} rj=${snap.red_cards_total}`
      );

      if (snap.match_status === "finished") break;
    } catch (e) {
      console.error(`[poll-match] iter ${iterations} error:`, (e as Error).message);
    }

    if (Date.now() - started + POLL_INTERVAL_MS >= MAX_RUN_MS) break;
    await sleep(POLL_INTERVAL_MS);
  }

  await releaseLock(admin, ownerId);
  return NextResponse.json({ ok: true, iterations, lastStatus });
}

async function releaseLock(admin: ReturnType<typeof createAdmin>, ownerId: string) {
  await admin
    .from("juego_match_state")
    .update({ polling_owner: null, lock_expires_at: null })
    .eq("id", 1)
    .eq("polling_owner", ownerId);
}
