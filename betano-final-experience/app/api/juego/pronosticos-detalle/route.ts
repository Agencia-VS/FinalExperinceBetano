import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Mapeo market_id → campo del snapshot (para los O/U que muestran progreso).
const STAT_FIELD: Record<string, string> = {
  total_goles_ou: "home_score + away_score", // goles totales
  total_corners_ou: "corners_total",
  total_amarillas_ou: "yellow_cards_total",
  tiros_arco_ou: "shots_on_goal_total",
  faltas_ou: "fouls_total",
  offsides_ou: "offsides_total",
};

// Mercados cuyo campo se resuelve con stat numérico (O/U).
const OU_MARKETS = new Set(Object.keys(STAT_FIELD));

export type BreakdownItem = {
  marketId: string;
  titulo: string;
  resolvesAt: string;
  /** Ventana que cuenta: '90' | '120' | 'ht' | null (no aplica). */
  tiempo: string | null;
  pickLabel: string | null;
  puntos: number;
  resolved: boolean;
  matchLive: boolean;
  matchFinished: boolean;
  // Solo para O/U:
  statActual: number | null;
  umbral: number | null;
  direccion: "over" | "under" | null;
};

/**
 * GET /api/juego/pronosticos-detalle?playerId=...
 *
 * Devuelve el breakdown de los 14 mercados para un jugador:
 *  - qué eligió, puntos, si ya se resolvió (✅/⏳), y progreso para O/U.
 */
export async function GET(req: Request) {
  const playerId = new URL(req.url).searchParams.get("playerId");
  if (!playerId) {
    return NextResponse.json({ error: "Falta playerId." }, { status: 400 });
  }

  const admin = createAdmin();

  // 1. Último snapshot (stats actuales del partido).
  const { data: snap } = await admin
    .from("juego_match_snapshots")
    .select("*")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 2. Score del jugador (sabemos qué mercados ya resolvió con puntos).
  const { data: scores } = await admin
    .from("juego_player_scores")
    .select("detalle")
    .eq("player_id", playerId)
    .maybeSingle();

  const detalle: Record<string, number> = scores?.detalle ?? {};

  // 3. Pronósticos del jugador.
  const { data: preds } = await admin
    .from("juego_predictions")
    .select("market_id, option_id, juego_market_options(etiqueta, puntos, umbral, direccion, valor)")
    .eq("player_id", playerId);

  // 4. Catálogo de mercados (para título, resolves_at y orden).
  const { data: markets } = await admin
    .from("juego_markets")
    .select("id, titulo, resolves_at, tiempo, orden")
    .eq("activo", true)
    .order("orden");

  const marketMap = new Map((markets ?? []).map((m) => [m.id, m]));

  // Armar breakdown
  const isFinished = snap?.match_status === "finished";
  const isLive = snap && snap.match_status !== "scheduled" && snap.match_status !== "finished";

  const breakdown: BreakdownItem[] = (markets ?? []).map((m) => {
    const pred = (preds ?? []).find((p) => p.market_id === m.id);
    const opt = (pred as any)?.juego_market_options as {
      etiqueta?: string;
      puntos?: number;
      umbral?: number | null;
      direccion?: "over" | "under" | null;
      valor?: string | null;
    } | null;

    const hasScore = (detalle[m.id] ?? 0) > 0;
    let resolved = hasScore;

    // Corrección: ciertas predicciones no pueden darse por resueltas hasta
    // que el partido termine o la evidencia sea irreversible.
    if (hasScore && isLive && opt) {
      if (m.id === "ambas_anotan" && opt.valor === "no") {
        resolved = false; // "No" solo se confirma al final
      }
      if (m.id === "habra_roja" && opt.valor === "no") {
        resolved = false; // "No" solo se confirma al final
      }
      if (m.id === "habra_penales" && opt.valor === "no") {
        resolved = false; // "No" solo se confirma al final
      }
      if (m.id === "primer_gol" && !snap?.first_scorer_side) {
        resolved = false; // aún no hubo gol
      }
      if (opt.direccion === "under") {
        resolved = false; // unders solo se confirman al final
      }
      // O/U "over" con umbral ya superado SÍ está confirmado.
    }
    let statActual: number | null = null;

    if (snap && OU_MARKETS.has(m.id)) {
      const field = STAT_FIELD[m.id];
      if (field === "home_score + away_score") {
        statActual = (snap.home_score ?? 0) + (snap.away_score ?? 0);
      } else {
        statActual = (snap as any)[field] ?? 0;
      }
    }

    return {
      marketId: m.id,
      titulo: m.titulo,
      resolvesAt: m.resolves_at,
      tiempo: m.tiempo ?? null,
      pickLabel: opt?.etiqueta ?? null,
      puntos: opt?.puntos ?? 0,
      resolved,
      matchLive: isLive,
      matchFinished: isFinished,
      statActual,
      umbral: opt?.umbral ?? null,
      direccion: opt?.direccion ?? null,
    };
  });

  return NextResponse.json({ breakdown, playerId });
}
