"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowser } from "@/lib/supabase-browser";
import type { TieBreakerEvent, Winner } from "@/lib/juego/winners";
import type { PrizeAssignment } from "@/lib/juego/prizes";
import TriviaAdminPanel from "./TriviaAdminPanel";

type FinalResult = {
  status: "idle" | "executed" | "revealed";
  seed: string | null;
  max_winners: number | null;
  winners: Winner[];
  tie_breaker_events: TieBreakerEvent[];
  executed_at: string | null;
  revealed_at: string | null;
  prize_assignments?: PrizeAssignment[];
  raffled_at?: string | null;
} | null;

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
  finalResult,
  prizeCatalog,
  defaultMaxWinners,
}: {
  matchState: MatchState;
  lastSnapshot: Snapshot;
  totalPlayers: number;
  fixtureId: string | null;
  leaderboard: LeaderboardInfo;
  finalResult: FinalResult;
  prizeCatalog: string[];
  defaultMaxWinners: number;
}) {
  const router = useRouter();
  // Trivia (evento 2026) por defecto; el panel del juego de pronósticos queda
  // intacto en su pestaña para una futura activación.
  const [tab, setTab] = useState<"trivia" | "pronosticos">("trivia");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [editFixtureId, setEditFixtureId] = useState(fixtureId ?? "");
  const [saving, setSaving] = useState(false);
  const [maxWinnersInput, setMaxWinnersInput] = useState(String(defaultMaxWinners));
  // Catálogo de premios preconfigurado (uno por línea, más valioso primero).
  const [catalogInput, setCatalogInput] = useState(prizeCatalog.join("\n"));

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

  async function postFinal(body: Record<string, unknown>) {
    const res = await fetch("/api/juego/admin/finalizar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { res, data: await res.json() };
  }

  async function ejecutarSorteo() {
    const n = Number(maxWinnersInput);
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      setMsg({ text: "Nº de ganadores debe ser un entero entre 1 y 100.", ok: false });
      return;
    }
    if (
      !window.confirm(
        `🎰 ¿Ejecutar el sorteo final con ${n} ganador(es)?\n\nEl resultado se decide en el servidor (semilla auditable) y la ruleta arranca AL INSTANTE en todos los teléfonos y en la TV.`
      )
    )
      return;

    setBusy(true);
    setMsg(null);
    let { res, data } = await postFinal({ action: "execute", maxWinners: n });
    if (res.status === 409 && data.needsForce) {
      if (window.confirm("⚠ El partido NO está finalizado.\n\n¿Ejecutar el sorteo de todas formas?")) {
        ({ res, data } = await postFinal({ action: "execute", maxWinners: n, force: true }));
      } else {
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    if (!res.ok) {
      setMsg({ text: data.error ?? "Error al ejecutar el sorteo.", ok: false });
    } else {
      setMsg({ text: `Sorteo ejecutado: ${data.winners.length} ganador(es). La animación está corriendo en las pantallas.`, ok: true });
      router.refresh();
    }
  }

  async function marcarRevelado() {
    setBusy(true);
    setMsg(null);
    const { res, data } = await postFinal({ action: "reveal" });
    setBusy(false);
    if (!res.ok) setMsg({ text: data.error ?? "Error al marcar revelado.", ok: false });
    else {
      setMsg({ text: "Marcado como revelado: quien entre ahora ve el podio directo.", ok: true });
      router.refresh();
    }
  }

  function catalogPrizes() {
    return catalogInput
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function guardarCatalogo() {
    setBusy(true);
    setMsg(null);
    const { res, data } = await postFinal({ action: "saveCatalog", prizes: catalogPrizes() });
    setBusy(false);
    if (!res.ok) setMsg({ text: data.error ?? "Error al guardar el catálogo.", ok: false });
    else {
      setMsg({ text: `Catálogo guardado (${data.prizes.length} premios).`, ok: true });
      router.refresh();
    }
  }

  async function sortearPremios() {
    const prizes = catalogPrizes();
    const nGanadores = finalResult?.winners.length ?? 0;
    if (prizes.length < nGanadores) {
      setMsg({
        text: `Hacen falta al menos ${nGanadores} premios en el catálogo (hay ${prizes.length}).`,
        ok: false,
      });
      return;
    }
    const disputados = prizes.slice(0, nGanadores);
    if (
      !window.confirm(
        `🎁 ¿Sortear estos ${nGanadores} premios entre los ${nGanadores} ganadores?\n\n${disputados
          .map((p, i) => `${i + 1}. ${p}`)
          .join(
            "\n"
          )}\n\nEl resultado se decide en el servidor (semilla auditable) y la ruleta arranca AL INSTANTE en todas las pantallas.`
      )
    )
      return;

    setBusy(true);
    setMsg(null);
    // Envía el catálogo actual como premios; el servidor toma los N más valiosos.
    const { res, data } = await postFinal({ action: "rafflePrizes", prizes });
    setBusy(false);
    if (!res.ok) setMsg({ text: data.error ?? "Error al sortear premios.", ok: false });
    else {
      setMsg({ text: "Premios sorteados. La animación está corriendo en las pantallas.", ok: true });
      router.refresh();
    }
  }

  async function deshacerPremios() {
    if (
      !window.confirm(
        "↩ ¿Deshacer el sorteo de premios?\n\nLos overlays de premios desaparecen de las pantallas. Podrás volver a sortear con una semilla nueva."
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    const { res, data } = await postFinal({ action: "undoPrizes" });
    setBusy(false);
    if (!res.ok) setMsg({ text: data.error ?? "Error al deshacer los premios.", ok: false });
    else {
      setMsg({ text: "Premios deshechos. Puedes volver a sortear.", ok: true });
      router.refresh();
    }
  }

  async function deshacerSorteo() {
    if (
      !window.confirm(
        "↩ ¿Deshacer el sorteo final?\n\nLos overlays desaparecen de todas las pantallas al instante.\nLa ejecución queda registrada en la auditoría (juego_final_runs).\nDespués puedes volver a ejecutar con una semilla nueva."
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    const { res, data } = await postFinal({ action: "undo" });
    setBusy(false);
    if (!res.ok) setMsg({ text: data.error ?? "Error al deshacer.", ok: false });
    else {
      setMsg({ text: "Sorteo deshecho. Puedes ejecutar de nuevo.", ok: true });
      router.refresh();
    }
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
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: "4px 0 0" }}>
              {tab === "trivia" ? "Trivia en vivo" : "Panel del partido"}
            </h1>
          </div>
          <button onClick={logout} style={btnGhost}>Cerrar sesión</button>
        </div>

        {/* Pestañas: Trivia (evento) / Pronósticos (juego anterior, intacto) */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
          <button
            onClick={() => setTab("trivia")}
            style={tab === "trivia" ? tabActive : tabIdle}
          >
            🎯 Trivia
          </button>
          <button
            onClick={() => setTab("pronosticos")}
            style={tab === "pronosticos" ? tabActive : tabIdle}
          >
            ⚽ Pronósticos (anterior)
          </button>
        </div>

        {tab === "trivia" && <TriviaAdminPanel />}

        {tab === "pronosticos" && (
          <>
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

        {/* Catálogo de premios: se preconfigura de antemano; el sorteo usa los
            N más valiosos según cuántos ganadores haya. */}
        <section style={card}>
          <h2 style={sectionTitle}>Catálogo de premios</h2>
          <p style={{ margin: "0 0 0.75rem", fontSize: 13, color: "#888" }}>
            Un premio por línea, el primero es el más valioso. Déjalo cargado antes del
            evento: si hay más premios que ganadores, se disputan sólo los más valiosos.
          </p>
          <textarea
            value={catalogInput}
            onChange={(e) => setCatalogInput(e.target.value)}
            rows={Math.max(3, catalogPrizes().length + 1)}
            placeholder={"PlayStation 5\nSilla Gamer\nGiftcard\nCamiseta\nTaza"}
            style={{
              width: "100%",
              background: "#0B0705",
              border: "1px solid #333",
              borderRadius: 8,
              padding: "0.65rem 0.75rem",
              color: "#f0ebe4",
              fontSize: 14,
              fontWeight: 500,
              outline: "none",
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.6rem" }}>
            <button onClick={guardarCatalogo} disabled={busy} style={btnPrimary}>
              {busy ? "Guardando…" : "💾 Guardar catálogo"}
            </button>
            <span style={{ fontSize: 12, color: "#888" }}>{catalogPrizes().length} premio(s)</span>
          </div>
        </section>

        {/* Final del juego: sorteo de desempate + reveal */}
        <section style={card}>
          <h2 style={sectionTitle}>Final del juego</h2>

          {(!finalResult || finalResult.status === "idle") && (
            <>
              <p style={{ margin: "0 0 1rem", fontSize: 13, color: "#888" }}>
                Resuelve los empates con un sorteo en el servidor (semilla auditable) y dispara
                la ruleta en todos los teléfonos y en <a href="/juego/tv" style={linkStyle}>/juego/tv</a>.
              </p>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", marginBottom: "0.75rem" }}>
                <div style={{ flex: "0 0 130px" }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#888", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Nº de ganadores
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={maxWinnersInput}
                    onChange={(e) => setMaxWinnersInput(e.target.value)}
                    style={{
                      width: "100%",
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
                </div>
                <button onClick={ejecutarSorteo} disabled={busy} style={{ ...btnPrimary, flex: 1 }}>
                  {busy ? "Ejecutando…" : "🎰 Ejecutar sorteo final"}
                </button>
              </div>
              {matchState.match_status !== "finished" && (
                <p style={{ margin: 0, fontSize: 11, color: "#f59e0b" }}>
                  ⚠ El partido aún no está &quot;Finalizado&quot; — se pedirá confirmación extra.
                </p>
              )}
            </>
          )}

          {finalResult && finalResult.status !== "idle" && (
            <>
              <dl style={dl}>
                <Row
                  label="Estado"
                  value={
                    <span style={{ color: finalResult.status === "revealed" ? "#22c55e" : "#f59e0b", fontWeight: 700 }}>
                      {finalResult.status === "revealed" ? "REVELADO" : "EJECUTADO (animación en curso)"}
                    </span>
                  }
                />
                <Row label="Ganadores" value={String(finalResult.winners.length)} />
                <Row label="Sorteos" value={finalResult.tie_breaker_events.length === 0 ? "Sin empates" : String(finalResult.tie_breaker_events.length)} />
                <Row label="Semilla" value={<code style={{ fontSize: 12 }}>{finalResult.seed ?? "—"}</code>} />
              </dl>

              <div style={{ borderTop: "1px solid #2a2420", margin: "0.75rem 0", paddingTop: "0.75rem" }}>
                {[...finalResult.winners]
                  .sort((a, b) => a.finalPosition - b.finalPosition)
                  .map((w) => (
                    <div key={w.player_id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.3rem 0", fontSize: 14 }}>
                      <span style={{ width: 28, fontWeight: 800, color: "#FF4D00" }}>{w.finalPosition}º</span>
                      <span style={{ flex: 1, fontWeight: 600 }}>{w.alias}</span>
                      <span style={{ color: "#888", fontVariantNumeric: "tabular-nums" }}>{w.puntos} pts</span>
                      {w.viaTieBreaker && <span title="Definido por ruleta">🎰</span>}
                    </div>
                  ))}
              </div>

              {finalResult.tie_breaker_events.length > 0 && (
                <p style={{ margin: "0 0 0.75rem", fontSize: 12, color: "#888" }}>
                  {finalResult.tie_breaker_events
                    .map((ev) =>
                      ev.kind === "order"
                        ? `Empate en ${ev.puntos} pts — orden de ${ev.positions.map((p) => `${p}º`).join("/")}`
                        : `Empate en ${ev.puntos} pts — ${ev.participants.length} jugadores por ${ev.spots} cupo(s)`
                    )
                    .join(" · ")}
                </p>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {finalResult.status === "executed" && (
                  <button onClick={marcarRevelado} disabled={busy} style={btnPrimary}>
                    📺 Marcar como revelado (los que entren ven el podio directo)
                  </button>
                )}
                <button
                  onClick={deshacerSorteo}
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
                  }}
                >
                  ↩ Deshacer sorteo
                </button>
              </div>

              {/* Fase 2: sorteo de premios entre los ganadores (usa el catálogo) */}
              {finalResult.status === "revealed" && !finalResult.raffled_at && (
                <div style={{ borderTop: "1px solid #2a2420", margin: "1rem 0 0", paddingTop: "1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  {catalogPrizes().length < finalResult.winners.length ? (
                    <p style={{ margin: 0, fontSize: 12, color: "#f59e0b" }}>
                      ⚠ El catálogo tiene {catalogPrizes().length} premio(s) y hay {finalResult.winners.length} ganadores.
                      Carga al menos {finalResult.winners.length} en el catálogo (abajo) y guarda.
                    </p>
                  ) : (
                    <>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        🎁 Se disputarán estos {finalResult.winners.length} premios
                      </label>
                      <ol style={{ margin: 0, paddingLeft: "1.2rem", fontSize: 14, color: "#f0ebe4" }}>
                        {catalogPrizes().slice(0, finalResult.winners.length).map((p, i) => (
                          <li key={i} style={{ padding: "0.15rem 0" }}>{p}</li>
                        ))}
                      </ol>
                      <button onClick={sortearPremios} disabled={busy} style={btnPrimary}>
                        {busy ? "Sorteando…" : "🎁 Sortear premios"}
                      </button>
                    </>
                  )}
                </div>
              )}

              {finalResult.raffled_at && finalResult.prize_assignments && (
                <div style={{ borderTop: "1px solid #2a2420", margin: "1rem 0 0", paddingTop: "1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    🎁 Premios sorteados
                  </label>
                  <div>
                    {finalResult.prize_assignments.map((a) => (
                      <div key={a.player_id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.3rem 0", fontSize: 14 }}>
                        <span style={{ flex: 1, fontWeight: 600 }}>{a.alias}</span>
                        <span style={{ color: "#FF4D00", fontWeight: 700 }}>{a.prize.name}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={deshacerPremios}
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
                    }}
                  >
                    ↩ Deshacer premios
                  </button>
                </div>
              )}
            </>
          )}
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
          </>
        )}

        {/* Links */}
        <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
          <a href="/juego/ranking" style={linkStyle}>Ver ranking →</a>
          <a href="/juego/tv" style={linkStyle}>Vista TV →</a>
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
const tabIdle: React.CSSProperties = {
  background: "transparent",
  color: "#888",
  border: "1px solid #333",
  borderRadius: 8,
  padding: "0.55rem 1rem",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};
const tabActive: React.CSSProperties = {
  ...tabIdle,
  background: "#FF4D00",
  color: "#fff",
  border: "1px solid #FF4D00",
};
const linkStyle: React.CSSProperties = {
  color: "#FF4D00",
  fontSize: 13,
  fontWeight: 600,
  textDecoration: "none",
};
