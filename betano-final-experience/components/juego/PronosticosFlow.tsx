"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import MarketCard from "./MarketCard";
import CountdownTimer from "./CountdownTimer";
import { createBrowser } from "@/lib/supabase-browser";
import { replaceTeamNames } from "@/lib/juego/teamLabels";

export type MarketOption = {
  id: string;
  etiqueta: string;
  puntos: number;
  /** 'otro' (resultado exacto) ocupa todas las columnas de la grilla. */
  valor: string | null;
};
export type Market = {
  id: string;
  titulo: string;
  descripcion: string | null;
  resolves_at: string;
  /** Ventana que cuenta: '90' | '120' | 'ht' | null (no aplica). */
  tiempo: string | null;
  options: MarketOption[];
};
export type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function PronosticosFlow({
  markets,
  homeTeam,
  awayTeam,
  kickoffAt,
}: {
  markets: Market[];
  homeTeam: string | null;
  awayTeam: string | null;
  kickoffAt?: string | null;
}) {
  const router = useRouter();
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [aliasName, setAliasName] = useState<string>("");
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, SaveStatus>>({});
  const [locked, setLocked] = useState(false);
  const pending = useRef<Record<string, string>>({});

  // Reemplazar "Local"/"Visita" en las etiquetas por los nombres reales de
  // los equipos (cuando API-Football ya los haya enviado al poller).
  const displayMarkets = useMemo(() => {
    if (!homeTeam && !awayTeam) return markets;
    const repl = (s: string) => replaceTeamNames(s, homeTeam, awayTeam);
    return markets.map((m) => ({
      ...m,
      titulo: repl(m.titulo),
      descripcion: m.descripcion ? repl(m.descripcion) : null,
      options: m.options.map((o) => ({ ...o, etiqueta: repl(o.etiqueta) })),
    }));
  }, [markets, homeTeam, awayTeam]);

  // Identidad + hidratación de picks locales.
  // Optimista: renderiza inmediato desde localStorage y valida en segundo
  // plano contra el servidor. Si el jugador fue borrado (ej. RESET de admin),
  // limpia localStorage y redirige a registro.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("juego_player");
      if (!raw) {
        router.replace("/juego/registro");
        return;
      }
      const p = JSON.parse(raw);
      // Optimista: mostrar UI de inmediato con datos cacheados.
      setPlayerId(p.playerId);
      setAliasName(p.alias ?? "");
      const saved = localStorage.getItem(`juego_picks_${p.playerId}`);
      if (saved) setPicks(JSON.parse(saved));

      // Validación server-side en segundo plano.
      fetch(`/api/juego/pronosticos?playerId=${encodeURIComponent(p.playerId)}`)
        .then((r) => {
          if (!r.ok) throw new Error("not-found");
        })
        .catch(() => {
          // Jugador huérfano: limpiar y redirigir.
          localStorage.removeItem("juego_player");
          localStorage.removeItem(`juego_picks_${p.playerId}`);
          router.replace("/juego/registro");
        });
    } catch {
      router.replace("/juego/registro");
    }
  }, [router]);

  // ¿Pronósticos cerrados? Carga inicial + suscripción Realtime para detectar
  // el cierre en vivo sin que el usuario tenga que recargar la página.
  useEffect(() => {
    fetch("/api/juego/leaderboard")
      .then((r) => r.json())
      .then((d) => { if (d.predictionsLocked) setLocked(true); })
      .catch(() => {});

    const supabase = createBrowser();
    const ch = supabase
      .channel("match_state_lock")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "juego_match_state" },
        (payload: { new: { predictions_locked?: boolean } }) => {
          if (payload.new?.predictions_locked) setLocked(true);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const save = useCallback(async (pid: string, optionId: string, marketId: string) => {
    setStatus((s) => ({ ...s, [marketId]: "saving" }));
    try {
      const res = await fetch("/api/juego/pronosticos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId: pid, options: [optionId] }),
      });
      if (!res.ok) {
        if (res.status === 423) setLocked(true);
        throw new Error();
      }
      setStatus((s) => ({ ...s, [marketId]: "saved" }));
      delete pending.current[marketId];
    } catch {
      setStatus((s) => ({ ...s, [marketId]: "error" }));
      pending.current[marketId] = optionId;
    }
  }, []);

  const onSelect = useCallback(
    (marketId: string, optionId: string) => {
      if (!playerId || locked) return;
      setPicks((prev) => {
        const next = { ...prev, [marketId]: optionId };
        localStorage.setItem(`juego_picks_${playerId}`, JSON.stringify(next));
        return next;
      });
      save(playerId, optionId, marketId);
    },
    [playerId, locked, save]
  );

  // Reintento automático al recuperar conexión.
  useEffect(() => {
    function flush() {
      if (!playerId) return;
      Object.entries(pending.current).forEach(([m, o]) => save(playerId, o, m));
    }
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [playerId, save]);

  const answered = Object.keys(picks).length;
  const total = displayMarkets.length;
  const pct = total ? Math.round((answered / total) * 100) : 0;
  const complete = total > 0 && answered >= total;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col pb-32 md:max-w-2xl">
      {/* Header sticky: progreso */}
      <header
        className="sticky top-0 z-10 -mx-5 border-b border-smoke/60 bg-ash/80 px-5 pb-4 backdrop-blur-md"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.25rem)" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-ember">
              Paso 2 · Tus jugadas
            </p>
            <h1 className="mt-1 font-title text-[1.6rem] font-extrabold uppercase leading-none tracking-tight text-bone">
              Arma tu apuesta
            </h1>
          </div>
          {aliasName && (
            <span className="max-w-[9rem] truncate rounded-full border border-smoke bg-char/70 px-3 py-1.5 text-xs font-semibold text-bone">
              {aliasName}
            </span>
          )}
        </div>

        {kickoffAt && (
          <CountdownTimer kickoffAt={kickoffAt} className="mt-4" />
        )}

        <div className="mt-3.5 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-smoke/80">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: "linear-gradient(90deg, #C2350A, #FF4D00, #FF8A3D)",
                boxShadow: "0 0 12px rgba(255,77,0,0.5)",
              }}
              animate={{ width: `${pct}%` }}
              transition={{ type: "spring", stiffness: 220, damping: 30 }}
            />
          </div>
          <span className="text-xs font-bold tabular-nums text-bone">
            {answered}
            <span className="font-medium text-bone-dim">/{total}</span>
          </span>
        </div>
        <p className="mt-1.5 text-[11px] text-bone-dim">
          {complete
            ? "¡Listo! Todas tus jugadas están guardadas."
            : "Cada jugada se guarda sola al elegirla."}
        </p>
      </header>

      {locked && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-ember/40 bg-ember/10 px-4 py-3">
          <svg className="h-5 w-5 shrink-0 text-ember" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="1.8" />
          </svg>
          <p className="text-sm text-bone">
            Pronósticos cerrados. <span className="text-bone-dim">¡Arrancó la final!</span>
          </p>
        </div>
      )}

      {/* Mercados */}
      <div className="mt-5 grid grid-cols-1 gap-3.5 md:grid-cols-2 md:items-start">
        {displayMarkets.map((m, i) => (
          <MarketCard
            key={m.id}
            index={i}
            market={m}
            selected={picks[m.id]}
            status={status[m.id] ?? "idle"}
            disabled={locked}
            onSelect={(o) => onSelect(m.id, o)}
          />
        ))}
        {displayMarkets.length === 0 && (
          <div className="j-card col-span-full px-5 py-10 text-center">
            <p className="font-title text-lg font-bold uppercase text-bone">
              Aún no hay jugadas
            </p>
            <p className="mt-1 text-sm text-bone-dim">
              Los mercados se publican antes del partido. Vuelve en un rato.
            </p>
          </div>
        )}
      </div>

      {/* Barra inferior fija */}
      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t border-smoke/60 bg-ash/85 px-5 pt-3 backdrop-blur-md"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.8rem)" }}
      >
        <div className="mx-auto flex max-w-md items-center gap-4 md:max-w-2xl">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-bone">
              {complete ? "Apuesta completa" : `${answered} de ${total} jugadas`}
            </p>
            <p className="truncate text-[11px] text-bone-dim">
              {complete ? "Ya puedes enviar tus jugadas" : "Guardado automático activo"}
            </p>
          </div>
          <Link
            href="/juego/ranking"
            className={`btn-ember shrink-0 !px-5 !py-3.5 text-sm ${complete ? "j-cta" : ""}`}
          >
            Enviar e ir al ranking
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </div>
    </main>
  );
}
