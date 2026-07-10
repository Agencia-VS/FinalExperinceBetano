import { createAdmin } from "@/lib/supabase";
import RankingLive, { type Row } from "@/components/juego/RankingLive";
import type { FinalResultRow } from "@/components/juego/useFinalReveal";

export const dynamic = "force-dynamic";

export default async function RankingPage() {
  const admin = createAdmin();
  const [{ data: cache }, { data: state }, { data: finalResult }] = await Promise.all([
    admin.from("juego_leaderboard_cache").select("ranking").eq("id", 1).maybeSingle(),
    admin.from("juego_match_state").select("match_status").eq("id", 1).maybeSingle(),
    admin
      .from("juego_final_result")
      .select(
        "status, seed, max_winners, winners, tie_breaker_events, executed_at, revealed_at, prizes, prize_assignments, prize_seed, raffled_at"
      )
      .eq("id", 1)
      .maybeSingle(),
  ]);

  const initial = (cache?.ranking as Row[] | null) ?? [];
  return (
    <RankingLive
      initialRanking={initial}
      matchStatus={state?.match_status ?? "scheduled"}
      initialFinalResult={(finalResult as FinalResultRow | null) ?? null}
    />
  );
}
