/**
 * Tipos compartidos de la trivia (cliente + servidor).
 *
 * Espejo de las tablas de migracion-v8-trivia.sql. `es_correcta` es opcional
 * porque los endpoints de jugador la OMITEN mientras la pregunta está abierta
 * (anti-trampa); sólo el admin y las preguntas cerradas la reciben.
 */

import type { TieBreakerPlayer } from "@/lib/juego/winners";

export type TriviaQuestionStatus = "borrador" | "abierta" | "cerrada" | "sorteada";
export type TriviaDrawStatus = "idle" | "executed" | "revealed";
export type TriviaMomento = "pre" | "entretiempo" | "post";

export type TriviaOption = {
  id: string;
  question_id: string;
  etiqueta: string;
  orden: number;
  es_correcta?: boolean | null;
};

export type TriviaQuestion = {
  id: string;
  orden: number;
  texto: string;
  momento: TriviaMomento | null;
  premio_label: string | null;
  duration_seconds: number;
  requiere_resolucion_manual: boolean;
  cierra_con_kickoff: boolean;
  status: TriviaQuestionStatus;
  opened_at: string | null;
  closes_at: string | null;
  options: TriviaOption[];
};

export type TriviaDraw = {
  question_id: string;
  status: TriviaDrawStatus;
  seed: string | null;
  pool_snapshot: TieBreakerPlayer[];
  winner: TieBreakerPlayer | null;
  es_consuelo: boolean;
  executed_at: string | null;
  revealed_at: string | null;
};

/**
 * ¿La ventana de respuesta sigue vigente? El cierre real lo garantiza el
 * trigger de la DB por reloj del servidor; esto es el espejo para la UI
 * (deshabilitar botones, cronómetro) y para los endpoints.
 */
export function isQuestionOpen(
  q: Pick<TriviaQuestion, "status" | "closes_at">,
  now: number = Date.now()
): boolean {
  if (q.status !== "abierta") return false;
  if (q.closes_at == null) return true; // sin límite (Q10 antes de configurar kickoff)
  return now < new Date(q.closes_at).getTime();
}

/**
 * Qué pregunta destaca el proyector: la abierta; si no hay, la última con
 * actividad (cerrada/sorteada), con la correcta pintada para que el host la
 * comente.
 *
 * Cuando el host revela el sorteo de esa última, el bloque terminó y el
 * tablero cae a la pantalla de espera. Sólo se mira la ÚLTIMA: buscar hacia
 * atrás una sin revelar resucitaría en pantalla alguna que se cerró sin
 * sortear.
 */
export function pickFeaturedQuestion(
  questions: TriviaQuestion[],
  draws: Map<string, Pick<TriviaDraw, "status">>,
  now: number = Date.now()
): TriviaQuestion | undefined {
  const rest = questions.filter((q) => !q.cierra_con_kickoff);

  const open = rest.find((q) => isQuestionOpen(q, now));
  if (open) return open;

  const last = [...rest]
    .filter((q) => q.status === "cerrada" || q.status === "sorteada")
    .sort(
      (a, b) => new Date(b.opened_at ?? 0).getTime() - new Date(a.opened_at ?? 0).getTime()
    )[0];

  if (last && draws.get(last.id)?.status === "revealed") return undefined;
  return last;
}
