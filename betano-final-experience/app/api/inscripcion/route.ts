import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { isValidRut } from "@/lib/rut";

const DOC_TYPES = ["RUT", "DNI_EXTRANJERO", "PASAPORTE"];

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const nombre = String(body.nombre ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const telefono = String(body.telefono ?? "").trim();
  const tipoDoc = String(body.tipoDoc ?? "");
  const documento = String(body.documento ?? "").trim();
  const motivo = String(body.motivo ?? "").trim() || null;
  const mayorEdad = body.mayorEdad === true;
  const aceptaBases = body.aceptaBases === true;

  // Re-validación en servidor (nunca confiar solo en el cliente).
  if (nombre.length < 2) return bad("Nombre inválido.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad("Correo inválido.");
  if (telefono.replace(/\D/g, "").length < 8) return bad("Teléfono inválido.");
  if (!DOC_TYPES.includes(tipoDoc)) return bad("Tipo de documento inválido.");
  if (!documento) return bad("Documento requerido.");
  if (tipoDoc === "RUT" && !isValidRut(documento)) return bad("RUT inválido.");
  if (!mayorEdad) return bad("Debes ser mayor de 18 años.");
  if (!aceptaBases) return bad("Debes aceptar las bases.");

  const supabase = createAdmin();
  const { error } = await supabase.from("participantes").insert({
    nombre,
    email,
    telefono,
    tipo_doc: tipoDoc,
    documento,
    motivo,
    mayor_edad: true,
    acepta_bases: true,
  });

  if (error) {
    // 23505 = violación de índice único (documento ya inscrito)
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Este documento ya está inscrito en el concurso." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "No pudimos registrar tu inscripción." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

function bad(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}
