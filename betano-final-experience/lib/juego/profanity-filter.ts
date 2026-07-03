/**
 * Filtro de groserías server-side (el alias se proyecta en la pantalla grande
 * del venue). Lista curada ES/CL + EN — NO exhaustiva: el admin también modera
 * visualmente en /juego/admin/jugadores. Se aplica sobre el alias normalizado.
 *
 * Estrategia de dos capas para minimizar falsos positivos:
 *  1) match por palabra completa (token) tras des-leetear ("put4" → "puta").
 *  2) match por subcadena SOLO para términos "duros" (slurs) aunque intenten
 *     evadir con espacios/símbolos ("h i j o d e p u t a").
 * Se evitan términos ambiguos (apellidos, jerga inocua) a propósito.
 */

const LEET: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b",
  "@": "a", "$": "s", "!": "i",
};

// Bloqueo por palabra completa.
const WORDS = new Set([
  // ES / CL
  "puta", "puto", "putas", "putos", "mierda", "cabron", "cabrones", "pendejo",
  "pendeja", "coño", "polla", "pene", "verga", "vergas", "culiao", "culiado",
  "maricon", "maricón", "marica", "maracos", "zorra", "perra", "pico", "rectum",
  "conchetumadre", "conchatumadre", "conchetumare", "ctm", "csm", "qlo", "qla",
  "aweonao", "cagon",
  // EN
  "fuck", "fucker", "fucking", "shit", "bitch", "cunt", "dick", "dicks", "pussy",
  "asshole", "whore", "slut", "rape", "rapist",
  // Slurs / odio (bloqueo fuerte)
  "nigger", "nigga", "faggot", "fag", "retard", "nazi", "hitler", "kkk",
]);

// Subcadena (evasión con espacios/símbolos) — solo lo más grave.
const HARD = [
  "nigger", "nigga", "faggot", "conchatumadre", "conchetumadre", "conchetumare",
  "hijodeputa", "hijadeputa", "cunt",
];

function deleet(s: string): string {
  return s
    .split("")
    .map((c) => LEET[c] ?? c)
    .join("");
}

export function isProfane(aliasNorm: string): boolean {
  const base = deleet(aliasNorm.toLowerCase());

  // Capa 1: tokens (palabras separadas por no-alfanuméricos).
  const tokens = base.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (tokens.some((t) => WORDS.has(t))) return true;

  // Capa 2: subcadena sobre la versión sin separadores (anti-evasión).
  const stripped = base.replace(/[^\p{L}\p{N}]+/gu, "");
  if (HARD.some((w) => stripped.includes(w))) return true;

  return false;
}
