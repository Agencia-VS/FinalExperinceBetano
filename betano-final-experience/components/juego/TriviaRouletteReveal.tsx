"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { T, SZ, phaseAnim, SpinStage, WinnerReveal } from "./revealKit";
import type { TriviaDraw, TriviaQuestion } from "@/lib/juego/trivia";

type Phase = "intro" | "spinning" | "reveal";

/**
 * Overlay del sorteo de UNA pregunta de la trivia: intro → ruleta → ganador.
 * Versión liviana de FinalReveal (siempre 1 pool → 1 ganador, sin posiciones
 * ni desempates). Dramatiza un resultado YA decidido en el servidor.
 *
 * Si el sorteo fue de CONSUELO (nadie acertó → participaron todos), se dice
 * explícitamente para que la sala entienda por qué gana alguien que no acertó.
 */
export default function TriviaRouletteReveal({
  question,
  draw,
  variant,
  skipAnimation = false,
  meId = null,
  onClose,
}: {
  question: TriviaQuestion;
  draw: TriviaDraw;
  variant: "mobile" | "tv";
  skipAnimation?: boolean;
  meId?: string | null;
  onClose?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(() => (skipAnimation ? "reveal" : "intro"));
  const sz = SZ[variant];
  const winner = draw.winner;
  const pool = Array.isArray(draw.pool_snapshot) ? draw.pool_snapshot : [];

  // Avance automático; "spinning" avanza cuando el carrete aterriza
  // (T.spinFallback de red de seguridad si el onDone nunca llega).
  useEffect(() => {
    if (phase === "reveal") return;
    const ms = phase === "intro" ? T.intro : T.spinFallback;
    const t = setTimeout(
      () => setPhase((p) => (p === "intro" ? (pool.length > 1 ? "spinning" : "reveal") : "reveal")),
      ms
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (!winner) return null;

  const correcta = question.options.find((o) => o.es_correcta)?.etiqueta ?? null;

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-black/85 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Resplandor ember de fondo */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 50% 0%, rgba(255,77,0,0.16), transparent 65%)",
        }}
      />

      <div className={`relative mx-auto flex w-full flex-1 flex-col justify-center py-10 ${sz.wrap}`}>
        <AnimatePresence mode="wait">
          {phase === "intro" && (
            <motion.div key="intro" {...phaseAnim} className="text-center">
              <p className={`font-bold uppercase text-wither ${sz.eyebrow}`}>
                Pregunta {question.orden} · Sorteo
              </p>
              <h2
                className={`j-text-fire mt-3 font-title font-extrabold uppercase leading-none ${sz.title}`}
              >
                ¡Tenemos sorteo!
              </h2>
              <p className={`mx-auto mt-4 max-w-md text-bone-dim ${sz.subtitle}`}>
                {draw.es_consuelo
                  ? "Nadie acertó esta pregunta: el premio se sortea entre TODOS los jugadores."
                  : correcta
                    ? `La respuesta correcta era "${correcta}". La ruleta elige entre ${pool.length} que acertaron.`
                    : `La ruleta elige entre ${pool.length} que acertaron.`}
              </p>
              <span className="j-live-dot mx-auto mt-6 block h-2 w-2 rounded-full bg-ember" />
            </motion.div>
          )}

          {phase === "spinning" && (
            <SpinStage
              key="spin"
              eyebrow={
                draw.es_consuelo ? "Premio de consuelo · gira la ruleta" : "La ruleta gira"
              }
              title={question.premio_label ? `¿Quién gana ${question.premio_label}?` : "¿Quién gana?"}
              pool={pool}
              target={winner}
              sz={sz}
              onDone={() => setPhase("reveal")}
              hidePoints
            />
          )}

          {phase === "reveal" && (
            <WinnerReveal
              key="reveal"
              heading={question.premio_label ?? "¡Premio!"}
              headingColor="#FFD24A"
              player={winner}
              subLabel={
                draw.es_consuelo
                  ? "Premio de consuelo · participaron todos"
                  : `Pregunta ${question.orden} · entre ${pool.length} que acertaron`
              }
              isMe={meId != null && winner.player_id === meId}
              sz={sz}
              footer={
                <>
                  {draw.seed && (
                    <p className="mt-8 text-[10px] tracking-wide text-bone-dim/50">
                      Sorteo verificable · semilla{" "}
                      <span className="font-mono">{draw.seed}</span>
                    </p>
                  )}
                  {onClose && (
                    <motion.button
                      onClick={onClose}
                      className="btn-ember mx-auto mt-6 inline-flex items-center gap-2 px-5 py-2.5 text-sm"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.8 }}
                    >
                      Seguir jugando
                    </motion.button>
                  )}
                </>
              }
            />
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
