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

/* ── Imágenes del evento (Cloudinary) ──────────────────── */
const IMG = {
  headerLogo: "https://res.cloudinary.com/ddwytwhln/image/upload/v1782917838/EXPERIENCE_hsefee.png",
  cobranding: "https://res.cloudinary.com/ddwytwhln/image/upload/v1782562282/COOBRANDING_ugyzea.png",
};

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
 * y franja de evento. Usa clases + `!important` para que los clientes de
 * correo que soportan <style> (Gmail app, Apple Mail, Outlook mobile) reduzcan
 * paddings y tamaños de fuente en pantallas angostas.
 */
function shell(opts: { preheader: string; kicker: string; body: string }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <style>
    @media only screen and (max-width: 480px) {
      .fe-wrap   { padding: 20px 8px !important; }
      .fe-body   { padding: 22px 20px !important; }
      .fe-strip  { padding: 14px 20px !important; }
      .fe-foot   { padding: 14px 20px 20px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${C.ash};">
  <span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${opts.preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ash};">
    <tr>
      <td class="fe-wrap" align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${C.char};border:1px solid ${C.smoke};border-radius:14px;overflow:hidden;">
          <!-- Header logo -->
          <tr>
            <td style="padding:0;line-height:0;">
              <img
                src="${IMG.headerLogo}"
                alt="Final Experience"
                width="320"
                style="display:block;width:100%;max-width:320px;height:auto;border:0;margin:0 auto;"
              />
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td class="fe-body" style="padding:26px 28px;font-family:Arial,Helvetica,sans-serif;color:${C.bone};">
              ${opts.body}
            </td>
          </tr>
          <!-- Event strip -->
          <tr>
            <td class="fe-strip" style="padding:16px 28px;border-top:1px solid ${C.smoke};font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${C.boneDim};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:0 0 6px;"><strong style="color:${C.ember};">Fecha</strong> 19 jul 2026 · 12:00 hrs</td>
                </tr>
                <tr>
                  <td style="padding:0;"><strong style="color:${C.ember};">Lugar</strong> Explanada Metropolitan, Vitacura</td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td class="fe-foot" style="padding:14px 28px 20px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:${C.boneDim};border-top:1px solid ${C.smoke};text-align:center;">
              <img
                src="${IMG.cobranding}"
                alt="Betano — Promotor Oficial de la Copa Mundial de la FIFA 2026™"
                width="200"
                style="display:block;width:100%;max-width:200px;height:auto;margin:0 auto 12px;border:0;"
              />
              Concurso Final Experience Betano · Chile, mayores de 18 años.
              <a href="https://finalexperience.cl/bases-legales" style="color:${C.ember};text-decoration:none;display:inline-block;padding:4px 2px;">Bases legales</a>.
            </td>
          </tr>
        </table>
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
    body: `
      <p style="font-size:16px;line-height:1.6;margin:0 0 14px;color:${C.bone};">Hola <strong>${name}</strong>,</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px;color:${C.bone};">
        Tu inscripción a <strong style="color:${C.ember};">Final Experience Betano</strong> fue exitosa.
        Ya participas por vivir la Gran Final del Mundial 2026 en un domo inmersivo, junto a 2 amigos.
      </p>
      <p style="font-size:15px;line-height:1.6;margin:0;color:${C.bone};">
        Si resultas ganador te avisaremos por este mismo correo. ¡Mucha suerte!
      </p>`,
  });
}

/* ── Correo: aviso a ganadores ────────────────────────── */
export function ganadorHtml(nombre: string) {
  const name = escapeHtml(firstName(nombre));
  return shell({
    preheader: "¡Ganaste! Vivirás la final del Mundial 2026 con Final Experience Betano.",
    kicker: "¡Resultaste ganador!",
    body: `
      <p style="font-size:16px;line-height:1.6;margin:0 0 14px;color:${C.bone};">Hola <strong>${name}</strong>,</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px;color:${C.bone};">
        Resultaste <strong style="color:${C.ember};">ganador</strong> de Final Experience Betano.
        Vivirás la final del Mundial 2026 junto a 2 invitados.
      </p>
      <p style="font-size:15px;line-height:1.6;margin:0;color:${C.bone};">
        Te contactaremos por este correo con los siguientes pasos. Tienes <strong>2 días</strong> para confirmar.
      </p>`,
  });
}

/* ── Envíos ───────────────────────────────────────────── */

export async function enviarCorreoInscripcion(to: string, nombre: string) {
  return client().emails.send({
    from: from(),
    to,
    subject: "Tu inscripción a Final Experience Betano fue exitosa",
    html: inscripcionHtml(nombre),
  });
}

export async function enviarCorreoGanador(to: string, nombre: string) {
  return client().emails.send({
    from: from(),
    to,
    subject: "¡Ganaste la Final Experience Betano!",
    html: ganadorHtml(nombre),
  });
}
