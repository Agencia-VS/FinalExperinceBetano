"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Avatar from "./Avatar";
import type { TieBreakerPlayer } from "@/lib/juego/winners";

/** Filas de relleno antes del objetivo: define el recorrido del carrete. */
const FILLER_ROWS = 28;
/** Pausa sobre el ganador (pulso + chispas) antes de avisar al padre. */
const LAND_PAUSE_MS = 750;

/**
 * Tira del carrete: ciclos barajados del pool como relleno visual, el
 * objetivo en la posición FILLER_ROWS y una fila extra al final para que
 * la ranura inferior no quede vacía al aterrizar. El relleno usa
 * Math.random sin culpa — el resultado ya fue sorteado en el servidor;
 * esto es pura dramatización.
 */
function buildStrip(pool: TieBreakerPlayer[], target: TieBreakerPlayer): TieBreakerPlayer[] {
  const strip: TieBreakerPlayer[] = [];
  while (strip.length < FILLER_ROWS) {
    const cycle = [...pool];
    for (let i = cycle.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cycle[i], cycle[j]] = [cycle[j], cycle[i]];
    }
    strip.push(...cycle);
  }
  strip.length = FILLER_ROWS;
  strip.push(target);
  const others = pool.filter((p) => p.player_id !== target.player_id);
  strip.push(others[Math.floor(Math.random() * others.length)] ?? target);
  return strip;
}

const SPARKS = Array.from({ length: 10 }, (_, i) => {
  const angle = (i / 10) * Math.PI * 2;
  return { x: Math.cos(angle) * 90, y: Math.sin(angle) * 55, delay: (i % 5) * 0.04 };
});

/**
 * Carrete vertical tipo tragamonedas: gira sobre el pool y aterriza en el
 * ganador predeterminado. Un solo tween con ease-out fuerte lee como
 * acelerar → planear → frenar; barato en GPU para 250 teléfonos.
 */
export default function RouletteReel({
  pool,
  target,
  rowHeight,
  durationMs,
  onDone,
  hidePoints = false,
}: {
  pool: TieBreakerPlayer[];
  target: TieBreakerPlayer;
  rowHeight: number;
  durationMs: number;
  onDone: () => void;
  hidePoints?: boolean;
}) {
  const reduced = useReducedMotion();
  const dur = reduced ? 800 : durationMs;
  // Tira estable durante la vida del componente (el padre re-monta por pick).
  const [strip] = useState(() => buildStrip(pool, target));
  const [landed, setLanded] = useState(false);
  const doneFired = useRef(false);

  // y = -(k-1)·h centra la fila k; el objetivo está en k = FILLER_ROWS.
  const targetIndex = FILLER_ROWS;
  const travel = -(targetIndex - 1) * rowHeight;
  const viewport = rowHeight * 3;

  useEffect(() => {
    if (!landed || doneFired.current) return;
    doneFired.current = true;
    const t = setTimeout(onDone, LAND_PAUSE_MS);
    return () => clearTimeout(t);
  }, [landed, onDone]);

  return (
    <div
      className="relative w-full max-w-full overflow-hidden rounded-2xl border border-smoke bg-char/70"
      style={{ height: viewport }}
    >
      <motion.div
        initial={{ y: 0 }}
        animate={{ y: travel }}
        transition={{ duration: dur / 1000, ease: [0.1, 0.8, 0.2, 1] }}
        onAnimationComplete={() => setLanded(true)}
      >
        {strip.map((p, i) => {
          const isTarget = i === targetIndex;
          const highlight = landed && isTarget;
          return (
            <motion.div
              key={i}
              className="flex items-center gap-3 px-5"
              style={{ height: rowHeight }}
              animate={highlight ? { scale: [1, 1.1, 1.04] } : undefined}
              transition={{ duration: 0.45 }}
            >
              <Avatar alias={p.alias} size={Math.round(rowHeight * 0.62)} avatarUrl={p.avatar} />
              <span
                className={`min-w-0 flex-1 truncate font-title font-extrabold uppercase leading-none ${
                  highlight ? "j-text-fire" : "text-bone"
                }`}
                style={{ fontSize: rowHeight * 0.32 }}
              >
                {p.alias}
              </span>
              {!hidePoints && (
                <span
                  className="shrink-0 font-title font-bold tabular-nums text-bone-dim"
                  style={{ fontSize: rowHeight * 0.26 }}
                >
                  {p.puntos} pts
                </span>
              )}
            </motion.div>
          );
        })}
      </motion.div>

      {/* Difuminado arriba/abajo: sólo la ranura central queda nítida. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0"
        style={{ height: rowHeight, background: "linear-gradient(to bottom, var(--ash), transparent)" }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{ height: rowHeight, background: "linear-gradient(to top, var(--ash), transparent)" }}
      />

      {/* Marco de la ranura central */}
      <div
        className={`pointer-events-none absolute inset-x-2 rounded-xl border-2 transition-[border-color,box-shadow] duration-300 ${
          landed
            ? "border-ember shadow-[0_0_34px_-6px_rgba(255,77,0,0.85)]"
            : "border-ember/45 shadow-[0_0_22px_-8px_rgba(255,77,0,0.5)]"
        }`}
        style={{ top: rowHeight, height: rowHeight }}
      />
      {/* Punteros laterales */}
      <div
        className="pointer-events-none absolute left-0"
        style={{
          top: rowHeight + rowHeight / 2 - 7,
          borderTop: "7px solid transparent",
          borderBottom: "7px solid transparent",
          borderLeft: "10px solid var(--ember)",
        }}
      />
      <div
        className="pointer-events-none absolute right-0"
        style={{
          top: rowHeight + rowHeight / 2 - 7,
          borderTop: "7px solid transparent",
          borderBottom: "7px solid transparent",
          borderRight: "10px solid var(--ember)",
        }}
      />

      {/* Chispas al aterrizar */}
      {landed &&
        SPARKS.map((s, i) => (
          <motion.span
            key={i}
            className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-ember"
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: s.x, y: s.y, opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.7, delay: s.delay, ease: "easeOut" }}
          />
        ))}
    </div>
  );
}
