/**
 * Motor del ranking final: resuelve empates y asigna los puestos de premio.
 *
 * Lógica pura, sin React ni Supabase. El azar se inyecta (Rng) para que el
 * servidor ejecute el sorteo con una semilla registrada:
 *
 *   calculateWinners(ranking, n, createSeededRng(seed))
 *
 * es 100% reproducible → seed + snapshot persistidos = sorteo auditable.
 * El frontend nunca sortea: sólo dramatiza el resultado ya decidido.
 */

import type { Row } from "@/components/juego/RankingLive";

/** Generador uniforme en [0, 1). */
export type Rng = () => number;

export type TieBreakerPlayer = Pick<Row, "player_id" | "alias" | "avatar" | "puntos">;

export type TieBreakerEvent = {
  /** "order": todos entran, la ruleta define el orden exacto de los puestos.
   *  "cutoff": hay más empatados que cupos, la ruleta decide quién entra. */
  kind: "order" | "cutoff";
  /** Puntaje empatado. */
  puntos: number;
  /** Posiciones finales que asigna este sorteo, ascendente (ej. [2, 3]). */
  positions: number[];
  /** = positions.length; en "cutoff" es menor que participants.length. */
  spots: number;
  /** Todos los empatados, en el orden de entrada (alfabético del cache). */
  participants: TieBreakerPlayer[];
  /** Orden sorteado completo; resolvedOrder[i] recibe positions[i]. */
  resolvedOrder: TieBreakerPlayer[];
  /** = resolvedOrder.slice(0, spots). */
  winners: TieBreakerPlayer[];
  /** Sólo "cutoff": quienes quedan fuera de premios. [] en "order". */
  eliminated: TieBreakerPlayer[];
};

export type Winner = TieBreakerPlayer & {
  /** Puesto definitivo 1..maxWinners, sin duplicados (premios jerárquicos). */
  finalPosition: number;
  viaTieBreaker: boolean;
};

export type WinnersResult = {
  maxWinners: number;
  /** min(maxWinners, players.length) ganadores, ordenados por finalPosition. */
  winners: Winner[];
  /** Sorteos requeridos, en orden de dramatización (mejor puntaje primero). */
  tieBreakerEvents: TieBreakerEvent[];
};

/** Hash xmur3: string → semilla numérica de 32 bits. */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/** PRNG mulberry32 con semilla string. Determinista entre ejecuciones. */
export function createSeededRng(seed: string): Rng {
  let a = xmur3(seed)();
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates sobre una copia. */
export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function toTieBreakerPlayer(r: Row): TieBreakerPlayer {
  return { player_id: r.player_id, alias: r.alias, avatar: r.avatar ?? null, puntos: r.puntos };
}

/**
 * Resuelve el ranking final.
 *
 * Agrupa por puntaje descendente y llena los cupos (availableSpots):
 * · grupo de 1 → entra directo, sin sorteo;
 * · grupo que cabe → todos entran, sorteo "order" fija el orden exacto
 *   (los premios son jerárquicos);
 * · grupo que desborda → sorteo "cutoff" elige quiénes entran y el bucle
 *   termina.
 */
export function calculateWinners(
  players: Row[],
  maxWinners: number,
  rng: Rng = Math.random
): WinnersResult {
  if (!Number.isInteger(maxWinners) || maxWinners < 1) {
    throw new Error(`maxWinners debe ser un entero >= 1 (recibido: ${maxWinners})`);
  }

  // Orden estable por puntos desc; no confiamos en posicion (rangos compartidos).
  const sorted = players.map(toTieBreakerPlayer).sort((a, b) => b.puntos - a.puntos);

  const winners: Winner[] = [];
  const tieBreakerEvents: TieBreakerEvent[] = [];
  let availableSpots = maxWinners;
  let nextPosition = 1;
  let i = 0;

  while (i < sorted.length && availableSpots > 0) {
    const puntos = sorted[i].puntos;
    let j = i;
    while (j < sorted.length && sorted[j].puntos === puntos) j++;
    const group = sorted.slice(i, j);
    i = j;

    if (group.length === 1) {
      winners.push({ ...group[0], finalPosition: nextPosition, viaTieBreaker: false });
      nextPosition++;
      availableSpots--;
      continue;
    }

    const spots = Math.min(group.length, availableSpots);
    const positions = Array.from({ length: spots }, (_, k) => nextPosition + k);
    const resolvedOrder = shuffle(group, rng);
    const eventWinners = resolvedOrder.slice(0, spots);
    const eliminated = resolvedOrder.slice(spots);

    tieBreakerEvents.push({
      kind: group.length <= availableSpots ? "order" : "cutoff",
      puntos,
      positions,
      spots,
      participants: group,
      resolvedOrder,
      winners: eventWinners,
      eliminated,
    });

    eventWinners.forEach((p, k) => {
      winners.push({ ...p, finalPosition: positions[k], viaTieBreaker: true });
    });
    nextPosition += spots;
    availableSpots -= spots;

    // Grupo desbordado: los cupos se agotaron, el resto queda fuera.
    if (eliminated.length > 0) break;
  }

  return { maxWinners, winners, tieBreakerEvents };
}
