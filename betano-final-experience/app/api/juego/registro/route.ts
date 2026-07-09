import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeAlias, validateAliasShape, aliasCandidates } from "@/lib/juego/alias";
import { isProfane } from "@/lib/juego/profanity-filter";
import { ensureDeviceToken } from "@/lib/juego/device-token";

// Lista de avatares válidos (nombres de archivo).
const AVATARES = Array.from({ length: 12 }, (_, i) => `avatar-${i + 1}.png`);

// POST /api/juego/registro  { nombre, apellido, alias, avatar? }
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(ip)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera un momento e intenta de nuevo." },
      { status: 429 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad("Solicitud inválida.");
  }

  const nombre = String(body.nombre ?? "").trim();
  const apellido = String(body.apellido ?? "").trim();
  const alias = String(body.alias ?? "").trim();
  const avatar = body.avatar != null ? String(body.avatar).trim() : null;

  // Re-validación server-side (nunca confiar solo en el cliente).
  if (nombre.length < 2) return bad("Ingresa tu nombre.");
  if (apellido.length < 2) return bad("Ingresa tu apellido.");
  const shapeErr = validateAliasShape(alias);
  if (shapeErr) return bad(shapeErr);
  const aliasNorm = normalizeAlias(alias);
  if (isProfane(aliasNorm)) return bad("Elige otro alias.");
  // Validar avatar: debe ser uno de los 12 nombres permitidos o null.
  if (avatar !== null && !AVATARES.includes(avatar)) return bad("Avatar inválido.");

  const admin = createAdmin();
  const deviceToken = await ensureDeviceToken();

  const { data, error } = await admin
    .from("juego_players")
    .insert({ nombre, apellido, alias, avatar, device_token: deviceToken })
    .select("id, alias, avatar")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Colisión: distinguir dispositivo ya registrado vs. alias tomado.
      if (error.message?.includes("device_token")) {
        // Re-scan / refresco del mismo navegador → devolver su jugador existente.
        const { data: existing } = await admin
          .from("juego_players")
          .select("id, alias, avatar")
          .eq("device_token", deviceToken)
          .maybeSingle();
        if (existing) {
          return NextResponse.json({
            ok: true,
            playerId: existing.id,
            alias: existing.alias,
            avatar: existing.avatar,
            existing: true,
          });
        }
        return NextResponse.json(
          { error: "Este dispositivo ya está registrado." },
          { status: 409 }
        );
      }
      // Alias tomado → sugerir variantes libres.
      const cands = aliasCandidates(alias);
      const normed = cands.map(normalizeAlias);
      const { data: taken } = await admin
        .from("juego_players")
        .select("alias_norm")
        .in("alias_norm", normed);
      const takenSet = new Set((taken ?? []).map((r) => r.alias_norm));
      const suggestions = cands.filter((c) => !takenSet.has(normalizeAlias(c))).slice(0, 3);
      return NextResponse.json(
        { error: "Ese alias ya está en uso.", suggestions },
        { status: 409 }
      );
    }
    console.error("[registro] insert:", error.message);
    return NextResponse.json({ error: "No pudimos registrarte." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, playerId: data.id, alias: data.alias, avatar: data.avatar });
}

function bad(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}
