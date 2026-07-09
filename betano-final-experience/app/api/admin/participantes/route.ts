import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

/** Quita tildes, diéresis y cedillas para búsqueda tolerante. */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  const supabase = createAdmin();

  const { data, error } = await supabase
    .from("participantes")
    .select("id, nombre, email, telefono, tipo_doc, documento, motivo, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let rows = data ?? [];

  // Filtro tolerante a acentos, espacios extra y capitalización
  if (q) {
    const qNorm = normalizar(q);
    rows = rows.filter((p) => {
      const nombre = normalizar(p.nombre);
      const email = normalizar(p.email);
      const documento = normalizar(p.documento.replace(/\D/g, ""));
      return (
        nombre.includes(qNorm) ||
        email.includes(qNorm) ||
        documento.includes(qNorm)
      );
    });
  }

  return NextResponse.json({ data: rows, total: rows.length });
}
