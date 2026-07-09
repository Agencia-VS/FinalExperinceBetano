/**
 * Aserciones del motor calculateWinners. Sin framework:
 *   npx tsx scripts/test-winners.ts
 */
import assert from "node:assert/strict";
import {
  calculateWinners,
  createSeededRng,
  type TieBreakerEvent,
  type WinnersResult,
} from "../lib/juego/winners";
import type { Row } from "../components/juego/RankingLive";

let n = 0;
function test(name: string, fn: () => void) {
  n++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    throw e;
  }
}

function mk(alias: string, puntos: number, posicion = 0): Row {
  return { posicion, player_id: `id-${alias}`, alias, avatar: null, puntos };
}

/** Invariantes que todo resultado debe cumplir. */
function checkInvariants(r: WinnersResult, totalPlayers: number) {
  assert.equal(r.winners.length, Math.min(r.maxWinners, totalPlayers));
  const positions = r.winners.map((w) => w.finalPosition);
  assert.deepEqual(
    positions,
    Array.from({ length: r.winners.length }, (_, i) => i + 1),
    "finalPosition debe ser exactamente 1..N sin duplicados"
  );
  const ids = new Set(r.winners.map((w) => w.player_id));
  assert.equal(ids.size, r.winners.length, "sin ganadores duplicados");
  for (const ev of r.tieBreakerEvents) {
    assert.equal(ev.spots, ev.positions.length);
    assert.equal(ev.winners.length, ev.spots);
    assert.deepEqual(ev.resolvedOrder.slice(0, ev.spots), ev.winners);
    assert.deepEqual(ev.resolvedOrder.slice(ev.spots), ev.eliminated);
    assert.equal(
      new Set(ev.resolvedOrder.map((p) => p.player_id)).size,
      ev.participants.length,
      "resolvedOrder es permutación de participants"
    );
    if (ev.kind === "order") assert.equal(ev.eliminated.length, 0);
    else assert.ok(ev.eliminated.length > 0);
    // Los ganadores del evento aparecen en winners con la posición asignada.
    ev.winners.forEach((p, i) => {
      const w = r.winners.find((x) => x.player_id === p.player_id);
      assert.ok(w, `ganador de evento ${p.alias} está en winners`);
      assert.equal(w!.finalPosition, ev.positions[i]);
      assert.equal(w!.viaTieBreaker, true);
    });
    ev.eliminated.forEach((p) => {
      assert.ok(!ids.has(p.player_id), `eliminado ${p.alias} no está en winners`);
    });
  }
}

console.log("calculateWinners:");

test("sin empates → 0 eventos, top N directo", () => {
  const players = [mk("ana", 10), mk("beto", 8), mk("carla", 6), mk("dani", 4)];
  const r = calculateWinners(players, 3, createSeededRng("s1"));
  checkInvariants(r, 4);
  assert.equal(r.tieBreakerEvents.length, 0);
  assert.deepEqual(
    r.winners.map((w) => [w.alias, w.finalPosition, w.viaTieBreaker]),
    [["ana", 1, false], ["beto", 2, false], ["carla", 3, false]]
  );
});

test("empate que cabe → evento 'order' que fija el orden 2º/3º", () => {
  const players = [mk("ana", 10), mk("beto", 8), mk("carla", 8), mk("dani", 4)];
  const r = calculateWinners(players, 3, createSeededRng("s2"));
  checkInvariants(r, 4);
  assert.equal(r.tieBreakerEvents.length, 1);
  const ev = r.tieBreakerEvents[0];
  assert.equal(ev.kind, "order");
  assert.equal(ev.puntos, 8);
  assert.deepEqual(ev.positions, [2, 3]);
  assert.deepEqual(new Set(ev.participants.map((p) => p.alias)), new Set(["beto", "carla"]));
  assert.equal(r.winners[0].alias, "ana");
});

test("empate en el corte (4 por 2 cupos) → 'cutoff', 2 fuera, bucle termina", () => {
  const players = [
    mk("ana", 10),
    mk("beto", 7), mk("carla", 7), mk("dani", 7), mk("eli", 7),
    mk("fede", 5),
  ];
  const r = calculateWinners(players, 3, createSeededRng("s3"));
  checkInvariants(r, 6);
  assert.equal(r.tieBreakerEvents.length, 1);
  const ev = r.tieBreakerEvents[0];
  assert.equal(ev.kind, "cutoff");
  assert.equal(ev.participants.length, 4);
  assert.equal(ev.spots, 2);
  assert.deepEqual(ev.positions, [2, 3]);
  assert.equal(ev.eliminated.length, 2);
  // fede (5 pts) nunca entra: el bucle terminó en el cutoff.
  assert.ok(!r.winners.some((w) => w.alias === "fede"));
});

test("todos empatados a 0 (250 jugadores, 3 cupos) → un solo cutoff gigante", () => {
  const players = Array.from({ length: 250 }, (_, i) => mk(`p${String(i).padStart(3, "0")}`, 0));
  const r = calculateWinners(players, 3, createSeededRng("s4"));
  checkInvariants(r, 250);
  assert.equal(r.tieBreakerEvents.length, 1);
  const ev = r.tieBreakerEvents[0];
  assert.equal(ev.kind, "cutoff");
  assert.equal(ev.participants.length, 250);
  assert.equal(ev.eliminated.length, 247);
  assert.equal(r.winners.length, 3);
});

test("menos jugadores que maxWinners → gana todo el mundo", () => {
  const players = [mk("ana", 3), mk("beto", 1)];
  const r = calculateWinners(players, 5, createSeededRng("s5"));
  checkInvariants(r, 2);
  assert.equal(r.winners.length, 2);
});

test("sin jugadores → resultado vacío", () => {
  const r = calculateWinners([], 3, createSeededRng("s6"));
  assert.equal(r.winners.length, 0);
  assert.equal(r.tieBreakerEvents.length, 0);
});

test("empates múltiples encadenados (2 empatan 1º/2º + 3 empatan por el 3º)", () => {
  const players = [
    mk("ana", 9), mk("beto", 9),
    mk("carla", 6), mk("dani", 6), mk("eli", 6),
  ];
  const r = calculateWinners(players, 3, createSeededRng("s7"));
  checkInvariants(r, 5);
  assert.equal(r.tieBreakerEvents.length, 2);
  assert.equal(r.tieBreakerEvents[0].kind, "order");
  assert.deepEqual(r.tieBreakerEvents[0].positions, [1, 2]);
  assert.equal(r.tieBreakerEvents[1].kind, "cutoff");
  assert.deepEqual(r.tieBreakerEvents[1].positions, [3]);
  assert.equal(r.tieBreakerEvents[1].eliminated.length, 2);
});

test("determinismo: misma seed → mismo resultado; seed distinta → distinto orden", () => {
  const players = Array.from({ length: 20 }, (_, i) => mk(`p${i}`, i < 10 ? 5 : 3));
  const a = calculateWinners(players, 5, createSeededRng("misma"));
  const b = calculateWinners(players, 5, createSeededRng("misma"));
  assert.deepEqual(a, b);
  const c = calculateWinners(players, 5, createSeededRng("otra"));
  assert.notDeepEqual(
    a.winners.map((w) => w.player_id),
    c.winners.map((w) => w.player_id)
  );
});

test("reproducibilidad estilo auditoría: seed + snapshot → mismos ganadores", () => {
  const snapshot = [mk("ana", 8), mk("beto", 8), mk("carla", 8), mk("dani", 2)];
  const seed = "b81c2f1e-demo-seed";
  const stored = calculateWinners(snapshot, 2, createSeededRng(seed));
  const replay = calculateWinners(snapshot, 2, createSeededRng(seed));
  assert.deepEqual(replay.winners, stored.winners);
  assert.deepEqual(replay.tieBreakerEvents, stored.tieBreakerEvents);
});

test("maxWinners inválido lanza error", () => {
  assert.throws(() => calculateWinners([mk("ana", 1)], 0));
  assert.throws(() => calculateWinners([mk("ana", 1)], 2.5));
  assert.throws(() => calculateWinners([mk("ana", 1)], -3));
});

test("rng por defecto (Math.random) también respeta invariantes", () => {
  const players = [mk("ana", 5), mk("beto", 5), mk("carla", 5), mk("dani", 5)];
  for (let k = 0; k < 50; k++) checkInvariants(calculateWinners(players, 2), 4);
});

console.log(`\n${n} pruebas OK ✅`);
