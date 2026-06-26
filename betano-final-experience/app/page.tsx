import Image from "next/image";
import InscriptionForm from "@/components/InscriptionForm";
import "./landing.css";

export default function Home() {
  return (
    <main className="landing">
      <header className="top-bar">
      </header>

      <div className="hero-wrap">
        {/* ── Sección izquierda 2/3 ── */}
        <section className="hero-copy">
          <Image
            src="/EXPERIENCE%20TEXTO.png"
            alt="Final Experience"
            className="hero-experience"
            width={3295}
            height={2463}
            priority
          />

          <div className="hero-brand">
            <Image
              src="/BTH.svg"
              alt="Betano — Promotor Oficial de la Copa Mundial de la FIFA 2026™"
              width={1440}
              height={810}
              style={{ width: "100%", maxWidth: "340px", height: "auto" }}
              priority
            />
          </div>
        </section>

        {/* ── Sección derecha 1/3 ── */}
        <section className="hero-form" aria-label="Formulario de inscripción">
          <InscriptionForm />
        </section>
      </div>

      <footer className="landing-foot">
        <div className="footer-logo">
          <Image
            src="/isoBetano.png"
            alt="Betano"
            width={40}
            height={40}
            style={{ width: "40px", height: "auto" }}
          />
        </div>
        <span>Concurso válido en Chile. Mayores de 18 años.</span>
      </footer>
    </main>
  );
}
