/**
 * Reglas del concurso principal (inscripción a la Final Experience).
 * Fuente única de verdad para el cierre de inscripciones.
 */

/**
 * Instante de cierre de la inscripción principal.
 * Por defecto: 15 jul 2026, 10:00 hora de Chile (America/Santiago).
 * En julio Chile está en UTC-4 (sin horario de verano) → 14:00 UTC.
 * Se puede sobreescribir con la env `INSCRIPCION_CIERRA_AT` (instante ISO 8601)
 * sin recompilar la lógica.
 */
export const INSCRIPCION_CIERRA_AT =
  process.env.INSCRIPCION_CIERRA_AT ?? "2026-07-15T14:00:00Z";

/**
 * `true` si las inscripciones ya están cerradas para el instante dado.
 * Compara por epoch, sin depender de zona horaria ni librerías de fecha.
 */
export function inscripcionesCerradas(now: number = Date.now()): boolean {
  return now >= Date.parse(INSCRIPCION_CIERRA_AT);
}
