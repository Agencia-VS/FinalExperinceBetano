"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowser } from "@/lib/supabase-browser";
import Image from "next/image";

interface Resultado {
  id: string;
  posicion: number;
  es_ganador: boolean;
  premio_tomado: boolean | null;
  notificado_at: string | null;
  participante_id: string;
  participantes: {
    nombre: string;
    email: string;
    telefono: string;
    tipo_doc: string;
    documento: string;
  };
}

interface Participante {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  tipo_doc: string;
  documento: string;
  motivo: string | null;
  created_at: string;
}

interface Props {
  totalParticipantes: number;
  sorteo: { id: string; semilla: string; created_at: string } | null;
  resultados: Resultado[];
}

export default function AdminDashboard({ totalParticipantes, sorteo, resultados }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"dashboard" | "inscritos">("dashboard");
  const [seed, setSeed] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const aceptadosORevocados = resultados.filter((r) => r.premio_tomado === false).length;
  const ganadoresEfectivos = resultados
    .filter((r) => r.premio_tomado !== false)
    .slice(0, 10);
  const ganadoresIds = new Set(ganadoresEfectivos.map((r) => r.id));
  const notificados = resultados.filter((r) => r.notificado_at).length;

  async function logout() {
    await createBrowser().auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  async function ejecutarSorteo() {
    setMsg("");
    const semilla = seed.trim() || crypto.randomUUID();
    if (sorteo && !confirm("Ya existe un sorteo. ¿Ejecutar uno nuevo? El anterior se conservará en el historial.")) return;
    setBusy(true);
    const res = await fetch("/api/admin/sorteo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ semilla }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json();
      setMsg(d.error ?? "Error al ejecutar el sorteo.");
      return;
    }
    router.refresh();
  }

  async function marcarPremio(resultadoId: string, tomado: boolean) {
    setBusy(true);
    await fetch("/api/admin/sorteo", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultadoId, premioTomado: tomado }),
    });
    setBusy(false);
    router.refresh();
  }

  async function notificarGanadores() {
    setMsg("");
    if (!confirm(`Se enviará correo a ${ganadoresEfectivos.length} ganador(es) efectivos. ¿Continuar?`)) return;
    setBusy(true);
    const res = await fetch("/api/admin/notificar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultadoIds: [...ganadoresIds] }),
    });
    const d = await res.json();
    setBusy(false);
    setMsg(res.ok ? `Correos enviados: ${d.enviados}.` : d.error ?? "Error al notificar.");
    router.refresh();
  }

  return (
    <main className="admin">

      {/* ── Header ── */}
      <header className="admin-header">
        <div className="admin-brand">
          <Image src="/isoBetano.png" alt="Betano" width={36} height={36} />
          <div>
            <h1 className="admin-title">Final Experience</h1>
            <p className="admin-sub">Panel de administración</p>
          </div>
        </div>
        <button type="button" className="ghost-btn" onClick={logout}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Cerrar sesión
        </button>
      </header>

      {/* ── Tabs ── */}
      <nav className="admin-tabs">
        <button
          type="button"
          className={`admin-tab ${tab === "dashboard" ? "admin-tab--active" : ""}`}
          onClick={() => setTab("dashboard")}
        >
          Dashboard
        </button>
        <button
          type="button"
          className={`admin-tab ${tab === "inscritos" ? "admin-tab--active" : ""}`}
          onClick={() => setTab("inscritos")}
        >
          Inscritos
        </button>
      </nav>

      {/* ── Dashboard ── */}
      {tab === "dashboard" && (
        <>
          {/* ── Stats bar ── */}
          <div className="stats-bar">
            <div className="stat-card">
              <span className="stat-num">{totalParticipantes}</span>
              <span className="stat-label">Inscritos</span>
            </div>
            <div className="stat-card">
              <span className="stat-num">{ganadoresEfectivos.length}</span>
              <span className="stat-label">Ganadores efectivos</span>
            </div>
            <div className="stat-card">
              <span className="stat-num">{aceptadosORevocados}</span>
              <span className="stat-label">Declinaron</span>
            </div>
            <div className="stat-card">
              <span className="stat-num">{notificados}</span>
              <span className="stat-label">Notificados</span>
            </div>
          </div>

          {/* ── Sorteo panel ── */}
          <section className="panel">
            <div className="panel-head-row">
              <div>
                <h2 className="panel-h">Sorteo</h2>
                {sorteo ? (
                  <p className="muted">
                    Último: {new Date(sorteo.created_at).toLocaleString("es-CL")} ·
                    semilla <code className="seed">{sorteo.semilla}</code>
                  </p>
                ) : (
                  <p className="muted">Aún no se ha ejecutado ningún sorteo.</p>
                )}
              </div>
            </div>
            <div className="seed-row">
              <input
                className="field-input"
                placeholder="Semilla personalizada (opcional)"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
              />
              <button type="button" className="btn-ember" onClick={ejecutarSorteo} disabled={busy}>
                {sorteo ? "Re-ejecutar sorteo" : "Ejecutar sorteo"}
              </button>
            </div>
            {msg && <p className="panel-msg" role="status">{msg}</p>}
          </section>

          {/* ── Resultados ── */}
          {resultados.length > 0 && (
            <section className="panel">
              <div className="panel-head-row">
                <div>
                  <h2 className="panel-h">
                    Ranking del sorteo
                  </h2>
                  <p className="muted">
                    {ganadoresEfectivos.length} ganadores efectivos
                    {aceptadosORevocados > 0 && ` · ${aceptadosORevocados} declinaron`}
                  </p>
                </div>
                <button type="button" className="btn-ember" onClick={notificarGanadores} disabled={busy}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                  Notificar ganadores
                </button>
              </div>

              <div className="table-scroll">
                <table className="rank-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Nombre</th>
                      <th>Correo</th>
                      <th>Teléfono</th>
                      <th>Documento</th>
                      <th>Estado</th>
                      <th>Notificado</th>
                      <th>Premio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultados.map((r) => {
                      const esGanadorEfectivo = ganadoresIds.has(r.id);
                      return (
                        <tr key={r.id} className={esGanadorEfectivo ? "row-winner" : ""}>
                          <td className="pos-cell">{r.posicion}</td>
                          <td className="name-cell">{r.participantes.nombre}</td>
                          <td>{r.participantes.email}</td>
                          <td>{r.participantes.telefono}</td>
                          <td className="doc-cell">
                            <span className="doc-type">{r.participantes.tipo_doc}</span>
                            {r.participantes.documento}
                          </td>
                          <td>
                            {r.premio_tomado === false ? (
                              <span className="tag tag-out">Declinó</span>
                            ) : esGanadorEfectivo ? (
                              <span className="tag tag-win">Ganador</span>
                            ) : (
                              <span className="tag tag-sub">Suplente</span>
                            )}
                          </td>
                          <td>
                            {r.notificado_at ? (
                              <span className="notif-yes">✓ Sí</span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td className="prize-cell">
                            {esGanadorEfectivo && r.premio_tomado !== true && (
                              <button type="button" className="mini-btn ok"
                                onClick={() => marcarPremio(r.id, true)} disabled={busy}>
                                Tomó
                              </button>
                            )}
                            {(esGanadorEfectivo || r.premio_tomado === false) &&
                              r.premio_tomado !== false && (
                              <button type="button" className="mini-btn no"
                                onClick={() => marcarPremio(r.id, false)} disabled={busy}>
                                Declinó
                              </button>
                            )}
                            {r.premio_tomado === false && (
                              <button type="button" className="mini-btn"
                                onClick={() => marcarPremio(r.id, true)} disabled={busy}>
                                Reactivar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="muted" style={{ marginTop: "1rem", fontSize: "0.78rem" }}>
                Si un ganador declina, el primer suplente disponible pasa automáticamente a ganador efectivo.
              </p>
            </section>
          )}
        </>
      )}

      {/* ── Inscritos ── */}
      {tab === "inscritos" && <InscritosTab />}
    </main>
  );
}

/* ═════════════════════════════════════════════
   InscritosTab – búsqueda con filtro tolerante
   ═════════════════════════════════════════════ */
function InscritosTab() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [data, setData] = useState<Participante[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Debounce de 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async (q: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const res = await fetch(`/api/admin/participantes?${params.toString()}`);
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Error al cargar.");
      }
      const json = await res.json();
      setData(json.data ?? []);
    } catch (e: any) {
      setError(e.message ?? "Error inesperado.");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(debounced);
  }, [debounced, fetchData]);

  // Resetea el filtro a vacío si la búsqueda es solo espacios
  const searchTerm = search.trim();
  const totalMostrados = data.length;

  return (
    <section className="panel">
      {/* Cabecera con buscador */}
      <div className="panel-head-row">
        <div>
          <h2 className="panel-h">Inscritos</h2>
          <p className="muted">
            {loading
              ? "Cargando…"
              : !searchTerm
                ? `${totalMostrados} inscrito(s). Usá el buscador para filtrar por nombre, RUT o email.`
                : `${totalMostrados} resultado(s) para «${searchTerm}».`}
          </p>
        </div>
        <div className="inscritos-search-wrap">
          <svg className="inscritos-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            className="inscritos-search-input"
            type="search"
            placeholder="Nombre, RUT o email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {search && (
            <button
              type="button"
              className="inscritos-search-clear"
              onClick={() => setSearch("")}
              aria-label="Limpiar"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      {error && (
        <p className="panel-msg" role="alert">{error}</p>
      )}

      {loading ? (
        <div className="inscritos-loading">
          <span className="inscritos-spinner" />
          <span className="muted">Cargando inscritos…</span>
        </div>
      ) : data.length === 0 ? (
        <div className="inscritos-empty">
          <p className="muted">
            {searchTerm
              ? `Ningún inscrito coincide con «${searchTerm}». Probá sin tildes o con menos texto.`
              : "No hay inscritos registrados todavía."}
          </p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="rank-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Teléfono</th>
                <th>Documento</th>
                <th>Motivo</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id}>
                  <td className="name-cell">{p.nombre}</td>
                  <td className="inscritos-email">{p.email}</td>
                  <td>{p.telefono}</td>
                  <td className="doc-cell">
                    <span className="doc-type">{p.tipo_doc}</span>
                    {p.documento}
                  </td>
                  <td className="muted" style={{ maxWidth: 220, whiteSpace: "normal" }}>
                    {p.motivo ?? "—"}
                  </td>
                  <td className="muted" style={{ fontSize: "0.78rem" }}>
                    {new Date(p.created_at).toLocaleDateString("es-CL", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
