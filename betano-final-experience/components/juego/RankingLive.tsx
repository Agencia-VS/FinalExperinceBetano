"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { createBrowser } from "@/lib/supabase-browser";
import PredictionBreakdown from "./PredictionBreakdown";

export type Row = { posicion: number; player_id: string; alias: string; puntos: number };

const LIVE_STATES = ["live_1h", "halftime", "live_2h", "extra_time", "penalties"];
const MEDAL = ["#FFD24A", "#D8D8D8", "#E08A4B"];

export default function RankingLive({
  initialRanking,
  matchStatus,
}: {
  initialRanking: Row[];
  matchStatus: string;
}) {
  const [ranking, setRanking] = useState<Row[]>(initialRanking);
  const [meId, setMeId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [moves, setMoves] = useState<Record<string, number>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);
  const [modalAlias, setModalAlias] = useState("");
  const prevPos = useRef<Map<string, number>>(new Map());
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("juego_player");
      if (raw) setMeId(JSON.parse(raw).playerId);
    } catch {
      /* sin identidad, no pasa nada */
    }
  }, []);

  function applyRanking(next: Row[]) {
    const deltas: Record<string, number> = {};
    for (const r of next) {
      const prev = prevPos.current.get(r.player_id);
      if (prev != null && prev !== r.posicion) deltas[r.player_id] = prev - r.posicion;
    }
    prevPos.current = new Map(next.map((r) => [r.player_id, r.posicion]));
    setRanking(next);
    if (Object.keys(deltas).length) {
      setMoves(deltas);
      if (moveTimer.current) clearTimeout(moveTimer.current);
      moveTimer.current = setTimeout(() => setMoves({}), 5000);
    }
  }

  useEffect(() => {
    prevPos.current = new Map(initialRanking.map((r) => [r.player_id, r.posicion]));
    const supabase = createBrowser();
    const channel = supabase
      .channel("juego_leaderboard")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "juego_leaderboard_cache" },
        (payload: { new: { ranking?: Row[] } }) => {
          const r = payload.new?.ranking;
          if (Array.isArray(r)) applyRanking(r);
        }
      )
      .subscribe((s) => setConnected(s === "SUBSCRIBED"));

    const iv = setInterval(() => {
      fetch("/api/juego/leaderboard")
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d.ranking)) applyRanking(d.ranking);
        })
        .catch(() => {});
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(iv);
      if (moveTimer.current) clearTimeout(moveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return ranking;
    return ranking.filter((r) => r.alias.toLowerCase().includes(q));
  }, [ranking, searchTerm]);

  const podium = filtered.slice(0, 3);
  const rest = filtered.slice(3, 30);
  const me = meId ? ranking.find((r) => r.player_id === meId) : undefined;
  const meInFiltered = me && filtered.find((r) => r.player_id === meId) != null;
  const meVisible = meInFiltered && me.posicion <= 30;
  const isLive = LIVE_STATES.includes(matchStatus);

  function openModal(r: Row) {
    setModalPlayerId(r.player_id);
    setModalAlias(r.alias);
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col pb-8 md:max-w-lg">
      {/* Header */}
      <header className="flex items-center justify-between pb-5">
        <div className="flex items-center gap-3">
          <Link
            href="/juego/pronosticos"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-smoke bg-char/60 text-bone-dim transition-colors hover:border-ember/50 hover:text-bone"
            aria-label="Mis jugadas"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <h1 className="font-title text-[1.7rem] font-extrabold uppercase leading-none tracking-tight text-bone">
            Ranking
          </h1>
        </div>
        <span
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] ${
            isLive
              ? "border-ember/50 bg-ember/10 text-ember"
              : "border-smoke bg-char/60 text-bone-dim"
          }`}
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              isLive ? "j-live-dot bg-ember" : connected ? "bg-[#3ddc84]" : "bg-bone-dim"
            }`}
          />
          {isLive ? "En vivo" : connected ? "Conectado" : "Conectando"}
        </span>
      </header>

      {/* Buscador */}
      <div className="relative mb-4">
        <svg
          className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-bone-dim/60"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Buscar jugador…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-2xl border border-smoke bg-char/80 py-2.5 pl-10 pr-10 text-sm text-bone placeholder:text-bone-dim/50 outline-none transition-[border-color,box-shadow] focus:border-ember/50 focus:shadow-[0_0_0_3px_rgba(255,77,0,0.1)]"
          autoComplete="off"
        />
        {searchTerm && (
          <button
            onClick={() => {
              setSearchTerm("");
              searchInputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-bone-dim/60 transition-colors hover:text-bone"
            aria-label="Limpiar búsqueda"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {filtered.length === 0 && searchTerm ? (
        <div className="py-14 text-center">
          <p className="text-sm text-bone-dim">Nadie llamado &quot;{searchTerm}&quot; en el ranking.</p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Podio top 3 */}
          {podium.length >= 3 && (
            <div className="mb-5 grid grid-cols-3 items-end gap-2.5">
              {[podium[1], podium[0], podium[2]].map((r) => {
                const rank = r.posicion;
                const first = rank === 1;
                return (
                  <motion.button
                    layout
                    key={r.player_id}
                    onClick={() => openModal(r)}
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                    className={`j-card relative flex cursor-pointer flex-col items-center px-2 pb-3.5 text-center ${
                      first ? "pt-6" : "pt-4"
                    } ${first ? "!border-[#FFD24A]/40" : ""} ${
                      r.player_id === meId ? "!border-ember" : ""
                    }`}
                  >
                    {first && (
                      <svg
                        className="absolute -top-3 h-6 w-6 text-[#FFD24A]"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden
                      >
                        <path d="M3 8l4.5 3L12 5l4.5 6L21 8l-1.5 9h-15L3 8Z" />
                      </svg>
                    )}
                    <Avatar alias={r.alias} rank={rank} size={first ? 52 : 42} />
                    <p className="mt-2 w-full truncate text-[12px] font-semibold text-bone">
                      {r.alias}
                    </p>
                    <p
                      className="font-title text-lg font-extrabold tabular-nums leading-tight"
                      style={{ color: MEDAL[rank - 1] }}
                    >
                      {r.puntos}
                    </p>
                    <MoveArrow delta={moves[r.player_id]} />
                  </motion.button>
                );
              })}
            </div>
          )}

          {/* Podio parcial (1-2) */}
          {podium.length > 0 && podium.length < 3 && (
            <div className="mb-5 flex flex-col gap-2">
              {podium.map((r) => (
                <motion.button
                  layout
                  key={r.player_id}
                  onClick={() => openModal(r)}
                  transition={{ type: "spring", stiffness: 450, damping: 38 }}
                  className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-2.5 ${
                    r.player_id === meId
                      ? "border-ember/70 bg-ember/10"
                      : "border-smoke bg-char/55"
                  }`}
                >
                  <RankBadge pos={r.posicion} />
                  <Avatar alias={r.alias} rank={r.posicion} size={34} />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-bone">
                    {r.alias}
                    {r.player_id === meId && <MeBadge />}
                  </span>
                  <MoveArrow delta={moves[r.player_id]} />
                  <span className="font-title text-lg font-bold tabular-nums text-bone">
                    {r.puntos}
                  </span>
                </motion.button>
              ))}
            </div>
          )}

          {/* Tabla */}
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {(podium.length >= 3 ? rest : []).map((r) => {
                const mine = r.player_id === meId;
                return (
                  <motion.li
                    layout
                    key={r.player_id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ type: "spring", stiffness: 450, damping: 38 }}
                  >
                    <button
                      onClick={() => openModal(r)}
                      className={`flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-colors ${
                        mine
                          ? "border-ember/70 bg-ember/10 shadow-[0_0_20px_-8px_rgba(255,77,0,0.5)] hover:bg-ember/15"
                          : "border-smoke bg-char/55 hover:bg-char/70"
                      }`}
                    >
                      <RankBadge pos={r.posicion} />
                      <Avatar alias={r.alias} rank={r.posicion} size={34} />
                      <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-bone">
                        {r.alias}
                        {mine && <MeBadge />}
                      </span>
                      <MoveArrow delta={moves[r.player_id]} />
                      <span className="font-title text-lg font-bold tabular-nums text-bone">
                        {r.puntos}
                      </span>
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </>
      )}

      {/* Sticky: mi posición */}
      {me && !meVisible && (
        <div className="sticky bottom-3 mt-4">
          <button
            onClick={() => openModal(me)}
            className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-2xl border border-ember bg-[#2a1206]/95 px-3.5 py-2.5 text-left shadow-[0_8px_30px_-8px_rgba(255,77,0,0.55)] backdrop-blur transition-colors hover:bg-[#2f1408]"
          >
            <span className="w-7 shrink-0 text-center font-title text-base font-bold tabular-nums text-ember">
              {me.posicion}
            </span>
            <Avatar alias={me.alias} rank={me.posicion} size={34} />
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-bone">
              {me.alias}
              <MeBadge />
            </span>
            <MoveArrow delta={moves[me.player_id]} />
            <span className="font-title text-lg font-bold tabular-nums text-bone">
              {me.puntos}
            </span>
          </button>
        </div>
      )}

      {/* Modal */}
      <PredictionBreakdown
        playerId={modalPlayerId ?? ""}
        alias={modalAlias}
        open={modalPlayerId !== null}
        onClose={() => setModalPlayerId(null)}
      />
    </main>
  );
}

function RankBadge({ pos }: { pos: number }) {
  return (
    <span
      className="w-7 shrink-0 text-center font-title text-base font-bold tabular-nums"
      style={{ color: pos <= 3 ? MEDAL[pos - 1] : "var(--bone-dim)" }}
    >
      {pos}
    </span>
  );
}

function MeBadge() {
  return (
    <span className="ml-1.5 rounded-md bg-ember/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ember">
      Tú
    </span>
  );
}

function Avatar({ alias, rank, size }: { alias: string; rank: number; size: number }) {
  const initials = alias
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const ring = rank <= 3 ? MEDAL[rank - 1] : "var(--smoke)";
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-smoke/80 font-title font-bold uppercase text-bone"
      style={{ width: size, height: size, fontSize: size * 0.36, boxShadow: `0 0 0 2px ${ring}` }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

function MoveArrow({ delta }: { delta?: number }) {
  return (
    <AnimatePresence>
      {delta != null && delta !== 0 && (
        <motion.span
          initial={{ opacity: 0, y: delta > 0 ? 6 : -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className={`flex items-center gap-0.5 text-[11px] font-bold tabular-nums ${
            delta > 0 ? "text-[#3ddc84]" : "text-[#ff8a6a]"
          }`}
        >
          <svg
            className={`h-3 w-3 ${delta > 0 ? "" : "rotate-180"}`}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            {/* Flecha real: apunta arriba al subir; rotate-180 la voltea al bajar. */}
            <path
              d="M12 19V5M6 11l6-6 6 6"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {Math.abs(delta)}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-smoke bg-char/50">
        <svg className="h-7 w-7 text-bone-dim" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H13L13 2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="font-title text-lg font-bold uppercase text-bone">Aún no hay ranking</h2>
      <p className="mt-1.5 max-w-[16rem] text-sm text-bone-dim">
        Sé el primero en registrar tus jugadas y aparecer en el ranking en vivo.
      </p>
      <Link href="/juego/pronosticos" className="btn-ember mt-5 inline-flex items-center gap-2 px-5 py-2.5 text-sm">
        Ir a mis jugadas
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </div>
  );
}
