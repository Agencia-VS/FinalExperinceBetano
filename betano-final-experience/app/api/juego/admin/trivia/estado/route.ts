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
 * POST /api/juego/admin/trivia/estado
 *   { questionId, action: "abrir" | "cerrar" }
 *
 * abrir  → status='abierta', opened_at=now, closes_at=now+duration_seconds.
 *          El UPDATE dispara Realtime: la pregunta aparece en todos los
 *          teléfonos y en la TV con el cronómetro corriendo. Re-abrir una
 *          pregunta cerrada da una ventana nueva (escape hatch para
 *          imprevistos en vivo, ej. falló el proyector). Las preguntas con
 *          cierra_con_kickoff mantienen su closes_at = kickoff.
 * cerrar → status='cerrada', closes_at=now (corta antes de tiempo; el
 *          cierre normal lo hace solo el reloj del servidor vía trigger).
 */
export async function POST(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  let body: { questionId?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const questionId = String(body.questionId ?? "");
  if (!questionId) return NextResponse.json({ error: "Falta questionId." }, { status: 400 });

  const admin = createAdmin();
  const { data: q } = await admin
    .from("juego_trivia_questions")
    .select("id, status, duration_seconds, cierra_con_kickoff")
    .eq("id", questionId)
    .maybeSingle();
  if (!q) return NextResponse.json({ error: "Pregunta no encontrada." }, { status: 404 });

  const now = new Date();

  if (body.action === "abrir") {
    if (q.status === "sorteada") {
      return NextResponse.json(
        { error: "La pregunta ya fue sorteada; deshaz el sorteo para reabrirla." },
        { status: 409 }
      );
    }

    let closesAt: string | null = new Date(
      now.getTime() + q.duration_seconds * 1000
    ).toISOString();
    if (q.cierra_con_kickoff) {
      const { data: cfg } = await admin
        .from("juego_trivia_config")
        .select("kickoff_at")
        .eq("id", 1)
        .maybeSingle();
      closesAt = cfg?.kickoff_at ?? null; // sin kickoff configurado ⇒ sin límite
    }

    const { error } = await admin
      .from("juego_trivia_questions")
      .update({
        status: "abierta",
        opened_at: now.toISOString(),
        closes_at: closesAt,
        updated_at: now.toISOString(),
      })
      .eq("id", questionId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, status: "abierta", closesAt });
  }

  if (body.action === "cerrar") {
    const { data: updated, error } = await admin
      .from("juego_trivia_questions")
      .update({ status: "cerrada", closes_at: now.toISOString(), updated_at: now.toISOString() })
      .eq("id", questionId)
      .eq("status", "abierta")
      .select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: "La pregunta no está abierta." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, status: "cerrada" });
  }

  return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
}
