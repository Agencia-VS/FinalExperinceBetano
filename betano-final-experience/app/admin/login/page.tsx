"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowser } from "@/lib/supabase-browser";
import Image from "next/image";
import "../admin.css";

export default function AdminLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function login() {
    setError("");
    setLoading(true);
    const supabase = createBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("Credenciales inválidas. Revisa tu correo y contraseña.");
      return;
    }
    const next = searchParams.get("next") ?? "/admin";
    router.push(next);
    router.refresh();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") login();
  }

  return (
    <main className="login-wrap">
      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          <Image src="/isoBetano.png" alt="Betano" width={56} height={56} priority />
        </div>

        <h1 className="login-title">Final Experience</h1>
        <p className="login-sub">Panel de administración</p>

        <div className="login-fields">
          <div className="login-field">
            <label className="field-label" htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              className="field-input"
              value={email}
              placeholder="admin@betano.cl"
              autoComplete="email"
              onKeyDown={onKey}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="login-field">
            <label className="field-label" htmlFor="pw">Contraseña</label>
            <div className="pw-wrap">
              <input
                id="pw"
                type={showPw ? "text" : "password"}
                className="field-input pw-input"
                value={password}
                placeholder="••••••••"
                autoComplete="current-password"
                onKeyDown={onKey}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="pw-toggle"
                aria-label={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
                onClick={() => setShowPw((v) => !v)}
              >
                {showPw ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="login-error" role="alert">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        <button
          type="button"
          className="btn-ember login-btn"
          onClick={login}
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="login-spinner" />
              Ingresando…
            </>
          ) : "Ingresar al panel"}
        </button>
      </div>
    </main>
  );
}
