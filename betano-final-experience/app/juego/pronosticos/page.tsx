import { createAdmin } from "@/lib/supabase";
import { getFixtureId } from "@/lib/juego/apifootball";
import PronosticosFlow, { type Market } from "@/components/juego/PronosticosFlow";

export const dynamic = "force-dynamic";

async function fetchTeamNames(admin: ReturnType<typeof createAdmin>): Promise<{ home: string | null; away: string | null; kickoff: string | null }> {
  const fixtureId = await getFixtureId(admin);
  const apiKey = process.env.API_KEY_FOOTBALL;
  if (!fixtureId || !apiKey) return { home: null, away: null, kickoff: null };
  try {
    const res = await fetch(
      `https://v3.football.api-sports.io/fixtures?id=${fixtureId}`,
      { headers: { "x-apisports-key": apiKey }, next: { revalidate: 3600 } }
    );
    if (!res.ok) return { home: null, away: null, kickoff: null };
    const json = await res.json();
    const fx = json?.response?.[0];
    return {
      home: fx?.teams?.home?.name ?? null,
      away: fx?.teams?.away?.name ?? null,
      kickoff: fx?.fixture?.date ?? null,
    };
  } catch {
    return { home: null, away: null, kickoff: null };
  }
}

export default async function PronosticosPage() {
  const admin = createAdmin();
  const [{ data: markets }, { data: options }, { data: state }] = await Promise.all([
    admin
      .from("juego_markets")
      .select("id, titulo, descripcion, resolves_at, tiempo, orden")
      .eq("activo", true)
      .order("orden"),
    admin
      .from("juego_market_options")
      .select("id, market_id, etiqueta, valor, puntos, orden")
      .order("orden"),
    admin
      .from("juego_match_state")
      .select("home_team, away_team, kickoff_at")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  let homeTeam: string | null = state?.home_team ?? null;
  let awayTeam: string | null = state?.away_team ?? null;
  let kickoffAt: string | null = state?.kickoff_at ?? null;

  // Fallback: si el poller aún no ha poblado los datos, obtenerlos directo
  // de API-Football y guardarlos en match_state para futuras requests.
  if (!homeTeam || !awayTeam || !kickoffAt) {
    const names = await fetchTeamNames(admin);
    homeTeam = homeTeam ?? names.home;
    awayTeam = awayTeam ?? names.away;
    kickoffAt = kickoffAt ?? names.kickoff;
    if (homeTeam || awayTeam || kickoffAt) {
      admin
        .from("juego_match_state")
        .update({ home_team: homeTeam, away_team: awayTeam, kickoff_at: kickoffAt })
        .eq("id", 1)
        .then(
          () => {},
          () => {}
        );
    }
  }

  const grouped: Market[] = (markets ?? []).map((m) => ({
    id: m.id,
    titulo: m.titulo,
    descripcion: m.descripcion,
    resolves_at: m.resolves_at,
    tiempo: m.tiempo ?? null,
    options: (options ?? [])
      .filter((o) => o.market_id === m.id)
      .map((o) => ({ id: o.id, etiqueta: o.etiqueta, puntos: o.puntos, valor: o.valor ?? null })),
  }));

  return <PronosticosFlow markets={grouped} homeTeam={homeTeam} awayTeam={awayTeam} kickoffAt={kickoffAt} />;
}
