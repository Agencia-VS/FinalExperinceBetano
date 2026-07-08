import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Betano · Predicción en Vivo — Final Mundial 2026",
  description:
    "Haz tus pronósticos de la final y súbete al ranking en vivo con Betano.",
};

// Shell del juego: atmósfera de marca (glow ember + viñeta + grano) y columna
// flexible; cada página controla su propio ancho máximo (mobile-first).
export default function JuegoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      {/* Fondo móvil */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-20 md:hidden"
        style={{
          backgroundImage: "url('/juego/FONDOMOVIL.jpg.jpeg')",
          backgroundSize: "cover",
          backgroundPosition: "center top",
          backgroundRepeat: "no-repeat",
        }}
      />
      {/* Fondo escritorio */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-20 hidden md:block"
        style={{
          backgroundImage: "url('/juego/FONDODESK.png')",
          backgroundSize: "cover",
          backgroundPosition: "center top",
          backgroundRepeat: "no-repeat",
        }}
      />
      {/* Glow superior e inferior */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(130% 90% at 50% -15%, rgba(255,77,0,0.22), transparent 55%)," +
            "radial-gradient(95% 60% at 50% 115%, rgba(194,53,10,0.16), transparent 70%)," +
            "radial-gradient(60% 40% at 85% 30%, rgba(255,77,0,0.05), transparent 70%)",
        }}
      />
      {/* Viñeta lateral para foco central */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "linear-gradient(90deg, rgba(0,0,0,0.4), transparent 18%, transparent 82%, rgba(0,0,0,0.4))",
        }}
      />
      <div aria-hidden className="j-noise" />

      <div
        className="flex min-h-dvh w-full flex-col px-5"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 1.1rem)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 1.1rem)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
