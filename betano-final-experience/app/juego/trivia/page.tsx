import { createAdmin } from "@/lib/supabase";
import { getTriviaSnapshot } from "@/lib/juego/trivia-snapshot";
import TriviaFlow from "@/components/juego/TriviaFlow";
import type { TriviaSnapshot } from "@/components/juego/useTriviaState";

export const dynamic = "force-dynamic";

/**
 * /juego/trivia — el juego del evento: pronóstico anclado (Q10) + preguntas
 * en vivo que el host abre una a una, cada una con su sorteo (ruleta).
 */
export default async function TriviaPage() {
  const admin = createAdmin();
  const snapshot = (await getTriviaSnapshot(admin)) as TriviaSnapshot;
  return <TriviaFlow initial={snapshot} />;
}
