import Image from "next/image";
import HeroStepsClient from "@/components/HeroStepsClient";
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
              VIVE LA FINAL DE LA COPA DEL MUNDO COMO NUNCA ANTES.
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
                <span className="hero-badge-value">19 julio 2026 · Desde las 13:00 hrs</span>
              </div>
            </div>
            <a
              className="hero-info-badge hero-badge-link"
              href="https://www.google.com/maps/place/Metropolitan+Santiago/@-33.3842451,-70.5912201,17.74z/data=!4m10!1m2!2m1!1sexplanada+metropolidan+vitacura!3m6!1s0x9662c9e4a4e59209:0xce1c8be4e1f853da!8m2!3d-33.3832912!4d-70.588124!15sCh9leHBsYW5hZGEgbWV0cm9wb2xpdGFuIHZpdGFjdXJhWiEiH2V4cGxhbmFkYSBtZXRyb3BvbGl0YW4gdml0YWN1cmGSARFjb252ZW50aW9uX2NlbnRlcpoBRENpOURRVWxSUVVOdlpFTm9kSGxqUmpsdlQydzVWRTFWVGtwa01scFpUbXRXTWs1WVpEVmtNMXBSVGxkU2EwMVlZeEFC4AEA-gEECAAQLA!16s%2Fg%2F12175sr_?entry=ttu&g_ep=EgoyMDI2MDYyOC4wIKXMDSoASAFQAw%3D%3D"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg className="hero-badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              <div className="hero-badge-text">
                <span className="hero-badge-label">Lugar</span>
                <span className="hero-badge-value">Explanada Metropolitan, Vitacura</span>
              </div>
            </a>
          </div>

          {/* Bloque 3: Descripción del evento */}
          <div className="hero-body-block">
            <p className="hero-body-title">Final Experience Betano</p>
            <p className="hero-desc-body">
              Únete a una experiencia inmersiva en un domo gigante, pantalla XL
              y sonido envolvente para ver la Gran Final. Concursos, música en
              vivo y food trucks, todo en un mismo lugar.
            </p>
          </div>

          <HeroStepsClient />
        </section>
      </div>

      <footer className="landing-foot">
        <div className="footer-logo">
          <Image
            src="/isoBetanoblanco.png"
            alt="Betano"
            width={50}
            height={50}
            style={{ width: "50px", height: "auto" }}
          />
        </div>
        <span>Concurso válido en Chile. Mayores de 18 años.</span>
      </footer>
    </main>
  );
}
