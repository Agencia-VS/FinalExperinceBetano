import { createAdmin } from "@/lib/supabase";
import type { Row } from "@/components/juego/RankingLive";
import type { FinalResultRow } from "@/components/juego/useFinalReveal";
import TvBoard from "./TvBoard";

export const dynamic = "force-dynamic";

/**
 * /juego/tv — vista para el proyector del evento: ranking gigante en vivo
 * y la ruleta del final a pantalla completa. Sin interacción.
 */
export default async function TvPage() {
  const admin = createAdmin();
  const [{ data: cache }, { data: state }, { data: finalResult }] = await Promise.all([
    admin.from("juego_leaderboard_cache").select("ranking").eq("id", 1).maybeSingle(),
    admin
      .from("juego_match_state")
      .select("match_status, home_team, away_team")
      .eq("id", 1)
      .maybeSingle(),
    admin
      .from("juego_final_result")
      .select("status, seed, max_winners, winners, tie_breaker_events, executed_at, revealed_at")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  return (
    <TvBoard
      initialRanking={(cache?.ranking as Row[] | null) ?? []}
      matchStatus={state?.match_status ?? "scheduled"}
      homeTeam={state?.home_team ?? null}
      awayTeam={state?.away_team ?? null}
      initialFinalResult={(finalResult as FinalResultRow | null) ?? null}
    />
  );
}
