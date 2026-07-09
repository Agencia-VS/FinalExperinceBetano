import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/juego/leaderboard
 * Snapshot inicial (SSR / primer render). Después el cliente se suscribe a
 * juego_leaderboard_cache por Realtime y deja de pegarle a este endpoint.
 */
export async function GET() {
  const admin = createAdmin();

  const [cacheRes, stateRes, finalRes] = await Promise.all([
    admin.from("juego_leaderboard_cache").select("ranking, updated_at").eq("id", 1).maybeSingle(),
    admin
      .from("juego_match_state")
      .select("match_status, predictions_locked, kickoff_at, home_team, away_team")
      .eq("id", 1)
      .maybeSingle(),
    admin
      .from("juego_final_result")
      .select("status, seed, max_winners, winners, tie_breaker_events, executed_at, revealed_at")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    ranking: cacheRes.data?.ranking ?? [],
    updatedAt: cacheRes.data?.updated_at ?? null,
    matchStatus: stateRes.data?.match_status ?? "scheduled",
    predictionsLocked: stateRes.data?.predictions_locked ?? false,
    kickoffAt: stateRes.data?.kickoff_at ?? null,
    homeTeam: stateRes.data?.home_team ?? null,
    awayTeam: stateRes.data?.away_team ?? null,
    finalResult: finalRes.data ?? null,
  });
}
