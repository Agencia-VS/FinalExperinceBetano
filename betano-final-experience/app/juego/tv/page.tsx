import { createAdmin } from "@/lib/supabase";
import { getTriviaSnapshot } from "@/lib/juego/trivia-snapshot";
import type { TriviaSnapshot } from "@/components/juego/useTriviaState";
import TriviaTvBoard from "./TriviaTvBoard";

export const dynamic = "force-dynamic";

/**
 * /juego/tv — vista para el proyector del evento: la trivia en vivo
 * (pregunta gigante + cronómetro + contador) y la ruleta de cada sorteo
 * a pantalla completa. Sin interacción.
 *
 * (Antes renderizaba TvBoard, el leaderboard del juego de pronósticos;
 * ese componente queda intacto en ./TvBoard.tsx — para reactivarlo basta
 * volver a importarlo aquí con sus fetches originales.)
 */
export default async function TvPage() {
  const admin = createAdmin();
  const snapshot = (await getTriviaSnapshot(admin)) as TriviaSnapshot;
  return <TriviaTvBoard initial={snapshot} />;
}
