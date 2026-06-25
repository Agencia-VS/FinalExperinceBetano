import type { Metadata } from "next";
import { Oswald, Inter } from "next/font/google";
import "./globals.css";

// Display: Oswald condensado evoca el lettering deportivo del mockup.
const display = Oswald({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

// Body: Inter, neutra y legible para formularios y legales.
const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Final Experience Betano | Inscríbete",
  description:
    "Inscríbete y participa por vivir la final del Mundial 2026 junto a tus amigos. Concurso Final Experience Betano.",
  icons: {
    icon: "/isoBetano.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${display.variable} ${body.variable}`}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
