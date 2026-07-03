/**
 * Token de dispositivo (anti-duplicado blando): uuid en cookie httpOnly.
 * Ata un registro a un navegador (unique en juego_players.device_token) para
 * evitar altas duplicadas por refresco/re-scan del QR. No es seguridad dura.
 * El cliente además guarda su playerId en localStorage para re-hidratar el flujo.
 */
import { cookies } from "next/headers";

const COOKIE = "juego_device";
const MAX_AGE = 60 * 60 * 24 * 45; // 45 días

export async function readDeviceToken(): Promise<string | null> {
  return (await cookies()).get(COOKIE)?.value ?? null;
}

/** Devuelve el token existente o crea uno nuevo (seteando la cookie httpOnly). */
export async function ensureDeviceToken(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing) return existing;

  const token = crypto.randomUUID();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
  return token;
}
