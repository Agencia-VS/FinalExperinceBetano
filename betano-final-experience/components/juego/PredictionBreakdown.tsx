"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { BreakdownItem } from "@/app/api/juego/pronosticos-detalle/route";
import Avatar from "./Avatar";

export default function PredictionBreakdown({
  playerId,
  alias,
  avatarUrl,
  open,
  onClose,
}: {
  playerId: string;
  alias: string;
  avatarUrl?: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [items, setItems] = useState<BreakdownItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !playerId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/juego/pronosticos-detalle?playerId=${encodeURIComponent(playerId)}`)
      .then((r) => {
        if (!r.ok) throw new Error("No se pudo cargar.");
        return r.json();
      })
      .then((d) => setItems(d.breakdown ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, playerId]);

  const answered = items.filter((i) => i.pickLabel).length;
  const resolved = items.filter((i) => i.resolved).length;
  const lost = items.filter((i) => i.lost && !i.resolved).length;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Sheet */}
          <motion.div
            className="relative mx-auto mt-auto flex w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] border border-smoke/60 bg-ash"
            style={{ maxHeight: "92dvh" }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 350, damping: 36 }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3.5 pb-2">
              <div className="h-1 w-10 rounded-full bg-smoke/80" />
            </div>

            {/* Header */}
            <div className="flex items-start justify-between px-5 pb-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar alias={alias} size={40} avatarUrl={avatarUrl} />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-wither">
                    Detalle de jugadas
                  </p>
                  <h2 className="mt-0.5 truncate font-title text-[1.4rem] font-extrabold uppercase leading-tight text-bone">
                    {alias}
                  </h2>
                  <p className="mt-0.5 text-[11px] text-bone-dim">
                    {answered} jugadas · {resolved} acertadas{lost > 0 ? ` · ${lost} erradas` : ""}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="ml-3 mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-smoke bg-char/60 text-bone-dim transition-colors hover:border-ember/50 hover:text-bone"
                aria-label="Cerrar"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div
              className="flex-1 overflow-y-auto overscroll-contain px-5"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
            >
              {loading && (
                <div className="flex flex-col items-center py-14">
                  <svg className="h-7 w-7 animate-spin text-wither" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  <p className="mt-3 text-sm text-bone-dim">Cargando jugadas…</p>
                </div>
              )}

              {error && (
                <div className="rounded-2xl border border-[#ff6b4a]/30 bg-[#ff6b4a]/10 px-4 py-5 text-center">
                  <p className="text-sm text-[#ff8a6a]">{error}</p>
                  <button onClick={onClose} className="mt-3 text-xs font-semibold text-wither underline">
                    Cerrar
                  </button>
                </div>
              )}

              {!loading && !error && (
                <div className="flex flex-col gap-3 pb-4">
                  {items.map((item, i) => (
                    <BreakdownCard key={item.marketId} item={item} index={i} />
                  ))}
                  {items.length === 0 && (
                    <p className="py-10 text-center text-sm text-bone-dim">
                      Este jugador aún no tiene pronósticos.
                    </p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Tarjeta individual de un mercado en el breakdown. */
function BreakdownCard({ item, index }: { item: BreakdownItem; index: number }) {
  const { titulo, resolvesAt, tiempo, pickLabel, puntos, resolved, statActual, umbral, direccion } = item;
  // Errada solo si además no está acertada (resolved tiene prioridad).
  const lost = item.lost && !resolved;

  const CHIP: Record<string, string> = {
    live: "En vivo",
    halftime: "1er tiempo",
    fulltime: "Final",
  };

  // Tag de la ventana que cuenta: el usuario entiende la regla sin adivinar.
  const TIEMPO_CHIP: Record<string, string> = {
    "90": "90 min",
    "120": "Incluye alargue",
    ht: "1er tiempo",
  };
  const tiempoLabel = tiempo ? TIEMPO_CHIP[tiempo] : null;

  // Barra de progreso solo para O/U
  const hasProgress = statActual != null && umbral != null && direccion != null;
  const pct = hasProgress ? Math.min(100, Math.round((statActual! / umbral!) * 100)) : 0;
  const over = direccion === "over";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, type: "spring", stiffness: 300, damping: 32 }}
      className={`j-card p-3.5 ${resolved ? "!border-[#3ddc84]/40" : lost ? "!border-[#ff6b4a]/40" : ""}`}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[11px] font-bold tabular-nums ${
            resolved
              ? "border-[#3ddc84]/50 bg-[#3ddc84]/12 text-[#3ddc84]"
              : lost
                ? "border-[#ff6b4a]/50 bg-[#ff6b4a]/12 text-[#ff8a6a]"
                : "border-smoke bg-ash/50 text-bone-dim"
          }`}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="rounded-md bg-smoke/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-bone-dim">
              {CHIP[resolvesAt] ?? resolvesAt}
            </span>
            {tiempoLabel && tiempoLabel !== CHIP[resolvesAt] && (
              <span className="rounded-md border border-ember/30 bg-ember/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-wither/90">
                {tiempoLabel}
              </span>
            )}
            {resolved ? (
              <span className="rounded-md bg-[#3ddc84]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#3ddc84]">
                ✅ Acertado
              </span>
            ) : lost ? (
              <span className="rounded-md bg-[#ff6b4a]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#ff8a6a]">
                ❌ No acertado
              </span>
            ) : item.matchLive && item.pickLabel ? (
              <span className="rounded-md bg-ember/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-wither">
                En juego
              </span>
            ) : item.matchFinished && item.pickLabel ? (
              <span className="rounded-md bg-[#ff6b4a]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#ff8a6a]">
                ❌ No acertado
              </span>
            ) : null}
          </div>
          <h3 className="mt-0.5 text-[13px] font-bold leading-tight text-bone">{titulo}</h3>
        </div>
      </div>

      {/* Pick */}
      <div className="mt-3 flex items-center gap-3">
        <div
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-3 py-2 ${
            resolved
              ? "border-[#3ddc84]/50 bg-[#3ddc84]/8"
              : lost
                ? "border-[#ff6b4a]/50 bg-[#ff6b4a]/8"
                : pickLabel
                  ? "border-smoke bg-ash/45"
                  : "border-smoke/50 bg-transparent"
          }`}
        >
          <span className={`text-sm font-semibold ${pickLabel ? "text-bone" : "italic text-bone-dim/60"}`}>
            {pickLabel ?? "Sin respuesta"}
          </span>
          <span className="ml-auto shrink-0 text-[11px] font-bold tabular-nums text-wither">
            +{puntos} pts
          </span>
        </div>
      </div>

      {/* Progress bar (solo O/U) */}
      {hasProgress && (
        <div className="mt-2.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-semibold text-bone-dim">
              {over ? "Va" : "Límite"} {statActual}/{umbral}
            </span>
            <span className="tabular-nums text-bone-dim/60">{pct}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-smoke/80">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: resolved
                  ? "#3ddc84"
                  : over && pct >= 100
                    ? "#3ddc84"
                    : `linear-gradient(90deg, #C2350A, #FF4D00)`,
              }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, pct)}%` }}
              transition={{ type: "spring", stiffness: 200, damping: 28 }}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}
