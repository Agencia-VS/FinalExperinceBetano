import { NextResponse } from "next/server";
import { createServer, createAdmin } from "@/lib/supabase";
import { createSeededRng } from "@/lib/juego/winners";
import { pickTriviaWinner, type TriviaPoolPlayer } from "@/lib/juego/trivia-draw";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * POST /api/juego/admin/trivia/sorteo
 *   { questionId, action: "execute", force?: boolean }
 *   { questionId, action: "reveal" }
 *   { questionId, action: "undo" }
 *
 * execute → congela el pool (quienes respondieron BIEN esa pregunta),
 *           sortea 1 ganador en el servidor con semilla registrada
 *           (auditable en juego_trivia_draw_runs) y publica: la fila de
 *           juego_trivia_draws pasa a 'executed' → Realtime dispara la
 *           ruleta en todas las pantallas. Si NADIE acertó, cae en modo
 *           CONSUELO: el pool pasa a ser todos los jugadores registrados
 *           y el sorteo queda marcado es_consuelo=true.
 * reveal  → 'revealed': quien cargue después ve el ganador sin animación.
 * undo    → la fila del sorteo vuelve a 'idle' y la pregunta a 'cerrada'.
 *           El run queda en la auditoría con undone_at.
 */
export async function POST(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  let body: { questionId?: string; action?: string; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const questionId = String(body.questionId ?? "");
  if (!questionId) return NextResponse.json({ error: "Falta questionId." }, { status: 400 });

  const admin = createAdmin();
  const { data: q } = await admin
    .from("juego_trivia_questions")
    .select("id, orden, status, closes_at, requiere_resolucion_manual")
    .eq("id", questionId)
    .maybeSingle();
  if (!q) return NextResponse.json({ error: "Pregunta no encontrada." }, { status: 404 });

  const now = new Date();

  if (body.action === "execute") {
    if (q.status === "borrador") {
      return NextResponse.json(
        { error: "La pregunta nunca se abrió; ábrela y ciérrala antes de sortear." },
        { status: 409 }
      );
    }
    if (q.status === "sorteada") {
      return NextResponse.json(
        { error: "Esta pregunta ya fue sorteada. Deshazla primero." },
        { status: 409 }
      );
    }
    // Sigue abierta por reloj → confirmar antes de cortar el juego a la sala.
    const stillOpen =
      q.status === "abierta" && (q.closes_at == null || now < new Date(q.closes_at));
    if (stillOpen && !body.force) {
      return NextResponse.json(
        { error: "La pregunta sigue abierta.", needsForce: true },
        { status: 409 }
      );
    }

    // La correcta debe estar definida (Q9/Q10 se setean en vivo desde el panel).
    const { data: correctOpts } = await admin
      .from("juego_trivia_options")
      .select("id")
      .eq("question_id", questionId)
      .eq("es_correcta", true);
    const correctIds = new Set((correctOpts ?? []).map((o) => o.id));
    if (correctIds.size === 0) {
      return NextResponse.json(
        {
          error: q.requiere_resolucion_manual
            ? "Setea la respuesta correcta antes de sortear (pregunta de resolución en vivo)."
            : "Esta pregunta no tiene respuesta correcta definida.",
        },
        { status: 409 }
      );
    }

    // Pool: jugadores que respondieron bien. Vacío ⇒ consuelo (todos).
    const { data: answers } = await admin
      .from("juego_trivia_answers")
      .select("player_id, option_id")
      .eq("question_id", questionId);
    const correctPlayerIds = (answers ?? [])
      .filter((a) => correctIds.has(a.option_id))
      .map((a) => a.player_id);

    let esConsuelo = false;
    let pool: TriviaPoolPlayer[] = [];
    if (correctPlayerIds.length > 0) {
      const { data: players } = await admin
        .from("juego_players")
        .select("id, alias, avatar")
        .in("id", correctPlayerIds);
      pool = (players ?? []).map((p) => ({
        player_id: p.id,
        alias: p.alias,
        avatar: p.avatar ?? null,
        puntos: 0,
      }));
    } else {
      esConsuelo = true;
      const { data: players } = await admin
        .from("juego_players")
        .select("id, alias, avatar");
      pool = (players ?? []).map((p) => ({
        player_id: p.id,
        alias: p.alias,
        avatar: p.avatar ?? null,
        puntos: 0,
      }));
    }
    if (pool.length === 0) {
      return NextResponse.json(
        { error: "No hay jugadores registrados para sortear." },
        { status: 400 }
      );
    }

    const seed = crypto.randomUUID();
    const winner = pickTriviaWinner(pool, createSeededRng(seed));

    // Auditoría primero: si lo demás falla, el run queda registrado igual.
    const { error: runErr } = await admin.from("juego_trivia_draw_runs").insert({
      question_id: questionId,
      seed,
      pool_snapshot: pool,
      winner,
      es_consuelo: esConsuelo,
      executed_by: user.id,
    });
    if (runErr) {
      return NextResponse.json(
        { error: `No se pudo registrar la auditoría: ${runErr.message}` },
        { status: 500 }
      );
    }

    // UPDATE condicional: sólo desde 'idle' → a prueba de doble click.
    // Este UPDATE dispara Realtime (la ruleta arranca en las pantallas).
    const { data: updated, error: updErr } = await admin
      .from("juego_trivia_draws")
      .update({
        status: "executed",
        seed,
        pool_snapshot: pool,
        winner,
        es_consuelo: esConsuelo,
        executed_by: user.id,
        executed_at: now.toISOString(),
        revealed_at: null,
        updated_at: now.toISOString(),
      })
      .eq("question_id", questionId)
      .eq("status", "idle")
      .select();
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    if (!updated || updated.length === 0) {
      return NextResponse.json(
        { error: "Esta pregunta ya tiene un sorteo en curso. Deshazlo primero." },
        { status: 409 }
      );
    }

    // La pregunta queda sellada como sorteada (cierra también si seguía abierta).
    await admin
      .from("juego_trivia_questions")
      .update({
        status: "sorteada",
        closes_at: stillOpen ? now.toISOString() : q.closes_at,
        updated_at: now.toISOString(),
      })
      .eq("id", questionId);

    return NextResponse.json({
      ok: true,
      seed,
      winner,
      esConsuelo,
      poolSize: pool.length,
    });
  }

  if (body.action === "reveal") {
    const { data: updated } = await admin
      .from("juego_trivia_draws")
      .update({
        status: "revealed",
        revealed_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("question_id", questionId)
      .eq("status", "executed")
      .select();
    if (!updated || updated.length === 0) {
      return NextResponse.json(
        { error: "No hay un sorteo ejecutado por revelar en esta pregunta." },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true, revealed: true });
  }

  if (body.action === "undo") {
    const { data: draw } = await admin
      .from("juego_trivia_draws")
      .select("status")
      .eq("question_id", questionId)
      .maybeSingle();
    if (!draw || draw.status === "idle") {
      return NextResponse.json({ error: "No hay un sorteo que deshacer." }, { status: 409 });
    }

    // Marca el último run vigente de ESTA pregunta (la auditoría no se borra).
    const { data: lastRun } = await admin
      .from("juego_trivia_draw_runs")
      .select("id")
      .eq("question_id", questionId)
      .is("undone_at", null)
      .order("executed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastRun) {
      await admin
        .from("juego_trivia_draw_runs")
        .update({ undone_at: now.toISOString() })
        .eq("id", lastRun.id);
    }

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
        updated_at: now.toISOString(),
      })
      .eq("question_id", questionId);

    // La pregunta vuelve a 'cerrada' (lista para re-sortear o reabrir).
    await admin
      .from("juego_trivia_questions")
      .update({ status: "cerrada", updated_at: now.toISOString() })
      .eq("id", questionId)
      .eq("status", "sorteada");

    return NextResponse.json({ ok: true, undone: true });
  }

  return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
}
