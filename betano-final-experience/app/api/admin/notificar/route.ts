import { NextResponse } from "next/server";
import { createServer, createAdmin } from "@/lib/supabase";
import { enviarCorreoGanador } from "@/lib/email";

export async function POST(req: Request) {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const body = await req.json();
  const replyTo: string | undefined =
    typeof body.replyTo === "string" && body.replyTo.trim()
      ? body.replyTo.trim()
      : undefined;

  // Modo prueba: envía UN correo a una dirección arbitraria, sin tocar la BD.
  const testEmail =
    typeof body.testEmail === "string" && body.testEmail.trim()
      ? body.testEmail.trim()
      : null;
  if (testEmail) {
    const testNombre =
      (typeof body.testNombre === "string" && body.testNombre.trim()) || "Prueba";
    try {
      await enviarCorreoGanador(testEmail, testNombre, { replyTo, test: true });
      return NextResponse.json({ ok: true, prueba: true, enviados: 1 });
    } catch {
      return NextResponse.json(
        { error: "No se pudo enviar el correo de prueba." },
        { status: 500 }
      );
    }
  }

  const { resultadoIds } = body;
  if (!Array.isArray(resultadoIds) || resultadoIds.length === 0) {
    return NextResponse.json({ error: "No hay ganadores para notificar." }, { status: 400 });
  }

  const admin = createAdmin();
  const { data: filas, error } = await admin
    .from("sorteo_resultados")
    .select("id, posicion, participantes(nombre, email)")
    .in("id", resultadoIds);

  if (error || !filas) {
    return NextResponse.json({ error: "No se pudieron cargar los ganadores." }, { status: 500 });
  }

  let enviados = 0;
  const fallos: string[] = [];

  for (const fila of filas as any[]) {
    const p = fila.participantes;
    if (!p?.email) continue;
    try {
      await enviarCorreoGanador(p.email, p.nombre, { replyTo });
      await admin
        .from("sorteo_resultados")
        .update({ notificado_at: new Date().toISOString() })
        .eq("id", fila.id);
      enviados++;
    } catch {
      fallos.push(p.email);
    }
  }

  return NextResponse.json({ ok: true, enviados, fallos });
}
