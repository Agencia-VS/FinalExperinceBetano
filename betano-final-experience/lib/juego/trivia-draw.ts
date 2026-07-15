/**
 * Sorteo de la trivia: 1 pool → 1 ganador.
 *
 * Lógica pura, sin React ni Supabase. Reutiliza el PRNG sembrado del motor
 * de pronósticos (createSeededRng) sin tocarlo: seed + pool_snapshot
 * persistidos = sorteo 100% reproducible/auditable, igual que el final.
 * El frontend nunca sortea: sólo dramatiza el resultado ya decidido.
 */

import type { Rng, TieBreakerPlayer } from "@/lib/juego/winners";

export type TriviaPoolPlayer = TieBreakerPlayer;

export function pickTriviaWinner(
  pool: readonly TriviaPoolPlayer[],
  rng: Rng = Math.random
): TriviaPoolPlayer {
  if (pool.length === 0) {
    throw new Error("El pool del sorteo está vacío.");
  }
  return pool[Math.floor(rng() * pool.length)];
}
