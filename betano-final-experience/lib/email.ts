import { Resend } from "resend";

/**
 * Servicio de correo del concurso (Resend).
 * Centraliza el cliente, la plantilla base y los envíos transaccionales.
 */

let _resend: Resend | null = null;
function client() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY!);
  return _resend;
}

function from() {
  return process.env.RESEND_FROM!;
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

/** Primer nombre, para un saludo más cálido. */
function firstName(nombre: string) {
  return nombre.trim().split(/\s+/)[0] || nombre.trim();
}

/* ── Paleta (alineada con la landing) ─────────────────── */
const C = {
  ash: "#0B0705",
  char: "#1A0F0A",
  ember: "#FF4D00",
  emberDeep: "#C2350A",
  bone: "#F5EFE8",
  boneDim: "#B8A99C",
  smoke: "#2A1B12",
};

/**
 * Envoltura común: cuerpo oscuro, tarjeta centrada, header con acento ember
 * y franja de evento. `accent` es la línea superior corta (kicker).
 */
function shell(opts: {
  preheader: string;
  kicker: string;
  title: string;
  body: string;
}) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
</head>
<body style="margin:0;padding:0;background:${C.ash};">
  <span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${opts.preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ash};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.char};border:1px solid ${C.smoke};border-radius:16px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,${C.emberDeep},${C.ember});padding:28px 32px;">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#fff;opacity:0.85;font-weight:700;">${opts.kicker}</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:1.1;font-style:italic;font-weight:800;text-transform:uppercase;color:#fff;margin-top:6px;">Final Experience</div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;font-family:Arial,Helvetica,sans-serif;color:${C.bone};">
              ${opts.body}
            </td>
          </tr>
          <!-- Event strip -->
          <tr>
            <td style="padding:0 32px 8px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.smoke};">
                <tr>
                  <td style="padding-top:18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.7;color:${C.boneDim};">
                    <span style="color:${C.ember};font-weight:700;">📅 19 de julio de 2026</span> · 12:00 hrs<br />
                    <span style="color:${C.ember};font-weight:700;">📍 Explanada Metropolitan</span>, Vitacura, Santiago
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px 28px 32px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:${C.boneDim};border-top:1px solid ${C.smoke};">
              Este correo se envía únicamente con fines del concurso Final Experience Betano.
              Tus datos serán eliminados tras la finalización del evento conforme a las
              <a href="#" style="color:${C.boneDim};text-decoration:underline;">bases legales</a>.
              Concurso válido en Chile. Mayores de 18 años.
            </td>
          </tr>
        </table>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#5c5048;margin-top:16px;">Betano · Promotor Oficial de la Copa Mundial de la FIFA 2026™</div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ── Correo: confirmación de inscripción ──────────────── */
export function inscripcionHtml(nombre: string) {
  const name = escapeHtml(firstName(nombre));
  return shell({
    preheader: "Tu inscripción fue exitosa. ¡Mucha suerte en el sorteo!",
    kicker: "Inscripción confirmada",
    title: "Inscripción confirmada",
    body: `
      <p style="font-size:18px;line-height:1.5;margin:0 0 16px;color:${C.bone};">Hola <strong>${name}</strong>,</p>
      <p style="font-size:16px;line-height:1.65;margin:0 0 16px;color:${C.bone};">
        Tu inscripción al concurso <strong style="color:${C.ember};">Final Experience Betano</strong> fue
        <strong>exitosa</strong> ✅. Ya estás participando por vivir la Gran Final del Mundial 2026
        como nunca antes: domo inmersivo, pantalla XL, sonido envolvente, música en vivo y mucho más.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
        <tr>
          <td style="background:rgba(255,77,0,0.10);border:1px solid rgba(255,77,0,0.30);border-radius:10px;padding:14px 18px;font-size:15px;line-height:1.55;color:${C.bone};">
            🎟️ <strong>10 cupos disponibles.</strong> Cada ganador asiste junto a <strong>2 amigos</strong>.
          </td>
        </tr>
      </table>
      <p style="font-size:16px;line-height:1.65;margin:0 0 16px;color:${C.bone};">
        Nos comunicaremos contigo <strong>por este mismo correo</strong> en caso de que resultes uno de
        los ganadores del sorteo. Te recomendamos revisar tu bandeja de entrada (y la de spam) durante
        los próximos días.
      </p>
      <p style="font-size:17px;line-height:1.5;margin:8px 0 0;color:${C.ember};font-weight:700;font-style:italic;">
        ¡Mucha suerte! 🍀
      </p>`,
  });
}

/* ── Correo: aviso a ganadores ────────────────────────── */
export function ganadorHtml(nombre: string) {
  const name = escapeHtml(firstName(nombre));
  return shell({
    preheader: "¡Ganaste! Vivirás la final del Mundial 2026 con Final Experience Betano.",
    kicker: "¡Resultaste ganador!",
    title: "¡Ganaste!",
    body: `
      <p style="font-size:18px;line-height:1.5;margin:0 0 16px;color:${C.bone};">Hola <strong>${name}</strong>,</p>
      <p style="font-size:16px;line-height:1.65;margin:0 0 16px;color:${C.bone};">
        Tenemos excelentes noticias: resultaste <strong style="color:${C.ember};">ganador</strong> del
        concurso Final Experience Betano. Vivirás la final del Mundial 2026 como nunca antes,
        junto a <strong>2 invitados</strong>.
      </p>
      <p style="font-size:16px;line-height:1.65;margin:0 0 16px;color:${C.bone};">
        Nuestro equipo se pondrá en contacto contigo por este mismo correo con los pasos para coordinar
        la entrega de tu premio y los datos de tus acompañantes. <strong>Tienes 2 días corridos</strong>
        para confirmar. ¡Mantente atento!
      </p>`,
  });
}

/* ── Envíos ───────────────────────────────────────────── */

export async function enviarCorreoInscripcion(to: string, nombre: string) {
  return client().emails.send({
    from: from(),
    to,
    subject: "✅ Tu inscripción a Final Experience Betano fue exitosa",
    html: inscripcionHtml(nombre),
  });
}

export async function enviarCorreoGanador(to: string, nombre: string) {
  return client().emails.send({
    from: from(),
    to,
    subject: "🏆 ¡Ganaste la Final Experience Betano!",
    html: ganadorHtml(nombre),
  });
}
