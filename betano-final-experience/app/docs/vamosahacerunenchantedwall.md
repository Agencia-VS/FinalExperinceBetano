# Game Final Experience — Juego de pronósticos en vivo (Final Mundial 2026, 19 jul)

## Contexto

Hoy es viernes 3 de julio de 2026: quedan **16 días**. El repo ya contiene `betano-final-experience/`, la landing de inscripción al concurso/sorteo de Betano, que **deja de tener sentido el 18 de julio**. El cliente quiere un producto nuevo y distinto: un juego de pronósticos en vivo para la final, accesible escaneando un QR físico en el evento, con un ranking que se reordena en vivo (animación tipo "posiciones que se cruzan") a medida que Sportmonks reporta el estado del partido.

Decisiones ya tomadas por el cliente (inputs fijos, no se cuestionan):
- Escala: **< 500 asistentes** jugando en simultáneo.
- Habrá **pantalla grande proyectada en el venue** además del celular individual → se necesita un modo "TV" sin inputs.
- Sportmonks: plan **"World Cup 2026 All-in"**, €69/mes, **2500 llamadas/mes**. Incluye Fixtures & Results, Real-time match updates, Comprehensive statistics y (Live) Standings — de ahí sale corners/tarjetas/posesión en vivo para el catálogo de mercados. **No incluye** xG Analytics, News & Match-facts ni Odds & Predictions (confirmado por el cliente) — ninguno de estos tres se usa en este diseño, así que no afectan el alcance.
- Presupuesto de 2500 llamadas/mes es una restricción de diseño **dura** → el polling a Sportmonks debe ser centralizado en el servidor, nunca desde el cliente.

Este documento responde también las dos preguntas abiertas del cliente:
1. **¿Cómo evitar alias duplicados de forma pulcra?** → normalización + índice único real + chequeo de disponibilidad en vivo mientras escribe + sugerencias + filtro de groserías (el alias se proyecta en pantalla grande). Detalle en §3.1.
2. **¿El sistema de puntos por umbral (">5 corners"=50pts, ">6 corners"=55pts) está bien?** → Sí, es el patrón correcto; se modela como catálogo *data-driven* (`markets` → `market_options`, cada opción con su propio puntaje editable desde un admin), no hardcodeado. Detalle en §3.2.

## Decisión de arquitectura: app nueva y separada

**`game-final-experience/`** como carpeta hermana de `betano-final-experience/` en el mismo repo, con su **propio proyecto de Vercel** (Root Directory apuntando a esta carpeta — mismo patrón dashboard que ya usan, confirmado por el commit `cb0fb93`) y su **propio proyecto de Supabase**.

Por qué (no hay alternativa en juego, esta es la resuelta):
- Ciclos de vida distintos: la landing muere el 18/7, el juego nace el 19/7. Mantenerlos en el mismo proyecto complica el corte.
- Perfil de tráfico y RLS muy distinto (leaderboard público realtime, endpoint de alias muy chateado) vs. una landing de inscripción de baja frecuencia — aislar reduce el radio de un bug de RLS.
- Presupuesto de Sportmonks y env vars aislados, sin riesgo de colisión.
- Reutilizamos marca **copiando/adaptando** `app/globals.css` (tokens `--ember`, `--ash`, `--char`, `--smoke`, `--bone`, fuentes Edo/MDNichrome/Haffer, clases `.field-input`/`.btn-ember`) al nuevo proyecto — ~150 líneas de CSS duplicadas es aceptable en 18 días; no hay workspaces (`pnpm-workspace.yaml`/`turbo.json`) configurados como para justificar extraer un paquete compartido.

Dominio recomendado: **`gamefinalexperience.cl`** (dominio propio, no subdominio) — corto para el QR, sin ambigüedad con el concurso ya cerrado.

**Acción día 0 confirmada con el cliente**: hay que **contratar Vercel Pro** — el diseño de polling (§Sportmonks) lo requiere (cron con intervalo de minutos + función con `maxDuration` extendido). En plan Hobby el cron mínimo es 1/día y las funciones se cortan a los 10s — incompatible con el poll de 20s en vivo. Es el primer paso antes de tocar código de cron.

## Estructura de carpetas

```
game-final-experience/
├── app/
│   ├── layout.tsx / globals.css / page.tsx (landing → registro)
│   ├── proxy.ts                          # protege /admin/*, mismo patrón que betano-final-experience
│   ├── (player)/registro/page.tsx        # nombre, apellido, alias
│   ├── (player)/pronosticos/page.tsx     # mercados, antes del kickoff
│   ├── (player)/ranking/page.tsx         # leaderboard móvil
│   ├── tv/page.tsx                       # modo proyección, sin inputs
│   ├── admin/{login,page,mercados,partido,jugadores}/
│   └── api/
│       ├── registro/route.ts
│       ├── alias-disponible/route.ts
│       ├── pronosticos/route.ts
│       ├── leaderboard/route.ts          # fallback SSR inicial
│       ├── cron/poll-match/route.ts      # polling centralizado a Sportmonks
│       └── admin/{mercados,partido,resolver}/route.ts
├── components/
│   ├── RegistroForm.tsx, AliasField.tsx, PronosticosForm.tsx, MarketCard.tsx
│   ├── Leaderboard/{LeaderboardList,LeaderboardRow,LeaderboardTV}.tsx
│   └── ScoreBadge.tsx, ConfettiBurst.tsx, ConnectionStatus.tsx
├── lib/
│   ├── supabase.ts, supabase-browser.ts   # mismo patrón createServer/createAdmin/createBrowser
│   ├── device-token.ts, profanity-filter.ts, sportmonks.ts, rate-limit.ts (copiado)
├── supabase/{schema.sql, seed-mercados.sql}
└── vercel.json                            # cron job
```

Archivos del proyecto existente a replicar tal cual (patrones ya probados):
- `betano-final-experience/lib/supabase.ts` y `lib/supabase-browser.ts` → clientes Supabase.
- `betano-final-experience/proxy.ts` → protección de `/admin/*`.
- `betano-final-experience/supabase/schema.sql` → convención RLS + `security definer` + manejo de conflicto `23505`.
- `betano-final-experience/app/api/inscripcion/route.ts` y `app/api/admin/sorteo/route.ts` → patrón de API route (rate limit, validación server-side, `requireAdmin()`).
- `betano-final-experience/app/globals.css` → tokens de marca a copiar.

## Esquema de Supabase (resumen ejecutable)

**Jugadores/alias** (`players`): `citext` + columna generada `alias_norm` (trim/colapsa espacios/lowercase) con **índice único real** sobre `alias_norm`. Flujo anti-duplicado:
1. `GET /api/alias-disponible?alias=...` con debounce ~400ms desde `AliasField.tsx`, feedback verde/rojo en vivo.
2. Si está tomado, el endpoint sugiere 2-3 variantes ya verificadas server-side.
3. El POST de `/api/registro` reintenta el insert; si Postgres devuelve `23505` (mismo patrón que `inscripcion/route.ts`), responde 409 — cierra la carrera entre el check y el insert.
4. `lib/profanity-filter.ts`: blocklist estática ES/CL+EN aplicada server-side sobre `alias_norm` (no se expone al bundle del cliente) — necesario porque el alias se proyecta en la pantalla grande del venue.
5. `device_token` (uuid en cookie httpOnly + localStorage) con `unique` en `players` — evita registros duplicados accidentales por refresco, no es seguridad dura (aceptado, sin SMS por tiempo).

**Catálogo de mercados data-driven** (`markets` + `market_options`): cada mercado (`campeon`, `resultado_exacto`, `ganador_ht`, `total_goles_ou`, `ambas_anotan`, `total_corners_ou`, `total_amarillas_ou`, `habra_roja`, `primer_gol`, `va_alargue`) tiene un `resolves_at` (`live` | `halftime` | `fulltime`) y sus opciones (`market_options`) cada una con `umbral`, `direccion` (over/under) y **`puntos` editable desde `/admin/mercados`** — así ">5 corners"=50pts y ">6 corners"=55pts son dos filas de configuración, no código.

**Pronósticos** (`predictions`): un registro por `(player_id, market_id)`, bloqueado server-side vía RLS `insert_predictions_before_lock` que consulta `match_state.predictions_locked` — aunque alguien manipule el frontend, Postgres rechaza el insert tras el cierre.

**Snapshot del partido** (`match_snapshots`): tabla *append-only* (una fila nueva por cada poll), no un registro mutable — permite replay/debug y evita condiciones de carrera si el cron se solapa. Incluye `source` (`sportmonks` | `manual`) para el fallback humano.

**Motor de puntaje** (`recompute_scores()`): función Postgres `security definer`, invocada **explícitamente** desde `api/cron/poll-match` tras cada snapshot y desde un botón admin — **no** como trigger recursivo. Recalcula el leaderboard completo en un solo `INSERT...SELECT...GROUP BY` (set-based; a <500 jugadores × 9 mercados esto es milisegundos, más simple y menos propenso a bugs que hacer deltas incrementales). Distingue mercados `live` (se evalúan contra el snapshot más reciente en cualquier minuto — el jugador ve sus puntos de corners/goles subir en vivo) de `halftime`/`fulltime` (solo se evalúan cuando `match_state.match_status` alcanza esa fase). Tabla de resolución completa por mercado en el detalle técnico abajo.

**Leaderboard realtime** (`leaderboard_cache`, tabla de una sola fila): en vez de que cada cliente reciba el evento de cambio y haga su propio refetch (500 celulares disparando el mismo `SELECT` en el mismo segundo cuando hay un gol, todos contra PostgREST — no revienta el pool a esta escala, pero es una vuelta de red innecesaria por cliente), `recompute_scores()` escribe el ranking completo ya ordenado como un array JSON en `leaderboard_cache` (`id int primary key default 1`, `ranking jsonb`, `updated_at`). Los clientes se suscriben con Postgres Changes a esa única fila y reciben el ranking completo **directamente en el payload del evento WebSocket** — cero queries adicionales desde el frontend, y consistencia atómica garantizada porque el array se escribe en la misma transacción que calculó los puntajes. `alter publication supabase_realtime add table public.leaderboard_cache;`

<details>
<summary>SQL completo de referencia (schema.sql / recompute_scores)</summary>

El SQL detallado — `players`, `markets`/`market_options`, `predictions`, `match_state`, `match_snapshots`, `player_scores`, vista `leaderboard`, y la función completa `recompute_scores()` con el `case` por cada uno de los 9 mercados — está desarrollado y verificado; se transcribe en el momento de crear `game-final-experience/supabase/schema.sql` (día 1-2 del cronograma), siguiendo exactamente la convención de RLS de `betano-final-experience/supabase/schema.sql`.
</details>

## Integración con Sportmonks

- **Endpoint**: `GET /v3/football/fixtures/{fixture_id}?include=scores;periods;statistics;events`. El `fixture_id` de la final se obtiene una vez (`GET /fixtures/date/2026-07-19?include=participants`) y se hardcodea en `SPORTMONKS_FIXTURE_ID` — no gastar llamadas buscándolo cada vez.
- **Verificación pendiente día 1-2**: confirmar contra un fixture real ya finalizado los `type_id` exactos de corners/amarillas/rojas (varían por versión de API) — no asumir de memoria antes de implementar `lib/sportmonks.ts`.
- **Polling centralizado, nunca desde el cliente**: Vercel Cron invoca `app/api/cron/poll-match` cada 5 min (mínimo del plan Pro); dentro de la ventana de partido (~15 min antes de kickoff hasta `finished`), la función corre un loop interno de hasta 4.5 min con `sleep` de **20s** entre polls (`export const maxDuration = 300`), y el cron externo la re-invoca cada 5 min como watchdog si una instancia muere. Fuera de la ventana de partido, no llama a Sportmonks.
- **Guard anti-solapamiento**: como el cron watchdog puede disparar una nueva invocación antes de que la anterior termine sus 4.5 min (o si una quedó colgada), `poll-match` toma un `pg_try_advisory_lock()` (o un flag `polling_owner`/`lock_expires_at` en `match_state`) al iniciar; si no consigue el lock, corta inmediatamente. Sin esto, dos invocaciones concurrentes duplicarían llamadas a Sportmonks (gasto de presupuesto) y podrían escribir snapshots fuera de orden. Cada iteración loguea su ciclo (timestamp + resultado) para poder diagnosticar latencia errática durante los ensayos.
- **Plan B documentado (no se activa por defecto)**: mantener el poller dentro de una función serverless de Vercel es pragmático para no sumar infraestructura nueva a operar el día del evento, pero un loop largo con sleeps no es el uso para el que estas funciones están pensadas — si durante las pruebas de los días 11-13 se observa latencia inconsistente entre iteraciones, el plan B es mover **solo el poller** (no el resto de la app) a un proceso Node persistente mínimo en Railway o Render (~$5/mes), que escribe a la misma tabla `match_snapshots` vía `service_role`. Checkpoint de decisión: 16 de julio (día 13 del cronograma), con margen suficiente para migrarlo antes del ensayo general del 18.
- **Presupuesto**: pruebas de desarrollo (~180) + ensayo general día 18 (~360) + ensayo corto día 17 (~60) + evento real con margen por alargue/penales (~420) + colchón (~150) = **~1170 de 2500** llamadas del mes. Intervalo de **20s en vivo / 30s pre-post** deja ~53% de margen.
- **Fallback manual**: si hay ≥3 fallos consecutivos de Sportmonks (~1 min sin datos frescos), banner rojo en `/admin/partido`. El admin carga a mano goles/corners/amarillas/rojas/estado mirando la transmisión del venue; cada envío dispara `recompute_scores()` igual. Cuando Sportmonks vuelve, sus snapshots automáticos retoman el control (siempre gana el más reciente por `fetched_at`).

## Ranking animado en vivo

**Framer Motion** (`layout` prop + `layoutId={player_id}` estable + `AnimatePresence`, técnica FLIP estándar) sobre las filas del leaderboard — el array se re-renderiza en el nuevo orden que llega por Realtime y Framer anima la transición de posiciones automáticamente.

Diferencias móvil (`/ranking`) vs. TV (`/tv`):
- Móvil: top 10 + posición propia fija (sticky) si está fuera del top 10, detalle de puntaje por mercado al tocar, confetti local si el jugador propio entra al top 3.
- TV: top 15-20 sin scroll, texto grande legible a distancia, sin interacción (kiosk mode), confetti a pantalla completa cuando *cualquiera* entra al top 3 (momento wow del venue).

**Fallback ante wifi/datos saturados (ambas vistas)**: un venue con cientos de celulares en la misma red pública va a tener micro-cortes, especialmente en los picos (goles, penales) — justo cuando el WebSocket de Realtime es más propenso a caerse y no siempre reconecta rápido. `ConnectionStatus.tsx` detecta la desconexión del canal y, mientras dura, el cliente pasa automáticamente a un `setInterval` silencioso de refetch de `leaderboard_cache` cada 30-45s en `/ranking` y cada 15s en `/tv` (esta última ya lo necesitaba por ser un dispositivo "fire and forget" que nadie recarga a mano); al reconectar el WebSocket, se cancela el polling y vuelve a modo Realtime puro. Recomendación operativa: la pantalla TV debe estar en una conexión separada del wifi público de asistentes (ya estaba en el runbook), precisamente para que el "momento wow" del venue no dependa de la congestión general.

## Resiliencia del envío de pronósticos (momento crítico pre-kickoff)

El instante de mayor riesgo del producto no es el partido en sí, es **el minuto previo al cierre**: todos los asistentes intentando asegurar su pronóstico a la vez, en la misma red saturada del venue. El diseño no puede depender de un único "Enviar" gigante al final:

1. **Guardado incremental, no un submit final**: `PronosticosForm` hace upsert de cada pregunta apenas el usuario elige una opción (`on conflict (player_id, market_id) do update`), no acumula las 9 respuestas para mandarlas juntas al tocar un botón final. Si hay un corte justo antes del cierre, en el peor caso se pierde el último pick, no los nueve.
2. **Autosave local primero**: cada selección se escribe en `localStorage` en el momento del click, antes de intentar la red — un refresh accidental o la pestaña que se cierra no borra lo ya elegido, y al reabrir `/pronosticos` el formulario se hidrata desde ahí mientras confirma contra el servidor.
3. **Estado por pregunta, no global**: cada `MarketCard` muestra su propio indicador (Guardando… / Guardado ✓ / Error, reintentar) en vez de un solo spinner de formulario — el jugador ve exactamente qué picks quedaron confirmados.
4. **Reintento automático con backoff** ante fallo de red (3 intentos) y, si persiste, el pick queda "pendiente" y se reintenta solo al detectar el evento `online` del navegador — sin perder la selección local.
5. **Idempotencia**: como el guardado es un upsert sobre `(player_id, market_id)`, reintentar (incluso manualmente) nunca duplica ni corrompe el pronóstico.
6. **El colchón de tiempo sigue siendo la mitigación principal**: el runbook ya cierra pronósticos 2-3 min antes del pitido inicial, no en el segundo exacto del kickoff — ese margen es lo que le da aire a los reintentos automáticos para completarse antes del lock real.

## Assets gráficos a preparar

Reutilizables tal cual desde `betano-final-experience/public/`: `isoBetano.png`, `isoBetanoblanco.png`, fuentes Haffer/MDNichrome.

Nuevos — **prioridad alta**: logo del juego (horizontal + isotipo), favicon + OG image 1200×630, fondo para pantalla TV (alto contraste, legible con luces del venue encendidas), iconografía de los 9 mercados (balón, corner, tarjeta amarilla/roja, silbato, alargue), avatares = iniciales sobre color determinístico por hash de `player_id` (sin asset, resuelto en CSS). **Prioridad media**: confetti vía `canvas-confetti` con colores de marca (sin diseño gráfico), skeleton/spinner con `--char`/`--smoke`, badge "EN VIVO" pulsante. **Prioridad baja**: ilustración de estado vacío admin, logo apto para impresión B/N del QR.

## Cronograma (3 → 19 de julio)

Comprimido 2 días respecto de la primera versión (el error de fecha dejaba un margen que no existe). Los sábados/domingos (4-5 jul) quedan como días de trabajo — no hay margen para tratarlos como descanso.

| Fecha | Hito |
|---|---|
| 3 jul (hoy, viernes) | **Contratar Vercel Pro hoy mismo**, crear `game-final-experience/`, proyecto Vercel + Supabase nuevos, confirmar acceso Sportmonks, obtener `fixture_id` de prueba y **verificar contra un fixture finalizado real los `type_id` de corners/tarjetas** (no asumir, es el riesgo de mayor incertidumbre y conviene descartarlo el día 1). |
| 4-5 jul (sáb-dom) | Esqueleto Next.js + `globals.css` adaptado + `schema.sql` + `seed-mercados.sql` (9 mercados). |
| 6-8 jul | Flujo de registro: `RegistroForm`, `AliasField` con check en vivo, `device-token`, `profanity-filter`. |
| 9-10 jul | Flujo de pronósticos (con autosave local, ver §Resiliencia del envío) + `/admin/mercados` (CRUD de puntos). |
| 11-12 jul | `lib/sportmonks.ts` validado contra fixture histórico real + `cron/poll-match` con guard anti-solapamiento (ver §Sportmonks). |
| 13 jul | `recompute_scores()` completa + pruebas manuales de los 9 mercados con datos sintéticos. Día ajustado — si se atrasa, es el primer candidato a robar tiempo del día 14. |
| 14-15 jul | Leaderboard + Realtime vía `leaderboard_cache` + Framer Motion (`/ranking`) + fallback de short-polling en desconexión. |
| 15 jul (noche) | **Ensayo interno**: cron contra fixture histórico completo, equipo registrándose/pronosticando, simular corte de wifi a propósito. |
| 16 jul | Vista `/tv`, confetti, `ConnectionStatus`, ajustes de legibilidad a distancia. **Checkpoint de decisión Plan B del poller** (ver §Sportmonks): si el loop largo en Vercel mostró latencia errática en los ensayos de días 11-13, hoy es el último día razonable para migrarlo a un worker Railway/Render sin poner en riesgo el resto. |
| 17 jul | `/admin/partido` (override manual, cierre de pronósticos), `/admin/jugadores`, hardening RLS. |
| 18 jul | **Ensayo general completo** con partido real ya jugado del Mundial, equipo en roles reales, dominio y QR físico validados en producción. |
| 19 jul | **Día del evento** — ver runbook abajo. |

Si aparece presión de tiempo: el modo TV dedicado es lo primero degradable (fallback: vista móvil en fullscreen). El fallback manual del admin (§Sportmonks) **no se recorta** — es la pieza de mayor relación riesgo/beneficio.

## Runbook del 19 de julio

**Pre-kickoff**: roles asignados (operador admin / monitor técnico / soporte venue) → confirmar `fixture_id` → smoke test end-to-end → QR físico + `/tv` en modo kiosk probados → iniciar poller → **cerrar pronósticos 2-3 min antes del pitido inicial**.

**Durante**: monitor técnico vigila logs del cron y `match_snapshots.fetched_at` avanzando; chequeo visual cada 10-15 min de que el líder del ranking tiene sentido con el marcador real; confirmar resolución de `ganador_ht` al entretiempo.

**Contingencia**: Sportmonks caído → modo manual en `/admin/partido` (§Sportmonks). Wifi del venue saturado → la pantalla TV debe estar en una **conexión separada** del wifi público (recomendación fuerte); los pronósticos ya están guardados desde antes del kickoff, no hay pérdida de datos. Caída total de Vercel/Supabase → planilla espejo de `markets`/`market_options` preparada de antemano como respaldo offline de último recurso.

**Post-partido**: confirmar `match_status = finished` y última corrida de `recompute_scores()` (mercados `fulltime` resueltos), anunciar top 3-5 desde `/tv`, detener el poller.

## Verificación de esta primera fase de planificación

Antes de escribir código: (1) confirmar plan de Vercel (Pro, por el cron/duración de función); (2) confirmar acceso real a Sportmonks y hacer una llamada de prueba contra un fixture finalizado para verificar los `type_id` de corners/tarjetas antes de construir `lib/sportmonks.ts` sobre supuestos; (3) decidir y comprar el dominio (`gamefinalexperience.cl` u otro). Una vez el código exista: `npm run dev` local contra el Supabase nuevo, probar el flujo registro→pronóstico→(simular snapshots a mano insertando filas en `match_snapshots` y llamando `select recompute_scores()`)→ver el `/ranking` reordenarse en vivo, y el ensayo general del 18/7 contra un partido real ya jugado es la prueba de extremo a extremo antes del evento. Dos pruebas específicas a no saltarse antes del 18/7: (a) cortar el wifi del celular a propósito mientras se envían pronósticos y confirmar que el autosave/reintento los recupera sin duplicados; (b) disparar dos invocaciones de `poll-match` en paralelo a mano (`curl` concurrente) y confirmar que el guard anti-solapamiento deja pasar solo una.
