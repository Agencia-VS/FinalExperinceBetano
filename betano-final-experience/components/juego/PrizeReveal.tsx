"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Avatar from "./Avatar";
import { T, SZ, type Sizes, phaseAnim, SpinStage, WinnerReveal } from "./revealKit";
import type { FinalResultRow } from "./useFinalReveal";
import type { PrizeAssignment } from "@/lib/juego/prizes";

type PPhase =
  | { name: "intro" }
  | { name: "spinning"; rank: number }
  | { name: "reveal"; rank: number }
  | { name: "summary" };

/** Pool aún en juego para el premio de rank r: los ganadores que todavía no
 *  recibieron premio (ranks 1..r). assignments viene ordenado por rank asc. */
function poolFor(assignments: PrizeAssignment[], rank: number): PrizeAssignment[] {
  return assignments.slice(0, rank);
}

/** Si sólo queda un contendiente no hay nada que girar: revelación directa. */
function toRound(assignments: PrizeAssignment[], rank: number): PPhase {
  return poolFor(assignments, rank).length <= 1
    ? { name: "reveal", rank }
    : { name: "spinning", rank };
}

/** Los premios se revelan de menor a mayor valor: rank N (menos valioso)
 *  primero, rank 1 (el más valioso) al final absoluto. */
function nextPhase(phase: PPhase, assignments: PrizeAssignment[]): PPhase {
  const n = assignments.length;
  switch (phase.name) {
    case "intro":
      return n === 0 ? { name: "summary" } : toRound(assignments, n);
    case "spinning":
      return { name: "reveal", rank: phase.rank };
    case "reveal":
      return phase.rank > 1 ? toRound(assignments, phase.rank - 1) : { name: "summary" };
    case "summary":
      return phase;
  }
}

/**
 * Overlay de la Fase 2: reparte los premios físicos entre los ganadores con la
 * misma ruleta del desempate. Dramatiza un resultado YA decidido en el servidor
 * (semilla registrada) — aquí no se sortea nada.
 */
export default function PrizeReveal({
  result,
  variant,
  skipAnimation = false,
  meId = null,
}: {
  result: FinalResultRow;
  variant: "mobile" | "tv";
  skipAnimation?: boolean;
  meId?: string | null;
}) {
  const assignments = Array.isArray(result.prize_assignments) ? result.prize_assignments : [];
  const [phase, setPhase] = useState<PPhase>(() =>
    skipAnimation ? { name: "summary" } : { name: "intro" }
  );
  const [dismissed, setDismissed] = useState(false);
  const sz = SZ[variant];

  // Fases con avance automático; "spinning" avanza cuando el carrete aterriza,
  // con un timeout de respaldo por si onDone nunca llega.
  useEffect(() => {
    if (phase.name === "summary") return;
    const ms =
      phase.name === "intro" ? T.intro : phase.name === "spinning" ? T.spinFallback : T.pickReveal;
    const t = setTimeout(() => setPhase((p) => nextPhase(p, assignments)), ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (dismissed) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-black/85 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Resplandor ember de fondo */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 50% 0%, rgba(255,77,0,0.16), transparent 65%)",
        }}
      />

      <div className={`relative mx-auto flex w-full flex-1 flex-col justify-center py-10 ${sz.wrap}`}>
        <AnimatePresence mode="wait">
          {phase.name === "intro" && (
            <motion.div key="intro" {...phaseAnim} className="text-center">
              <p className={`font-bold uppercase text-wither ${sz.eyebrow}`}>Final Experience</p>
              <h2 className={`j-text-fire mt-3 font-title font-extrabold uppercase leading-none ${sz.title}`}>
                Sorteo de premios
              </h2>
              <p className={`mx-auto mt-4 max-w-md text-bone-dim ${sz.subtitle}`}>
                La ruleta reparte los premios entre los ganadores, del menor al
                mayor.
              </p>
              <span className="j-live-dot mx-auto mt-6 block h-2 w-2 rounded-full bg-ember" />
            </motion.div>
          )}

          {phase.name === "spinning" && (
            <SpinStage
              key={`sp-${phase.rank}`}
              eyebrow="Sorteo de premios"
              title={`Premio: ${assignments[phase.rank - 1].prize.name}`}
              pool={poolFor(assignments, phase.rank)}
              target={assignments[phase.rank - 1]}
              sz={sz}
              onDone={() => setPhase((p) => nextPhase(p, assignments))}
            />
          )}

          {phase.name === "reveal" && (
            <WinnerReveal
              key={`rv-${phase.rank}`}
              heading={`🎁 ${assignments[phase.rank - 1].prize.name}`}
              headingColor="var(--wither)"
              player={assignments[phase.rank - 1]}
              subLabel={`${assignments[phase.rank - 1].puntos} pts`}
              isMe={assignments[phase.rank - 1].player_id === meId}
              sz={sz}
            />
          )}

          {phase.name === "summary" && (
            <PrizeSummary
              key="summary"
              assignments={assignments}
              seed={result.prize_seed}
              meId={meId}
              sz={sz}
              onClose={() => setDismissed(true)}
            />
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/** Resumen final: premio → ganador, de mayor a menor valor (rank ascendente). */
function PrizeSummary({
  assignments,
  seed,
  meId,
  sz,
  onClose,
}: {
  assignments: PrizeAssignment[];
  seed: string | null;
  meId: string | null;
  sz: Sizes;
  onClose: () => void;
}) {
  return (
    <motion.div {...phaseAnim} className="text-center">
      <p className={`font-bold uppercase text-wither ${sz.eyebrow}`}>Premios entregados</p>
      <h2 className={`j-text-fire mt-2 font-title font-extrabold uppercase leading-none ${sz.title}`}>
        Ganadores
      </h2>

      <div className="mx-auto mt-8 flex max-w-md flex-col gap-2">
        {assignments.map((a, i) => {
          const mine = a.player_id === meId;
          return (
            <motion.div
              key={a.player_id}
              className={`flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left ${
                mine ? "border-ember/70 bg-ember/10" : "border-smoke bg-char/55"
              }`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.1, type: "spring", stiffness: 320, damping: 28 }}
            >
              <Avatar alias={a.alias} size={sz.listAvatar} avatarUrl={a.avatar} />
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-bone">
                {a.alias}
                {mine && (
                  <span className="ml-1.5 rounded-md bg-ember/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-wither">
                    Tú
                  </span>
                )}
              </span>
              <span className="shrink-0 text-right text-[13px] font-semibold text-wither">
                🎁 {a.prize.name}
              </span>
            </motion.div>
          );
        })}
      </div>

      {seed && (
        <p className="mt-8 text-[10px] tracking-wide text-bone-dim/50">
          Sorteo verificable · semilla <span className="font-mono">{seed}</span>
        </p>
      )}

      <button
        onClick={onClose}
        className="btn-ember mx-auto mt-6 inline-flex items-center gap-2 px-5 py-2.5 text-sm"
      >
        Ver ranking
      </button>
    </motion.div>
  );
}
