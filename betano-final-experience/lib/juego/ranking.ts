/**
 * Reordena el ranking para reflejar el sorteo de desempate ya resuelto.
 *
 * El cache numera con rank() por puntos y desempata alfabéticamente, así que
 * los jugadores empatados salen en un orden que NO corresponde al resultado
 * del sorteo. Una vez ejecutado el final, los ganadores deben mostrarse con su
 * puesto definitivo (finalPosition, único 1..N) y en ese orden; el resto sigue
 * por puntos, renumerado a continuación.
 *
 * Genérico a propósito (no importa el tipo `Row` de components/) para no crear
 * un ciclo components↔lib.
 */
export function applyFinalOrder<
  T extends { player_id: string; posicion: number }
>(
  rows: T[],
  winners?: { player_id: string; finalPosition: number }[]
): T[] {
  if (!winners || winners.length === 0) return rows;

  const byId = new Map(winners.map((w) => [w.player_id, w.finalPosition]));

  const won = rows
    .filter((r) => byId.has(r.player_id))
    .sort((a, b) => byId.get(a.player_id)! - byId.get(b.player_id)!)
    .map((r) => ({ ...r, posicion: byId.get(r.player_id)! }));

  // `rows` ya viene ordenado por puntos desde el cache: el resto conserva ese
  // orden y sólo se renumera para continuar después de los ganadores.
  const rest = rows
    .filter((r) => !byId.has(r.player_id))
    .map((r, i) => ({ ...r, posicion: won.length + i + 1 }));

  return [...won, ...rest];
}
