/**
 * Aserciones de pickFeaturedQuestion — qué muestra el proyector. Sin framework:
 *   npx tsx scripts/test-tv-featured.ts
 */
import assert from "node:assert/strict";
import {
  pickFeaturedQuestion,
  type TriviaDraw,
  type TriviaDrawStatus,
  type TriviaQuestion,
} from "../lib/juego/trivia";

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

const NOW = new Date("2026-07-19T20:00:00Z").getTime();
const min = (m: number) => new Date(NOW + m * 60_000).toISOString();

function mk(
  id: string,
  status: TriviaQuestion["status"],
  { openedMin = 0, closesMin = 0, anclada = false }: Partial<Record<string, any>> = {}
): TriviaQuestion {
  return {
    id,
    orden: Number(id.replace(/\D/g, "")) || 1,
    texto: `Pregunta ${id}`,
    momento: "pre",
    premio_label: null,
    duration_seconds: 90,
    requiere_resolucion_manual: false,
    cierra_con_kickoff: anclada,
    status,
    opened_at: min(openedMin),
    closes_at: min(closesMin),
    options: [],
  };
}

const draws = (...pairs: [string, TriviaDrawStatus][]) =>
  new Map<string, Pick<TriviaDraw, "status">>(pairs.map(([id, status]) => [id, { status }]));

console.log("pickFeaturedQuestion");

test("la pregunta abierta manda sobre cualquier cerrada", () => {
  const q1 = mk("q1", "sorteada", { openedMin: -10, closesMin: -8 });
  const q2 = mk("q2", "abierta", { openedMin: -1, closesMin: +1 });
  const f = pickFeaturedQuestion([q1, q2], draws(["q1", "revealed"]), NOW);
  assert.equal(f?.id, "q2");
});

test("sin abierta, se destaca la última cerrada (el host comenta la correcta)", () => {
  const q1 = mk("q1", "cerrada", { openedMin: -10, closesMin: -8 });
  const q2 = mk("q2", "cerrada", { openedMin: -3, closesMin: -1 });
  const f = pickFeaturedQuestion([q1, q2], draws(), NOW);
  assert.equal(f?.id, "q2");
});

test("sorteo ejecutado pero sin revelar: la pregunta sigue en pantalla", () => {
  const q1 = mk("q1", "sorteada", { openedMin: -3, closesMin: -1 });
  const f = pickFeaturedQuestion([q1], draws(["q1", "executed"]), NOW);
  assert.equal(f?.id, "q1");
});

test("al revelar el sorteo de la última, el tablero queda en espera", () => {
  const q1 = mk("q1", "sorteada", { openedMin: -3, closesMin: -1 });
  const f = pickFeaturedQuestion([q1], draws(["q1", "revealed"]), NOW);
  assert.equal(f, undefined);
});

test("revelar NO resucita una pregunta vieja que se cerró sin sortear", () => {
  // El host saltó el sorteo de q1 (queda 'idle') y siguió con q2.
  const q1 = mk("q1", "cerrada", { openedMin: -10, closesMin: -8 });
  const q2 = mk("q2", "sorteada", { openedMin: -3, closesMin: -1 });
  const f = pickFeaturedQuestion([q1, q2], draws(["q1", "idle"], ["q2", "revealed"]), NOW);
  assert.equal(f, undefined, "debe caer a la pantalla de espera, no volver a q1");
});

test("abrir la siguiente saca al tablero de la espera", () => {
  const q1 = mk("q1", "sorteada", { openedMin: -3, closesMin: -1 });
  const q2 = mk("q2", "abierta", { openedMin: 0, closesMin: +1.5 });
  const f = pickFeaturedQuestion([q1, q2], draws(["q1", "revealed"]), NOW);
  assert.equal(f?.id, "q2");
});

test("la anclada al kickoff (Q10) nunca se destaca", () => {
  const q10 = mk("q10", "abierta", { openedMin: -5, closesMin: +60, anclada: true });
  assert.equal(pickFeaturedQuestion([q10], draws(), NOW), undefined);

  const q1 = mk("q1", "cerrada", { openedMin: -3, closesMin: -1 });
  assert.equal(pickFeaturedQuestion([q10, q1], draws(), NOW)?.id, "q1");
});

test("una pregunta 'abierta' cuyo reloj ya venció no cuenta como abierta", () => {
  const q1 = mk("q1", "abierta", { openedMin: -5, closesMin: -1 });
  // Ni abierta ni cerrada/sorteada ⇒ nada que destacar.
  assert.equal(pickFeaturedQuestion([q1], draws(), NOW), undefined);
});

test("sin preguntas, no hay destacada", () => {
  assert.equal(pickFeaturedQuestion([], draws(), NOW), undefined);
});

console.log(`\n${n} tests OK`);
