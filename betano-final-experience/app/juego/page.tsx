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
        if (p.playerId) setIsReturningPlayer(true);
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
        <Image src="/isoBetanoblanco.png" alt="Betano" width={0} height={0} sizes="7rem" className="h-7 w-auto" />
        <span className="rounded-full border border-smoke bg-char/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-bone-dim">
          19 · 07 · 2026
        </span>
      </motion.header>

      {/* Hero central */}
      <div className="flex flex-1 flex-col justify-center py-12">
        <motion.p
          variants={item}
          className="mb-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.26em] text-ember"
        >
          <span className="j-live-dot inline-block h-1.5 w-1.5 rounded-full bg-ember" />
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
          className="mt-5 max-w-[21rem] text-[15px] leading-relaxed text-bone-dim"
        >
          Arma tus jugadas antes del pitazo inicial y mira cómo escalas en el
          ranking en vivo, jugada a jugada, con toda la tribuna.
        </motion.p>

        {/* Countdown al kickoff */}
        <CountdownTimer className="mt-7" />

        {/* Features */}
        <motion.ul variants={item} className="mt-9 grid grid-cols-3 gap-2.5">
          <Feature
            icon={
              <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H13L13 2Z" strokeLinejoin="round" />
            }
            label="Ranking en vivo"
          />
          <Feature
            icon={
              <>
                <path d="M8 21h8M12 17v4" strokeLinecap="round" />
                <path d="M6 3h12v5a6 6 0 0 1-12 0V3Z" strokeLinejoin="round" />
                <path d="M18 5h2.5a0.5 0.5 0 0 1 .5.5C21 8 19.5 9.5 18 9.7M6 5H3.5a0.5 0.5 0 0 0-.5.5C3 8 4.5 9.5 6 9.7" strokeLinecap="round" />
              </>
            }
            label="Premios top 3"
          />
          <Feature
            icon={
              <>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8.4l3.1 2.25-1.2 3.6h-3.8l-1.2-3.6L12 8.4Z" strokeLinejoin="round" />
              </>
            }
            label="16 jugadas"
          />
        </motion.ul>
      </div>

      {/* CTA */}
      <motion.div variants={item} className="flex flex-col gap-3">
        <Link href="/juego/registro" className="btn-ember j-cta w-full py-4 text-base">
          Comenzar a jugar
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        {isReturningPlayer && (
          <Link
            href="/juego/ranking"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-smoke bg-char/40 py-3.5 text-sm font-semibold text-bone transition-colors hover:bg-char/60 active:bg-char/80"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M3 22h18M8 17V9m4 8V3m4 14v-4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Ir al ranking
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
        className="h-5 w-5 text-ember"
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
