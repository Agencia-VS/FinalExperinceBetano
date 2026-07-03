"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { Market, SaveStatus } from "./PronosticosFlow";

const RESOLVE_CHIP: Record<string, string> = {
  live: "En vivo",
  halftime: "1er tiempo",
  fulltime: "Final",
};

// Ventana de tiempo que cuenta la estadística (claridad 90' vs 120').
const TIEMPO_CHIP: Record<string, string> = {
  "90": "90 min",
  "120": "Incluye alargue",
  ht: "1er tiempo",
};

export default function MarketCard({
  index,
  market,
  selected,
  status,
  disabled,
  onSelect,
}: {
  index: number;
  market: Market;
  selected?: string;
  status: SaveStatus;
  disabled?: boolean;
  onSelect: (optionId: string) => void;
}) {
  const answered = !!selected;
  // Grillas por forma de mercado: escaleras largas y marcadores → 3 col; resto 2.
  const cols =
    market.options.length >= 6
      ? "grid-cols-3"
      : market.options.length === 3
        ? "grid-cols-3"
        : "grid-cols-2";

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ type: "spring", stiffness: 300, damping: 32 }}
      className={`j-card p-4 transition-colors duration-300 ${
        answered ? "!border-ember/35" : ""
      }`}
    >
      {/* Header del mercado */}
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors ${
            answered
              ? "border-ember/50 bg-ember/15 text-ember"
              : "border-smoke bg-ash/50 text-bone-dim"
          }`}
        >
          <MarketIcon id={market.id} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tabular-nums tracking-wider text-bone-dim/60">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="rounded-md bg-smoke/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-bone-dim">
              {RESOLVE_CHIP[market.resolves_at] ?? market.resolves_at}
            </span>
            {market.tiempo && TIEMPO_CHIP[market.tiempo] && TIEMPO_CHIP[market.tiempo] !== RESOLVE_CHIP[market.resolves_at] && (
              <span className="rounded-md border border-ember/30 bg-ember/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ember/90">
                {TIEMPO_CHIP[market.tiempo]}
              </span>
            )}
          </div>
          <h3 className="mt-0.5 font-title text-[1.05rem] font-bold uppercase leading-tight tracking-tight text-bone">
            {market.titulo}
          </h3>
          {market.descripcion && (
            <p className="mt-0.5 text-xs leading-snug text-bone-dim">{market.descripcion}</p>
          )}
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Opciones */}
      <div className={`mt-3.5 grid ${cols} gap-2`}>
        {market.options.map((o) => {
          const active = selected === o.id;
          // "Otro resultado" (catch-all del resultado exacto) ocupa toda la fila.
          const fullRow = o.valor === "otro";
          return (
            <motion.button
              key={o.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(o.id)}
              whileTap={{ scale: 0.96 }}
              className={`relative flex min-h-14 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-2.5 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-45 ${
                fullRow ? "col-span-full" : ""
              } ${
                active
                  ? "border-transparent bg-gradient-to-b from-[#FF5A0F] to-[#E23F00] text-white shadow-[0_6px_20px_-6px_rgba(255,77,0,0.55)]"
                  : "border-smoke bg-ash/45 text-bone hover:border-ember/50 active:border-ember"
              }`}
              aria-pressed={active}
            >
              <span className="text-[13px] font-semibold leading-tight">{o.etiqueta}</span>
              <span
                className={`text-[11px] font-bold tabular-nums ${
                  active ? "text-white/85" : "text-ember"
                }`}
              >
                +{o.puntos} pts
              </span>
              <AnimatePresence>
                {active && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 28 }}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-bone text-ash shadow"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>
    </motion.section>
  );
}

function StatusBadge({ status }: { status: SaveStatus }) {
  return (
    <AnimatePresence mode="wait">
      {status === "saving" && (
        <motion.span
          key="s"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="mt-1 shrink-0"
          aria-label="Guardando"
        >
          <svg className="h-4 w-4 animate-spin text-bone-dim" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </motion.span>
      )}
      {status === "saved" && (
        <motion.span
          key="ok"
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 26 }}
          className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#3ddc84]/15"
          aria-label="Guardado"
        >
          <svg className="h-3.5 w-3.5 text-[#3ddc84]" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.span>
      )}
      {status === "error" && (
        <motion.span
          key="e"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="mt-1 shrink-0 text-[10px] font-bold uppercase tracking-wider text-[#ff8a6a]"
        >
          Reintentando
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/** Iconografía por mercado — SVG stroke 1.8, consistente. */
function MarketIcon({ id }: { id: string }) {
  const cls = "h-[18px] w-[18px]";
  const common = {
    className: cls,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    "aria-hidden": true,
  } as const;

  switch (id) {
    case "campeon":
      return (
        <svg {...common}>
          <path d="M8 21h8M12 17v4" strokeLinecap="round" />
          <path d="M6 3h12v5a6 6 0 0 1-12 0V3Z" strokeLinejoin="round" />
          <path d="M18 5h2.5a.5.5 0 0 1 .5.5C21 8 19.5 9.5 18 9.7M6 5H3.5a.5.5 0 0 0-.5.5C3 8 4.5 9.5 6 9.7" strokeLinecap="round" />
        </svg>
      );
    case "resultado_exacto":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4.5" />
          <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "ganador_ht":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3v18" />
          <path d="M12 3a9 9 0 0 1 0 18" fill="currentColor" fillOpacity="0.25" stroke="none" />
        </svg>
      );
    case "primer_gol":
      return (
        <svg {...common}>
          <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H13L13 2Z" strokeLinejoin="round" />
        </svg>
      );
    case "total_goles_ou":
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8.4l3.1 2.25-1.2 3.6h-3.8l-1.2-3.6L12 8.4Z" strokeLinejoin="round" />
        </svg>
      );
    case "ambas_anotan":
      return (
        <svg {...common}>
          <circle cx="8.5" cy="12" r="5.5" />
          <circle cx="15.5" cy="12" r="5.5" />
        </svg>
      );
    case "total_corners_ou":
      return (
        <svg {...common}>
          <path d="M6 21V4" strokeLinecap="round" />
          <path d="M6 4l7 2.5L6 9" strokeLinejoin="round" />
          <path d="M3 21h18" strokeLinecap="round" />
        </svg>
      );
    case "total_amarillas_ou":
    case "habra_roja":
      return (
        <svg {...common}>
          <rect x="7" y="3.5" width="10" height="15" rx="1.8" transform="rotate(6 12 11)" />
        </svg>
      );
    case "va_alargue":
      return (
        <svg {...common}>
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9.5V13l2.5 1.8M10 2.5h4" strokeLinecap="round" />
        </svg>
      );
    case "metodo_victoria": // silbato
      return (
        <svg {...common}>
          <circle cx="9.5" cy="14.5" r="5" />
          <path d="M13.5 11.5 21 8.5v4.2l-6 2.3" strokeLinejoin="round" />
          <circle cx="9.5" cy="14.5" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      );
    case "habra_penales": // arco + pelota en el punto penal
      return (
        <svg {...common}>
          <path d="M3.5 19V6h17v13" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="16.5" r="2.4" />
        </svg>
      );
  }
}
