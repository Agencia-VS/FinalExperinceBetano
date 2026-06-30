"use client";

import { useState } from "react";
import { isValidRut, formatRut } from "@/lib/rut";

type DocType = "RUT" | "DNI_EXTRANJERO" | "PASAPORTE";

const DOC_LABELS: Record<DocType, string> = {
  RUT: "RUT",
  DNI_EXTRANJERO: "DNI extranjero",
  PASAPORTE: "Pasaporte",
};

interface FormState {
  nombre: string;
  email: string;
  telefono: string;
  tipoDoc: DocType;
  documento: string;
  motivo: string;
  mayorEdad: boolean;
  aceptaBases: boolean;
}

const EMPTY: FormState = {
  nombre: "",
  email: "",
  telefono: "",
  tipoDoc: "RUT",
  documento: "",
  motivo: "",
  mayorEdad: false,
  aceptaBases: false,
};

export default function InscriptionForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [serverMsg, setServerMsg] = useState("");

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (form.nombre.trim().length < 2) e.nombre = "Escribe tu nombre.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email))
      e.email = "Revisa tu correo.";
    if (form.telefono.replace(/\D/g, "").length < 8)
      e.telefono = "Revisa tu teléfono.";

    if (!form.documento.trim()) {
      e.documento = "Ingresa tu documento.";
    } else if (form.tipoDoc === "RUT" && !isValidRut(form.documento)) {
      e.documento = "RUT inválido. Revisa el dígito verificador.";
    }

    if (!form.mayorEdad) e.mayorEdad = "Debes ser mayor de 18 años.";
    if (!form.aceptaBases) e.aceptaBases = "Debes aceptar las bases.";

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    setServerMsg("");
    if (!validate()) return;
    setStatus("sending");

    const payload = {
      ...form,
      documento:
        form.tipoDoc === "RUT" ? formatRut(form.documento) : form.documento.trim(),
    };

    try {
      const res = await fetch("/api/inscripcion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setServerMsg(data.error ?? "No pudimos registrar tu inscripción.");
        return;
      }
      setStatus("ok");
      setForm(EMPTY);
    } catch {
      setStatus("error");
      setServerMsg("Error de conexión. Intenta de nuevo.");
    }
  }

  if (status === "ok") {
    return (
      <div className="form-card" role="status">
        <h2 className="form-title">¡Estás dentro!</h2>
        <p style={{ color: "var(--bone-dim)", lineHeight: 1.6 }}>
          Recibimos tu inscripción a la Final Experience Betano. Si resultas
          seleccionado en el sorteo, te escribiremos al correo que registraste.
          Mucha suerte.
        </p>
        <button
          type="button"
          className="btn-ember"
          style={{ marginTop: "1.5rem" }}
          onClick={() => setStatus("idle")}
        >
          Volver al home
        </button>
      </div>
    );
  }

  return (
    <div className="form-card">
      <h2 className="form-title">
        <span className="form-title-main">Inscríbete</span>
        <span className="form-title-dim">
          Y participa junto a 2 amigos en la{" "}
          <span className="form-title-em">Final Experience Betano.</span>
        </span>
      </h2>

      <div className="form-grid">
        <div>
          <label className="field-label" htmlFor="nombre">Nombre</label>
          <input
            id="nombre" className="field-input" value={form.nombre}
            placeholder="Nombre y apellido"
            aria-invalid={!!errors.nombre}
            onChange={(e) => update("nombre", e.target.value)}
          />
          {errors.nombre && <p className="field-error">{errors.nombre}</p>}
        </div>

        <div>
          <label className="field-label" htmlFor="email">Mail</label>
          <input
            id="email" type="email" className="field-input" value={form.email}
            placeholder="tucorreo@ejemplo.cl"
            aria-invalid={!!errors.email}
            onChange={(e) => update("email", e.target.value)}
          />
          {errors.email && <p className="field-error">{errors.email}</p>}
        </div>

        <div>
          <label className="field-label" htmlFor="telefono">Teléfono</label>
          <input
            id="telefono" className="field-input" value={form.telefono}
            placeholder="+56 9 1234 5678"
            aria-invalid={!!errors.telefono}
            onChange={(e) => update("telefono", e.target.value)}
          />
          {errors.telefono && <p className="field-error">{errors.telefono}</p>}
        </div>

        <div className="doc-row">
          <div className="doc-type">
            <label className="field-label" htmlFor="tipoDoc">Tipo de documento</label>
            <select
              id="tipoDoc" className="field-select" value={form.tipoDoc}
              onChange={(e) => update("tipoDoc", e.target.value as DocType)}
            >
              {(Object.keys(DOC_LABELS) as DocType[]).map((k) => (
                <option key={k} value={k}>{DOC_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div className="doc-number">
            <label className="field-label" htmlFor="documento">
              {DOC_LABELS[form.tipoDoc]}
            </label>
            <input
              id="documento" className="field-input" value={form.documento}
              placeholder={form.tipoDoc === "RUT" ? "12.345.678-9" : "N° de documento"}
              aria-invalid={!!errors.documento}
              onChange={(e) => update("documento", e.target.value)}
              onBlur={() =>
                form.tipoDoc === "RUT" && form.documento &&
                update("documento", formatRut(form.documento))
              }
            />
            {errors.documento && <p className="field-error">{errors.documento}</p>}
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="motivo">
            En pocas palabras, ¿por qué quieres vivir la Final Experience?
          </label>
          <textarea
            id="motivo" className="field-textarea" rows={3} value={form.motivo}
            placeholder="Tu respuesta (opcional)"
            onChange={(e) => update("motivo", e.target.value)}
          />
        </div>

        <label className="check-row">
          <input
            type="checkbox" checked={form.mayorEdad}
            onChange={(e) => update("mayorEdad", e.target.checked)}
          />
          <span>Declaro que soy mayor de 18 años.</span>
        </label>
        {errors.mayorEdad && <p className="field-error">{errors.mayorEdad}</p>}

        <label className="check-row">
          <input
            type="checkbox" checked={form.aceptaBases}
            onChange={(e) => update("aceptaBases", e.target.checked)}
          />
          <span>
            He leído y acepto las{" "}
            <a href="/bases-legales" target="_blank" className="link-ember">
              bases legales y la política de tratamiento de datos
            </a>.
          </span>
        </label>
        {errors.aceptaBases && <p className="field-error">{errors.aceptaBases}</p>}

        {status === "error" && (
          <p className="field-error" role="alert">{serverMsg}</p>
        )}

        <button
          type="button"
          className="btn-ember" style={{ width: "100%", marginTop: "0.5rem" }}
          onClick={handleSubmit} disabled={status === "sending"}
        >
          {status === "sending" ? "Enviando…" : "ENVIAR INSCRIPCIÓN"}
        </button>
      </div>
    </div>
  );
}
