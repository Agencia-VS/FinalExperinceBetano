import { createServer, createAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation";
import JuegoAdminDashboard from "./JuegoAdminDashboard";

export const dynamic = "force-dynamic";

export default async function JuegoAdminPage() {
  const supabase = await createServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login?next=/juego/admin");

  const admin = createAdmin();

  const [stateRes, snapshotRes, playersRes, leaderboardRes, scoresRes, finalRes, catalogRes] = await Promise.all([
    admin
      .from("juego_match_state")
      .select("match_status, predictions_locked, kickoff_at, home_team, away_team, polling_owner, lock_expires_at, updated_at, fixture_id")
      .eq("id", 1)
      .maybeSingle(),
    admin
      .from("juego_match_snapshots")
      .select("fetched_at, match_status, home_score, away_score, corners_total, yellow_cards_total, red_cards_total")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("juego_players")
      .select("id", { count: "exact", head: true }),
    admin
      .from("juego_leaderboard_cache")
      .select("ranking, updated_at")
      .eq("id", 1)
      .maybeSingle(),
    admin
      .from("juego_player_scores")
      .select("player_id", { count: "exact", head: true }),
    admin
      .from("juego_final_result")
      .select(
        "status, seed, max_winners, winners, tie_breaker_events, executed_at, revealed_at, prizes, prize_assignments, prize_seed, raffled_at"
      )
      .eq("id", 1)
      .maybeSingle(),
    admin.from("juego_prize_catalog").select("prizes").eq("id", 1).maybeSingle(),
  ]);

  const st = stateRes.data;
  const pollingActive =
    !!st?.polling_owner &&
    !!st?.lock_expires_at &&
    new Date(st.lock_expires_at) > new Date();

  const rankingArr = (leaderboardRes.data?.ranking as unknown[] | null) ?? null;

  return (
    <JuegoAdminDashboard
      matchState={{
        match_status: st?.match_status ?? "scheduled",
        predictions_locked: st?.predictions_locked ?? false,
        kickoff_at: st?.kickoff_at ?? null,
        home_team: st?.home_team ?? null,
        away_team: st?.away_team ?? null,
        polling_active: pollingActive,
        updated_at: st?.updated_at ?? null,
      }}
      lastSnapshot={snapshotRes.data ?? null}
      totalPlayers={playersRes.count ?? 0}
        fixtureId={st?.fixture_id || process.env.APIFOOTBALL_FIXTURE_ID || null}
        leaderboard={{
          cacheRowExists: leaderboardRes.data != null,
          rankingCount: rankingArr?.length ?? 0,
          updatedAt: leaderboardRes.data?.updated_at ?? null,
          scoredPlayers: scoresRes.count ?? 0,
        }}
      finalResult={finalRes.data ?? null}
      prizeCatalog={(catalogRes.data?.prizes as string[] | null) ?? []}
      defaultMaxWinners={Number(process.env.JUEGO_MAX_WINNERS) || 3}
    />
  );
}
