"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowser } from "@/lib/supabase-browser";

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

interface Props {
  totalParticipantes: number;
  sorteo: { id: string; semilla: string; created_at: string } | null;
  resultados: Resultado[];
}

export default function AdminDashboard({ totalParticipantes, sorteo, resultados }: Props) {
  const router = useRouter();
  const [seed, setSeed] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Top 10 efectivos: ganadores que aún no han rechazado el premio.
  // Si alguien rechaza (premio_tomado=false), el siguiente suplente sube.
  const aceptadosORevocados = resultados.filter((r) => r.premio_tomado === false).length;
  const ganadoresEfectivos = resultados
    .filter((r) => r.premio_tomado !== false)
    .slice(0, 10);
  const ganadoresIds = new Set(ganadoresEfectivos.map((r) => r.id));

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
      <header className="admin-head">
        <div>
          <h1 className="admin-title">Final Experience · Panel</h1>
          <p className="admin-sub">{totalParticipantes} inscritos en total</p>
        </div>
        <button className="ghost-btn" onClick={logout}>Cerrar sesión</button>
      </header>

      <section className="panel">
        <h2 className="panel-h">Sorteo</h2>
        {sorteo ? (
          <p className="muted">
            Último sorteo: {new Date(sorteo.created_at).toLocaleString("es-CL")} ·
            semilla <code className="seed">{sorteo.semilla}</code>
          </p>
        ) : (
          <p className="muted">Aún no se ha ejecutado ningún sorteo.</p>
        )}
        <div className="seed-row">
          <input
            className="field-input" placeholder="Semilla (opcional, se genera una si la dejas vacía)"
            value={seed} onChange={(e) => setSeed(e.target.value)}
          />
          <button className="btn-ember" onClick={ejecutarSorteo} disabled={busy}>
            {sorteo ? "Re-ejecutar sorteo" : "Ejecutar sorteo"}
          </button>
        </div>
        {msg && <p className="muted" style={{ marginTop: "0.75rem" }}>{msg}</p>}
      </section>

      {resultados.length > 0 && (
        <section className="panel">
          <div className="panel-head-row">
            <h2 className="panel-h">
              Ranking del sorteo · {ganadoresEfectivos.length} ganadores efectivos
              {aceptadosORevocados > 0 && ` · ${aceptadosORevocados} declinaron`}
            </h2>
            <button className="btn-ember" onClick={notificarGanadores} disabled={busy}>
              Notificar ganadores
            </button>
          </div>

          <div className="table-scroll">
            <table className="rank-table">
              <thead>
                <tr>
                  <th>#</th><th>Nombre</th><th>Correo</th><th>Teléfono</th>
                  <th>Documento</th><th>Estado</th><th>Notificado</th><th>Premio</th>
                </tr>
              </thead>
              <tbody>
                {resultados.map((r) => {
                  const esGanadorEfectivo = ganadoresIds.has(r.id);
                  return (
                    <tr key={r.id} className={esGanadorEfectivo ? "row-winner" : ""}>
                      <td>{r.posicion}</td>
                      <td>{r.participantes.nombre}</td>
                      <td>{r.participantes.email}</td>
                      <td>{r.participantes.telefono}</td>
                      <td>{r.participantes.tipo_doc} {r.participantes.documento}</td>
                      <td>
                        {r.premio_tomado === false ? (
                          <span className="tag tag-out">Declinó</span>
                        ) : esGanadorEfectivo ? (
                          <span className="tag tag-win">Ganador</span>
                        ) : (
                          <span className="tag tag-sub">Suplente</span>
                        )}
                      </td>
                      <td>{r.notificado_at ? "Sí" : "—"}</td>
                      <td className="prize-cell">
                        {esGanadorEfectivo && r.premio_tomado !== true && (
                          <button className="mini-btn ok"
                            onClick={() => marcarPremio(r.id, true)} disabled={busy}>
                            Tomó
                          </button>
                        )}
                        {(esGanadorEfectivo || r.premio_tomado === false) &&
                          r.premio_tomado !== false && (
                          <button className="mini-btn no"
                            onClick={() => marcarPremio(r.id, false)} disabled={busy}>
                            Declinó
                          </button>
                        )}
                        {r.premio_tomado === false && (
                          <button className="mini-btn"
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
          <p className="muted" style={{ marginTop: "0.75rem" }}>
            Si un ganador declina, el primer suplente disponible pasa
            automáticamente a ganador efectivo.
          </p>
        </section>
      )}
    </main>
  );
}
