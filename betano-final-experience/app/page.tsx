import Image from "next/image";
import EnrollModal from "@/components/EnrollModal";
import "./landing.css";

export default function Home() {
  return (
    <main className="landing">
      <header className="top-bar">
      </header>

      <div className="hero-wrap">
        {/* ── Izquierda: gráfico de marca ── */}
        <section className="hero-copy">
          <Image
            src="/EXPERIENCE.png"
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
              style={{ width: "100%", maxWidth: "320px", height: "auto" }}
              priority
            />
          </div>
        </section>

        {/* ── Derecha: descripción + CTA ── */}
        <section className="hero-side">
          {/* Bloque 1: Título con barra decorativa */}
          <div className="hero-title-block">
            <h2 className="hero-desc-title">
              Vive la final de la Copa del Mundo como nunca antes.
            </h2>
          </div>

          {/* Bloque 2: Badges informativos */}
          <div className="hero-info-badges">
            <div className="hero-info-badge">
              <svg className="hero-badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <div className="hero-badge-text">
                <span className="hero-badge-label">Fecha</span>
                <span className="hero-badge-value">19 julio 2026 · 12:00 hrs</span>
              </div>
            </div>
            <div className="hero-info-badge">
              <svg className="hero-badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              <div className="hero-badge-text">
                <span className="hero-badge-label">Lugar</span>
                <span className="hero-badge-value">Explanada Metropolitan, Vitacura</span>
              </div>
            </div>
          </div>

          {/* Bloque 3: Descripción del evento */}
          <div className="hero-body-block">
            <p className="hero-body-title">Final Experience</p>
            <p className="hero-desc-body">
              La gran final en pantalla XL dentro de un domo inmersivo.
              Música, concursos, comida y la mejor energía. ¡No te quedes fuera!
            </p>
          </div>

          {/* Bloque 4: Pasos para participar */}
          <div className="hero-steps-block">
            <p className="hero-steps-title">¿Cómo participar?</p>
            <div className="hero-step">
              <span className="hero-step-num">1</span>
              <span className="hero-step-text">Inscríbete entre el 4 y el 15 de julio</span>
            </div>
            <div className="hero-step">
              <span className="hero-step-num">2</span>
              <span className="hero-step-text">Cuéntanos por qué quieres vivir esta experiencia</span>
            </div>
            <div className="hero-step">
              <span className="hero-step-num">3</span>
              <span className="hero-step-text">Entra al sorteo para asistir junto a 2 amigos</span>
            </div>
          </div>

          <EnrollModal />
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
