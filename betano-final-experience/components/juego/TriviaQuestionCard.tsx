"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Avatar from "./Avatar";
import { isQuestionOpen, type TriviaDraw, type TriviaQuestion } from "@/lib/juego/trivia";

/** Estado de guardado de la respuesta de ESTA pregunta (UI optimista). */
export type TriviaSaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Tarjeta de una pregunta de la trivia. Misma gramática visual que
 * MarketCard (grid de opciones, check de guardado) pero sin puntos:
 * acá solo importa acertar para entrar al sorteo de la pregunta.
 *
 * - abierta   → opciones tocables + cronómetro desde closes_at (corregido
 *               con serverOffsetMs para que toda la sala vea lo mismo).
 * - cerrada   → deshabilitada; si ya llegó es_correcta, pinta la correcta
 *               y marca si el jugador acertó.
 * - sorteada  → además muestra el ganador del sorteo (y si fue consuelo).
 */
export default function TriviaQuestionCard({
  question,
  draw,
  selected,
  status,
  serverOffsetMs,
  meId,
  onSelect,
}: {
  question: TriviaQuestion;
  draw?: TriviaDraw | null;
  selected?: string;
  status: TriviaSaveStatus;
  serverOffsetMs: number;
  meId?: string | null;
  onSelect: (optionId: string) => void;
}) {
  // Reloj local corregido; re-evalúa cada segundo mientras la pregunta corre.
  const [now, setNow] = useState(() => Date.now() + serverOffsetMs);
  useEffect(() => {
    if (question.status !== "abierta") return;
    const iv = setInterval(() => setNow(Date.now() + serverOffsetMs), 250);
    return () => clearInterval(iv);
  }, [question.status, serverOffsetMs]);

  const open = isQuestionOpen(question, now);
  const answered = !!selected;
  const correctId = question.options.find((o) => o.es_correcta)?.id ?? null;
  const resolved = !open && correctId != null;
  const acerto = resolved && selected != null && selected === correctId;

  const secondsLeft =
    open && question.closes_at != null
      ? Math.max(0, Math.ceil((new Date(question.closes_at).getTime() - now) / 1000))
      : null;
  const totalSeconds = question.duration_seconds;
  const urgency = secondsLeft != null && secondsLeft <= 10;

  const cols = question.options.length >= 3 ? "grid-cols-2" : "grid-cols-2";
  const winner = draw?.winner ?? null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 32 }}
      className={`j-card p-4 transition-colors duration-300 ${
        open ? "!border-ember/45" : answered ? "!border-ember/25" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border font-title text-sm font-extrabold tabular-nums transition-colors ${
            open
              ? "border-ember/50 bg-ember/15 text-wither"
              : "border-smoke bg-ash/50 text-bone-dim"
          }`}
        >
          {question.orden}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {open ? (
              <span className="flex items-center gap-1.5 rounded-md border border-ember/30 bg-ember/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-wither">
                <span className="j-live-dot inline-block h-1.5 w-1.5 rounded-full bg-ember" />
                Abierta
              </span>
            ) : question.status === "sorteada" ? (
              <span className="rounded-md bg-smoke/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-bone-dim">
                Sorteada
              </span>
            ) : (
              <span className="rounded-md bg-smoke/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-bone-dim">
                Cerrada
              </span>
            )}
            {question.premio_label && (
              <span className="truncate rounded-md border border-[#FFD24A]/30 bg-[#FFD24A]/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#FFD24A]/90">
                🎁 {question.premio_label}
              </span>
            )}
          </div>
          <h3 className="mt-1 text-[15px] font-semibold leading-snug text-bone">
            {question.texto}
          </h3>
        </div>
        <SaveBadge status={status} />
      </div>

      {/* Cronómetro (solo mientras corre la ventana) */}
      {open && secondsLeft != null && (
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-smoke/80">
            <div
              className="h-full rounded-full transition-[width] duration-300 ease-linear"
              style={{
                width: `${Math.min(100, (secondsLeft / totalSeconds) * 100)}%`,
                background: urgency
                  ? "#ff4d4d"
                  : "linear-gradient(90deg, #C2350A, #FF4D00, #FF8A3D)",
                boxShadow: "0 0 10px rgba(255,77,0,0.45)",
              }}
            />
          </div>
          <span
            className={`font-title text-lg font-extrabold tabular-nums leading-none ${
              urgency ? "animate-pulse text-[#ff6b4a]" : "text-bone"
            }`}
            role="timer"
            aria-label="Segundos restantes"
          >
            {secondsLeft}s
          </span>
        </div>
      )}

      {/* Resultado personal (cuando ya se conoce la correcta) */}
      {resolved && answered && (
        <p
          className={`mt-3 rounded-xl border px-3 py-2 text-[13px] font-semibold ${
            acerto
              ? "border-[#3ddc84]/30 bg-[#3ddc84]/10 text-[#3ddc84]"
              : "border-[#ff6b4a]/25 bg-[#ff6b4a]/8 text-[#ff8a6a]"
          }`}
        >
          {acerto ? "✓ ¡Acertaste! Estás en el sorteo de esta pregunta." : "✗ No fue esta vez."}
        </p>
      )}

      {/* Opciones */}
      <div className={`mt-3.5 grid ${cols} gap-2`}>
        {question.options.map((o) => {
          const active = selected === o.id;
          const isCorrect = resolved && o.id === correctId;
          const isWrongPick = resolved && active && o.id !== correctId;
          return (
            <motion.button
              key={o.id}
              type="button"
              disabled={!open}
              onClick={() => onSelect(o.id)}
              whileTap={open ? { scale: 0.96 } : undefined}
              className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-2.5 transition-all duration-200 ${
                open ? "cursor-pointer" : "cursor-default"
              } ${
                isCorrect
                  ? "border-[#3ddc84]/60 bg-[#3ddc84]/12 text-bone"
                  : isWrongPick
                    ? "border-[#ff6b4a]/50 bg-[#ff6b4a]/10 text-bone opacity-90"
                    : active
                      ? "border-transparent bg-gradient-to-b from-[#FF5A0F] to-[#E23F00] text-white shadow-[0_6px_20px_-6px_rgba(255,77,0,0.55)]"
                      : `border-smoke bg-ash/45 text-bone ${
                          open ? "hover:border-ember/50 active:border-ember" : "opacity-55"
                        }`
              }`}
              aria-pressed={active}
            >
              <span className="text-[13px] font-semibold leading-tight">{o.etiqueta}</span>
              {isCorrect && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#3ddc84]">
                  Correcta
                </span>
              )}
              <AnimatePresence>
                {active && !resolved && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 28 }}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-bone text-ash shadow"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M20 6 9 17l-5-5"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>

      {/* Ganador del sorteo de esta pregunta */}
      {question.status === "sorteada" && winner && (
        <div className="mt-3.5 flex items-center gap-3 rounded-xl border border-[#FFD24A]/30 bg-[#FFD24A]/8 px-3 py-2.5">
          <Avatar alias={winner.alias} size={30} avatarUrl={winner.avatar} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#FFD24A]/80">
              {draw?.es_consuelo ? "Premio de consuelo — nadie acertó" : "Ganador del sorteo"}
            </p>
            <p className="truncate text-[14px] font-semibold text-bone">
              {winner.alias}
              {meId != null && winner.player_id === meId && (
                <span className="ml-1.5 rounded-md bg-ember/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-wither">
                  ¡Tú!
                </span>
              )}
            </p>
          </div>
          <span aria-hidden>🎰</span>
        </div>
      )}
    </motion.section>
  );
}

function SaveBadge({ status }: { status: TriviaSaveStatus }) {
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
          Guardando…
        </motion.span>
      )}
    </AnimatePresence>
  );
}
