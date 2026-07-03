/**
 * Utilidades de alias del juego. El ranking se arma por alias → debe ser único.
 * `normalizeAlias` replica EXACTAMENTE la columna generada `alias_norm` de la DB
 * (btrim + colapsar espacios + minúsculas), para que el check en vivo y el insert
 * coincidan con el índice único.
 */

export const ALIAS_MIN = 3;
export const ALIAS_MAX = 20;

/** Igual que: lower(regexp_replace(btrim(alias), '\s+', ' ', 'g')). */
export function normalizeAlias(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Valida forma (largo + caracteres). Devuelve mensaje de error o null si OK. */
export function validateAliasShape(raw: string): string | null {
  const a = raw.trim();
  if (a.length < ALIAS_MIN) return `El alias debe tener al menos ${ALIAS_MIN} caracteres.`;
  if (a.length > ALIAS_MAX) return `El alias no puede superar los ${ALIAS_MAX} caracteres.`;
  // Letras (con acentos/ñ), números, espacio y . _ -
  if (!/^[\p{L}\p{N} ._-]+$/u.test(a)) {
    return "El alias solo admite letras, números, espacios y . _ -";
  }
  return null;
}

/**
 * Candidatos deterministas para sugerir cuando el alias está tomado.
 * El endpoint verifica cuáles están libres antes de devolverlos.
 */
export function aliasCandidates(raw: string): string[] {
  const base = raw.replace(/\s+/g, " ").trim();
  const short = base.slice(0, ALIAS_MAX - 4);
  const cands = [`${short}10`, `${short}23`, `${short}.7`, `${short}_99`, `${short}26`, `${short}07`];
  return [...new Set(cands)].filter((c) => c.length >= ALIAS_MIN && c.length <= ALIAS_MAX);
}
