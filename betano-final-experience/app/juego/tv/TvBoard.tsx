"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createBrowser } from "@/lib/supabase-browser";
import Avatar from "@/components/juego/Avatar";
import FinalReveal from "@/components/juego/FinalReveal";
import { useFinalReveal, type FinalResultRow } from "@/components/juego/useFinalReveal";
import type { Row } from "@/components/juego/RankingLive";

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
  const { result: finalResult, active: finalActive, skipAnimation } =
    useFinalReveal(initialFinalResult);

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
  const top = ranking.slice(0, 10);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col pb-8">
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

      {/* Final del juego: ruleta + podio a pantalla completa */}
      <AnimatePresence>
        {finalActive && finalResult && (
          <FinalReveal
            key={finalResult.seed ?? "final"}
            result={finalResult}
            variant="tv"
            skipAnimation={skipAnimation}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
