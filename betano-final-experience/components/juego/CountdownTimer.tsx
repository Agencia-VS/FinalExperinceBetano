"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

type TimeLeft = { days: number; hours: number; minutes: number; seconds: number } | null;

function calcTimeLeft(target: Date): TimeLeft {
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return null;
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  };
}

/**
 * Countdown hacia el kickoff. Recibe `kickoffAt` (ISO string) y muestra
 * días/horas/minutos/segundos en tiempo real. Si el partido ya empezó,
 * oculta el componente.
 *
 * También hace fetch del leaderboard para obtener el kickoffAt si no se
 * pasa como prop (útil en la home /juego donde no hay server data).
 */
export default function CountdownTimer({
  kickoffAt: initialKickoff,
  className = "",
}: {
  kickoffAt?: string | null;
  className?: string;
}) {
  const [target, setTarget] = useState<Date | null>(
    initialKickoff ? new Date(initialKickoff) : null
  );
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(
    initialKickoff ? calcTimeLeft(new Date(initialKickoff)) : null
  );

  // Si no se pasa kickoffAt, lo obtenemos del leaderboard.
  useEffect(() => {
    if (target) return;
    fetch("/api/juego/leaderboard")
      .then((r) => r.json())
      .then((d) => {
        if (d.kickoffAt) {
          const t = new Date(d.kickoffAt);
          setTarget(t);
          setTimeLeft(calcTimeLeft(t));
        }
      })
      .catch(() => {});
  }, [target]);

  // Tick cada segundo.
  useEffect(() => {
    if (!target) return;
    const iv = setInterval(() => setTimeLeft(calcTimeLeft(target)), 1000);
    return () => clearInterval(iv);
  }, [target]);

  // Partido ya empezó o sin datos → no mostrar nada.
  if (!timeLeft) return null;

  const segments = [
    { value: timeLeft.days, label: "d" },
    { value: timeLeft.hours, label: "h" },
    { value: timeLeft.minutes, label: "m" },
    { value: timeLeft.seconds, label: "s" },
  ];

  // Omitir días si faltan 0.
  const startIdx = timeLeft.days === 0 ? 1 : 0;
  const visible = segments.slice(startIdx);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={className}
    >
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/80">
        La final comienza en
      </p>
      <div className="flex items-center gap-1.5" aria-label="Cuenta regresiva para el inicio del partido" role="timer">
        {visible.map((seg, i) => (
          <span key={seg.label} className="flex items-center gap-1.5">
            <span className="flex min-w-[2.5rem] flex-col items-center rounded-xl border border-ember/30 bg-ember/10 px-2.5 py-1.5">
              <span className="font-title text-xl font-extrabold tabular-nums leading-none text-bone">
                {String(seg.value).padStart(2, "0")}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-wither">
                {seg.label}
              </span>
            </span>
            {i < visible.length - 1 && (
              <span className="text-sm font-bold text-white/80" aria-hidden>:</span>
            )}
          </span>
        ))}
      </div>
    </motion.div>
  );
}
