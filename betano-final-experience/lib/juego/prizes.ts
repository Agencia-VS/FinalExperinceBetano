/**
 * Fase 2 del final: reparte premios físicos entre los ganadores ya decididos.
 *
 * Lógica pura, sin React ni Supabase. El azar se inyecta (Rng) para que el
 * servidor ejecute el sorteo con una semilla registrada:
 *
 *   assignPrizes(winners, prizes, createSeededRng(prizeSeed))
 *
 * es 100% reproducible → semilla + snapshot de ganadores = sorteo auditable.
 * Un premio por ganador, sin reposición (una permutación aleatoria).
 */

import type { Rng, TieBreakerPlayer } from "./winners";
import { shuffle } from "./winners";

/** Premio jerárquico. rank 1 = el más valioso. */
export type Prize = { rank: number; name: string };

/** Un ganador con el premio que le tocó. */
export type PrizeAssignment = TieBreakerPlayer & { prize: Prize };

export type PrizesResult = {
  /** Premios ordenados por rank ascendente (1..N). */
  prizes: Prize[];
  /** Asignaciones ordenadas por rank ascendente (assignments[i].prize.rank === i+1). */
  assignments: PrizeAssignment[];
};

/**
 * Empareja al azar un premio con cada ganador (sorteo sin reposición).
 *
 * Debe haber exactamente tantos premios como ganadores. Baraja los ganadores
 * una vez (biyección uniforme) y los zipea con los premios ordenados por rank,
 * así el orden de los premios no sesga a nadie.
 */
export function assignPrizes(
  winners: TieBreakerPlayer[],
  prizes: Prize[],
  rng: Rng = Math.random
): PrizesResult {
  if (prizes.length !== winners.length) {
    throw new Error(
      `Debe haber tantos premios como ganadores (premios: ${prizes.length}, ganadores: ${winners.length}).`
    );
  }

  const byRank = [...prizes].sort((a, b) => a.rank - b.rank);
  const shuffled = shuffle(winners, rng);
  const assignments: PrizeAssignment[] = byRank.map((prize, i) => ({
    ...shuffled[i],
    prize,
  }));

  return { prizes: byRank, assignments };
}
