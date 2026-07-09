import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { readDeviceToken } from "@/lib/juego/device-token";

/**
 * POST /api/juego/pronosticos  { playerId, options: string[] }
 * `options` = ids de juego_market_options (uno o varios → soporta autosave por
 * pregunta y guardado en lote). El market_id se deriva de la opción server-side.
 * Idempotente: upsert sobre (player_id, market_id). El cierre lo garantizan el
 * chequeo de abajo y el trigger de la DB.
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(ip, 60)) {
    return NextResponse.json({ error: "Demasiados intentos." }, { status: 429 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad("Solicitud inválida.");
  }

  const playerId = String(body.playerId ?? "");
  const options: string[] = Array.isArray(body.options) ? body.options.map(String) : [];
  if (!playerId) return bad("Falta el jugador.");
  if (!options.length) return bad("No hay pronósticos para guardar.");

  const admin = createAdmin();

  // Cierre de pronósticos (además del trigger a nivel DB).
  const { data: state } = await admin
    .from("juego_match_state")
    .select("predictions_locked")
    .eq("id", 1)
    .maybeSingle();
  if (state?.predictions_locked) {
    return NextResponse.json({ error: "Los pronósticos están cerrados." }, { status: 423 });
  }

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

  // Derivar market_id de cada opción; dedupe por mercado (última gana).
  const { data: opts, error: optErr } = await admin
    .from("juego_market_options")
    .select("id, market_id")
    .in("id", options);
  if (optErr) return NextResponse.json({ error: "No se pudo validar." }, { status: 500 });

  const byMarket = new Map<string, string>();
  for (const id of options) {
    const o = (opts ?? []).find((x) => x.id === id);
    if (o) byMarket.set(o.market_id, o.id);
  }
  if (!byMarket.size) return bad("Opciones inválidas.");

  const rows = [...byMarket.entries()].map(([market_id, option_id]) => ({
    player_id: playerId,
    market_id,
    option_id,
  }));

  const { error } = await admin
    .from("juego_predictions")
    .upsert(rows, { onConflict: "player_id,market_id" });

  if (error) {
    // 23514 = trigger de cierre (check_violation).
    if (error.code === "23514" || error.message?.includes("cerrados")) {
      return NextResponse.json({ error: "Los pronósticos están cerrados." }, { status: 423 });
    }
    console.error("[pronosticos] upsert:", error.message);
    return NextResponse.json({ error: "No pudimos guardar tus pronósticos." }, { status: 500 });
  }

  // Antes del kickoff el poller todavía no corre (solo arranca en la ventana del
  // partido), así que sin esto el jugador queda invisible en /ranking hasta el
  // primer snapshot. Recalcular acá mantiene el leaderboard sincronizado siempre.
  // Set-based, <500 jugadores → milisegundos (ver juego_recompute_scores).
  const { error: rpcErr } = await admin.rpc("juego_recompute_scores");
  if (rpcErr) console.error("[pronosticos] recompute:", rpcErr.message);

  return NextResponse.json({ ok: true, guardados: rows.length });
}

/**
 * GET /api/juego/pronosticos?playerId=uuid
 * Validación ligera: confirma que el jugador existe en la DB.
 * Útil para detectar playerIds huérfanos post-RESET del admin.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const playerId = searchParams.get("playerId") ?? "";
  if (!playerId) return NextResponse.json({ error: "Falta playerId." }, { status: 400 });

  const admin = createAdmin();
  const { data } = await admin
    .from("juego_players")
    .select("id")
    .eq("id", playerId)
    .maybeSingle();

  if (!data) return NextResponse.json({ error: "Jugador no encontrado." }, { status: 404 });
  return NextResponse.json({ valid: true });
}

function bad(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}
