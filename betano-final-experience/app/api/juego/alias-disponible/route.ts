import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeAlias, validateAliasShape, aliasCandidates } from "@/lib/juego/alias";
import { isProfane } from "@/lib/juego/profanity-filter";

export const dynamic = "force-dynamic";

// GET /api/juego/alias-disponible?alias=...  (con debounce desde el cliente)
export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(ip, 60)) {
    return NextResponse.json({ available: false, reason: "Demasiados intentos." }, { status: 429 });
  }

  const raw = new URL(req.url).searchParams.get("alias") ?? "";
  const shapeErr = validateAliasShape(raw);
  if (shapeErr) return NextResponse.json({ available: false, reason: shapeErr });

  const norm = normalizeAlias(raw);
  if (isProfane(norm)) {
    return NextResponse.json({ available: false, reason: "Elige otro alias." });
  }

  const admin = createAdmin();
  const { data, error } = await admin
    .from("juego_players")
    .select("id")
    .eq("alias_norm", norm)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "No se pudo verificar el alias." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ available: true });

  // Tomado → sugerir 3 variantes libres (verificadas contra la DB).
  const cands = aliasCandidates(raw);
  const normed = cands.map(normalizeAlias);
  const { data: taken } = await admin
    .from("juego_players")
    .select("alias_norm")
    .in("alias_norm", normed);
  const takenSet = new Set((taken ?? []).map((r) => r.alias_norm));
  const suggestions = cands
    .filter((c) => !takenSet.has(normalizeAlias(c)) && !isProfane(normalizeAlias(c)))
    .slice(0, 3);

  return NextResponse.json({ available: false, reason: "Ese alias ya está en uso.", suggestions });
}
