import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { getTriviaSnapshot } from "@/lib/juego/trivia-snapshot";

export const dynamic = "force-dynamic";

/**
 * GET /api/juego/trivia/estado
 * Snapshot público de la trivia: poll de respaldo de los clientes
 * (teléfonos cada 30s, TV más seguido para el contador de respuestas).
 * Las reglas de exposición viven en getTriviaSnapshot (anti-trampa).
 */
export async function GET() {
  const admin = createAdmin();
  return NextResponse.json(await getTriviaSnapshot(admin));
}
