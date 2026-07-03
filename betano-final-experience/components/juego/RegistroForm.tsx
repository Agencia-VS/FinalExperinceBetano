"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import AliasField from "./AliasField";

export const inputCls =
  "w-full rounded-2xl border border-smoke bg-char/80 px-4 py-3.5 text-base text-bone placeholder:text-bone-dim/60 outline-none transition-[border-color,box-shadow] duration-200 focus:border-ember focus:shadow-[0_0_0_3px_rgba(255,77,0,0.15)]";
export const labelCls =
  "mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-bone-dim";

const fade: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.06 * i, type: "spring", stiffness: 320, damping: 30 },
  }),
};

export default function RegistroForm() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [alias, setAlias] = useState("");
  const [aliasOk, setAliasOk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    nombre.trim().length >= 2 &&
    apellido.trim().length >= 2 &&
    aliasOk &&
    !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/juego/registro", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nombre: nombre.trim(),
          apellido: apellido.trim(),
          alias: alias.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No pudimos registrarte.");
        setSubmitting(false);
        return;
      }
      localStorage.setItem(
        "juego_player",
        JSON.stringify({ playerId: data.playerId, alias: data.alias })
      );
      router.push("/juego/pronosticos");
    } catch {
      setError("Sin conexión. Revisa tu internet e intenta de nuevo.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-1 flex-col">
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3">
          <motion.div custom={0} variants={fade} initial="hidden" animate="show">
            <label htmlFor="nombre" className={labelCls}>
              Nombre
            </label>
            <input
              id="nombre"
              className={inputCls}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre"
              autoComplete="given-name"
              maxLength={40}
            />
          </motion.div>

          <motion.div custom={1} variants={fade} initial="hidden" animate="show">
            <label htmlFor="apellido" className={labelCls}>
              Apellido
            </label>
            <input
              id="apellido"
              className={inputCls}
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
              placeholder="Apellido"
              autoComplete="family-name"
              maxLength={40}
            />
          </motion.div>
        </div>

        <motion.div custom={2} variants={fade} initial="hidden" animate="show">
          <AliasField
            value={alias}
            onChange={setAlias}
            onValidityChange={setAliasOk}
            inputCls={inputCls}
            labelCls={labelCls}
          />
        </motion.div>
      </div>

      <div className="mt-auto pt-8">
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-3 rounded-xl border border-[#ff6b4a]/30 bg-[#ff6b4a]/10 px-4 py-3 text-sm text-[#ff8a6a]"
              role="alert"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <motion.div custom={3} variants={fade} initial="hidden" animate="show">
          <button
            type="submit"
            className="btn-ember j-cta w-full py-4 text-base"
            disabled={!canSubmit}
          >
            {submitting ? (
              <>
                <Spinner /> Entrando…
              </>
            ) : (
              <>
                Ir a mis jugadas
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </>
            )}
          </button>
          <p className="mt-3 text-center text-xs text-bone-dim">
            Solo usamos tus datos para el juego del evento.
          </p>
        </motion.div>
      </div>
    </form>
  );
}

function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
