import { NextResponse } from "next/server";
import { createServer, createAdmin } from "@/lib/supabase";

async function requireAdmin() {
  const supabase = await createServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// POST /api/juego/admin/resolver → fuerza un recálculo del leaderboard (botón admin).
export async function POST() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const admin = createAdmin();
  const { error } = await admin.rpc("juego_recompute_scores");
  if (error) {
    console.error("[resolver] recompute:", error.message);
    return NextResponse.json({ error: "No se pudo recalcular." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
