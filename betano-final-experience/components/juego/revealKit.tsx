"use client";

/**
 * Kit de animación compartido por los reveals del final del juego.
 *
 * Piezas agnósticas reutilizables por cualquier modalidad de sorteo
 * (desempates, premios físicos, …): la ruleta (`RouletteReel`, ya genérica),
 * `SpinStage` (la ruleta girando con textos inyectados) y `WinnerReveal` (la
 * tarjeta de revelación de un ganador). El orquestador de cada modalidad
 * decide los textos, el pool y el ganador; estas piezas sólo dramatizan.
 */

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import Avatar from "./Avatar";
import RouletteReel from "./RouletteReel";
import type { TieBreakerPlayer } from "@/lib/juego/winners";

export const MEDAL = ["#FFD24A", "#D8D8D8", "#E08A4B"];

/** Timings compartidos: teléfonos y TV reproducen la misma partitura, así
 *  todas las pantallas van casi sincronizadas sin coordinación extra. */
export const T = {
  intro: 2600,
  eventIntro: 3200,
  spin: 4200,
  pickReveal: 2600,
  // Red de seguridad: si el carrete nunca avisa que aterrizó (pestaña en
  // segundo plano, celular bloqueado, glitch de animación), esto fuerza el
  // avance igual para que la pantalla nunca quede pegada girando.
  spinFallback: 4200 + 750 + 2500,
} as const;

/** Mapa de tamaños por superficie; la lógica y los timings son idénticos. */
export const SZ = {
  mobile: {
    wrap: "max-w-md px-6",
    eyebrow: "text-[11px] tracking-[0.3em]",
    title: "text-3xl",
    subtitle: "text-sm",
    row: 64,
    winAvatar: 96,
    winAlias: "text-3xl",
    posLabel: "text-5xl",
    podiumAvatar: 56,
    podiumFirstAvatar: 74,
    listAvatar: 34,
  },
  tv: {
    wrap: "max-w-4xl px-12",
    eyebrow: "text-lg tracking-[0.35em]",
    title: "text-7xl",
    subtitle: "text-2xl",
    row: 112,
    winAvatar: 190,
    winAlias: "text-7xl",
    posLabel: "text-8xl",
    podiumAvatar: 104,
    podiumFirstAvatar: 140,
    listAvatar: 52,
  },
} as const;

export type Sizes = (typeof SZ)[keyof typeof SZ];

export const phaseAnim = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -14 },
  transition: { type: "spring" as const, stiffness: 350, damping: 36 },
};

export function posLabel(n: number) {
  return `${n}º`;
}

export function positionsLabel(positions: number[]) {
  const labels = positions.map(posLabel);
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]}`;
}

/**
 * La ruleta girando, agnóstica: recibe los textos, el pool que gira y el
 * ganador predeterminado. Sirve igual para "¿Quién se queda con el 3º lugar?"
 * que para "Premio: PlayStation 5".
 */
export function SpinStage({
  eyebrow,
  title,
  pool,
  target,
  sz,
  onDone,
  hidePoints = false,
}: {
  eyebrow: string;
  title: string;
  pool: TieBreakerPlayer[];
  target: TieBreakerPlayer;
  sz: Sizes;
  onDone: () => void;
  hidePoints?: boolean;
}) {
  return (
    <motion.div {...phaseAnim} className="text-center">
      <p className={`font-bold uppercase text-wither ${sz.eyebrow}`}>{eyebrow}</p>
      <h2 className={`mt-3 font-title font-extrabold uppercase leading-none text-bone ${sz.title}`}>
        {title}
      </h2>
      <div className="mt-7">
        <RouletteReel
          pool={pool}
          target={target}
          rowHeight={sz.row}
          durationMs={T.spin}
          onDone={onDone}
          hidePoints={hidePoints}
        />
      </div>
    </motion.div>
  );
}

/**
 * Tarjeta de revelación de un ganador, agnóstica: el caller decide el
 * encabezado (puesto o nombre de premio), su color, el sublabel y un footer
 * opcional (ej. la lista de "quedan fuera" en un cutoff de desempate).
 */
export function WinnerReveal({
  heading,
  headingColor,
  player,
  subLabel,
  isMe,
  rank,
  sz,
  footer,
}: {
  heading: string;
  headingColor: string;
  player: TieBreakerPlayer;
  subLabel?: string;
  isMe: boolean;
  rank?: number;
  sz: Sizes;
  footer?: ReactNode;
}) {
  return (
    <motion.div {...phaseAnim} className="text-center">
      <p
        className={`font-title font-extrabold uppercase leading-none ${sz.posLabel}`}
        style={{ color: headingColor }}
      >
        {heading}
      </p>
      <motion.div
        className="mt-5 flex justify-center"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
      >
        <Avatar alias={player.alias} rank={rank} size={sz.winAvatar} avatarUrl={player.avatar} />
      </motion.div>
      <h2 className={`mt-4 font-title font-extrabold uppercase leading-none text-bone ${sz.winAlias}`}>
        {player.alias}
      </h2>
      {subLabel && (
        <p className={`mt-2 font-bold tabular-nums text-bone-dim ${sz.subtitle}`}>{subLabel}</p>
      )}
      {isMe && (
        <motion.p
          className="j-text-fire mt-3 font-title text-xl font-extrabold uppercase"
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 18, delay: 0.35 }}
        >
          ¡Eres tú!
        </motion.p>
      )}
      {footer}
    </motion.div>
  );
}
