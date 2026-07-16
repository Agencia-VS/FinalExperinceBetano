"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import TriviaRouletteReveal from "@/components/juego/TriviaRouletteReveal";
import { useTriviaState, type TriviaSnapshot } from "@/components/juego/useTriviaState";
import { isQuestionOpen, pickFeaturedQuestion, type TriviaQuestion } from "@/lib/juego/trivia";

/**
 * Tablero de trivia para el proyector: la pregunta activa en gigante con
 * cronómetro y contador de respuestas; al sortear, la ruleta a pantalla
 * completa. Mismo shell que TvBoard (fullscreen manual, cursor que se
 * esconde), que queda intacto para el juego de pronósticos.
 *
 * Mientras la pregunta está ABIERTA no se muestran conteos por opción (para
 * no sesgar a la sala) — solo el total. La correcta se pinta al cerrar.
 */
export default function TriviaTvBoard({ initial }: { initial: TriviaSnapshot | null }) {
  // Poll corto: el contador de respuestas se siente vivo en pantalla.
  const { questions, draws, kickoffAt, serverOffsetMs, activeReveal, skipAnimation, dismissReveal } =
    useTriviaState(initial, { pollMs: 5000 });
  const [isFs, setIsFs] = useState(false);
  const [idle, setIdle] = useState(false);
  const [now, setNow] = useState(() => Date.now() + serverOffsetMs);

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now() + serverOffsetMs), 250);
    return () => clearInterval(iv);
  }, [serverOffsetMs]);

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

  const featured: TriviaQuestion | undefined = useMemo(
    () => pickFeaturedQuestion(questions, draws, now),
    [questions, draws, now]
  );

  const featuredOpen = featured != null && isQuestionOpen(featured, now);
  const secondsLeft =
    featuredOpen && featured.closes_at != null
      ? Math.max(0, Math.ceil((new Date(featured.closes_at).getTime() - now) / 1000))
      : null;
  const total = (featured as (TriviaQuestion & { total_respuestas?: number }) | undefined)
    ?.total_respuestas;
  const correctId = featured?.options.find((o) => o.es_correcta)?.id ?? null;
  const featuredDraw = featured ? draws.get(featured.id) : undefined;

  return (
    <main
      className={`mx-auto flex w-full max-w-5xl flex-1 flex-col pb-8 ${idle ? "cursor-none" : ""}`}
    >
      {/* Header proyector */}
      <header className="flex items-center justify-between pb-8 pt-2">
        <h1 className="font-title text-5xl font-extrabold uppercase leading-none tracking-tight text-bone">
          Trivia <span className="text-wither">Mundialera</span>
        </h1>
        <div className="flex items-center gap-3">
          <span
            className={`flex items-center gap-3 rounded-full border px-5 py-2.5 text-lg font-bold uppercase tracking-[0.14em] ${
              featuredOpen
                ? "border-ember/50 bg-ember/10 text-wither"
                : "border-smoke bg-char/60 text-bone-dim"
            }`}
          >
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                featuredOpen ? "j-live-dot bg-ember" : "bg-bone-dim"
              }`}
            />
            {featuredOpen ? "Pregunta abierta" : "En espera"}
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

      {featured ? (
        <div className="flex flex-1 flex-col justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${featured.id}-${featured.status}`}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
            >
              <div className="flex items-center gap-4">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-ember/50 bg-ember/15 font-title text-2xl font-extrabold tabular-nums text-wither">
                  {featured.orden}
                </span>
                {featured.premio_label && (
                  <span className="rounded-full border border-[#FFD24A]/30 bg-[#FFD24A]/10 px-4 py-2 text-lg font-bold uppercase tracking-wider text-[#FFD24A]">
                    🎁 {featured.premio_label}
                  </span>
                )}
              </div>

              <h2 className="mt-6 font-title text-6xl font-extrabold uppercase leading-[1.05] tracking-tight text-bone">
                {featured.texto}
              </h2>

              <div className="mt-8 grid grid-cols-2 gap-4">
                {featured.options.map((o, i) => {
                  const isCorrect = !featuredOpen && correctId === o.id;
                  return (
                    <div
                      key={o.id}
                      className={`flex min-h-20 items-center gap-4 rounded-2xl border px-6 py-4 ${
                        isCorrect
                          ? "border-[#3ddc84]/60 bg-[#3ddc84]/12"
                          : "border-smoke bg-char/55"
                      }`}
                    >
                      <span
                        className={`font-title text-3xl font-extrabold ${
                          isCorrect ? "text-[#3ddc84]" : "text-bone-dim"
                        }`}
                      >
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="min-w-0 flex-1 text-2xl font-semibold text-bone">
                        {o.etiqueta}
                      </span>
                      {isCorrect && (
                        <span className="text-lg font-bold uppercase tracking-wider text-[#3ddc84]">
                          ✓ Correcta
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Cronómetro + contador */}
              <div className="mt-10 flex items-center gap-8">
                {featuredOpen && secondsLeft != null && (
                  <div className="flex items-center gap-5">
                    <span
                      className={`font-title text-8xl font-extrabold tabular-nums leading-none ${
                        secondsLeft <= 10 ? "animate-pulse text-[#ff6b4a]" : "j-text-fire"
                      }`}
                      role="timer"
                    >
                      {secondsLeft}
                    </span>
                    <span className="text-2xl font-bold uppercase tracking-widest text-bone-dim">
                      seg
                    </span>
                  </div>
                )}
                {featuredOpen && (
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-smoke/80">
                    <div
                      className="h-full rounded-full transition-[width] duration-300 ease-linear"
                      style={{
                        width: `${Math.min(
                          100,
                          ((secondsLeft ?? 0) / featured.duration_seconds) * 100
                        )}%`,
                        background:
                          secondsLeft != null && secondsLeft <= 10
                            ? "#ff4d4d"
                            : "linear-gradient(90deg, #C2350A, #FF4D00, #FF8A3D)",
                        boxShadow: "0 0 18px rgba(255,77,0,0.5)",
                      }}
                    />
                  </div>
                )}
                {typeof total === "number" && (
                  <p className="shrink-0 text-2xl font-bold tabular-nums text-bone">
                    {total}
                    <span className="ml-2 text-lg font-semibold uppercase tracking-wider text-bone-dim">
                      respuestas
                    </span>
                  </p>
                )}
              </div>

              {featured.status === "sorteada" && featuredDraw?.winner && (
                <p className="mt-8 text-3xl font-bold text-bone">
                  🎰 Ganador:{" "}
                  <span className="text-[#FFD24A]">{featuredDraw.winner.alias}</span>
                  {featuredDraw.es_consuelo && (
                    <span className="ml-3 text-xl font-semibold uppercase tracking-wider text-bone-dim">
                      · premio de consuelo
                    </span>
                  )}
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      ) : (
        <WaitingScreen kickoffAt={kickoffAt} now={now} />
      )}

      {/* Ruleta del sorteo a pantalla completa (disparada por Realtime).
          Nadie toca el proyector: el overlay se levanta cuando el host marca
          el sorteo como 'revealed' desde el panel, o cuando abre la siguiente
          pregunta. En el móvil, en cambio, lo cierra el propio jugador. */}
      <AnimatePresence>
        {activeReveal && activeReveal.draw.status !== "revealed" && (
          <TriviaRouletteReveal
            key={activeReveal.draw.seed ?? activeReveal.question.id}
            question={activeReveal.question}
            draw={activeReveal.draw}
            variant="tv"
            skipAnimation={skipAnimation}
            onClose={dismissReveal}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

function WaitingScreen({ kickoffAt, now }: { kickoffAt: string | null; now: number }) {
  const diff = kickoffAt ? new Date(kickoffAt).getTime() - now : null;
  const parts =
    diff != null && diff > 0
      ? {
          h: Math.floor(diff / 3600000),
          m: Math.floor((diff % 3600000) / 60000),
          s: Math.floor((diff % 60000) / 1000),
        }
      : null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <span className="j-live-dot mb-6 block h-3 w-3 rounded-full bg-ember" />
      <p className="font-title text-4xl font-extrabold uppercase text-bone">
        La trivia continúa en un momento
      </p>
      <p className="mt-3 max-w-xl text-xl text-bone-dim">
        Escanea el QR, crea tu usuario y prepárate para la siguiente pregunta.
      </p>
      {parts && (
        <p className="mt-8 font-title text-6xl font-extrabold tabular-nums text-bone">
          {String(parts.h).padStart(2, "0")}:{String(parts.m).padStart(2, "0")}:
          {String(parts.s).padStart(2, "0")}
          <span className="ml-4 text-2xl font-bold uppercase tracking-widest text-wither">
            para el kickoff
          </span>
        </p>
      )}
    </div>
  );
}
