import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

/**
 * Fuentes de marca Betano (locales, servidas desde /public):
 *  — MDNichrome (Regular + Dark) → var(--font-mdn): titulares y botones.
 *    Usar font-weight 800 para el corte Dark (MDNichrome-Dark.woff2).
 *  — Haffer → var(--font-haffer): cuerpo y UI (formularios, listas, ranking).
 * Los tokens semánticos (--font-display / --font-body) y las utilidades de
 * Tailwind (font-title / font-sans) se mapean sobre estas variables en globals.css.
 */
const mdNichrome = localFont({
  src: [
    { path: "../public/MDNichrome-Regular.woff", weight: "400", style: "normal" },
    { path: "../public/MDNichrome-Dark.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-mdn",
  display: "swap",
});

const haffer = localFont({
  src: "../public/Haffer-Regular.ttf",
  variable: "--font-haffer",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Final Experience Betano",
  description:
    "Final Experience Betano — vive la final del Mundial 2026 junto a Betano.",
  icons: { icon: "/isoBetano.png" },
};

export const viewport: Viewport = {
  themeColor: "#0B0705",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${mdNichrome.variable} ${haffer.variable}`}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
