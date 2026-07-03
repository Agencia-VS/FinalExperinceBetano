import { NextResponse } from "next/server";
import { createServer, createAdmin } from "@/lib/supabase";
import { fetchMatchSnapshot } from "@/lib/juego/apifootball";

async function requireAdmin() {
  const supabase = await createServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * GET /api/juego/admin/partido
 * Estado actual del partido: status, lock, kickoff, equipos, último snapshot.
 */
export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const admin = createAdmin();

  const [stateRes, snapshotRes] = await Promise.all([
    admin
      .from("juego_match_state")
      .select("match_status, predictions_locked, kickoff_at, home_team, away_team, polling_owner, lock_expires_at, updated_at")
      .eq("id", 1)
      .maybeSingle(),
    admin
      .from("juego_match_snapshots")
      .select("fetched_at, match_status, home_score, away_score, corners_total, yellow_cards_total, red_cards_total")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const st = stateRes.data;
  const pollingActive =
    !!st?.polling_owner &&
    !!st?.lock_expires_at &&
    new Date(st.lock_expires_at) > new Date();

  return NextResponse.json({
    match_status: st?.match_status ?? "scheduled",
    predictions_locked: st?.predictions_locked ?? false,
    kickoff_at: st?.kickoff_at ?? null,
    home_team: st?.home_team ?? null,
    away_team: st?.away_team ?? null,
    polling_active: pollingActive,
    last_snapshot: snapshotRes.data ?? null,
    fixture_id: process.env.APIFOOTBALL_FIXTURE_ID ?? null,
  });
}

/**
 * POST /api/juego/admin/partido  { action: "poll" | "lock" | "unlock" }
 *
 * poll   → ejecuta un ciclo de poll manual (sin restricción de kickoff_at),
 *          útil para verificar la integración con API-Football antes del partido.
 * lock   → cierra los pronósticos manualmente.
 * unlock → reabre los pronósticos (sólo antes del partido).
 */
export async function POST(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const admin = createAdmin();

  if (body.action === "lock" || body.action === "unlock") {
    const locked = body.action === "lock";
    await admin
      .from("juego_match_state")
      .update({ predictions_locked: locked, updated_at: new Date().toISOString() })
      .eq("id", 1);
    return NextResponse.json({ ok: true, predictions_locked: locked });
  }

  if (body.action === "poll") {
    const fixtureId = process.env.APIFOOTBALL_FIXTURE_ID;
    if (!fixtureId) {
      return NextResponse.json({ error: "Falta APIFOOTBALL_FIXTURE_ID en el entorno." }, { status: 500 });
    }

    let snap;
    try {
      snap = await fetchMatchSnapshot(fixtureId);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }

    const { home_team, away_team, kickoff_at, ...snapshotRow } = snap;
    await admin.from("juego_match_snapshots").insert(snapshotRow);

    const { data: st } = await admin
      .from("juego_match_state")
      .select("predictions_locked")
      .eq("id", 1)
      .maybeSingle();

    const shouldLock =
      !st?.predictions_locked &&
      snap.match_status !== "scheduled" &&
      snap.match_status !== "finished";

    await admin
      .from("juego_match_state")
      .update({
        match_status: snap.match_status,
        predictions_locked: shouldLock ? true : undefined,
        home_team,
        away_team,
        kickoff_at: kickoff_at ?? undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    const { error: rpcErr } = await admin.rpc("juego_recompute_scores");
    if (rpcErr) console.error("[admin/partido poll] recompute:", rpcErr.message);

    return NextResponse.json({
      ok: true,
      match_status: snap.match_status,
      home_score: snap.home_score,
      away_score: snap.away_score,
      predictions_locked: shouldLock ? true : (st?.predictions_locked ?? false),
    });
  }

  return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
}
