"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createBrowser } from "@/lib/supabase-browser";
import Avatar from "@/components/juego/Avatar";
import FinalReveal from "@/components/juego/FinalReveal";
import PrizeReveal from "@/components/juego/PrizeReveal";
import { useFinalReveal, type FinalResultRow } from "@/components/juego/useFinalReveal";
import type { Row } from "@/components/juego/RankingLive";
import { applyFinalOrder } from "@/lib/juego/ranking";

const LIVE_STATES = ["live_1h", "halftime", "live_2h", "extra_time", "penalties"];
const MEDAL = ["#FFD24A", "#D8D8D8", "#E08A4B"];

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Programado",
  live_1h: "1er tiempo",
  halftime: "Entretiempo",
  live_2h: "2do tiempo",
  extra_time: "Alargue",
  penalties: "Penales",
  finished: "Finalizado",
};

export default function TvBoard({
  initialRanking,
  matchStatus,
  homeTeam,
  awayTeam,
  initialFinalResult,
}: {
  initialRanking: Row[];
  matchStatus: string;
  homeTeam: string | null;
  awayTeam: string | null;
  initialFinalResult: FinalResultRow | null;
}) {
  const [ranking, setRanking] = useState<Row[]>(initialRanking);
  const [status, setStatus] = useState(matchStatus);
  const {
    result: finalResult,
    active: finalActive,
    skipAnimation,
    prizesActive,
    skipPrizeAnimation,
  } = useFinalReveal(initialFinalResult);
  const [isFs, setIsFs] = useState(false);
  const [idle, setIdle] = useState(false);

  // Pantalla completa (kiosco de proyector): oculta el chrome del navegador.
  // Los navegadores exigen un gesto del usuario, por eso es un botón manual.
  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.();
  };
  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Oculta el cursor tras unos segundos quieto (se ve solo el juego).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), 4000);
    };
    wake();
    window.addEventListener("mousemove", wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousemove", wake);
    };
  }, []);

  // Leaderboard en vivo: Realtime + poll de respaldo (patrón de RankingLive).
  useEffect(() => {
    const supabase = createBrowser();
    const channel = supabase
      .channel("tv_leaderboard")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "juego_leaderboard_cache" },
        (payload: { new: { ranking?: Row[] } }) => {
          const r = payload.new?.ranking;
          if (Array.isArray(r)) setRanking(r);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "juego_match_state" },
        (payload: { new: { match_status?: string } }) => {
          if (payload.new?.match_status) setStatus(payload.new.match_status);
        }
      )
      .subscribe();

    const iv = setInterval(() => {
      fetch("/api/juego/leaderboard")
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d.ranking)) setRanking(d.ranking);
          if (typeof d.matchStatus === "string") setStatus(d.matchStatus);
        })
        .catch(() => {});
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(iv);
    };
  }, []);

  const isLive = LIVE_STATES.includes(status);
  const top = applyFinalOrder(ranking, finalResult?.winners).slice(0, 10);

  return (
    <main
      className={`no-scrollbar mx-auto flex w-full max-w-5xl flex-1 flex-col overflow-y-auto pb-8 ${idle ? "cursor-none" : ""}`}
    >
      {/* Header proyector */}
      <header className="flex items-center justify-between pb-8 pt-2">
        <h1 className="font-title text-5xl font-extrabold uppercase leading-none tracking-tight text-bone">
          {homeTeam && awayTeam ? (
            <>
              {homeTeam} <span className="text-wither">vs</span> {awayTeam}
            </>
          ) : (
            "Ranking en vivo"
          )}
        </h1>
        <div className="flex items-center gap-3">
          <span
            className={`flex items-center gap-3 rounded-full border px-5 py-2.5 text-lg font-bold uppercase tracking-[0.14em] ${
              isLive ? "border-ember/50 bg-ember/10 text-wither" : "border-smoke bg-char/60 text-bone-dim"
            }`}
          >
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                isLive ? "j-live-dot bg-ember" : "bg-bone-dim"
              }`}
            />
            {STATUS_LABEL[status] ?? status}
          </span>
          <button
            onClick={toggleFs}
            aria-label={isFs ? "Salir de pantalla completa" : "Pantalla completa"}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-smoke bg-char/60 text-bone-dim transition-colors hover:border-ember/50 hover:text-bone"
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden>
              {isFs ? (
                <path
                  d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <path
                  d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </svg>
          </button>
        </div>
      </header>

      {/* Top 10 a escala de proyector */}
      {top.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="font-title text-3xl font-bold uppercase text-bone-dim">
            Aún no hay jugadores en el ranking
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {top.map((r) => (
              <motion.li
                layout
                key={r.player_id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 36 }}
                className={`flex items-center gap-5 rounded-2xl border px-6 py-3.5 ${
                  r.posicion === 1 ? "border-[#FFD24A]/40 bg-char/70" : "border-smoke bg-char/55"
                }`}
              >
                <span
                  className="w-14 shrink-0 text-center font-title text-4xl font-bold tabular-nums"
                  style={{ color: r.posicion <= 3 ? MEDAL[r.posicion - 1] : "var(--bone-dim)" }}
                >
                  {r.posicion}
                </span>
                <Avatar alias={r.alias} rank={r.posicion} size={56} avatarUrl={r.avatar} />
                <span className="min-w-0 flex-1 truncate text-3xl font-semibold text-bone">
                  {r.alias}
                </span>
                <span className="font-title text-4xl font-bold tabular-nums text-bone">
                  {r.puntos}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {/* Final del juego: ruleta + podio a pantalla completa. Una vez sorteados
          los premios (Fase 2), su overlay reemplaza al del podio. */}
      <AnimatePresence>
        {prizesActive && finalResult ? (
          <PrizeReveal
            key={finalResult.prize_seed ?? "prizes"}
            result={finalResult}
            variant="tv"
            skipAnimation={skipPrizeAnimation}
          />
        ) : finalActive && finalResult ? (
          <FinalReveal
            key={finalResult.seed ?? "final"}
            result={finalResult}
            variant="tv"
            skipAnimation={skipAnimation}
          />
        ) : null}
      </AnimatePresence>
    </main>
  );
}
