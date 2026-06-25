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
          <h1 className="hero-title">
            <span className="word-final">FINAL</span>
            <span className="word-exp">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/trazo.svg" className="trazo-bg" alt="" aria-hidden="true" />
              <span className="exp-text">EXPERIENCE</span>
            </span>
          </h1>

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

          <p className="hero-lede">
            Vive la final como nunca antes.<br />
            Un evento único. Una experiencia inolvidable.
          </p>
        </section>

        {/* ── Sección derecha 1/3 ── */}
        <section className="hero-form" aria-label="Formulario de inscripción">
          <InscriptionForm />
        </section>
      </div>

      <footer className="landing-foot">
        <a href="/bases-legales" className="link-ember">Bases legales</a>
        <span className="foot-sep">·</span>
        <span>Concurso válido en Chile. Mayores de 18 años.</span>
      </footer>
    </main>
  );
}
