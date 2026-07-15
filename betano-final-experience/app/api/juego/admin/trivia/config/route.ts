import { NextResponse } from "next/server";
import { createServer, createAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * POST /api/juego/admin/trivia/config  { kickoffAt: string | null }
 *
 * El kickoff es UN solo instante con dos efectos:
 *   1. corte de inscripción (lo chequea /api/juego/registro), y
 *   2. cierre automático de las preguntas con cierra_con_kickoff (Q10):
 *      acá se les sincroniza closes_at para que el trigger de la DB las
 *      cierre por reloj del servidor sin intervención del admin.
 */
export async function POST(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  let body: { kickoffAt?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  let kickoffAt: string | null = null;
  if (body.kickoffAt) {
    const d = new Date(body.kickoffAt);
    if (isNaN(d.getTime())) {
      return NextResponse.json({ error: "Fecha de kickoff inválida." }, { status: 400 });
    }
    kickoffAt = d.toISOString();
  }

  const admin = createAdmin();
  const now = new Date().toISOString();

  const { error } = await admin
    .from("juego_trivia_config")
    .upsert({ id: 1, kickoff_at: kickoffAt, updated_at: now });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sincroniza el cierre de las preguntas ancladas al kickoff (Q10) que aún
  // no fueron sorteadas. Si estaban cerradas por un kickoff anterior que se
  // corrió hacia adelante, vuelven a quedar abiertas hasta el nuevo corte.
  await admin
    .from("juego_trivia_questions")
    .update({ status: "abierta", closes_at: kickoffAt, updated_at: now })
    .eq("cierra_con_kickoff", true)
    .in("status", ["borrador", "abierta", "cerrada"]);

  return NextResponse.json({ ok: true, kickoffAt });
}
