/**
 * Reemplaza los placeholders "Local"/"Visita" de las etiquetas/títulos por los
 * nombres reales de los equipos (cuando API-Football ya los haya enviado).
 *
 * La resolución de puntajes usa 'home'/'away' (columna `valor`), nunca el nombre
 * del equipo — esto es solo para lo que ve el usuario. Se usa tanto al hacer la
 * jugada (PronosticosFlow) como al ver el ticket (pronosticos-detalle) para que
 * ambos textos nunca se desincronicen.
 */
export function replaceTeamNames(
  s: string,
  home: string | null | undefined,
  away: string | null | undefined,
): string {
  if (!home && !away) return s;
  return s
    .replace(/\bLocal\b/g, home ?? "Local")
    .replace(/\bVisita\b/g, away ?? "Visita");
}
