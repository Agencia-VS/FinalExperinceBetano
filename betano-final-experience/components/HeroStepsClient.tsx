"use client";

import { useState, useEffect } from "react";
import InscriptionForm from "@/components/InscriptionForm";

export default function HeroStepsClient({ closed = false }: { closed?: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Bloque 4: Pasos para participar */}
      <div className="hero-steps-block">
        <p className="hero-steps-title">¿Cómo participar?</p>
        <div className="hero-step">
          <span className="hero-step-num">1</span>
          <span className="hero-step-text">
            {closed ? (
              <>Las inscripciones estuvieron abiertas entre el 4 y el 15 de julio</>
            ) : (
              <>
                <button
                  type="button"
                  className="hero-step-link"
                  onClick={() => setOpen(true)}
                >
                  Inscríbete
                </button>
                {" "}entre el 4 y el 15 de julio
              </>
            )}
          </span>
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

      {/* CTA: Participa */}
      {closed ? (
        <button type="button" className="hero-cta hero-cta-closed" disabled>
          Inscripciones cerradas
        </button>
      ) : (
        <button
          type="button"
          className="hero-cta"
          onClick={() => setOpen(true)}
        >
          Participa
        </button>
      )}

      {/* Modal */}
      {open && !closed && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Formulario de inscripción"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="modal-panel">
            <button
              type="button"
              className="modal-close"
              aria-label="Cerrar"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
            <InscriptionForm onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
