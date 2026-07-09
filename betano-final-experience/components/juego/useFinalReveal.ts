"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowser } from "@/lib/supabase-browser";
import type { TieBreakerEvent, Winner } from "@/lib/juego/winners";

/** Fila de juego_final_result tal como llega por Realtime / API. */
export type FinalResultRow = {
  status: "idle" | "executed" | "revealed";
  seed: string | null;
  max_winners: number | null;
  winners: Winner[];
  tie_breaker_events: TieBreakerEvent[];
  executed_at: string | null;
  revealed_at: string | null;
};

/** Un 'executed' más viejo que esto al cargar la página se trata como
 *  revelado (red de seguridad si el admin olvidó marcar reveal). */
const STALE_EXECUTED_MS = 5 * 60_000;

/**
 * Estado vivo del sorteo final. Suscripción Realtime a juego_final_result
 * + poll de 30s como respaldo (mismo patrón que el leaderboard).
 *
 * - `active`: montar el overlay del final.
 * - `skipAnimation`: fijado UNA vez al montar — quien llega tarde o
 *   refresca ve el podio directo; una transición en vivo idle→executed
 *   siempre reproduce la animación completa.
 */
export function useFinalReveal(initial: FinalResultRow | null): {
  result: FinalResultRow | null;
  active: boolean;
  skipAnimation: boolean;
} {
  const [result, setResult] = useState<FinalResultRow | null>(initial);
  const skipAnimation = useRef(
    initial != null &&
      (initial.status === "revealed" ||
        (initial.status === "executed" &&
          initial.executed_at != null &&
          Date.now() - new Date(initial.executed_at).getTime() > STALE_EXECUTED_MS))
  ).current;

  useEffect(() => {
    const apply = (row: FinalResultRow | null | undefined) => {
      if (!row || typeof row.status !== "string") return;
      setResult((prev) =>
        // No re-renderizar (ni perturbar una animación en curso) si nada cambió.
        prev &&
        prev.status === row.status &&
        prev.executed_at === row.executed_at &&
        prev.revealed_at === row.revealed_at
          ? prev
          : row
      );
    };

    const supabase = createBrowser();
    const ch = supabase
      .channel("juego_final")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "juego_final_result" },
        (payload: { new: FinalResultRow }) => apply(payload.new)
      )
      .subscribe();

    const iv = setInterval(() => {
      fetch("/api/juego/leaderboard")
        .then((r) => r.json())
        .then((d) => apply(d.finalResult))
        .catch(() => {});
    }, 30000);

    return () => {
      supabase.removeChannel(ch);
      clearInterval(iv);
    };
  }, []);

  const active =
    result != null &&
    result.status !== "idle" &&
    Array.isArray(result.winners) &&
    result.winners.length > 0;

  return { result, active, skipAnimation };
}
