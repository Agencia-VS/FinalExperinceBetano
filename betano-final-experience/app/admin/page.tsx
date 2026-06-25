import { createServer } from "@/lib/supabase";
import AdminDashboard from "./AdminDashboard";
import "./admin.css";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createServer();

  const { count: totalParticipantes } = await supabase
    .from("participantes")
    .select("*", { count: "exact", head: true });

  // Último sorteo (si existe)
  const { data: sorteo } = await supabase
    .from("sorteos")
    .select("id, semilla, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Solo necesitamos los primeros 50: 10 ganadores + 40 suplentes por si alguno declina.
  // Cargar 1M de filas aquí reventaría el servidor y el browser del admin.
  let resultados: any[] = [];
  if (sorteo) {
    const { data } = await supabase
      .from("sorteo_resultados")
      .select(
        "id, posicion, es_ganador, premio_tomado, notificado_at, participante_id, participantes(nombre, email, telefono, tipo_doc, documento)"
      )
      .eq("sorteo_id", sorteo.id)
      .order("posicion", { ascending: true })
      .limit(50);
    resultados = data ?? [];
  }

  return (
    <AdminDashboard
      totalParticipantes={totalParticipantes ?? 0}
      sorteo={sorteo}
      resultados={resultados}
    />
  );
}
