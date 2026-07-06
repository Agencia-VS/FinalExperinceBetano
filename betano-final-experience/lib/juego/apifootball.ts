/**
 * Cliente API-Football para el juego de pronósticos (Final Mundial 2026).
 *
 * Un único endpoint: GET /fixtures?id={FIXTURE_ID}.
 * El poller server-side (app/api/juego/cron/poll-match) llama a
 * `fetchMatchSnapshot()` cada ~15s dentro de la ventana del partido e inserta
 * el resultado en `juego_match_snapshots` (los campos mapean 1:1 a columnas).
 *
 * Este módulo hace la INTERPRETACIÓN (goles/córners/tarjetas/ganador/primer gol)
 * y deja "hechos ya resueltos" listos para juego_recompute_scores().
 *
 * Strings confirmados por la spec oficial API-Football V3:
 *   statistics.type : "Corner Kicks" | "Yellow Cards" | "Red Cards"
 *   events "Goal" detail: "Normal Goal" | "Own Goal" | "Penalty" | "Missed Penalty"
 *   events "Card" detail: "Yellow Card" | "Red card"   ← ojo: 'card' minúscula en la roja
 * Aun así conviene un smoke test contra un fixture ya jugado antes del evento.
 */

const API_BASE = "https://v3.football.api-sports.io";

// Nombres exactos de statistics.type (spec oficial API-Football V3).
const STAT_CORNERS = "Corner Kicks";
const STAT_YELLOW = "Yellow Cards";
const STAT_RED = "Red Cards";
const STAT_SHOTS_ON = "Shots on Goal";
const STAT_FOULS = "Fouls";
const STAT_OFFSIDES = "Offsides";
const STAT_POSSESSION = "Ball Possession";

export type MatchStatus =
  | "scheduled"
  | "live_1h"
  | "halftime"
  | "live_2h"
  | "extra_time"
  | "penalties"
  | "finished";

export type Side = "home" | "away";

/** Objeto listo para `.insert()` en public.juego_match_snapshots. */
export type MatchSnapshotInsert = {
  source: "apifootball" | "manual";
  match_status: MatchStatus;
  home_score: number;
  away_score: number;
  ht_home_score: number | null;
  ht_away_score: number | null;
  reg_home_score: number | null;
  reg_away_score: number | null;
  corners_total: number;
  yellow_cards_total: number;
  red_cards_total: number;
  shots_on_goal_total: number;
  fouls_total: number;
  offsides_total: number;
  possession_home: number | null;
  possession_away: number | null;
  both_teams_scored: boolean;
  first_scorer_side: Side | null;
  winner_side: Side | "draw" | null;
  went_to_extra_time: boolean;
  went_to_penalties: boolean;
  /** Nombres de los equipos (para match_state, no van al snapshot). */
  home_team: string | null;
  away_team: string | null;
  /** Fecha/hora de inicio del partido (ISO, desde API-Football). */
  kickoff_at: string | null;
  raw: unknown;
};

// ---- Formas mínimas del payload (parsing defensivo con optional chaining) ----
type ApiScorePair = { home: number | null; away: number | null } | null;
type ApiTeam = { id: number; name?: string };
type ApiEvent = {
  type?: string; // 'Goal' | 'Card' | 'subst' | 'Var'
  detail?: string; // 'Yellow Card' | 'Red Card' | 'Own Goal' | ...
  team?: ApiTeam;
  time?: { elapsed?: number | null; extra?: number | null };
};
type ApiStatBlock = {
  team?: ApiTeam;
  statistics?: { type?: string; value?: number | string | null }[];
};
type ApiFixture = {
  fixture?: { id?: number; date?: string; status?: { short?: string; elapsed?: number | null } };
  teams?: { home?: ApiTeam; away?: ApiTeam };
  goals?: { home?: number | null; away?: number | null };
  score?: {
    halftime?: ApiScorePair;
    fulltime?: ApiScorePair;
    extratime?: ApiScorePair;
    penalty?: ApiScorePair;
  };
  events?: ApiEvent[];
  statistics?: ApiStatBlock[];
};

/** status.short de API-Football → nuestro match_status. */
export function mapStatus(short: string | undefined): MatchStatus {
  switch (short) {
    case "1H":
      return "live_1h";
    case "HT":
      return "halftime";
    case "2H":
      return "live_2h";
    case "ET":
    case "BT": // break time (dentro del alargue)
      return "extra_time";
    case "P":
      return "penalties";
    case "FT":
    case "AET":
    case "PEN":
      return "finished";
    default:
      // NS, TBD, SUSP, INT, PST, CANC, ABD, AWD, WO, LIVE...
      return "scheduled";
  }
}

function n(v: number | null | undefined): number | null {
  return typeof v === "number" ? v : null;
}

function sumStat(stats: ApiStatBlock[] | undefined, type: string): number {
  if (!Array.isArray(stats)) return 0;
  let total = 0;
  for (const block of stats) {
    const found = block.statistics?.find((s) => s.type === type);
    const raw = found?.value;
    const num = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
    if (Number.isFinite(num)) total += num;
  }
  return total;
}

/** Extrae posesión por equipo desde statistics (valor "52%" → 52). */
function possessionFor(
  stats: ApiStatBlock[] | undefined,
  homeId: number | undefined,
  awayId: number | undefined
): { home: number | null; away: number | null } {
  if (!Array.isArray(stats)) return { home: null, away: null };
  const result = { home: null as number | null, away: null as number | null };
  for (const block of stats) {
    const raw = block.statistics?.find((s) => s.type === STAT_POSSESSION)?.value;
    const pct = typeof raw === "number" ? raw : parseFloat(String(raw ?? "").replace("%", ""));
    if (Number.isFinite(pct)) {
      if (block.team?.id === homeId) result.home = pct;
      else if (block.team?.id === awayId) result.away = pct;
    }
  }
  return result;
}

/** Cuenta tarjetas por eventos (fallback si statistics aún no está poblado). */
function countCards(events: ApiEvent[] | undefined, detail: string): number {
  if (!Array.isArray(events)) return 0;
  return events.filter((e) => e.type === "Card" && e.detail === detail).length;
}

function sideOf(teamId: number | undefined, homeId?: number, awayId?: number): Side | null {
  if (teamId == null) return null;
  if (teamId === homeId) return "home";
  if (teamId === awayId) return "away";
  return null;
}

/**
 * Interpreta un fixture de API-Football → snapshot resuelto.
 * `fx` es response[0] del endpoint /fixtures?id=...
 */
export function mapFixtureToSnapshot(fx: ApiFixture): MatchSnapshotInsert {
  const homeId = fx.teams?.home?.id;
  const awayId = fx.teams?.away?.id;
  const short = fx.fixture?.status?.short;
  const status = mapStatus(short);

  const home = fx.goals?.home ?? 0;
  const away = fx.goals?.away ?? 0;

  const htHome = n(fx.score?.halftime?.home ?? null);
  const htAway = n(fx.score?.halftime?.away ?? null);
  const regHome = n(fx.score?.fulltime?.home ?? null);
  const regAway = n(fx.score?.fulltime?.away ?? null);
  const etHome = n(fx.score?.extratime?.home ?? null);
  const penHome = n(fx.score?.penalty?.home ?? null);
  const penAway = n(fx.score?.penalty?.away ?? null);

  // Primer gol: evento 'Goal' real más temprano.
  //  · excluye "Missed Penalty" (tiene type 'Goal' pero NO es gol).
  //  · un autogol ("Own Goal") suma para el equipo rival.
  //  · gate por el marcador real: si no hubo goles (0-0 → penales) no hay primer
  //    gol, así los penales de la tanda no cuentan como "primer gol" del partido.
  const goalTime = (e: ApiEvent) => (e.time?.elapsed ?? 0) + (e.time?.extra ?? 0);
  const goalEvents = (fx.events ?? [])
    .filter((e) => e.type === "Goal" && e.detail !== "Missed Penalty")
    .sort((a, b) => goalTime(a) - goalTime(b));
  let firstScorer: Side | null = null;
  if (home + away > 0 && goalEvents.length) {
    const g = goalEvents[0];
    let s = sideOf(g.team?.id, homeId, awayId);
    if (g.detail === "Own Goal" && s) s = s === "home" ? "away" : "home";
    firstScorer = s;
  }

  // Ganador (sólo si terminó): penales deciden si ET quedó empatado.
  let winner: Side | "draw" | null = null;
  if (status === "finished") {
    if (penHome != null && penAway != null && penHome !== penAway) {
      winner = penHome > penAway ? "home" : "away";
    } else if (home !== away) {
      winner = home > away ? "home" : "away";
    } else {
      winner = "draw";
    }
  }

  const wentToExtra =
    etHome != null ||
    penHome != null ||
    ["ET", "BT", "P", "AET", "PEN"].includes(short ?? "");

  // Penales: hay tanda apenas el status entra en 'P' (en vivo) o si la API
  // ya reporta el marcador de la tanda.
  const wentToPenalties =
    penHome != null || penAway != null || ["P", "PEN"].includes(short ?? "");

  // Córners: sólo en statistics. Tarjetas: el mayor entre statistics y el conteo
  // por eventos (los eventos son más "en vivo"; las stats a veces tardan).
  const corners = sumStat(fx.statistics, STAT_CORNERS);
  const yellow = Math.max(sumStat(fx.statistics, STAT_YELLOW), countCards(fx.events, "Yellow Card"));
  const red = Math.max(sumStat(fx.statistics, STAT_RED), countCards(fx.events, "Red card"));
  const shotsOnGoal = sumStat(fx.statistics, STAT_SHOTS_ON);
  const fouls = sumStat(fx.statistics, STAT_FOULS);
  const offsides = sumStat(fx.statistics, STAT_OFFSIDES);
  const pos = possessionFor(fx.statistics, homeId, awayId);

  return {
    source: "apifootball",
    match_status: status,
    home_score: home,
    away_score: away,
    ht_home_score: htHome,
    ht_away_score: htAway,
    reg_home_score: regHome,
    reg_away_score: regAway,
    corners_total: corners,
    yellow_cards_total: yellow,
    red_cards_total: red,
    shots_on_goal_total: shotsOnGoal,
    fouls_total: fouls,
    offsides_total: offsides,
    possession_home: pos.home,
    possession_away: pos.away,
    both_teams_scored: home > 0 && away > 0,
    first_scorer_side: firstScorer,
    winner_side: winner,
    went_to_extra_time: wentToExtra,
    went_to_penalties: wentToPenalties,
    home_team: fx.teams?.home?.name ?? null,
    away_team: fx.teams?.away?.name ?? null,
    kickoff_at: fx.fixture?.date ?? null,
    raw: fx,
  };
}

/** Trae el fixture y lo mapea a snapshot. Lanza si falta la key o el fixture. */
export async function fetchMatchSnapshot(
  fixtureId: number | string
): Promise<MatchSnapshotInsert> {
  const key = process.env.API_KEY_FOOTBALL;
  if (!key) throw new Error("Falta API_KEY_FOOTBALL en el entorno");

  const res = await fetch(`${API_BASE}/fixtures?id=${fixtureId}`, {
    headers: { "x-apisports-key": key },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`API-Football ${res.status}: ${await res.text().catch(() => "")}`);
  }

  // Cuota (headers de la spec §4): avisar si estamos cerca de un límite.
  const remMinute = res.headers.get("x-ratelimit-remaining"); // por minuto
  const remDay = res.headers.get("x-ratelimit-requests-remaining"); // por día
  if (remMinute != null && Number(remMinute) <= 2) {
    console.warn(`[apifootball] límite/minuto casi agotado (quedan ${remMinute})`);
  }
  if (remDay != null && Number(remDay) <= 100) {
    console.warn(`[apifootball] cuota diaria baja (quedan ${remDay})`);
  }

  const json = (await res.json()) as { response?: ApiFixture[]; errors?: unknown };
  const fx = json.response?.[0];
  if (!fx) {
    throw new Error(`Fixture ${fixtureId} sin datos (errors: ${JSON.stringify(json.errors)})`);
  }
  return mapFixtureToSnapshot(fx);
}

/**
 * Obtiene el fixture ID a usar: primero busca en juego_match_state (DB),
 * luego cae al environment variable APIFOOTBALL_FIXTURE_ID.
 *
 * Esto permite que el admin cambie el partido desde el panel sin tocar Vercel.
 */
export async function getFixtureId(admin: ReturnType<typeof import("@/lib/supabase").createAdmin>): Promise<string | null> {
  // 1) Intentar leer de la DB (configurado desde admin).
  const { data } = await admin
    .from("juego_match_state")
    .select("fixture_id")
    .eq("id", 1)
    .maybeSingle();
  if (data?.fixture_id) return data.fixture_id;

  // 2) Fallback al environment variable.
  return process.env.APIFOOTBALL_FIXTURE_ID ?? null;
}
