"use client";

import { useEffect, useMemo } from "react";
import Image from "next/image";
import { motion } from "framer-motion";

const TOTAL = 12;

export default function AvatarSelector({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (filename: string) => void;
}) {
  const avatars = useMemo(
    () => Array.from({ length: TOTAL }, (_, i) => `avatar-${i + 1}.png`),
    []
  );

  // Seleccionar uno aleatorio al montar si no hay valor previo.
  useEffect(() => {
    if (!value) {
      const random = avatars[Math.floor(Math.random() * avatars.length)];
      onChange(random);
    }
    // Solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <label className="mb-3 block text-[11px] font-bold uppercase tracking-[0.14em] text-bone-dim">
        Elige tu avatar
      </label>
      <div className="grid grid-cols-4 gap-2.5 sm:gap-3">
        {avatars.map((filename, i) => {
          const selected = value === filename;
          return (
            <motion.button
              key={filename}
              type="button"
              onClick={() => onChange(filename)}
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.06 }}
              className={`relative aspect-square overflow-hidden rounded-2xl border-2 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/60 ${
                selected
                  ? "border-ember shadow-[0_0_20px_-4px_rgba(255,77,0,0.45)]"
                  : "border-smoke hover:border-bone-dim/50"
              }`}
              aria-label={`Avatar ${i + 1}${selected ? " (seleccionado)" : ""}`}
              aria-pressed={selected}
            >
              <Image
                src={`/juego/AVATARES/${filename}`}
                alt={`Avatar ${i + 1}`}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 22vw, 12vw"
                unoptimized
              />
              {selected && (
                <motion.div
                  className="absolute inset-0 rounded-2xl bg-ember/20"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15 }}
                />
              )}
              {selected && (
                <motion.span
                  className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ember shadow-lg"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                >
                  <svg
                    className="h-3.5 w-3.5 text-white"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M20 6 9 17l-5-5"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
