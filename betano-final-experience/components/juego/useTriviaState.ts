"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowser } from "@/lib/supabase-browser";
import type { TriviaDraw, TriviaQuestion } from "@/lib/juego/trivia";

/** Snapshot de /api/juego/trivia/estado (también usado para el SSR inicial). */
export type TriviaSnapshot = {
  serverNow: string;
  kickoffAt: string | null;
  questions: (TriviaQuestion & { total_respuestas: number })[];
  draws: TriviaDraw[];
};

/** Un 'executed' más viejo que esto al cargar la página se muestra como
 *  resultado directo, sin replay de la ruleta (mismo criterio que el final). */
const STALE_EXECUTED_MS = 5 * 60_000;

/**
 * Estado vivo de la trivia. Realtime como CAMPANA, la API como FUENTE:
 * cualquier cambio en juego_trivia_questions/juego_trivia_draws dispara un
 * refetch inmediato de /api/juego/trivia/estado (es lo que resuelve, entre
 * otras cosas, que una pregunta recién abierta llegue CON sus opciones y
 * que es_correcta aparezca recién al cerrar), más un poll de respaldo por
 * si el websocket se cae. A diferencia de useFinalReveal (una sola fila),
 * acá hay N sorteos independientes → cola de reveals para no solapar
 * animaciones si dos llegan casi juntos.
 *
 * Abrir una pregunta NUEVA descarta cualquier reveal en pantalla: si el
 * host ya avanzó el show, teléfonos y TV lo siguen.
 */
export function useTriviaState(
  initial: TriviaSnapshot | null,
  { pollMs = 30_000 }: { pollMs?: number } = {}
): {
  questions: TriviaSnapshot["questions"];
  draws: Map<string, TriviaDraw>;
  kickoffAt: string | null;
  /** serverNow - Date.now() al momento del snapshot: corrige el reloj del
   *  teléfono para que el cronómetro de 90s sea consistente en la sala. */
  serverOffsetMs: number;
  /** Sorteo a dramatizar ahora (cabeza de la cola) o null. */
  activeReveal: { question: TriviaQuestion; draw: TriviaDraw } | null;
  /** true si el reveal activo se cargó tarde (sin replay de animación). */
  skipAnimation: boolean;
  dismissReveal: () => void;
} {
  const [snapshot, setSnapshot] = useState<TriviaSnapshot | null>(initial);
  // Offset fijado al momento de RECIBIR cada snapshot (no en el render: el
  // snapshot envejece pero la diferencia servidor-cliente es constante).
  const [serverOffsetMs, setServerOffsetMs] = useState(() =>
    initial ? new Date(initial.serverNow).getTime() - Date.now() : 0
  );
  const [queue, setQueue] = useState<{ questionId: string; skip: boolean }[]>(() => {
    if (!initial) return [];
    // Un sorteo fresco (ejecutado hace <5 min y sin revelar) se anima aunque
    // la página haya cargado después del click del admin.
    return initial.draws
      .filter(
        (d) =>
          d.status === "executed" &&
          d.executed_at != null &&
          Date.now() - new Date(d.executed_at).getTime() <= STALE_EXECUTED_MS
      )
      .map((d) => ({ questionId: d.question_id, skip: false }));
  });
  const seenSeeds = useRef<Map<string, string | null>>(
    new Map((initial?.draws ?? []).map((d) => [d.question_id, d.seed]))
  );
  const openedAt = useRef<Map<string, string | null>>(
    new Map((initial?.questions ?? []).map((q) => [q.id, q.opened_at]))
  );

  useEffect(() => {
    let disposed = false;
    let fetching = false;

    const apply = (snap: TriviaSnapshot) => {
      // Sorteos: detectar ejecuciones nuevas (semilla distinta) → encolar.
      const additions: { questionId: string; skip: boolean }[] = [];
      const undone = new Set<string>();
      for (const d of snap.draws) {
        const prevSeed = seenSeeds.current.get(d.question_id) ?? null;
        if (d.status === "idle") {
          // Undo del admin: el overlay de esa pregunta desaparece.
          if (prevSeed != null) undone.add(d.question_id);
          seenSeeds.current.set(d.question_id, null);
          continue;
        }
        if (d.seed !== prevSeed) {
          seenSeeds.current.set(d.question_id, d.seed);
          const stale =
            d.status === "revealed" ||
            (d.executed_at != null &&
              Date.now() - new Date(d.executed_at).getTime() > STALE_EXECUTED_MS);
          if (!stale) additions.push({ questionId: d.question_id, skip: false });
        }
      }

      // Pregunta recién abierta (opened_at nuevo) ⇒ el show avanzó: se
      // descartan los reveals pendientes/en pantalla.
      let freshOpen = false;
      for (const q of snap.questions) {
        const prev = openedAt.current.get(q.id);
        if (q.status === "abierta" && q.opened_at && q.opened_at !== prev) freshOpen = true;
        openedAt.current.set(q.id, q.opened_at);
      }

      setQueue((prev) => {
        let next = prev.filter((r) => !undone.has(r.questionId));
        if (freshOpen) next = [];
        for (const a of additions) {
          if (!next.some((r) => r.questionId === a.questionId)) next.push(a);
        }
        return next;
      });
      setServerOffsetMs(new Date(snap.serverNow).getTime() - Date.now());
      setSnapshot(snap);
    };

    const refetch = () => {
      if (fetching) return;
      fetching = true;
      fetch("/api/juego/trivia/estado")
        .then((r) => r.json())
        .then((d) => {
          if (!disposed && Array.isArray(d.questions)) apply(d);
        })
        .catch(() => {})
        .finally(() => {
          fetching = false;
        });
    };

    // Campana Realtime: colapsa ráfagas de eventos en un solo refetch.
    let bell: ReturnType<typeof setTimeout> | null = null;
    const ring = () => {
      if (bell) clearTimeout(bell);
      bell = setTimeout(refetch, 150);
    };

    const supabase = createBrowser();
    const ch = supabase
      .channel("juego_trivia")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "juego_trivia_questions" },
        ring
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "juego_trivia_draws" },
        ring
      )
      .subscribe();

    const iv = setInterval(refetch, pollMs);
    if (!initial) refetch();

    return () => {
      disposed = true;
      if (bell) clearTimeout(bell);
      supabase.removeChannel(ch);
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollMs]);

  const questions = snapshot?.questions ?? [];
  const draws = new Map((snapshot?.draws ?? []).map((d) => [d.question_id, d]));

  const head = queue[0] ?? null;
  const headQuestion = head ? questions.find((q) => q.id === head.questionId) : undefined;
  const headDraw = head ? draws.get(head.questionId) : undefined;
  const activeReveal =
    headQuestion && headDraw && headDraw.status !== "idle" && headDraw.winner
      ? { question: headQuestion, draw: headDraw }
      : null;

  return {
    questions,
    draws,
    kickoffAt: snapshot?.kickoffAt ?? null,
    serverOffsetMs,
    activeReveal,
    skipAnimation: head?.skip ?? false,
    dismissReveal: () => setQueue((prev) => prev.slice(1)),
  };
}
