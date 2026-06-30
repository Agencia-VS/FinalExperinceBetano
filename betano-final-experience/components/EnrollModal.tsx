"use client";

import { useEffect, useState } from "react";
import InscriptionForm from "@/components/InscriptionForm";

export default function EnrollModal() {
  const [open, setOpen] = useState(false);

  // Cerrar con Esc + bloquear scroll del fondo mientras está abierto.
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
      <button
        type="button"
        className="hero-cta"
        onClick={() => setOpen(true)}
      >
        Participa
      </button>

      {open && (
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
            <InscriptionForm />
          </div>
        </div>
      )}
    </>
  );
}
