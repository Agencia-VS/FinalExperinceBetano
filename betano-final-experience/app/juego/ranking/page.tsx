import { createAdmin } from "@/lib/supabase";
import RankingLive, { type Row } from "@/components/juego/RankingLive";

export const dynamic = "force-dynamic";

export default async function RankingPage() {
  const admin = createAdmin();
  const [{ data: cache }, { data: state }] = await Promise.all([
    admin.from("juego_leaderboard_cache").select("ranking").eq("id", 1).maybeSingle(),
    admin.from("juego_match_state").select("match_status").eq("id", 1).maybeSingle(),
  ]);

  const initial = (cache?.ranking as Row[] | null) ?? [];
  return <RankingLive initialRanking={initial} matchStatus={state?.match_status ?? "scheduled"} />;
}
