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
 *   { questionId, action: "abrir" | "cerrar" | "extender", seconds? }
 *
 * abrir  → status='abierta', opened_at=now, closes_at=now+duration_seconds.
 *          El UPDATE dispara Realtime: la pregunta aparece en todos los
 *          teléfonos y en la TV con el cronómetro corriendo. Re-abrir una
 *          pregunta cerrada da una ventana nueva (escape hatch para
 *          imprevistos en vivo, ej. falló el proyector). Las preguntas con
 *          cierra_con_kickoff mantienen su closes_at = kickoff.
 * cerrar → status='cerrada', closes_at=now (corta antes de tiempo; el
 *          cierre normal lo hace solo el reloj del servidor vía trigger).
 * extender → suma 'seconds' (default 20, clamp 1..120) a closes_at SIN cambiar
 *          el status; sirve para dar más tiempo o reabrir una ventana que acaba
 *          de vencer. El trigger de la DB re-admite respuestas automáticamente.
 */
export async function POST(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  let body: { questionId?: string; action?: string; seconds?: number };
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
    .select("id, status, duration_seconds, cierra_con_kickoff, closes_at")
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

  if (body.action === "extender") {
    // Suma tiempo a la ventana en vivo (escape hatch: sala lenta, falló el
    // proyector, etc.). Empuja closes_at hacia adelante SIN cambiar el status;
    // el trigger de la DB y el frontend del jugador re-admiten respuestas solos.
    if (q.status !== "abierta") {
      return NextResponse.json(
        { error: "Solo se puede extender una pregunta abierta." },
        { status: 409 }
      );
    }
    if (q.cierra_con_kickoff) {
      return NextResponse.json(
        { error: "Esta pregunta cierra con el kickoff; ajusta el kickoff en su lugar." },
        { status: 409 }
      );
    }
    if (q.closes_at == null) {
      return NextResponse.json(
        { error: "La pregunta no tiene tiempo límite; no hay nada que extender." },
        { status: 409 }
      );
    }

    const rawSeconds = Number(body.seconds ?? 20);
    const seconds = Number.isFinite(rawSeconds) ? Math.min(120, Math.max(1, Math.round(rawSeconds))) : 20;
    // max(now, closes_at) ⇒ si la ventana ya venció, reabre desde ahora +Ns;
    // si sigue viva, suma al tiempo restante (no reinicia).
    const base = Math.max(now.getTime(), new Date(q.closes_at).getTime());
    const newClosesAt = new Date(base + seconds * 1000).toISOString();

    const { data: updated, error } = await admin
      .from("juego_trivia_questions")
      .update({ closes_at: newClosesAt, updated_at: now.toISOString() })
      .eq("id", questionId)
      .eq("status", "abierta")
      .select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: "La pregunta no está abierta." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, status: "abierta", seconds, closesAt: newClosesAt });
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
