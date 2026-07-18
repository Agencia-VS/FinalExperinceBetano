/**
 * Emulador de 300 jugadores — vía HTTP real (rate limits, cookies, triggers).
 *
 * Uso:
 *   1. Asegurate de tener `next dev` corriendo (o BASE_URL a un preview)
 *   2. npx tsx scripts/emulate-300.ts
 *   3. Abrí preguntas desde /juego/admin → pestaña Trivia
 *   4. La consola muestra cuántas respuestas ACEPTÓ el servidor y cuántas
 *      fallaron, desglosado por código HTTP — nada se descarta en silencio.
 *
 * Aliases únicos por corrida (emu-<runId>-NNN): se puede re-correr sin
 * limpiar la DB. Al cortar con Ctrl+C imprime el SQL de limpieza exacto.
 */

// ─── Config ────────────────────────────────────────────────
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const NUM_PLAYERS = 300;
const POLL_MS = 2_000;          // chequea pregunta abierta cada 2s
const CONCURRENCY = 30;         // requests simultáneos (no satura el dev server)

// ─── Tipos ─────────────────────────────────────────────────
interface PlayerSession {
  playerId: string;
  alias: string;
  cookie: string;               // "juego_device=uuid"
  avatar: string;
}

interface TriviaOption {
  id: string;
  etiqueta: string;
}

interface OpenQuestion {
  id: string;
  texto: string;
  options: TriviaOption[];
}

type Result = "ok" | "cerrada" | "noAuth" | "rateLimit" | "otro";

// ─── Helpers ───────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toLocaleTimeString("es-CL", { hour12: false });
const rand = (n: number) => Math.floor(Math.random() * n);
const runId = Math.random().toString(36).slice(2, 8);

function parseSetCookie(header: string | null): string {
  if (!header) return "";
  const match = header.match(/juego_device=([^;]+)/);
  return match ? `juego_device=${match[1]}` : "";
}

function fmtTally(t: Record<Result, number>): string {
  const total = Object.values(t).reduce((s, n) => s + n, 0);
  const parts = [`✅ ${t.ok} aceptadas`];
  if (t.cerrada) parts.push(`🔒 ${t.cerrada} pregunta cerrada (423)`);
  if (t.noAuth) parts.push(`🚫 ${t.noAuth} device token (403)`);
  if (t.rateLimit) parts.push(`⏳ ${t.rateLimit} rate limit (429)`);
  if (t.otro) parts.push(`❌ ${t.otro} otros errores`);
  return `${parts.join("  ·  ")}  —  ${total} enviadas`;
}

// ─── Fase 1: Registrar 300 jugadores vía API ───────────────
async function registerPlayers(): Promise<PlayerSession[]> {
  console.log(`\n[${ts()}] 🌱 Registrando ${NUM_PLAYERS} jugadores (run ${runId})...`);
  console.log(`[${ts()}]    Concurrencia: ${CONCURRENCY} | URL: ${BASE_URL}/api/juego/registro\n`);

  const sessions: PlayerSession[] = [];
  let errores = 0;
  let kickoffCerrado = false;

  for (let i = 0; i < NUM_PLAYERS; i += CONCURRENCY) {
    const batch: Promise<void>[] = [];

    for (let j = i; j < Math.min(i + CONCURRENCY, NUM_PLAYERS); j++) {
      const n = String(j + 1).padStart(3, "0");
      const alias = `emu-${runId}-${n}`;
      const avatar = `avatar-${(j % 12) + 1}.png`;

      batch.push(
        fetch(`${BASE_URL}/api/juego/registro`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ nombre: "Emu", apellido: n, alias, avatar }),
        })
          .then(async (res) => {
            const cookie = parseSetCookie(res.headers.get("set-cookie"));
            const body = await res.json().catch(() => ({}) as any);

            if (res.ok) {
              sessions.push({ playerId: body.playerId, alias: body.alias, cookie, avatar: body.avatar });
              return;
            }
            if (res.status === 423) kickoffCerrado = true;
            errores++;
            if (errores <= 5) console.warn(`\n  ⚠️  ${alias}: ${res.status} ${body.error ?? ""}`);
          })
          .catch((err) => {
            errores++;
            if (errores <= 5) console.warn(`\n  ⚠️  ${alias}: ${err.message}`);
          })
      );
    }

    await Promise.all(batch);
    process.stdout.write(`\r[${ts()}]    Registrados: ${sessions.length}/${NUM_PLAYERS}`);
  }

  console.log("");
  if (kickoffCerrado) {
    console.log(`[${ts()}] 🛑 El registro devuelve 423: el kickoff ya pasó. Borrá/moveté el kickoff en /juego/admin → Trivia y re-corré.`);
  }
  if (errores > 0) console.log(`[${ts()}]    ⚠️  ${errores} registros fallaron (detalle arriba, máx 5).`);
  console.log(`[${ts()}] ✅ ${sessions.length} jugadores listos.\n`);
  return sessions;
}

// ─── Fase 2: Poll de preguntas abiertas + responder ────────
async function watchAndRespond(sessions: PlayerSession[]) {
  console.log(`[${ts()}] 👀 Esperando preguntas (Ctrl+C para salir)...`);
  console.log(`[${ts()}]    Abrí una pregunta desde /juego/admin → pestaña Trivia\n`);

  let lastQuestionId = "";

  const respondToQuestion = async (q: OpenQuestion) => {
    const tally: Record<Result, number> = { ok: 0, cerrada: 0, noAuth: 0, rateLimit: 0, otro: 0 };

    for (let i = 0; i < sessions.length; i += CONCURRENCY) {
      const batch = sessions.slice(i, i + CONCURRENCY);

      const results = await Promise.all(
        batch.map(async (s): Promise<Result> => {
          try {
            const res = await fetch(`${BASE_URL}/api/juego/trivia/responder`, {
              method: "POST",
              headers: { "content-type": "application/json", cookie: s.cookie },
              body: JSON.stringify({
                playerId: s.playerId,
                questionId: q.id,
                optionId: q.options[rand(q.options.length)].id,
              }),
            });
            if (res.ok) return "ok";
            if (res.status === 423) return "cerrada";
            if (res.status === 403) return "noAuth";
            if (res.status === 429) return "rateLimit";
            return "otro";
          } catch {
            return "otro";
          }
        })
      );
      for (const r of results) tally[r]++;
    }

    console.log(`[${ts()}]    ${fmtTally(tally)}`);
  };

  // ── Poll loop ──
  while (true) {
    try {
      const res = await fetch(`${BASE_URL}/api/juego/trivia/estado`);
      if (!res.ok) {
        await sleep(POLL_MS);
        continue;
      }

      const data = (await res.json()) as { questions?: any[] };
      const openQuestions: OpenQuestion[] = (data.questions ?? []).filter(
        (q: any) => q.status === "abierta"
      );

      if (openQuestions.length === 0) {
        if (lastQuestionId) {
          console.log(`[${ts()}] 🔒 Sin preguntas abiertas. Esperando...\n`);
          lastQuestionId = "";
        }
        await sleep(POLL_MS);
        continue;
      }

      const q = openQuestions[0];
      if (q.id === lastQuestionId) {
        await sleep(POLL_MS);
        continue;
      }

      console.log(`[${ts()}] 🟢 ABIERTA: "${q.texto}"`);
      console.log(`[${ts()}]    Opciones: ${q.options.map((o) => o.etiqueta).join(" | ")}`);

      lastQuestionId = q.id;
      await respondToQuestion(q);
    } catch (err: any) {
      console.error(`[${ts()}] ⚠️ Error en poll:`, err.message);
      await sleep(POLL_MS);
    }
  }
}

// ─── Main ──────────────────────────────────────────────────
async function main() {
  console.log("╔═══════════════════════════════════════════════╗");
  console.log("║  🎮 EMULADOR TRIVIA — 300 JUGADORES (HTTP)    ║");
  console.log(`║  URL: ${BASE_URL.padEnd(40)}║`);
  console.log(`║  Run: ${runId.padEnd(40)}║`);
  console.log("╚═══════════════════════════════════════════════╝");

  const sessions = await registerPlayers();

  process.on("SIGINT", () => {
    console.log(`\n[${ts()}] 🛑 Detenido. ${sessions.length} sesiones en memoria.`);
    console.log(`[${ts()}]    Limpiar DB (respuestas caen en cascada):`);
    console.log(`[${ts()}]    DELETE FROM juego_players WHERE alias LIKE 'emu-${runId}-%';`);
    console.log(`[${ts()}]    (todas las corridas: ... LIKE 'emu-%')`);
    process.exit(0);
  });

  await watchAndRespond(sessions);
}

main().catch((e) => {
  console.error("❌ Error fatal:", e);
  process.exit(1);
});
