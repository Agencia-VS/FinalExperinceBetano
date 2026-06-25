"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowser } from "@/lib/supabase-browser";

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function login() {
    setError("");
    setLoading(true);
    const supabase = createBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("Credenciales inválidas.");
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <main style={wrap}>
      <div style={card}>
        <h1 style={{ fontFamily: "var(--font-display)", textTransform: "uppercase",
          letterSpacing: "0.08em", marginBottom: "1.5rem", fontSize: "1.5rem" }}>
          Panel Final Experience
        </h1>
        <label className="field-label" htmlFor="email">Correo</label>
        <input id="email" type="email" className="field-input" value={email}
          style={{ marginBottom: "1rem" }}
          onChange={(e) => setEmail(e.target.value)} />
        <label className="field-label" htmlFor="pw">Contraseña</label>
        <input id="pw" type="password" className="field-input" value={password}
          style={{ marginBottom: "1.25rem" }}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && login()} />
        {error && <p className="field-error" style={{ marginBottom: "1rem" }}>{error}</p>}
        <button className="btn-ember" style={{ width: "100%" }}
          onClick={login} disabled={loading}>
          {loading ? "Ingresando…" : "Ingresar"}
        </button>
      </div>
    </main>
  );
}

const wrap: React.CSSProperties = {
  minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem",
  background: "radial-gradient(80% 60% at 50% 0%, #2a1005, var(--ash))",
};
const card: React.CSSProperties = {
  width: "100%", maxWidth: "380px", background: "var(--char)",
  border: "1px solid var(--smoke)", borderRadius: "14px", padding: "2rem",
};
