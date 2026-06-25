import { NextResponse } from "next/server";
import { createServer, createAdmin } from "@/lib/supabase";

async function requireAdmin() {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Ejecutar sorteo reproducible con semilla
export async function POST(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const { semilla } = await req.json();
  if (!semilla || typeof semilla !== "string") {
    return NextResponse.json({ error: "Semilla requerida." }, { status: 400 });
  }

  const admin = createAdmin();
  const { data, error } = await admin.rpc("ejecutar_sorteo", {
    p_semilla: semilla,
    p_ejecutor: user.id,
  });

  if (error) {
    return NextResponse.json({ error: "No se pudo ejecutar el sorteo." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, sorteoId: data });
}

// Marcar si un ganador tomó o declinó el premio
export async function PATCH(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const { resultadoId, premioTomado } = await req.json();
  if (!resultadoId) {
    return NextResponse.json({ error: "Falta el resultado." }, { status: 400 });
  }

  const admin = createAdmin();
  const { error } = await admin
    .from("sorteo_resultados")
    .update({ premio_tomado: premioTomado })
    .eq("id", resultadoId);

  if (error) {
    return NextResponse.json({ error: "No se pudo actualizar." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
