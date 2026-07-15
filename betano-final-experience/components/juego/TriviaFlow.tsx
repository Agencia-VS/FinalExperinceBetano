"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import Avatar from "./Avatar";
import CountdownTimer from "./CountdownTimer";
import TriviaQuestionCard, { type TriviaSaveStatus } from "./TriviaQuestionCard";
import TriviaRouletteReveal from "./TriviaRouletteReveal";
import { useTriviaState, type TriviaSnapshot } from "./useTriviaState";
import { isQuestionOpen } from "@/lib/juego/trivia";

/** Reintento activo del guardado: en wifi de evento el evento `online` del
 *  navegador muchas veces no llega a dispararse, así que además de escucharlo
 *  se reintenta cada 3s hasta lograr el check verde. */
const RETRY_MS = 3000;

export default function TriviaFlow({ initial }: { initial: TriviaSnapshot | null }) {
  const router = useRouter();
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [aliasName, setAliasName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, TriviaSaveStatus>>({});

  // Cola de guardados pendientes + última respuesta CONFIRMADA por el server
  // (para revertir la UI optimista si un guardado muere en un 423).
  const pending = useRef<Map<string, string>>(new Map());
  const inflight = useRef<Set<string>>(new Set());
  const confirmed = useRef<Map<string, string>>(new Map());

  const {
    questions,
    draws,
    kickoffAt,
    serverOffsetMs,
    activeReveal,
    skipAnimation,
    dismissReveal,
  } = useTriviaState(initial);

  // Identidad: optimista desde localStorage, validación server en background.
  // Si el jugador fue borrado (RESET de admin) → limpiar y volver a registro.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("juego_player");
      if (!raw) {
        router.replace("/juego/registro");
        return;
      }
      const p = JSON.parse(raw);
      setPlayerId(p.playerId);
      setAliasName(p.alias ?? "");
      setAvatarUrl(p.avatar ?? null);
      const saved = localStorage.getItem(`juego_trivia_picks_${p.playerId}`);
      if (saved) setPicks(JSON.parse(saved));

      fetch(`/api/juego/trivia/responder?playerId=${encodeURIComponent(p.playerId)}`)
        .then((r) => {
          if (!r.ok) throw new Error("not-found");
          return r.json();
        })
        .then((d) => {
          // La verdad del servidor pisa el espejo local (recarga, otro clima
          // de red, etc.). Lo optimista solo sobrevive si está pendiente.
          const serverPicks: Record<string, string> = {};
          for (const a of d.answers ?? []) {
            serverPicks[a.question_id] = a.option_id;
            confirmed.current.set(a.question_id, a.option_id);
          }
          setPicks((prev) => ({ ...serverPicks, ...prev }));
          setStatus((prev) => {
            const next = { ...prev };
            for (const qid of Object.keys(serverPicks)) {
              if (!pending.current.has(qid)) next[qid] = "saved";
            }
            return next;
          });
        })
        .catch(() => {
          localStorage.removeItem("juego_player");
          localStorage.removeItem(`juego_trivia_picks_${p.playerId}`);
          router.replace("/juego/registro");
        });
    } catch {
      router.replace("/juego/registro");
    }
  }, [router]);

  const save = useCallback(async (pid: string, questionId: string, optionId: string) => {
    if (inflight.current.has(questionId)) return;
    inflight.current.add(questionId);
    setStatus((s) => ({ ...s, [questionId]: "saving" }));
    try {
      const res = await fetch("/api/juego/trivia/responder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId: pid, questionId, optionId }),
      });
      if (res.ok) {
        confirmed.current.set(questionId, optionId);
        // Solo desencolar si nadie eligió otra opción mientras viajaba el POST.
        if (pending.current.get(questionId) === optionId) pending.current.delete(questionId);
        setStatus((s) => ({ ...s, [questionId]: "saved" }));
        return;
      }
      if (res.status === 423) {
        // La ventana cerró con el guardado en vuelo: revertir a lo confirmado.
        pending.current.delete(questionId);
        const last = confirmed.current.get(questionId);
        setPicks((prev) => {
          const next = { ...prev };
          if (last) next[questionId] = last;
          else delete next[questionId];
          return next;
        });
        setStatus((s) => ({ ...s, [questionId]: last ? "saved" : "idle" }));
        return;
      }
      throw new Error();
    } catch {
      // Sin red / error transitorio: queda en pending, el timer reintenta.
      setStatus((s) => ({ ...s, [questionId]: "error" }));
    } finally {
      inflight.current.delete(questionId);
    }
  }, []);

  // Motor de reintentos: cada 3s + al volver la conexión.
  useEffect(() => {
    if (!playerId) return;
    const flush = () => {
      pending.current.forEach((optionId, questionId) => save(playerId, questionId, optionId));
    };
    const iv = setInterval(flush, RETRY_MS);
    window.addEventListener("online", flush);
    return () => {
      clearInterval(iv);
      window.removeEventListener("online", flush);
    };
  }, [playerId, save]);

  const onSelect = useCallback(
    (questionId: string, optionId: string) => {
      if (!playerId) return;
      setPicks((prev) => {
        const next = { ...prev, [questionId]: optionId };
        localStorage.setItem(`juego_trivia_picks_${playerId}`, JSON.stringify(next));
        return next;
      });
      pending.current.set(questionId, optionId);
      save(playerId, questionId, optionId);
    },
    [playerId, save]
  );

  // Layout dividido: la pregunta de pronóstico (Q10, anclada al kickoff)
  // siempre arriba; abajo el área dinámica del show (Q1–9 según se abren).
  const pinned = useMemo(() => questions.filter((q) => q.cierra_con_kickoff), [questions]);
  const dynamic = useMemo(() => {
    const rest = questions.filter((q) => !q.cierra_con_kickoff);
    const now = Date.now() + serverOffsetMs;
    // La pregunta en vivo primero; después la historia, la más reciente arriba.
    return [
      ...rest.filter((q) => isQuestionOpen(q, now)),
      ...rest.filter((q) => !isQuestionOpen(q, now)).sort((a, b) => b.orden - a.orden),
    ];
  }, [questions, serverOffsetMs]);

  const answered = Object.keys(picks).length;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col pb-16 md:max-w-2xl">
      {/* Header sticky */}
      <header
        className="sticky top-0 z-10 -mx-5 border-b border-smoke/60 bg-ash/80 px-5 pb-4 backdrop-blur-md"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.25rem)" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-wither">
              Paso 2 · Trivia Mundialera
            </p>
            <h1 className="mt-1 font-title text-[1.6rem] font-extrabold uppercase leading-none tracking-tight text-bone">
              A jugar
            </h1>
          </div>
          {aliasName && (
            <div className="flex items-center gap-2">
              <Avatar alias={aliasName} size={30} avatarUrl={avatarUrl} />
              <span className="max-w-[8rem] truncate rounded-full border border-smoke bg-char/70 px-3 py-1.5 text-xs font-semibold text-bone">
                {aliasName}
              </span>
            </div>
          )}
        </div>

        {kickoffAt && <CountdownTimer kickoffAt={kickoffAt} className="mt-4" />}

        <p className="mt-2.5 text-[11px] text-bone-dim">
          {answered > 0
            ? `${answered} respuesta${answered === 1 ? "" : "s"} guardada${answered === 1 ? "" : "s"}. `
            : ""}
          Cada respuesta se guarda sola al elegirla. Acierta y entras al sorteo de esa pregunta.
        </p>
      </header>

      {/* Pregunta de pronóstico anclada (Q10) */}
      {pinned.length > 0 && (
        <div className="mt-5 flex flex-col gap-3.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-bone-dim">
            Tu pronóstico · abierto hasta el inicio de la final
          </p>
          {pinned.map((q) => (
            <TriviaQuestionCard
              key={q.id}
              question={q}
              draw={draws.get(q.id)}
              selected={picks[q.id]}
              status={status[q.id] ?? "idle"}
              serverOffsetMs={serverOffsetMs}
              meId={playerId}
              onSelect={(o) => onSelect(q.id, o)}
            />
          ))}
        </div>
      )}

      {/* Área dinámica del show en vivo */}
      <div className="mt-6 flex flex-col gap-3.5">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-bone-dim">
          Preguntas en vivo
        </p>
        {dynamic.length === 0 ? (
          <WaitingCard />
        ) : (
          <AnimatePresence initial={false}>
            {dynamic.map((q) => (
              <TriviaQuestionCard
                key={q.id}
                question={q}
                draw={draws.get(q.id)}
                selected={picks[q.id]}
                status={status[q.id] ?? "idle"}
                serverOffsetMs={serverOffsetMs}
                meId={playerId}
                onSelect={(o) => onSelect(q.id, o)}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Ruleta del sorteo en vivo (Realtime) */}
      <AnimatePresence>
        {activeReveal && (
          <TriviaRouletteReveal
            key={activeReveal.draw.seed ?? activeReveal.question.id}
            question={activeReveal.question}
            draw={activeReveal.draw}
            variant="mobile"
            skipAnimation={skipAnimation}
            meId={playerId}
            onClose={dismissReveal}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

function WaitingCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="j-card flex flex-col items-center px-5 py-10 text-center"
    >
      <span className="j-live-dot mb-4 block h-2.5 w-2.5 rounded-full bg-ember" />
      <p className="font-title text-lg font-bold uppercase text-bone">
        Esperando la siguiente pregunta
      </p>
      <p className="mt-1.5 max-w-[18rem] text-sm text-bone-dim">
        El animador abre cada pregunta en vivo. Cuando aparezca, tendrás poco
        tiempo para responder: ¡atento a la pantalla gigante!
      </p>
    </motion.div>
  );
}
