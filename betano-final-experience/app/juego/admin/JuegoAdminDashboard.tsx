"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowser } from "@/lib/supabase-browser";

type MatchState = {
  match_status: string;
  predictions_locked: boolean;
  kickoff_at: string | null;
  home_team: string | null;
  away_team: string | null;
  polling_active: boolean;
  updated_at: string | null;
};

type Snapshot = {
  fetched_at: string;
  match_status: string;
  home_score: number;
  away_score: number;
  corners_total: number;
  yellow_cards_total: number;
  red_cards_total: number;
} | null;

type LeaderboardInfo = {
  cacheRowExists: boolean;
  rankingCount: number;
  updatedAt: string | null;
  scoredPlayers: number;
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Programado",
  live_1h: "1er tiempo",
  halftime: "Descanso",
  live_2h: "2do tiempo",
  extra_time: "Prórroga",
  penalties: "Penales",
  finished: "Finalizado",
};

export default function JuegoAdminDashboard({
  matchState,
  lastSnapshot,
  totalPlayers,
  fixtureId,
  leaderboard,
}: {
  matchState: MatchState;
  lastSnapshot: Snapshot;
  totalPlayers: number;
  fixtureId: string | null;
  leaderboard: LeaderboardInfo;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [editFixtureId, setEditFixtureId] = useState(fixtureId ?? "");
  const [saving, setSaving] = useState(false);

  async function postAction(action: string, extra?: Record<string, string>) {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/juego/admin/partido", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg({ text: data.error ?? "Error desconocido.", ok: false });
    } else {
      setMsg({
        text:
          action === "poll"
            ? `Poll OK — ${data.match_status} ${data.home_score ?? ""}–${data.away_score ?? ""}`
            : action === "lock"
            ? "Pronósticos cerrados."
            : action === "unlock"
            ? "Pronósticos reabiertos."
            : action === "setFixture"
            ? `Fixture actualizado a ${data.fixture_id}.`
            : action === "reset"
            ? "Juego reseteado. Jugadores, predicciones, puntajes y snapshots eliminados."
            : "OK.",
        ok: true,
      });
      router.refresh();
    }
  }

  async function recalcularRanking() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/juego/admin/resolver", { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg({ text: `Error al recalcular: ${data.error ?? "desconocido"}`, ok: false });
    } else {
      setMsg({ text: "Ranking recalculado.", ok: true });
      router.refresh();
    }
  }

  async function handleSetFixture() {
    const trimmed = editFixtureId.trim();
    if (!trimmed) {
      setMsg({ text: "Ingresa un fixture ID válido.", ok: false });
      return;
    }
    setSaving(true);
    await postAction("setFixture", { fixtureId: trimmed });
    setSaving(false);
  }

  async function handleReset() {
    if (!window.confirm("⚠ ¿Resetear todo el juego?\n\nSe eliminarán TODOS los jugadores, predicciones, puntajes y snapshots.\nEl estado del partido volverá a 'Programado'.\nLos mercados NO se borran.\n\nEsta acción NO se puede deshacer.")) return;
    setBusy(true);
    await postAction("reset");
    setBusy(false);
  }

  async function logout() {
    await createBrowser().auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  const kickoff = matchState.kickoff_at
    ? new Date(matchState.kickoff_at).toLocaleString("es-CL", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Santiago",
      })
    : "—";

  const lastFetch = lastSnapshot?.fetched_at
    ? new Date(lastSnapshot.fetched_at).toLocaleString("es-CL", {
        timeStyle: "short",
        dateStyle: "short",
        timeZone: "America/Santiago",
      })
    : "Sin datos aún";

  const leaderboardUpdatedAt = leaderboard.updatedAt
    ? new Date(leaderboard.updatedAt).toLocaleString("es-CL", {
        timeStyle: "short",
        dateStyle: "short",
        timeZone: "America/Santiago",
      })
    : "—";

  return (
    <main style={{ fontFamily: "var(--font-haffer, sans-serif)", minHeight: "100dvh", background: "#0B0705", color: "#f0ebe4", padding: "1.5rem" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2rem" }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "#FF4D00", margin: 0 }}>
              Admin · Juego
            </p>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: "4px 0 0" }}>Panel del partido</h1>
          </div>
          <button onClick={logout} style={btnGhost}>Cerrar sesión</button>
        </div>

        {msg && (
          <div style={{ ...msgBox, borderColor: msg.ok ? "#22c55e" : "#ef4444", color: msg.ok ? "#22c55e" : "#ef4444" }}>
            {msg.text}
          </div>
        )}

        {/* Estado del partido */}
        <section style={card}>
          <h2 style={sectionTitle}>Estado del partido</h2>
          <dl style={dl}>
            <Row label="Equipos" value={matchState.home_team && matchState.away_team ? `${matchState.home_team} vs ${matchState.away_team}` : "—"} />
            <Row label="Kickoff" value={kickoff} />
            <Row label="Estado" value={STATUS_LABEL[matchState.match_status] ?? matchState.match_status} />
            <Row
              label="Pronósticos"
              value={
                <span style={{ color: matchState.predictions_locked ? "#ef4444" : "#22c55e", fontWeight: 700 }}>
                  {matchState.predictions_locked ? "CERRADOS" : "ABIERTOS"}
                </span>
              }
            />
            <Row label="Poller activo" value={matchState.polling_active ? "Sí" : "No"} />
            <Row label="Jugadores" value={String(totalPlayers)} />
          </dl>
        </section>

        {/* Último snapshot */}
        <section style={card}>
          <h2 style={sectionTitle}>Último snapshot de API-Football</h2>
          {lastSnapshot ? (
            <dl style={dl}>
              <Row label="Obtenido" value={lastFetch} />
              <Row label="Estado" value={STATUS_LABEL[lastSnapshot.match_status] ?? lastSnapshot.match_status} />
              <Row label="Marcador" value={`${lastSnapshot.home_score} – ${lastSnapshot.away_score}`} />
              <Row label="Córners" value={String(lastSnapshot.corners_total)} />
              <Row label="Amarillas" value={String(lastSnapshot.yellow_cards_total)} />
              <Row label="Rojas" value={String(lastSnapshot.red_cards_total)} />
            </dl>
          ) : (
            <p style={{ color: "#888", margin: 0 }}>Sin snapshots todavía.</p>
          )}
        </section>

        {/* Ranking / leaderboard cache */}
        <section style={card}>
          <h2 style={sectionTitle}>Ranking (leaderboard cache)</h2>
          <dl style={dl}>
            <Row
              label="Fila cache"
              value={
                leaderboard.cacheRowExists ? (
                  "Existe"
                ) : (
                  <span style={{ color: "#ef4444", fontWeight: 700 }}>⚠ NO EXISTE (id=1 falta)</span>
                )
              }
            />
            <Row label="Jugadores en ranking" value={String(leaderboard.rankingCount)} />
            <Row label="Jugadores con puntaje" value={String(leaderboard.scoredPlayers)} />
            <Row label="Última actualización" value={leaderboardUpdatedAt} />
          </dl>
          {!leaderboard.cacheRowExists && (
            <p style={{ marginTop: "0.5rem", fontSize: 12, color: "#ef4444" }}>
              La fila id=1 de juego_leaderboard_cache no existe. Si se borró por error, hay que
              reinsertarla manualmente en Supabase: <code>insert into juego_leaderboard_cache (id) values (1);</code>
            </p>
          )}
          {leaderboard.cacheRowExists && leaderboard.rankingCount === 0 && totalPlayers > 0 && (
            <p style={{ marginTop: "0.5rem", fontSize: 12, color: "#f59e0b" }}>
              Hay {totalPlayers} jugador(es) registrado(s) pero el ranking está vacío — probá
              &quot;Recalcular ranking&quot; abajo y fijate si tira error.
            </p>
          )}
          <button onClick={recalcularRanking} disabled={busy} style={{ ...btnPrimary, marginTop: "1rem" }}>
            {busy ? "Ejecutando…" : "🔄 Recalcular ranking ahora"}
          </button>
        </section>

        {/* Configuración */}
        <section style={card}>
          <h2 style={sectionTitle}>Configuración del partido</h2>
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#888", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Fixture ID (API-Football)
            </label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="text"
                value={editFixtureId}
                onChange={(e) => setEditFixtureId(e.target.value)}
                placeholder="Ej: 1565178"
                style={{
                  flex: 1,
                  background: "#0B0705",
                  border: "1px solid #333",
                  borderRadius: 8,
                  padding: "0.65rem 0.75rem",
                  color: "#f0ebe4",
                  fontSize: 14,
                  fontWeight: 600,
                  outline: "none",
                }}
              />
              <button onClick={handleSetFixture} disabled={saving || busy} style={{ ...btnPrimary, whiteSpace: "nowrap" }}>
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
            <p style={{ marginTop: "0.5rem", fontSize: 11, color: "#555" }}>
              ⚠ Al cambiar el fixture ID, el próximo poll traerá datos del nuevo partido.
              Si es un partido nuevo, usa también el botón &quot;Resetear juego&quot; para limpiar predicciones anteriores.
            </p>
          </div>
          <button
            onClick={handleReset}
            disabled={busy}
            style={{
              background: "transparent",
              color: "#ef4444",
              border: "1px solid #7f1d1d",
              borderRadius: 8,
              padding: "0.65rem 1rem",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              width: "100%",
            }}
          >
            🔄 Resetear juego (borrar predicciones, puntajes y snapshots)
          </button>
          <p style={{ margin: "0.5rem 0 0", fontSize: 11, color: "#555" }}>
            Usa esto cuando cambies a un partido completamente nuevo. Elimina todas las predicciones,
            puntajes y snapshots del partido anterior. También elimina jugadores (cada ronda
            puede tener participantes distintos). No elimina mercados.
          </p>
        </section>

        {/* Acciones */}
        <section style={card}>
          <h2 style={sectionTitle}>Acciones</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <button onClick={() => postAction("poll")} disabled={busy} style={btnPrimary}>
              {busy ? "Ejecutando…" : "▶ Poll manual (prueba API-Football)"}
            </button>
            {!matchState.predictions_locked ? (
              <button onClick={() => postAction("lock")} disabled={busy} style={btnDanger}>
                🔒 Cerrar pronósticos manualmente
              </button>
            ) : (
              <button onClick={() => postAction("unlock")} disabled={busy} style={btnGhost}>
                🔓 Reabrir pronósticos
              </button>
            )}
          </div>
          <p style={{ marginTop: "1rem", fontSize: 12, color: "#666" }}>
            El cron automático corre cada 5 min en Vercel dentro de la ventana del partido (30 min antes del kickoff). El poll manual no tiene esa restricción — úsalo para verificar la integración.
          </p>
        </section>

        {/* Links */}
        <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
          <a href="/juego/ranking" style={linkStyle}>Ver ranking →</a>
          <a href="/admin" style={linkStyle}>Admin sorteo →</a>
        </div>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt style={{ color: "#888", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</dt>
      <dd style={{ margin: "0 0 0.75rem", fontWeight: 600, fontSize: 15 }}>{value}</dd>
    </>
  );
}

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
const dl: React.CSSProperties = { margin: 0, display: "grid", gridTemplateColumns: "130px 1fr", rowGap: 0 };
const btnPrimary: React.CSSProperties = {
  background: "#FF4D00",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "0.75rem 1rem",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  textAlign: "left",
};
const btnDanger: React.CSSProperties = {
  ...btnPrimary,
  background: "#7f1d1d",
};
const btnGhost: React.CSSProperties = {
  background: "transparent",
  color: "#888",
  border: "1px solid #333",
  borderRadius: 8,
  padding: "0.6rem 1rem",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
  textAlign: "left",
};
const msgBox: React.CSSProperties = {
  border: "1px solid",
  borderRadius: 8,
  padding: "0.75rem 1rem",
  marginBottom: "1rem",
  fontSize: 13,
  fontWeight: 600,
};
const linkStyle: React.CSSProperties = {
  color: "#FF4D00",
  fontSize: 13,
  fontWeight: 600,
  textDecoration: "none",
};
