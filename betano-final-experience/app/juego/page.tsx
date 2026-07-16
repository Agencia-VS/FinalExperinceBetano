"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import CountdownTimer from "@/components/juego/CountdownTimer";
import Image from "next/image";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 30 } },
};

export default function JuegoHome() {
  const [isReturningPlayer, setIsReturningPlayer] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("juego_player");
    if (raw) {
      try {
        const p = JSON.parse(raw);
        if (p.playerId) {
          // Optimista: mostrar botón de inmediato, validar en segundo plano.
          setIsReturningPlayer(true);
          fetch(`/api/juego/pronosticos?playerId=${encodeURIComponent(p.playerId)}`)
            .then((r) => {
              if (!r.ok) throw new Error("not-found");
            })
            .catch(() => {
              // Jugador borrado del servidor → limpiar caché local.
              localStorage.removeItem("juego_player");
              localStorage.removeItem(`juego_picks_${p.playerId}`);
              setIsReturningPlayer(false);
            });
        }
      } catch { /* ignore malformed */ }
    }
  }, []);

  return (
    <motion.main
      variants={container}
      initial="hidden"
      animate="show"
      className="mx-auto flex w-full max-w-md flex-1 flex-col"
    >
      {/* Top bar: marca + fecha del evento */}
      <motion.header variants={item} className="flex items-center justify-between">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <Image src="/juego/LOGO BETANO HORIZONTAL.png" alt="Betano" width={0} height={0} sizes="12rem" className="h-7 w-auto" />
        <span className="rounded-full border border-smoke bg-char/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-bone-dim">
          19 · 07 · 2026
        </span>
      </motion.header>

      {/* Hero central */}
      <div className="flex flex-1 flex-col justify-center py-12">
        <motion.p
          variants={item}
          className="mb-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.26em] text-white/80"
        >
          <span className="j-live-dot inline-block h-1.5 w-1.5 rounded-full bg-white" />
          Final Experience · Mundial 2026
        </motion.p>

        <motion.h1
          variants={item}
          className="font-title text-[clamp(3.2rem,17vw,5rem)] font-extrabold uppercase leading-[0.88] tracking-tight text-bone"
        >
          {/* Móvil */}
          <Image src="/juego/FINAL BET.png" alt="Final Experience" width={0} height={0} sizes="12rem" className="h-auto w-48 md:hidden" />
          {/* Desktop */}
          <Image src="/juego/FINAL BET HORIZONTAL.png" alt="Final Experience" width={0} height={0} sizes="24rem" className="hidden h-auto w-96 md:block" />
        </motion.h1>

        <motion.p
          variants={item}
          className="mt-5 max-w-[21rem] text-[15px] leading-relaxed text-white/80"
        >
          ¡Participa y gana premios fantásticos! En cada respuesta tendrás la
          oportunidad de ganar.
        </motion.p>

        {/* Countdown al kickoff */}
        <CountdownTimer className="mt-7" />

        {/* Features */}
        <motion.ul variants={item} className="mt-9 grid grid-cols-3 gap-2.5">
          <Feature
            icon={
              <>
                <path d="M4 8h16a1 1 0 0 1 1 1v2a2 2 0 0 0 0 4v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a2 2 0 0 0 0-4V9a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
                <path d="M13 8v10" strokeLinecap="round" strokeDasharray="2 2.5" />
              </>
            }
            label="Sorteo en vivo"
          />
          <Feature
            icon={
              <>
                <path d="M3 11h18v3H3zM4.5 14h15v7h-15z" strokeLinejoin="round" />
                <path d="M12 11v10" strokeLinecap="round" />
                <path d="M12 11S10.5 7.5 8.5 7.5a2 2 0 1 0 0 3.5M12 11s1.5-3.5 3.5-3.5a2 2 0 1 1 0 3.5" strokeLinejoin="round" />
              </>
            }
            label="10 premios"
          />
          <Feature
            icon={
              <>
                <circle cx="12" cy="12" r="9" />
                <path d="M9.4 9.3a2.7 2.7 0 1 1 3.2 3.5v1.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12.5 17.2h.01" strokeLinecap="round" strokeWidth="2.4" />
              </>
            }
            label="10 preguntas flash"
          />
        </motion.ul>
      </div>

      {/* CTA */}
      <motion.div variants={item} className="flex flex-col gap-3">
        {isReturningPlayer ? (
          <Link href="/juego/trivia" className="btn-ember j-cta w-full py-4 text-base">
            Ir a mis respuestas
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        ) : (
          <Link href="/juego/registro" className="btn-ember j-cta w-full py-4 text-base">
            Comenzar a jugar
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        )}
        <p className="text-center text-xs text-bone-dim">
          Gratis · menos de un minuto · sin descargas
        </p>
      </motion.div>
    </motion.main>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <li className="j-card flex flex-col items-center gap-2 px-2 py-3.5 text-center">
      <svg
        className="h-5 w-5 text-wither"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden
      >
        {icon}
      </svg>
      <span className="text-[11px] font-semibold leading-tight text-bone-dim">{label}</span>
    </li>
  );
}
