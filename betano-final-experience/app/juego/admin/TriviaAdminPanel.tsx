"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Pestaña "Trivia" del panel /juego/admin: config del kickoff, CRUD de
 * preguntas y el control en vivo del show (abrir → cerrar → setear correcta
 * en Q9/Q10 → sortear → revelar / deshacer).
 *
 * Auto-contenida: fetchea /api/juego/admin/trivia/preguntas al montar, tras
 * cada acción y cada 10s (para ver el contador de respuestas en vivo) — no
 * necesita props del server component.
 */

type AdminOption = {
  id: string;
  etiqueta: string;
  orden: number;
  es_correcta: boolean;
  respuestas: number;
};

type AdminDraw = {
  question_id: string;
  status: "idle" | "executed" | "revealed";
  seed: string | null;
  winner: { player_id: string; alias: string } | null;
  es_consuelo: boolean;
  executed_at: string | null;
} | null;

type AdminQuestion = {
  id: string;
  orden: number;
  texto: string;
  momento: string | null;
  premio_label: string | null;
  duration_seconds: number;
  requiere_resolucion_manual: boolean;
  cierra_con_kickoff: boolean;
  status: "borrador" | "abierta" | "cerrada" | "sorteada";
  opened_at: string | null;
  closes_at: string | null;
  options: AdminOption[];
  total_respuestas: number;
  draw: AdminDraw;
};

const STATUS_CHIP: Record<AdminQuestion["status"], { label: string; color: string }> = {
  borrador: { label: "Borrador", color: "#888" },
  abierta: { label: "ABIERTA", color: "#22c55e" },
  cerrada: { label: "Cerrada", color: "#f59e0b" },
  sorteada: { label: "Sorteada", color: "#FF4D00" },
};

/** datetime-local (hora local del navegador del admin) → ISO UTC. */
function localToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO UTC → valor para <input type="datetime-local"> en hora local. */
function isoToLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TriviaAdminPanel() {
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [kickoffAt, setKickoffAt] = useState<string | null>(null);
  const [kickoffInput, setKickoffInput] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [showCreate, setShowCreate] = useState(false);
  const kickoffTouched = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/juego/admin/trivia/preguntas");
      if (!res.ok) return;
      const d = await res.json();
      setQuestions(d.questions ?? []);
      setKickoffAt(d.kickoffAt ?? null);
      if (!kickoffTouched.current) setKickoffInput(isoToLocal(d.kickoffAt ?? null));
      setLoaded(true);
    } catch {
      /* siguiente refresh lo recupera */
    }
  }, []);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 10_000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(iv);
      clearInterval(tick);
    };
  }, [refresh]);

  async function call(
    path: string,
    body: Record<string, unknown>,
    okMsg: string,
    method: string = "POST"
  ) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/juego/admin/trivia/${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) {
        setMsg({ text: d.error ?? "Error desconocido.", ok: false });
        return null;
      }
      setMsg({ text: okMsg, ok: true });
      await refresh();
      return d;
    } catch {
      setMsg({ text: "Sin conexión con el servidor.", ok: false });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function guardarKickoff() {
    const iso = localToIso(kickoffInput);
    if (kickoffInput && !iso) {
      setMsg({ text: "Fecha de kickoff inválida.", ok: false });
      return;
    }
    kickoffTouched.current = false;
    await call(
      "config",
      { kickoffAt: iso },
      iso
        ? "Kickoff guardado: cierra inscripciones y la pregunta de pronóstico a esa hora."
        : "Kickoff borrado: sin corte de inscripción."
    );
  }

  async function abrir(q: AdminQuestion) {
    if (
      q.status !== "borrador" &&
      !window.confirm(`¿Reabrir la pregunta ${q.orden}? Se reinicia la ventana de ${q.duration_seconds}s.`)
    )
      return;
    await call(
      "estado",
      { questionId: q.id, action: "abrir" },
      `Pregunta ${q.orden} ABIERTA (${q.duration_seconds}s). Ya aparece en teléfonos y TV.`
    );
  }

  async function cerrar(q: AdminQuestion) {
    await call("estado", { questionId: q.id, action: "cerrar" }, `Pregunta ${q.orden} cerrada.`);
  }

  async function extender(q: AdminQuestion) {
    await call(
      "estado",
      { questionId: q.id, action: "extender", seconds: 20 },
      `Pregunta ${q.orden} +20s. Se reabrió la ventana en teléfonos y TV.`
    );
  }

  async function setearCorrecta(q: AdminQuestion, optionId: string) {
    const opt = q.options.find((o) => o.id === optionId);
    if (!opt) return;
    if (!window.confirm(`¿Marcar "${opt.etiqueta}" como la respuesta correcta de la pregunta ${q.orden}?`)) return;
    await call(
      "preguntas",
      { questionId: q.id, correctOptionId: optionId },
      `Correcta seteada: "${opt.etiqueta}". Ya puedes sortear.`,
      "PATCH"
    );
  }

  async function quitarCorrecta(q: AdminQuestion) {
    if (
      !window.confirm(
        `¿Quitar la respuesta correcta de la pregunta ${q.orden}?\n\nVuelve a "sin resolver" (no toca las respuestas de la gente). Útil si se marcó por error.`
      )
    )
      return;
    await call(
      "preguntas",
      { questionId: q.id, correctOptionId: null },
      `Pregunta ${q.orden}: correcta quitada, queda sin resolver.`,
      "PATCH"
    );
  }

  async function sortear(q: AdminQuestion) {
    const aciertos = q.options.filter((o) => o.es_correcta).reduce((s, o) => s + o.respuestas, 0);
    const consuelo = aciertos === 0;
    if (
      !window.confirm(
        consuelo
          ? `🎰 Pregunta ${q.orden}: según el panel nadie acertó.\n\nEl servidor decide con datos frescos de la DB: si alguien acertó, sortea entre ellos; si nadie, modo consuelo entre TODOS los registrados.\n\nLa ruleta arranca AL INSTANTE en todas las pantallas. ¿Continuar?`
          : `🎰 ¿Sortear la pregunta ${q.orden} entre ${aciertos} que acertaron?\n\nEl resultado se decide en el servidor (semilla auditable) y la ruleta arranca AL INSTANTE en todas las pantallas.`
      )
    )
      return;

    setBusy(true);
    setMsg(null);
    try {
      const post = (extra?: Record<string, unknown>) =>
        fetch("/api/juego/admin/trivia/sorteo", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ questionId: q.id, action: "execute", ...extra }),
        });

      let res = await post();
      let d = await res.json().catch(() => ({}) as any);
      if (res.status === 409 && d.needsForce) {
        if (!window.confirm("⚠ La pregunta sigue abierta.\n\n¿Cortar la ventana y sortear igual?")) return;
        res = await post({ force: true });
        d = await res.json().catch(() => ({}) as any);
      }
      if (!res.ok) {
        setMsg({ text: d.error ?? "Error al sortear.", ok: false });
        return;
      }
      setMsg({
        text: `Sorteo ejecutado: ganó ${d.winner?.alias ?? "—"}${d.esConsuelo ? " (consuelo)" : ""}. La ruleta está corriendo en las pantallas.`,
        ok: true,
      });
      await refresh();
    } catch {
      setMsg({ text: "Sin conexión con el servidor.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function revelar(q: AdminQuestion) {
    await call(
      "sorteo",
      { questionId: q.id, action: "reveal" },
      "Marcado como revelado: quien entre ahora ve el ganador directo."
    );
  }

  async function deshacer(q: AdminQuestion) {
    if (
      !window.confirm(
        `↩ ¿Deshacer el sorteo de la pregunta ${q.orden}?\n\nEl overlay desaparece de las pantallas. La ejecución queda en la auditoría.\nLa pregunta vuelve a "cerrada" y puedes re-sortear o reabrir.`
      )
    )
      return;
    await call("sorteo", { questionId: q.id, action: "undo" }, "Sorteo deshecho.");
  }

  async function eliminar(q: AdminQuestion) {
    if (!window.confirm(`⚠ ¿Eliminar la pregunta ${q.orden} ("${q.texto.slice(0, 60)}…")?\n\nSe borran también sus respuestas. No se puede deshacer.`)) return;
    await call("preguntas", { questionId: q.id }, "Pregunta eliminada.", "DELETE");
  }

  return (
    <>
      {msg && (
        <div
          style={{
            ...msgBox,
            borderColor: msg.ok ? "#22c55e" : "#ef4444",
            color: msg.ok ? "#22c55e" : "#ef4444",
          }}
        >
          {msg.text}
        </div>
      )}

      {/* Config: kickoff */}
      <section style={card}>
        <h2 style={sectionTitle}>Kickoff de la final</h2>
        <p style={{ margin: "0 0 0.75rem", fontSize: 13, color: "#888" }}>
          Un solo instante con dos efectos: cierra las inscripciones y bloquea la
          pregunta de pronóstico (campeón). Hora según el reloj de este navegador.
        </p>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="datetime-local"
            value={kickoffInput}
            onChange={(e) => {
              kickoffTouched.current = true;
              setKickoffInput(e.target.value);
            }}
            style={inputStyle}
          />
          <button onClick={guardarKickoff} disabled={busy} style={{ ...btnPrimary, whiteSpace: "nowrap" }}>
            Guardar
          </button>
        </div>
        {kickoffAt && (
          <p style={{ margin: "0.5rem 0 0", fontSize: 12, color: "#888" }}>
            Actual:{" "}
            {new Date(kickoffAt).toLocaleString("es-CL", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "America/Santiago",
            })}{" "}
            (hora de Santiago)
          </p>
        )}
      </section>

      {/* Preguntas */}
      <section style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <h2 style={{ ...sectionTitle, margin: 0 }}>
            Preguntas ({questions.length})
          </h2>
          <button onClick={() => setShowCreate((v) => !v)} style={btnGhost}>
            {showCreate ? "Cancelar" : "+ Nueva pregunta"}
          </button>
        </div>

        {showCreate && (
          <CreateForm
            busy={busy}
            onCreate={async (payload) => {
              const d = await call("preguntas", payload, "Pregunta creada.");
              if (d?.ok) setShowCreate(false);
            }}
          />
        )}

        {!loaded ? (
          <p style={{ color: "#888", margin: 0 }}>Cargando…</p>
        ) : questions.length === 0 ? (
          <p style={{ color: "#888", margin: 0 }}>
            No hay preguntas. Ejecuta la migración v8 (seed) o crea preguntas acá.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
            {questions.map((q) => (
              <QuestionRow
                key={q.id}
                q={q}
                now={now}
                busy={busy}
                onAbrir={() => abrir(q)}
                onCerrar={() => cerrar(q)}
                onExtender={() => extender(q)}
                onSetearCorrecta={(oid) => setearCorrecta(q, oid)}
                onQuitarCorrecta={() => quitarCorrecta(q)}
                onSortear={() => sortear(q)}
                onRevelar={() => revelar(q)}
                onDeshacer={() => deshacer(q)}
                onEliminar={() => eliminar(q)}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function QuestionRow({
  q,
  now,
  busy,
  onAbrir,
  onCerrar,
  onExtender,
  onSetearCorrecta,
  onQuitarCorrecta,
  onSortear,
  onRevelar,
  onDeshacer,
  onEliminar,
}: {
  q: AdminQuestion;
  now: number;
  busy: boolean;
  onAbrir: () => void;
  onCerrar: () => void;
  onExtender: () => void;
  onSetearCorrecta: (optionId: string) => void;
  onQuitarCorrecta: () => void;
  onSortear: () => void;
  onRevelar: () => void;
  onDeshacer: () => void;
  onEliminar: () => void;
}) {
  const chip = STATUS_CHIP[q.status];
  const openByClock =
    q.status === "abierta" && (q.closes_at == null || now < new Date(q.closes_at).getTime());
  const secondsLeft =
    q.status === "abierta" && q.closes_at != null
      ? Math.max(0, Math.ceil((new Date(q.closes_at).getTime() - now) / 1000))
      : null;
  const correct = q.options.find((o) => o.es_correcta) ?? null;
  const aciertos = correct?.respuestas ?? 0;
  const necesitaCorrecta = correct == null;

  return (
    <div style={{ border: "1px solid #2a2420", borderRadius: 10, padding: "0.9rem 1rem", background: "#141009" }}>
      {/* Cabecera */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 800, color: "#FF4D00", fontSize: 15 }}>#{q.orden}</span>
        <span style={{ fontWeight: 700, color: chip.color, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          {chip.label}
          {q.status === "abierta" && !openByClock && " (venció el tiempo)"}
        </span>
        {secondsLeft != null && openByClock && (
          <span style={{ fontWeight: 800, color: "#22c55e", fontVariantNumeric: "tabular-nums" }}>
            ⏱ {secondsLeft}s
          </span>
        )}
        {q.cierra_con_kickoff && (
          <span style={{ fontSize: 11, color: "#888" }}>· cierra con el kickoff</span>
        )}
        {q.momento && <span style={{ fontSize: 11, color: "#666" }}>· {q.momento}</span>}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#888", fontVariantNumeric: "tabular-nums" }}>
          {q.total_respuestas} resp.
        </span>
      </div>

      <p style={{ margin: "0.45rem 0 0.6rem", fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>
        {q.texto}
        {q.premio_label && (
          <span style={{ marginLeft: 8, fontSize: 12, color: "#FFD24A", fontWeight: 700 }}>
            🎁 {q.premio_label}
          </span>
        )}
      </p>

      {/* Opciones con conteo */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: "0.7rem" }}>
        {q.options.map((o) => (
          <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ width: 14, color: o.es_correcta ? "#22c55e" : "#555" }}>
              {o.es_correcta ? "✓" : "·"}
            </span>
            <span style={{ flex: 1, color: o.es_correcta ? "#22c55e" : "#bbb", fontWeight: o.es_correcta ? 700 : 500 }}>
              {o.etiqueta}
            </span>
            <span style={{ color: "#777", fontVariantNumeric: "tabular-nums" }}>{o.respuestas}</span>
            {/* Setear correcta en vivo: solo preguntas de resolución manual, ya cerradas */}
            {q.requiere_resolucion_manual && q.status === "cerrada" && !o.es_correcta && (
              <button onClick={() => onSetearCorrecta(o.id)} disabled={busy} style={miniBtn}>
                ✓ es la correcta
              </button>
            )}
            {/* Quitar una correcta marcada por error (cualquier estado salvo sorteada). */}
            {q.requiere_resolucion_manual && q.status !== "sorteada" && o.es_correcta && (
              <button onClick={onQuitarCorrecta} disabled={busy} style={miniBtnDanger}>
                ✕ quitar
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Ganador */}
      {q.status === "sorteada" && q.draw?.winner && (
        <p style={{ margin: "0 0 0.7rem", fontSize: 13 }}>
          🎰 Ganador: <strong style={{ color: "#FFD24A" }}>{q.draw.winner.alias}</strong>
          {q.draw.es_consuelo && <span style={{ color: "#f59e0b" }}> · consuelo (nadie acertó)</span>}
          {q.draw.seed && (
            <span style={{ color: "#555", fontSize: 11 }}>
              {" "}
              · semilla <code>{q.draw.seed.slice(0, 8)}…</code>
            </span>
          )}
        </p>
      )}

      {/* Controles según estado */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {q.status === "borrador" && (
          <>
            <button onClick={onAbrir} disabled={busy} style={btnPrimarySm}>
              ▶ Abrir ({q.duration_seconds}s)
            </button>
            <button onClick={onEliminar} disabled={busy} style={btnDangerGhostSm}>
              Eliminar
            </button>
          </>
        )}
        {q.status === "abierta" && (
          <>
            <button onClick={onExtender} disabled={busy} style={btnPrimarySm} title="Suma 20s a la ventana (reabre en teléfonos y TV)">
              ⏱ +20s
            </button>
            <button onClick={onCerrar} disabled={busy} style={btnDangerSm}>
              🔒 Cerrar ahora
            </button>
          </>
        )}
        {q.status === "cerrada" && (
          <>
            <button
              onClick={onSortear}
              disabled={busy || (q.requiere_resolucion_manual && necesitaCorrecta)}
              style={{
                ...btnPrimarySm,
                opacity: q.requiere_resolucion_manual && necesitaCorrecta ? 0.5 : 1,
              }}
              title={
                q.requiere_resolucion_manual && necesitaCorrecta
                  ? "Primero setea la respuesta correcta"
                  : undefined
              }
            >
              🎰 Sortear{aciertos > 0 ? ` (${aciertos} acertaron)` : necesitaCorrecta ? "" : " (consuelo)"}
            </button>
            <button onClick={onAbrir} disabled={busy} style={btnGhostSm}>
              ↻ Reabrir
            </button>
          </>
        )}
        {q.status === "sorteada" && q.draw?.status === "executed" && (
          <button onClick={onRevelar} disabled={busy} style={btnPrimarySm}>
            📺 Marcar revelado
          </button>
        )}
        {q.status === "sorteada" && (
          <button onClick={onDeshacer} disabled={busy} style={btnDangerGhostSm}>
            ↩ Deshacer sorteo
          </button>
        )}
      </div>
    </div>
  );
}

function CreateForm({
  busy,
  onCreate,
}: {
  busy: boolean;
  onCreate: (payload: Record<string, unknown>) => void;
}) {
  const [texto, setTexto] = useState("");
  const [premio, setPremio] = useState("");
  const [momento, setMomento] = useState("");
  const [duracion, setDuracion] = useState("90");
  const [manual, setManual] = useState(false);
  const [opciones, setOpciones] = useState<{ etiqueta: string; correcta: boolean }[]>([
    { etiqueta: "", correcta: true },
    { etiqueta: "", correcta: false },
  ]);

  const setOpcion = (i: number, patch: Partial<{ etiqueta: string; correcta: boolean }>) =>
    setOpciones((prev) =>
      prev.map((o, j) =>
        j === i
          ? { ...o, ...patch }
          : patch.correcta
            ? { ...o, correcta: false } // radio: una sola correcta
            : o
      )
    );

  return (
    <div style={{ border: "1px dashed #3a332c", borderRadius: 10, padding: "0.9rem 1rem", marginBottom: "1rem" }}>
      <input
        placeholder="Texto de la pregunta"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        style={{ ...inputStyle, width: "100%", marginBottom: 8 }}
      />
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <input
          placeholder="Premio (opcional)"
          value={premio}
          onChange={(e) => setPremio(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: 140 }}
        />
        <select value={momento} onChange={(e) => setMomento(e.target.value)} style={inputStyle}>
          <option value="">Momento…</option>
          <option value="pre">Pre partido</option>
          <option value="entretiempo">Entretiempo</option>
          <option value="post">Post partido</option>
        </select>
        <input
          type="number"
          min={10}
          max={3600}
          value={duracion}
          onChange={(e) => setDuracion(e.target.value)}
          style={{ ...inputStyle, width: 90 }}
          title="Segundos abierta"
        />
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#888", marginBottom: 8 }}>
        <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
        Resolución manual en vivo (la correcta se setea después de cerrar)
      </label>
      {opciones.map((o, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
          {!manual && (
            <input
              type="radio"
              name="correcta"
              checked={o.correcta}
              onChange={() => setOpcion(i, { correcta: true })}
              title="Correcta"
            />
          )}
          <input
            placeholder={`Alternativa ${String.fromCharCode(65 + i)}`}
            value={o.etiqueta}
            onChange={(e) => setOpcion(i, { etiqueta: e.target.value })}
            style={{ ...inputStyle, flex: 1 }}
          />
          {opciones.length > 2 && (
            <button
              onClick={() => setOpciones((prev) => prev.filter((_, j) => j !== i))}
              style={btnDangerGhostSm}
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          onClick={() => setOpciones((prev) => [...prev, { etiqueta: "", correcta: false }])}
          style={btnGhostSm}
        >
          + Alternativa
        </button>
        <button
          onClick={() =>
            onCreate({
              texto: texto.trim(),
              premioLabel: premio.trim() || null,
              momento: momento || null,
              durationSeconds: Number(duracion),
              requiereResolucionManual: manual,
              options: opciones
                .filter((o) => o.etiqueta.trim())
                .map((o) => ({ etiqueta: o.etiqueta.trim(), esCorrecta: !manual && o.correcta })),
            })
          }
          disabled={busy}
          style={btnPrimarySm}
        >
          Crear pregunta
        </button>
      </div>
    </div>
  );
}

/* Estilos compartidos con el resto del panel (misma paleta inline). */
const card: React.CSSProperties = {
  background: "#1a1410",
  border: "1px solid #2a2420",
  borderRadius: 12,
  padding: "1.25rem",
  marginBottom: "1rem",
};
const sectionTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.15em",
  color: "#FF4D00",
  margin: "0 0 1rem",
};
const inputStyle: React.CSSProperties = {
  background: "#0B0705",
  border: "1px solid #333",
  borderRadius: 8,
  padding: "0.55rem 0.7rem",
  color: "#f0ebe4",
  fontSize: 14,
  fontWeight: 500,
  outline: "none",
  fontFamily: "inherit",
};
const btnPrimary: React.CSSProperties = {
  background: "#FF4D00",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "0.65rem 1rem",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};
const btnPrimarySm: React.CSSProperties = { ...btnPrimary, padding: "0.5rem 0.85rem", fontSize: 13 };
const btnDangerSm: React.CSSProperties = { ...btnPrimarySm, background: "#7f1d1d" };
const btnGhost: React.CSSProperties = {
  background: "transparent",
  color: "#888",
  border: "1px solid #333",
  borderRadius: 8,
  padding: "0.5rem 0.85rem",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};
const btnGhostSm = btnGhost;
const btnDangerGhostSm: React.CSSProperties = {
  ...btnGhost,
  color: "#ef4444",
  border: "1px solid #7f1d1d",
};
const miniBtn: React.CSSProperties = {
  background: "transparent",
  color: "#22c55e",
  border: "1px solid #14532d",
  borderRadius: 6,
  padding: "0.15rem 0.5rem",
  fontWeight: 700,
  fontSize: 11,
  cursor: "pointer",
};
const miniBtnDanger: React.CSSProperties = { ...miniBtn, color: "#ef4444", border: "1px solid #7f1d1d" };
const msgBox: React.CSSProperties = {
  border: "1px solid",
  borderRadius: 8,
  padding: "0.75rem 1rem",
  marginBottom: "1rem",
  fontSize: 13,
  fontWeight: 600,
};
