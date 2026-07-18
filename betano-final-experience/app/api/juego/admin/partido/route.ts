import { NextResponse } from "next/server";
import { createServer, createAdmin } from "@/lib/supabase";
import { fetchMatchSnapshot, getFixtureId } from "@/lib/juego/apifootball";

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
      .select("match_status, predictions_locked, kickoff_at, home_team, away_team, polling_owner, lock_expires_at, updated_at, fixture_id")
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
    fixture_id: st?.fixture_id || process.env.APIFOOTBALL_FIXTURE_ID || null,
  });
}

/**
 * POST /api/juego/admin/partido
 *   { action: "poll" | "lock" | "unlock" | "setFixture" | "reset" }
 *
 * poll       → ejecuta un ciclo de poll manual (sin restricción de kickoff_at),
 *              útil para verificar la integración con API-Football antes del partido.
 * lock       → cierra los pronósticos manualmente.
 * unlock     → reabre los pronósticos (sólo antes del partido).
 * setFixture → cambia el fixture ID { action: "setFixture", fixtureId: "123456" }
 * reset      → resetea predicciones, puntajes y snapshots para un nuevo partido.
 */
export async function POST(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  let body: { action?: string; fixtureId?: string };
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

  if (body.action === "setFixture") {
    const fixtureId = body.fixtureId?.trim();
    if (!fixtureId) {
      return NextResponse.json({ error: "Debes proporcionar un fixture ID." }, { status: 400 });
    }
    await admin
      .from("juego_match_state")
      .update({ fixture_id: fixtureId, updated_at: new Date().toISOString() })
      .eq("id", 1);
    return NextResponse.json({ ok: true, fixture_id: fixtureId });
  }

  if (body.action === "reset") {
    // Limpia TODO del partido anterior para empezar uno nuevo.
    // Se borran jugadores porque cada ronda/partido puede tener
    // participantes distintos (se registran por QR por evento).
    await Promise.all([
      admin.from("juego_predictions").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      admin.from("juego_player_scores").delete().neq("player_id", "00000000-0000-0000-0000-000000000000"),
      admin.from("juego_match_snapshots").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      admin.from("juego_players").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
    ]);
    // Resetear match_state (menos fixture_id que lo configura setFixture).
    await admin
      .from("juego_match_state")
      .update({
        match_status: "scheduled",
        predictions_locked: false,
        home_team: null,
        away_team: null,
        kickoff_at: null,
        polling_owner: null,
        lock_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    // Resetear el sorteo final (la auditoría en juego_final_runs se conserva).
    await admin
      .from("juego_final_result")
      .update({
        status: "idle",
        seed: null,
        max_winners: null,
        winners: [],
        tie_breaker_events: [],
        prizes: [],
        prize_assignments: [],
        prize_seed: null,
        raffled_at: null,
        executed_by: null,
        executed_at: null,
        revealed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    // Recalcular leaderboard (quedará vacío).
    await admin.rpc("juego_recompute_scores");

    // ── Resetear trivia: preguntas, respuestas, sorteos y config ──
    // Respuestas de los jugadores (se borran todas).
    await admin.from("juego_trivia_answers").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    // Correctas seteadas en vivo (Q9/Q10, resolución manual): vuelven a
    // "sin definir" — si sobreviven al reset, el próximo evento arrancaría
    // con una correcta marcada de la prueba anterior.
    const { data: manuales } = await admin
      .from("juego_trivia_questions")
      .select("id")
      .eq("requiere_resolucion_manual", true);
    if (manuales && manuales.length > 0) {
      await admin
        .from("juego_trivia_options")
        .update({ es_correcta: false })
        .in("question_id", manuales.map((m) => m.id));
    }
    // Preguntas: volver a su estado inicial.
    // Q1–Q9 → borrador, Q10 → abierta (cierra con kickoff).
    await admin
      .from("juego_trivia_questions")
      .update({
        status: "borrador",
        opened_at: null,
        closes_at: null,
        updated_at: new Date().toISOString(),
      })
      .neq("orden", 10);
    await admin
      .from("juego_trivia_questions")
      .update({
        status: "abierta",
        opened_at: null,
        closes_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("orden", 10);
    // Sorteos: volver a idle (sin seed, sin ganador).
    await admin
      .from("juego_trivia_draws")
      .update({
        status: "idle",
        seed: null,
        pool_snapshot: [],
        winner: null,
        es_consuelo: false,
        executed_by: null,
        executed_at: null,
        revealed_at: null,
        updated_at: new Date().toISOString(),
      })
      .neq("question_id", "00000000-0000-0000-0000-000000000000");
    // Config: limpiar kickoff.
    await admin
      .from("juego_trivia_config")
      .update({ kickoff_at: null, updated_at: new Date().toISOString() })
      .eq("id", 1);

    return NextResponse.json({ ok: true, reset: true });
  }

  if (body.action === "poll") {
    const fixtureId = await getFixtureId(admin);
    if (!fixtureId) {
      return NextResponse.json({ error: "No hay fixture ID configurado. Usa setFixture o define APIFOOTBALL_FIXTURE_ID." }, { status: 500 });
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
