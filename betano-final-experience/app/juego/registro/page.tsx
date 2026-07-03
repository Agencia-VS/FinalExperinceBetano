import Link from "next/link";
import RegistroForm from "@/components/juego/RegistroForm";

export default function RegistroPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col">
      {/* Top bar: volver + paso */}
      <header className="flex items-center justify-between">
        <Link
          href="/juego"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-smoke bg-char/60 text-bone-dim transition-colors hover:border-ember/50 hover:text-bone"
          aria-label="Volver"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div className="flex items-center gap-1.5" aria-label="Paso 1 de 2">
          <span className="h-1.5 w-6 rounded-full bg-ember" />
          <span className="h-1.5 w-6 rounded-full bg-smoke" />
        </div>
      </header>

      <div className="mt-9">
        <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-ember">
          Paso 1 · Tu jugador
        </p>
        <h1 className="mt-2 font-title text-[2.15rem] font-extrabold uppercase leading-[0.95] tracking-tight text-bone">
          Crea tu
          <br />
          jugador
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-bone-dim">
          Tu alias es tu nombre en el ranking y en la pantalla gigante. Elígelo bien.
        </p>
      </div>

      <RegistroForm />
    </main>
  );
}
