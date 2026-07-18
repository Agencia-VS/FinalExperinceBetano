const store = new Map<string, { count: number; resetAt: number }>();

// `key` debe incluir la ruta además de la IP (p. ej. `registro:${ip}`):
// el Map es único para todo el proceso, y si dos rutas comparten la key
// el tráfico de una consume el cupo de la otra — con los ~250 asistentes
// saliendo por la misma NAT del venue, una ruta de límite bajo quedaría
// bloqueada por el tráfico de las de límite alto.
export function rateLimit(key: string, max = 15, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}
