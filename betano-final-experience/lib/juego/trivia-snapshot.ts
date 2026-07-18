import { fetchAllRows, type createAdmin } from "@/lib/supabase";

/**
 * Snapshot público de la trivia — compartido por el SSR de /juego/trivia,
 * /juego/tv y el endpoint de poll /api/juego/trivia/estado.
 *
 * Reglas de exposición (anti-trampa / anti-spoiler):
 *  · Preguntas en 'borrador' NO se incluyen (Q1–9 aparecen recién cuando el
 *    host las abre; tampoco se filtra su texto antes de tiempo).
 *  · es_correcta se OMITE mientras la pregunta está 'abierta'.
 *  · serverNow permite corregir el desfase de reloj del cliente para que el
 *    cronómetro de 90s sea consistente en toda la sala.
 */
export async function getTriviaSnapshot(admin: ReturnType<typeof createAdmin>) {
  const [qRes, oRes, dRes, cRes, aRows] = await Promise.all([
    admin
      .from("juego_trivia_questions")
      .select(
        "id, orden, texto, momento, premio_label, duration_seconds, requiere_resolucion_manual, cierra_con_kickoff, status, opened_at, closes_at"
      )
      .neq("status", "borrador")
      .order("orden"),
    admin.from("juego_trivia_options").select("id, question_id, etiqueta, orden, es_correcta"),
    admin
      .from("juego_trivia_draws")
      .select(
        "question_id, status, seed, pool_snapshot, winner, es_consuelo, executed_at, revealed_at"
      ),
    admin.from("juego_trivia_config").select("kickoff_at").eq("id", 1).maybeSingle(),
    // El contador es cosmético: ante un error transitorio preferimos 0 por un
    // ciclo de poll antes que tirar abajo el SSR/estado de toda la sala.
    fetchAllRows<{ question_id: string }>((from, to) =>
      admin.from("juego_trivia_answers").select("question_id").order("id").range(from, to)
    ).catch(() => [] as { question_id: string }[]),
  ]);

  const totals = new Map<string, number>();
  for (const a of aRows) {
    totals.set(a.question_id, (totals.get(a.question_id) ?? 0) + 1);
  }

  const visibleIds = new Set((qRes.data ?? []).map((q) => q.id));
  const questions = (qRes.data ?? []).map((q) => ({
    ...q,
    options: (oRes.data ?? [])
      .filter((o) => o.question_id === q.id)
      .sort((a, b) => a.orden - b.orden)
      .map((o) =>
        q.status === "abierta"
          ? { id: o.id, question_id: o.question_id, etiqueta: o.etiqueta, orden: o.orden }
          : o
      ),
    total_respuestas: totals.get(q.id) ?? 0,
  }));

  return {
    serverNow: new Date().toISOString(),
    kickoffAt: cRes.data?.kickoff_at ?? null,
    questions,
    draws: (dRes.data ?? []).filter((d) => visibleIds.has(d.question_id)),
  };
}
