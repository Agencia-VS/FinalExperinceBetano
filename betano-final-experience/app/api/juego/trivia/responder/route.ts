import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { readDeviceToken } from "@/lib/juego/device-token";

export const dynamic = "force-dynamic";

/**
 * POST /api/juego/trivia/responder  { playerId, questionId, optionId }
 *
 * Upsert sobre (player_id, question_id): el jugador puede cambiar su
 * respuesta mientras la ventana siga abierta. El cierre REAL lo garantiza
 * el trigger juego_trivia_answers_guard por reloj del servidor
 * (status='abierta' AND now() < closes_at) — acá solo se traduce ese
 * rechazo a un 423 legible.
 *
 * Rate limit: 1000/min por IP, deliberadamente alto — los ~250 teléfonos
 * del evento salen por la NAT del venue (pocas IPs compartidas) y todos
 * responden dentro de la misma ventana de 90s. El control real por jugador
 * es el unique (player_id, question_id) + el device token.
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(ip, 1000)) {
    return NextResponse.json({ error: "Demasiados intentos." }, { status: 429 });
  }

  let body: { playerId?: string; questionId?: string; optionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const playerId = String(body.playerId ?? "");
  const questionId = String(body.questionId ?? "");
  const optionId = String(body.optionId ?? "");
  if (!playerId || !questionId || !optionId) {
    return NextResponse.json({ error: "Faltan datos." }, { status: 400 });
  }

  const admin = createAdmin();

  // Jugador + verificación blanda por device token (anti-spoof casual).
  const { data: player } = await admin
    .from("juego_players")
    .select("id, device_token")
    .eq("id", playerId)
    .maybeSingle();
  if (!player) return NextResponse.json({ error: "Jugador no encontrado." }, { status: 404 });
  const device = await readDeviceToken();
  if (player.device_token && device && player.device_token !== device) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { error } = await admin
    .from("juego_trivia_answers")
    .upsert(
      { player_id: playerId, question_id: questionId, option_id: optionId },
      { onConflict: "player_id,question_id" }
    );

  if (error) {
    // 23514 = trigger de guardia (check_violation): ventana cerrada u opción inválida.
    if (error.code === "23514" || error.message?.includes("cerrada")) {
      return NextResponse.json({ error: "La pregunta ya está cerrada." }, { status: 423 });
    }
    if (error.code === "23503") {
      return NextResponse.json({ error: "Pregunta u opción inexistente." }, { status: 400 });
    }
    console.error("[trivia/responder] upsert:", error.message);
    return NextResponse.json({ error: "No pudimos guardar tu respuesta." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * GET /api/juego/trivia/responder?playerId=uuid
 * Valida que el jugador exista (detecta playerIds huérfanos post-RESET)
 * y devuelve sus respuestas guardadas — fuente de verdad para re-hidratar
 * la UI tras recarga, por encima de lo que diga localStorage.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const playerId = searchParams.get("playerId") ?? "";
  if (!playerId) return NextResponse.json({ error: "Falta playerId." }, { status: 400 });

  const admin = createAdmin();
  const { data: player } = await admin
    .from("juego_players")
    .select("id")
    .eq("id", playerId)
    .maybeSingle();
  if (!player) return NextResponse.json({ error: "Jugador no encontrado." }, { status: 404 });

  const { data: answers } = await admin
    .from("juego_trivia_answers")
    .select("question_id, option_id")
    .eq("player_id", playerId);

  return NextResponse.json({ valid: true, answers: answers ?? [] });
}
