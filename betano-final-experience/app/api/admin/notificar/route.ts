import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createServer, createAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const { resultadoIds } = await req.json();
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

  const resend = new Resend(process.env.RESEND_API_KEY!);
  const from = process.env.RESEND_FROM!;
  let enviados = 0;
  const fallos: string[] = [];

  for (const fila of filas as any[]) {
    const p = fila.participantes;
    if (!p?.email) continue;
    try {
      await resend.emails.send({
        from,
        to: p.email,
        subject: "¡Ganaste la Final Experience Betano!",
        html: emailHtml(p.nombre),
      });
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

function emailHtml(nombre: string) {
  return `
  <div style="font-family:Arial,sans-serif;background:#0B0705;color:#F5EFE8;padding:32px;border-radius:12px;max-width:560px;margin:auto">
    <h1 style="color:#FF4D00;text-transform:uppercase;font-style:italic;margin:0 0 16px">Final Experience</h1>
    <p style="font-size:16px;line-height:1.6">Hola ${escapeHtml(nombre)},</p>
    <p style="font-size:16px;line-height:1.6">
      Tenemos excelentes noticias: resultaste <strong>ganador</strong> del concurso
      Final Experience Betano. Vivirás la final del Mundial 2026 como nunca antes.
    </p>
    <p style="font-size:16px;line-height:1.6">
      Nuestro equipo se pondrá en contacto contigo a este mismo correo con los pasos
      para coordinar la entrega de tu premio. Mantente atento.
    </p>
    <p style="font-size:13px;color:#B8A99C;margin-top:24px">
      Este correo se envía únicamente con fines de este concurso. Tus datos serán
      eliminados tras la finalización del evento conforme a las bases legales.
    </p>
  </div>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}
