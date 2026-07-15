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
        ¡Tu inscripción fue exitosa! Ya estás participando en
        <strong style="color:${C.ember};">Final Experience Betano</strong>
        donde podrás vivir la Gran Final del Mundial 2026 junto a 2 amigos.
      </p>
      <p style="font-size:15px;line-height:1.6;margin:0;color:${C.bone};">
        Si resultas ganador te avisaremos por este mismo correo. ¡Mucha suerte!
      </p>`,
  });
}

/* ── Correo: aviso a ganadores (tema claro, naranja Betano) ─ */
export function ganadorHtml(nombre: string) {
  const name = escapeHtml(firstName(nombre));
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <style>
    @media only screen and (max-width: 480px) {
      .fe-wrap   { padding: 14px 8px !important; }
      .fe-orange { padding: 20px 18px !important; }
      .fe-foot   { padding: 16px 14px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;">
  <span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden">¡Felicidades! Ganaste el concurso Final Experience Betano. Confirma tu asistencia.</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
    <tr>
      <td class="fe-wrap" align="center" style="padding:20px 12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
          <!-- Header negro con borde blanco -->
          <tr>
            <td align="center" style="background:#000000;padding:18px 20px;border-bottom:4px solid #ffffff;line-height:0;">
              <img src="${IMG.cobranding}" alt="Betano — Promotor Oficial de la Copa Mundial de la FIFA 2026™" width="200" style="display:block;width:100%;max-width:200px;height:auto;margin:0 auto;border:0;" />
            </td>
          </tr>
          <!-- Bloque naranja -->
          <tr>
            <td class="fe-orange" style="background:#FF5A00;padding:25px;color:#ffffff;">
              <div style="text-align:center;">
                <span style="display:inline-block;background:#000000;color:#ffffff;border:1px solid #333333;padding:5px 14px;border-radius:15px;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.04em;">¡Ganaste!</span>
              </div>
              <h1 style="font-size:24px;line-height:1.2;color:#ffffff;margin:16px 0 12px;text-align:center;letter-spacing:-0.5px;">¡Felicidades!</h1>
              <p style="font-size:15px;line-height:1.55;margin:0 0 16px;text-align:center;color:#ffffff;">
                Hola <strong>${name}</strong>, ganaste el concurso para vivir la <strong>Final Experience Betano</strong> y disfrutar la gran final del Mundial 2026 junto a <strong>2 acompañantes</strong>.
              </p>
              <div style="text-align:center;margin:0 0 20px;">
                <img src="${IMG.headerLogo}" alt="Final Experience" width="280" style="display:block;width:85%;max-width:280px;height:auto;margin:0 auto;border:0;border-radius:8px;" />
              </div>
              <!-- Confirmación (responder → reply-to) -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;margin:0;">
                <tr>
                  <td style="padding:18px;text-align:center;font-size:14px;line-height:1.55;color:#333333;">
                    <strong style="color:#111827;">Confirma tu asistencia respondiendo a este correo</strong> y te haremos llegar toda la información del evento.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td class="fe-foot" style="padding:20px 22px;background:#fafafa;border-top:1px solid #eef0f2;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 12px;font-size:13px;line-height:1.55;color:#4b5563;text-align:center;">
                <strong style="color:#111827;">Chilevisión</strong> se contactará contigo una vez que confirmes tu participación. Si no la confirmas, tu cupo pasará a otro participante.
              </p>
              <p style="margin:0;font-size:11px;line-height:1.6;color:#9ca3af;text-align:center;">
                Betano Final Experience · Chile, mayores de 18 años. <a href="https://finalexperience.cl/bases-legales" style="color:#FF5A00;text-decoration:none;">Bases legales</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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

export async function enviarCorreoGanador(
  to: string,
  nombre: string,
  opts?: { replyTo?: string; test?: boolean }
) {
  // Reply-to: override del admin > env por defecto > sin header.
  const replyTo = opts?.replyTo?.trim() || process.env.RESEND_REPLY_TO || undefined;
  return client().emails.send({
    from: from(),
    to,
    replyTo,
    subject: `${opts?.test ? "[PRUEBA] " : ""}¡Estás en la Final Experience Betano!`,
    html: ganadorHtml(nombre),
  });
}
