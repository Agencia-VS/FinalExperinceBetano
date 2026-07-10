/**
 * Aserciones del motor assignPrizes. Sin framework:
 *   npx tsx scripts/test-prizes.ts
 */
import assert from "node:assert/strict";
import { createSeededRng, type TieBreakerPlayer } from "../lib/juego/winners";
import { assignPrizes, type Prize } from "../lib/juego/prizes";

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

function mkWinner(alias: string): TieBreakerPlayer {
  return { player_id: `id-${alias}`, alias, avatar: null, puntos: 0 };
}
function mkPrizes(names: string[]): Prize[] {
  return names.map((name, i) => ({ rank: i + 1, name }));
}

console.log("assignPrizes:");

const winners = ["Ana", "Beto", "Caro", "Dani", "Eva"].map(mkWinner);
const prizes = mkPrizes(["PS5", "Silla", "Giftcard", "Camiseta", "Taza"]);

test("biyección: cada ganador un premio único, cada premio un ganador único", () => {
  const { assignments } = assignPrizes(winners, prizes, createSeededRng("s1"));
  assert.equal(assignments.length, winners.length);
  const players = new Set(assignments.map((a) => a.player_id));
  const prizeRanks = new Set(assignments.map((a) => a.prize.rank));
  assert.equal(players.size, winners.length, "sin ganadores repetidos");
  assert.equal(prizeRanks.size, prizes.length, "sin premios repetidos");
  // Todos los ganadores presentes.
  assert.deepEqual(
    [...players].sort(),
    winners.map((w) => w.player_id).sort()
  );
});

test("assignments ordenado por rank asc (1..N)", () => {
  const { assignments, prizes: outPrizes } = assignPrizes(winners, prizes, createSeededRng("s1"));
  assert.deepEqual(
    assignments.map((a) => a.prize.rank),
    [1, 2, 3, 4, 5]
  );
  assert.deepEqual(
    outPrizes.map((p) => p.rank),
    [1, 2, 3, 4, 5]
  );
});

test("premios desordenados en la entrada quedan ordenados por rank", () => {
  const scrambled: Prize[] = [
    { rank: 3, name: "Giftcard" },
    { rank: 1, name: "PS5" },
    { rank: 5, name: "Taza" },
    { rank: 2, name: "Silla" },
    { rank: 4, name: "Camiseta" },
  ];
  const { prizes: outPrizes } = assignPrizes(winners, scrambled, createSeededRng("s1"));
  assert.deepEqual(
    outPrizes.map((p) => p.name),
    ["PS5", "Silla", "Giftcard", "Camiseta", "Taza"]
  );
});

test("determinismo: misma seed → mismo resultado; seed distinta → distinto", () => {
  const a = assignPrizes(winners, prizes, createSeededRng("same"));
  const b = assignPrizes(winners, prizes, createSeededRng("same"));
  assert.deepEqual(
    a.assignments.map((x) => [x.prize.rank, x.player_id]),
    b.assignments.map((x) => [x.prize.rank, x.player_id])
  );
  const c = assignPrizes(winners, prizes, createSeededRng("otra"));
  const sameAsA =
    JSON.stringify(a.assignments.map((x) => x.player_id)) ===
    JSON.stringify(c.assignments.map((x) => x.player_id));
  assert.ok(!sameAsA, "seed distinta debería dar otra permutación");
});

test("valida que premios == ganadores", () => {
  assert.throws(() => assignPrizes(winners, mkPrizes(["Solo uno"]), createSeededRng("s")));
  assert.throws(() =>
    assignPrizes(winners.slice(0, 2), prizes, createSeededRng("s"))
  );
});

test("caso 1 ganador / 1 premio", () => {
  const { assignments } = assignPrizes([mkWinner("Solo")], mkPrizes(["PS5"]), createSeededRng("s"));
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].player_id, "id-Solo");
  assert.equal(assignments[0].prize.name, "PS5");
});

test("rng por defecto (Math.random) también respeta la biyección", () => {
  const { assignments } = assignPrizes(winners, prizes);
  assert.equal(new Set(assignments.map((a) => a.player_id)).size, winners.length);
});

console.log(`\n${n} pruebas OK ✅`);
