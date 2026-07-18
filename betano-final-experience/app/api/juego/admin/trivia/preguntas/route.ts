import { NextResponse } from "next/server";
import { createServer, createAdmin, fetchAllRows } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * GET /api/juego/admin/trivia/preguntas
 * Todas las preguntas con opciones (incluye es_correcta: es el admin),
 * conteo de respuestas por opción y estado del sorteo de cada una.
 */
export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const admin = createAdmin();
  const [qRes, oRes, aRows, dRes, cRes] = await Promise.all([
    admin.from("juego_trivia_questions").select("*").order("orden"),
    admin.from("juego_trivia_options").select("*").order("orden"),
    fetchAllRows<{ question_id: string; option_id: string }>((from, to) =>
      admin.from("juego_trivia_answers").select("question_id, option_id").order("id").range(from, to)
    ),
    admin.from("juego_trivia_draws").select("*"),
    admin.from("juego_trivia_config").select("kickoff_at").eq("id", 1).maybeSingle(),
  ]);

  const counts = new Map<string, number>(); // por opción
  const totals = new Map<string, number>(); // por pregunta
  for (const a of aRows) {
    counts.set(a.option_id, (counts.get(a.option_id) ?? 0) + 1);
    totals.set(a.question_id, (totals.get(a.question_id) ?? 0) + 1);
  }

  const questions = (qRes.data ?? []).map((q) => ({
    ...q,
    options: (oRes.data ?? [])
      .filter((o) => o.question_id === q.id)
      .map((o) => ({ ...o, respuestas: counts.get(o.id) ?? 0 })),
    total_respuestas: totals.get(q.id) ?? 0,
    draw: (dRes.data ?? []).find((d) => d.question_id === q.id) ?? null,
  }));

  return NextResponse.json({ questions, kickoffAt: cRes.data?.kickoff_at ?? null });
}

/**
 * POST /api/juego/admin/trivia/preguntas
 *   { texto, momento?, premioLabel?, durationSeconds?, orden?,
 *     options: [{ etiqueta, esCorrecta? }] }
 * Crea la pregunta + opciones + su fila de sorteo (los clientes escuchan
 * eventos UPDATE de Realtime, así que la fila debe existir de antemano).
 */
export async function POST(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const texto = String(body.texto ?? "").trim();
  if (texto.length < 5) return NextResponse.json({ error: "Escribe la pregunta." }, { status: 400 });

  const rawOptions: any[] = Array.isArray(body.options) ? body.options : [];
  const options = rawOptions
    .map((o, i) => ({ etiqueta: String(o.etiqueta ?? "").trim(), es_correcta: !!o.esCorrecta, orden: i + 1 }))
    .filter((o) => o.etiqueta.length > 0);
  if (options.length < 2) {
    return NextResponse.json({ error: "Se necesitan al menos 2 alternativas." }, { status: 400 });
  }

  const admin = createAdmin();

  let orden = Number(body.orden);
  if (!Number.isInteger(orden) || orden < 1) {
    const { data: max } = await admin
      .from("juego_trivia_questions")
      .select("orden")
      .order("orden", { ascending: false })
      .limit(1)
      .maybeSingle();
    orden = (max?.orden ?? 0) + 1;
  }

  const durationSeconds = Number(body.durationSeconds);
  const { data: q, error: qErr } = await admin
    .from("juego_trivia_questions")
    .insert({
      orden,
      texto,
      momento: body.momento ?? null,
      premio_label: body.premioLabel ? String(body.premioLabel).trim() : null,
      duration_seconds:
        Number.isInteger(durationSeconds) && durationSeconds >= 10 ? durationSeconds : 90,
      requiere_resolucion_manual: !!body.requiereResolucionManual,
    })
    .select("id")
    .single();
  if (qErr) {
    const msg = qErr.code === "23505" ? `Ya existe una pregunta con orden ${orden}.` : qErr.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { error: oErr } = await admin
    .from("juego_trivia_options")
    .insert(options.map((o) => ({ ...o, question_id: q.id })));
  if (oErr) {
    await admin.from("juego_trivia_questions").delete().eq("id", q.id);
    return NextResponse.json({ error: oErr.message }, { status: 500 });
  }

  await admin.from("juego_trivia_draws").insert({ question_id: q.id });

  return NextResponse.json({ ok: true, questionId: q.id });
}

/**
 * PATCH /api/juego/admin/trivia/preguntas
 *   { questionId, texto?, momento?, premioLabel?, durationSeconds?, orden?,
 *     correctOptionId? }
 * correctOptionId cubre el "setear correcta" en vivo de Q9/Q10: apaga
 * es_correcta en todas las opciones de la pregunta y la enciende en una.
 * Bloqueado si la pregunta ya fue sorteada (no tiene sentido y rompería
 * la auditoría del pool).
 */
export async function PATCH(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  let body: any;
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
    .select("id, status")
    .eq("id", questionId)
    .maybeSingle();
  if (!q) return NextResponse.json({ error: "Pregunta no encontrada." }, { status: 404 });
  if (q.status === "sorteada") {
    return NextResponse.json(
      { error: "La pregunta ya fue sorteada. Deshaz el sorteo antes de editarla." },
      { status: 409 }
    );
  }

  if (body.correctOptionId === null) {
    // Quitar la correcta: la pregunta vuelve a "sin resolver" (Q9/Q10
    // marcadas por error en pruebas o en vivo). No toca las respuestas.
    const { error } = await admin
      .from("juego_trivia_options")
      .update({ es_correcta: false })
      .eq("question_id", questionId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (body.correctOptionId != null) {
    const correctOptionId = String(body.correctOptionId);
    const { data: opt } = await admin
      .from("juego_trivia_options")
      .select("id")
      .eq("id", correctOptionId)
      .eq("question_id", questionId)
      .maybeSingle();
    if (!opt) {
      return NextResponse.json({ error: "La opción no pertenece a esta pregunta." }, { status: 400 });
    }
    await admin.from("juego_trivia_options").update({ es_correcta: false }).eq("question_id", questionId);
    await admin.from("juego_trivia_options").update({ es_correcta: true }).eq("id", correctOptionId);
  }

  const patch: Record<string, unknown> = {};
  if (body.texto != null && String(body.texto).trim().length >= 5) patch.texto = String(body.texto).trim();
  if (body.momento !== undefined) patch.momento = body.momento || null;
  if (body.premioLabel !== undefined)
    patch.premio_label = body.premioLabel ? String(body.premioLabel).trim() : null;
  if (body.durationSeconds != null) {
    const d = Number(body.durationSeconds);
    if (Number.isInteger(d) && d >= 10 && d <= 3600) patch.duration_seconds = d;
  }
  if (body.orden != null && Number.isInteger(Number(body.orden))) patch.orden = Number(body.orden);

  if (Object.keys(patch).length > 0) {
    patch.updated_at = new Date().toISOString();
    const { error } = await admin.from("juego_trivia_questions").update(patch).eq("id", questionId);
    if (error) {
      const msg = error.code === "23505" ? "Ya existe una pregunta con ese orden." : error.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/juego/admin/trivia/preguntas  { questionId }
 * Elimina pregunta + opciones + respuestas + sorteo (cascada). Bloqueado
 * si ya fue sorteada (la auditoría en juego_trivia_draw_runs sobrevive
 * igual, pero borrar una pregunta premiada en caliente sería un error).
 */
export async function DELETE(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  let body: any;
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
    .select("status")
    .eq("id", questionId)
    .maybeSingle();
  if (!q) return NextResponse.json({ error: "Pregunta no encontrada." }, { status: 404 });
  if (q.status === "sorteada") {
    return NextResponse.json(
      { error: "La pregunta ya fue sorteada; deshaz el sorteo antes de eliminarla." },
      { status: 409 }
    );
  }

  await admin.from("juego_trivia_questions").delete().eq("id", questionId);
  return NextResponse.json({ ok: true });
}
