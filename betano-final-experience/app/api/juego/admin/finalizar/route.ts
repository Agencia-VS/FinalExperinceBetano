import { NextResponse } from "next/server";
import { createServer, createAdmin } from "@/lib/supabase";
import { calculateWinners, createSeededRng, type Winner } from "@/lib/juego/winners";
import { assignPrizes } from "@/lib/juego/prizes";
import type { Row } from "@/components/juego/RankingLive";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

const NO_PRIZES = {
  prizes: [],
  prize_assignments: [],
  prize_seed: null,
  raffled_at: null,
};

const IDLE_ROW = {
  status: "idle",
  seed: null,
  max_winners: null,
  winners: [],
  tie_breaker_events: [],
  executed_by: null,
  executed_at: null,
  revealed_at: null,
  ...NO_PRIZES,
};

/**
 * GET /api/juego/admin/finalizar
 * Estado del sorteo final + últimas ejecuciones (auditoría) para el dashboard.
 */
export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const admin = createAdmin();
  const [resultRes, runsRes] = await Promise.all([
    admin.from("juego_final_result").select("*").eq("id", 1).maybeSingle(),
    admin
      .from("juego_final_runs")
      .select("id, seed, max_winners, executed_at, undone_at")
      .order("executed_at", { ascending: false })
      .limit(5),
  ]);

  return NextResponse.json({
    finalResult: resultRes.data ?? null,
    runs: runsRes.data ?? [],
  });
}

/**
 * POST /api/juego/admin/finalizar
 *   { action: "execute", maxWinners: number, force?: boolean }
 *   { action: "reveal" }
 *   { action: "undo" }
 *
 * execute → recalcula el ranking, sortea desempates en el servidor con
 *           semilla registrada (auditable en juego_final_runs) y publica
 *           el resultado: la fila juego_final_result pasa a 'executed' y
 *           Realtime dispara la ruleta en todas las pantallas.
 * reveal  → marca 'revealed': quien cargue después salta la animación y
 *           ve el podio directo. No afecta a quien ya la está viendo.
 * undo    → vuelve a 'idle' (los overlays se desmontan en vivo). El run
 *           queda en la auditoría con undone_at.
 */
export async function POST(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  let body: {
    action?: string;
    maxWinners?: number;
    force?: boolean;
    prizes?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const admin = createAdmin();

  if (body.action === "execute") {
    const maxWinners = body.maxWinners;
    if (!Number.isInteger(maxWinners) || maxWinners! < 1 || maxWinners! > 100) {
      return NextResponse.json(
        { error: "maxWinners debe ser un entero entre 1 y 100." },
        { status: 400 }
      );
    }

    const { data: st } = await admin
      .from("juego_match_state")
      .select("match_status")
      .eq("id", 1)
      .maybeSingle();
    if (st?.match_status !== "finished" && !body.force) {
      return NextResponse.json(
        { error: "El partido no está finalizado.", needsForce: true },
        { status: 409 }
      );
    }

    // Ranking fresco en el momento decisivo.
    const { error: rpcErr } = await admin.rpc("juego_recompute_scores");
    if (rpcErr) {
      return NextResponse.json(
        { error: `No se pudo recalcular el ranking: ${rpcErr.message}` },
        { status: 500 }
      );
    }

    const { data: cache } = await admin
      .from("juego_leaderboard_cache")
      .select("ranking")
      .eq("id", 1)
      .maybeSingle();
    const ranking = (cache?.ranking as Row[] | null) ?? [];
    if (ranking.length === 0) {
      return NextResponse.json({ error: "No hay jugadores en el ranking." }, { status: 400 });
    }

    const seed = crypto.randomUUID();
    const result = calculateWinners(ranking, maxWinners!, createSeededRng(seed));

    // Auditoría primero: si lo demás falla, el run queda registrado igual.
    const { error: runErr } = await admin.from("juego_final_runs").insert({
      seed,
      max_winners: maxWinners,
      ranking_snapshot: ranking,
      winners: result.winners,
      tie_breaker_events: result.tieBreakerEvents,
      executed_by: user.id,
    });
    if (runErr) {
      return NextResponse.json(
        { error: `No se pudo registrar la auditoría: ${runErr.message}` },
        { status: 500 }
      );
    }

    // UPDATE condicional: sólo desde 'idle' → a prueba de doble click y
    // de ejecuciones concurrentes. Este UPDATE dispara Realtime.
    const { data: updated, error: updErr } = await admin
      .from("juego_final_result")
      .update({
        status: "executed",
        seed,
        max_winners: maxWinners,
        winners: result.winners,
        tie_breaker_events: result.tieBreakerEvents,
        executed_by: user.id,
        executed_at: new Date().toISOString(),
        revealed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1)
      .eq("status", "idle")
      .select();
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json(
        { error: "Ya hay un sorteo ejecutado. Deshazlo primero." },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      seed,
      maxWinners,
      winners: result.winners,
      tieBreakerEvents: result.tieBreakerEvents,
    });
  }

  if (body.action === "reveal") {
    const { data: updated } = await admin
      .from("juego_final_result")
      .update({ status: "revealed", revealed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", 1)
      .eq("status", "executed")
      .select();
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: "No hay un sorteo ejecutado por revelar." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, revealed: true });
  }

  if (body.action === "undo") {
    const { data: current } = await admin
      .from("juego_final_result")
      .select("status")
      .eq("id", 1)
      .maybeSingle();
    if (!current || current.status === "idle") {
      return NextResponse.json({ error: "No hay un sorteo que deshacer." }, { status: 409 });
    }

    // Marca el último run vigente como deshecho (la auditoría no se borra).
    const { data: lastRun } = await admin
      .from("juego_final_runs")
      .select("id")
      .is("undone_at", null)
      .order("executed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastRun) {
      await admin
        .from("juego_final_runs")
        .update({ undone_at: new Date().toISOString() })
        .eq("id", lastRun.id);
    }

    await admin
      .from("juego_final_result")
      .update({ ...IDLE_ROW, updated_at: new Date().toISOString() })
      .eq("id", 1);

    return NextResponse.json({ ok: true, undone: true });
  }

  if (body.action === "saveCatalog") {
    const prizes = (body.prizes ?? []).map((s) => String(s).trim()).filter(Boolean);
    const { error } = await admin
      .from("juego_prize_catalog")
      .upsert({ id: 1, prizes, updated_at: new Date().toISOString() });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, prizes });
  }

  if (body.action === "rafflePrizes") {
    // Sólo tras revelar los ganadores de la Fase 1 (fuerza ejecutar → revelar
    // → premios) y sólo una vez (raffled_at null).
    const { data: fr } = await admin
      .from("juego_final_result")
      .select("status, winners, raffled_at")
      .eq("id", 1)
      .maybeSingle();
    if (!fr || fr.status !== "revealed") {
      return NextResponse.json(
        { error: "Primero marca el sorteo como revelado." },
        { status: 409 }
      );
    }
    if (fr.raffled_at) {
      return NextResponse.json({ error: "Los premios ya fueron sorteados." }, { status: 409 });
    }

    const winners = (fr.winners as Winner[] | null) ?? [];

    // Los premios llegan en el body o, si no, desde el catálogo preconfigurado.
    let prizeNames = (body.prizes ?? []).map((s) => String(s).trim()).filter(Boolean);
    if (prizeNames.length === 0) {
      const { data: cat } = await admin
        .from("juego_prize_catalog")
        .select("prizes")
        .eq("id", 1)
        .maybeSingle();
      prizeNames = ((cat?.prizes as string[] | null) ?? [])
        .map((s) => String(s).trim())
        .filter(Boolean);
    }
    if (prizeNames.length < winners.length) {
      return NextResponse.json(
        {
          error: `Hacen falta al menos ${winners.length} premios (hay ${prizeNames.length}). Agrega más al catálogo.`,
        },
        { status: 400 }
      );
    }

    // Si sobran premios, se disputan sólo los N más valiosos (los primeros).
    const chosen = prizeNames.slice(0, winners.length);
    const prizeSeed = crypto.randomUUID();
    const prizes = chosen.map((name, i) => ({ rank: i + 1, name }));
    const result = assignPrizes(winners, prizes, createSeededRng(prizeSeed));

    // Auditoría primero (append-only, fuera de Realtime).
    const { error: runErr } = await admin.from("juego_prize_runs").insert({
      prize_seed: prizeSeed,
      winners_snapshot: winners,
      prizes: result.prizes,
      prize_assignments: result.assignments,
      executed_by: user.id,
    });
    if (runErr) {
      return NextResponse.json(
        { error: `No se pudo registrar la auditoría: ${runErr.message}` },
        { status: 500 }
      );
    }

    // UPDATE condicional (raffled_at null) → a prueba de doble click. Dispara Realtime.
    const { data: updated, error: updErr } = await admin
      .from("juego_final_result")
      .update({
        prizes: result.prizes,
        prize_assignments: result.assignments,
        prize_seed: prizeSeed,
        raffled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1)
      .eq("status", "revealed")
      .is("raffled_at", null)
      .select();
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: "Los premios ya fueron sorteados." }, { status: 409 });
    }

    return NextResponse.json({ ok: true, prizeSeed, assignments: result.assignments });
  }

  if (body.action === "undoPrizes") {
    const { data: current } = await admin
      .from("juego_final_result")
      .select("raffled_at")
      .eq("id", 1)
      .maybeSingle();
    if (!current || !current.raffled_at) {
      return NextResponse.json({ error: "No hay premios que deshacer." }, { status: 409 });
    }

    const { data: lastRun } = await admin
      .from("juego_prize_runs")
      .select("id")
      .is("undone_at", null)
      .order("executed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastRun) {
      await admin
        .from("juego_prize_runs")
        .update({ undone_at: new Date().toISOString() })
        .eq("id", lastRun.id);
    }

    await admin
      .from("juego_final_result")
      .update({ ...NO_PRIZES, updated_at: new Date().toISOString() })
      .eq("id", 1);

    return NextResponse.json({ ok: true, undone: true });
  }

  return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
}
