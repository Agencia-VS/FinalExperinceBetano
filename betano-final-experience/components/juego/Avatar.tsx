"use client";

import Image from "next/image";

const AVATAR_BASE = "/juego/AVATARES";

const RING_COLORS = ["#FFD24A", "#D8D8D8", "#E08A4B"];

type Props = {
  alias: string;
  rank?: number;
  size: number;
  avatarUrl?: string | null;
  className?: string;
};

/**
 * Avatar de jugador unificado:
 * - Si `avatarUrl` existe, muestra la imagen del avatar.
 * - Si no, fallback al sistema de iniciales con color determinístico.
 * - Anillo de color según posición de ranking (top 3).
 */
export default function Avatar({ alias, rank, size, avatarUrl, className = "" }: Props) {
  const ringColor =
    rank != null && rank <= 3
      ? RING_COLORS[rank - 1]
      : "var(--smoke)";

  if (avatarUrl) {
    return (
      <span
        className={`relative inline-block shrink-0 overflow-hidden rounded-full ${className}`}
        style={{
          width: size,
          height: size,
          boxShadow: `0 0 0 2px ${ringColor}`,
        }}
        aria-hidden
      >
        <Image
          src={`${AVATAR_BASE}/${avatarUrl}`}
          alt={alias}
          fill
          className="object-cover"
          sizes={`${size}px`}
          unoptimized
        />
      </span>
    );
  }

  // Fallback: iniciales con color determinístico
  const initials = alias
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Hash simple para color determinístico por alias.
  let hash = 0;
  for (let i = 0; i < alias.length; i++) {
    hash = alias.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  const bg = `hsl(${h}, 35%, 18%)`;

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-title font-bold uppercase text-bone ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        backgroundColor: bg,
        boxShadow: `0 0 0 2px ${ringColor}`,
      }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
