"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { validateAliasShape } from "@/lib/juego/alias";

type Status = "idle" | "checking" | "available" | "taken" | "invalid";

const pop = {
  initial: { opacity: 0, scale: 0.5 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.5 },
  transition: { type: "spring", stiffness: 500, damping: 30 } as const,
};

export default function AliasField({
  value,
  onChange,
  onValidityChange,
  inputCls,
  labelCls,
}: {
  value: string;
  onChange: (v: string) => void;
  onValidityChange: (ok: boolean) => void;
  inputCls: string;
  labelCls: string;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [reason, setReason] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onValidityChange(status === "available");
  }, [status, onValidityChange]);

  useEffect(() => {
    setSuggestions([]);
    const v = value.trim();
    if (timer.current) clearTimeout(timer.current);
    if (!v) {
      setStatus("idle");
      setReason(null);
      return;
    }
    const shapeErr = validateAliasShape(v);
    if (shapeErr) {
      setStatus("invalid");
      setReason(shapeErr);
      return;
    }
    setStatus("checking");
    setReason(null);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/juego/alias-disponible?alias=${encodeURIComponent(v)}`
        );
        const data = await res.json();
        if (data.available) {
          setStatus("available");
          setReason(null);
        } else {
          setStatus("taken");
          setReason(data.reason ?? "Ese alias ya está en uso.");
          setSuggestions(data.suggestions ?? []);
        }
      } catch {
        setStatus("idle");
        setReason(null);
      }
    }, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value]);

  const invalid = status === "taken" || status === "invalid";

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <label htmlFor="alias" className={`${labelCls} mb-0`}>
          Alias
        </label>
        <span className="text-[11px] tabular-nums text-bone-dim/70">
          {value.trim().length}/20
        </span>
      </div>

      <div className="relative">
        <input
          id="alias"
          className={`${inputCls} pr-12 ${
            status === "available"
              ? "!border-[#3ddc84]/60"
              : invalid
                ? "!border-[#ff6b4a]/60"
                : ""
          }`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ej. elcapo23"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={20}
          aria-invalid={invalid}
          aria-describedby="alias-hint"
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          <AnimatePresence mode="wait">
            {status === "checking" && (
              <motion.span key="c" {...pop} className="block">
                <Spinner />
              </motion.span>
            )}
            {status === "available" && (
              <motion.span key="a" {...pop} className="block">
                <Check />
              </motion.span>
            )}
            {invalid && (
              <motion.span key="x" {...pop} className="block">
                <Cross />
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div id="alias-hint" aria-live="polite">
        <AnimatePresence mode="wait">
          {status === "available" && (
            <motion.p
              key="ok"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-2 flex items-center gap-1.5 text-sm text-[#3ddc84]"
            >
              ¡Disponible! Es todo tuyo.
            </motion.p>
          )}
          {reason && status !== "available" && (
            <motion.p
              key="err"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-2 text-sm text-[#ff8a6a]"
            >
              {reason}
            </motion.p>
          )}
          {status === "idle" && !value.trim() && (
            <motion.p
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-2 text-sm text-bone-dim/70"
            >
              Letras, números, espacios y . _ -
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3"
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-bone-dim">
              Libres ahora
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <motion.button
                  type="button"
                  key={s}
                  onClick={() => onChange(s)}
                  whileTap={{ scale: 0.95 }}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-ember/40 bg-ember/10 px-3.5 py-2 text-sm font-medium text-bone transition-colors hover:border-ember hover:bg-ember/20"
                >
                  <svg className="h-3.5 w-3.5 text-wither" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                  </svg>
                  {s}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin text-bone-dim" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
function Check() {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#3ddc84]/15">
      <svg className="h-4 w-4 text-[#3ddc84]" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
function Cross() {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#ff6b4a]/15">
      <svg className="h-4 w-4 text-[#ff8a6a]" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}
