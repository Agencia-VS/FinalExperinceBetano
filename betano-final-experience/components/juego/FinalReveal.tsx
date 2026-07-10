"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Avatar from "./Avatar";
import {
  MEDAL,
  T,
  SZ,
  type Sizes,
  phaseAnim,
  posLabel,
  positionsLabel,
  SpinStage,
  WinnerReveal,
} from "./revealKit";
import type { FinalResultRow } from "./useFinalReveal";
import type { TieBreakerEvent, TieBreakerPlayer } from "@/lib/juego/winners";

type Phase =
  | { name: "intro" }
  | { name: "event_intro"; eventIndex: number }
  | { name: "spinning"; eventIndex: number; pickIndex: number }
  | { name: "pick_reveal"; eventIndex: number; pickIndex: number }
  | { name: "podium" };

/** Pool aún en juego para el pick i: ganadores no revelados + eliminados
 *  (en un cutoff los que quedan fuera giran en el carrete hasta el final). */
function poolFor(ev: TieBreakerEvent, pickIndex: number): TieBreakerPlayer[] {
  return [...ev.resolvedOrder.slice(0, pickIndex + 1), ...ev.eliminated];
}

/** Si sólo queda un contendiente no hay nada que girar: revelación directa. */
function toPick(ev: TieBreakerEvent, eventIndex: number, pickIndex: number): Phase {
  return poolFor(ev, pickIndex).length <= 1
    ? { name: "pick_reveal", eventIndex, pickIndex }
    : { name: "spinning", eventIndex, pickIndex };
}

/** Los picks de cada sorteo se revelan del último puesto al primero. */
function nextPhase(phase: Phase, events: TieBreakerEvent[]): Phase {
  switch (phase.name) {
    case "intro":
      return events.length === 0
        ? { name: "podium" }
        : { name: "event_intro", eventIndex: 0 };
    case "event_intro": {
      const ev = events[phase.eventIndex];
      return toPick(ev, phase.eventIndex, ev.spots - 1);
    }
    case "spinning":
      return { name: "pick_reveal", eventIndex: phase.eventIndex, pickIndex: phase.pickIndex };
    case "pick_reveal": {
      if (phase.pickIndex > 0) {
        return toPick(events[phase.eventIndex], phase.eventIndex, phase.pickIndex - 1);
      }
      const next = phase.eventIndex + 1;
      return next < events.length ? { name: "event_intro", eventIndex: next } : { name: "podium" };
    }
    case "podium":
      return phase;
  }
}

/**
 * Overlay del final del juego: pausa el ranking, corre la ruleta por cada
 * empate y termina en el podio. Dramatiza un resultado YA decidido en el
 * servidor — aquí no se sortea nada.
 */
export default function FinalReveal({
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
  // Se dramatiza siempre de menor a mayor premio: el sorteo que resuelve los
  // puestos de menor valor va primero, y el que incluye el 1º queda al final.
  const events = (Array.isArray(result.tie_breaker_events) ? result.tie_breaker_events : [])
    .slice()
    .sort((a, b) => Math.max(...b.positions) - Math.max(...a.positions));
  const [phase, setPhase] = useState<Phase>(() =>
    skipAnimation ? { name: "podium" } : { name: "intro" }
  );
  const [dismissed, setDismissed] = useState(false);
  const sz = SZ[variant];

  // Fases con avance automático; "spinning" avanza cuando el carrete aterriza.
  useEffect(() => {
    if (phase.name === "podium") return;
    const ms =
      phase.name === "intro"
        ? T.intro
        : phase.name === "event_intro"
        ? T.eventIntro
        : phase.name === "spinning"
        ? T.spinFallback
        : T.pickReveal;
    const t = setTimeout(() => setPhase((p) => nextPhase(p, events)), ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (dismissed) return null;

  const winners = [...result.winners].sort((a, b) => a.finalPosition - b.finalPosition);

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
                ¡Tenemos definición!
              </h2>
              <p className={`mx-auto mt-4 max-w-md text-bone-dim ${sz.subtitle}`}>
                {events.length > 0
                  ? "El ranking cerró con empates: la ruleta decide los puestos."
                  : "El ranking final está listo."}
              </p>
              <span className="j-live-dot mx-auto mt-6 block h-2 w-2 rounded-full bg-ember" />
            </motion.div>
          )}

          {phase.name === "event_intro" && (
            <EventIntro
              key={`ei-${phase.eventIndex}`}
              ev={events[phase.eventIndex]}
              index={phase.eventIndex}
              total={events.length}
              sz={sz}
            />
          )}

          {phase.name === "spinning" && (
            <SpinStage
              key={`sp-${phase.eventIndex}-${phase.pickIndex}`}
              eyebrow="La ruleta gira"
              title={`¿Quién se queda con el ${posLabel(
                events[phase.eventIndex].positions[phase.pickIndex]
              )} lugar?`}
              pool={poolFor(events[phase.eventIndex], phase.pickIndex)}
              target={events[phase.eventIndex].resolvedOrder[phase.pickIndex]}
              sz={sz}
              onDone={() => setPhase((p) => nextPhase(p, events))}
            />
          )}

          {phase.name === "pick_reveal" && (
            <PickReveal
              key={`pr-${phase.eventIndex}-${phase.pickIndex}`}
              ev={events[phase.eventIndex]}
              pickIndex={phase.pickIndex}
              meId={meId}
              sz={sz}
            />
          )}

          {phase.name === "podium" && (
            <Podium
              key="podium"
              winners={winners}
              seed={result.seed}
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

function EventIntro({
  ev,
  index,
  total,
  sz,
}: {
  ev: TieBreakerEvent;
  index: number;
  total: number;
  sz: Sizes;
}) {
  const shown = ev.participants.slice(0, 8);
  const extra = ev.participants.length - shown.length;
  return (
    <motion.div {...phaseAnim} className="text-center">
      <p className={`font-bold uppercase text-wither ${sz.eyebrow}`}>
        Sorteo {index + 1} de {total}
      </p>
      <h2 className={`mt-3 font-title font-extrabold uppercase leading-none text-bone ${sz.title}`}>
        Empate en {ev.puntos} pts
      </h2>
      <p className={`mx-auto mt-4 max-w-md text-bone-dim ${sz.subtitle}`}>
        {ev.kind === "order"
          ? `Se sortea el orden exacto de los puestos ${positionsLabel(ev.positions)}.`
          : `${ev.participants.length} jugadores por ${ev.spots} ${
              ev.spots === 1 ? "cupo" : "cupos"
            } en la zona de premios.`}
      </p>
      <div className="mt-7 flex flex-wrap items-start justify-center gap-x-5 gap-y-4">
        {shown.map((p, i) => (
          <motion.div
            key={p.player_id}
            className="flex w-16 flex-col items-center gap-1.5"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.07, type: "spring", stiffness: 320, damping: 28 }}
          >
            <Avatar alias={p.alias} size={sz.listAvatar + 14} avatarUrl={p.avatar} />
            <span className="w-full truncate text-center text-[11px] font-semibold text-bone">
              {p.alias}
            </span>
          </motion.div>
        ))}
        {extra > 0 && (
          <motion.span
            className="mt-3 rounded-full border border-smoke bg-char/70 px-3 py-1 text-xs font-bold text-bone-dim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            +{extra} más
          </motion.span>
        )}
      </div>
    </motion.div>
  );
}

/** Envoltorio de desempate sobre WinnerReveal: calcula puesto, medalla y la
 *  lista de eliminados (sólo en un cutoff) y delega el render al kit. */
function PickReveal({
  ev,
  pickIndex,
  meId,
  sz,
}: {
  ev: TieBreakerEvent;
  pickIndex: number;
  meId: string | null;
  sz: Sizes;
}) {
  const winner = ev.resolvedOrder[pickIndex];
  const position = ev.positions[pickIndex];
  const medal = position <= 3 ? MEDAL[position - 1] : "var(--bone)";
  const showEliminated = pickIndex === 0 && ev.kind === "cutoff" && ev.eliminated.length > 0;

  return (
    <WinnerReveal
      heading={posLabel(position)}
      headingColor={medal}
      player={winner}
      subLabel={`${winner.puntos} pts`}
      isMe={winner.player_id === meId}
      rank={position}
      sz={sz}
      footer={
        showEliminated ? (
          <motion.div
            className="mt-7"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <p className={`font-bold uppercase text-bone-dim ${sz.eyebrow}`}>Quedan fuera</p>
            <div className="mt-2.5 flex flex-wrap justify-center gap-2">
              {ev.eliminated.slice(0, 12).map((p) => (
                <span
                  key={p.player_id}
                  className="rounded-full border border-smoke bg-char/60 px-3 py-1 text-xs font-semibold text-bone-dim/70"
                >
                  {p.alias}
                </span>
              ))}
              {ev.eliminated.length > 12 && (
                <span className="rounded-full border border-smoke bg-char/60 px-3 py-1 text-xs font-semibold text-bone-dim/70">
                  +{ev.eliminated.length - 12} más
                </span>
              )}
            </div>
          </motion.div>
        ) : undefined
      }
    />
  );
}

function Podium({
  winners,
  seed,
  meId,
  sz,
  onClose,
}: {
  winners: FinalResultRow["winners"];
  seed: string | null;
  meId: string | null;
  sz: Sizes;
  onClose?: () => void;
}) {
  const top3 = winners.slice(0, 3);
  const rest = winners.slice(3);
  // Orden visual clásico de podio: 2º · 1º · 3º.
  const arranged = top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3;

  return (
    <motion.div {...phaseAnim} className="text-center">
      <p className={`font-bold uppercase text-wither ${sz.eyebrow}`}>Resultado final</p>
      <h2 className={`j-text-fire mt-2 font-title font-extrabold uppercase leading-none ${sz.title}`}>
        Ganadores
      </h2>

      <div
        className={`mx-auto mt-8 grid items-end gap-3 ${
          arranged.length === 3 ? "max-w-lg grid-cols-3" : "max-w-xs grid-cols-1"
        }`}
      >
        {arranged.map((w, i) => {
          const first = w.finalPosition === 1;
          const mine = w.player_id === meId;
          return (
            <motion.div
              key={w.player_id}
              className={`j-card relative flex flex-col items-center px-2 pb-4 text-center ${
                first ? "pt-7 !border-[#FFD24A]/40" : "pt-4"
              } ${mine ? "!border-ember" : ""}`}
              initial={{ opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 + i * 0.18, type: "spring", stiffness: 300, damping: 26 }}
            >
              {first && (
                <svg
                  className="absolute -top-4 h-8 w-8 text-[#FFD24A]"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M3 8l4.5 3L12 5l4.5 6L21 8l-1.5 9h-15L3 8Z" />
                </svg>
              )}
              <Avatar
                alias={w.alias}
                rank={w.finalPosition}
                size={first ? sz.podiumFirstAvatar : sz.podiumAvatar}
                avatarUrl={w.avatar}
              />
              <p
                className="mt-2 font-title text-xl font-extrabold tabular-nums leading-none"
                style={{ color: MEDAL[w.finalPosition - 1] }}
              >
                {posLabel(w.finalPosition)}
              </p>
              <p className="mt-1 w-full truncate text-[13px] font-semibold text-bone">
                {w.alias}
                {mine && (
                  <span className="ml-1 rounded-md bg-ember/20 px-1 py-0.5 text-[9px] font-bold uppercase text-wither">
                    Tú
                  </span>
                )}
              </p>
              <p className="text-xs tabular-nums text-bone-dim">{w.puntos} pts</p>
              {w.viaTieBreaker && (
                <span className="mt-1.5 rounded-md border border-ember/30 bg-ember/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-wither/90">
                  🎰 Ruleta
                </span>
              )}
            </motion.div>
          );
        })}
      </div>

      {rest.length > 0 && (
        <div className="mx-auto mt-4 flex max-w-md flex-col gap-2">
          {rest.map((w, i) => (
            <motion.div
              key={w.player_id}
              className={`flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left ${
                w.player_id === meId ? "border-ember/70 bg-ember/10" : "border-smoke bg-char/55"
              }`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.85 + i * 0.1, type: "spring", stiffness: 320, damping: 28 }}
            >
              <span className="w-8 shrink-0 text-center font-title text-base font-bold tabular-nums text-bone-dim">
                {posLabel(w.finalPosition)}
              </span>
              <Avatar alias={w.alias} size={sz.listAvatar} avatarUrl={w.avatar} />
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-bone">
                {w.alias}
              </span>
              {w.viaTieBreaker && <span aria-hidden>🎰</span>}
              <span className="font-title text-lg font-bold tabular-nums text-bone">{w.puntos}</span>
            </motion.div>
          ))}
        </div>
      )}

      {seed && (
        <p className="mt-8 text-[10px] tracking-wide text-bone-dim/50">
          Sorteo verificable · semilla <span className="font-mono">{seed}</span>
        </p>
      )}

      {onClose && (
        <button
          onClick={onClose}
          className="btn-ember mx-auto mt-6 inline-flex items-center gap-2 px-5 py-2.5 text-sm"
        >
          Ver ranking
        </button>
      )}
    </motion.div>
  );
}
