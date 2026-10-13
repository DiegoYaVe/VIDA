// Correo transaccional (SMTP del .env: EMAIL_HOST/PORT/USER/PASS/FROM) con la
// plantilla de la marca VIDA. Lo usan la recuperación de contraseña y los
// cupones personales; el registro arma su propio correo de confirmación.
import { createTransport } from 'nodemailer';

export const correoConfigurado = (env = process.env) => !!(env.EMAIL_USER && env.EMAIL_PASS);

let transporte = null;
function smtp() {
  if (!transporte) {
    transporte = createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: false,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
  }
  return transporte;
}

export async function enviarCorreo({ to, subject, html }) {
  if (!correoConfigurado()) throw Object.assign(new Error('SMTP no configurado'), { codigo: 'SIN_SMTP' });
  await smtp().sendMail({ from: `"VIDA" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`, to, subject, html });
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// destacado: texto grande centrado (un código o un cupón)
export function plantillaCorreo({ saludo, parrafos = [], destacado = null, pie = '' }) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#F1F8FB;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;"><tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;border:1px solid #D6EAF1;">
      <tr><td style="background:#001034;padding:26px;text-align:center;">
        <div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:2px;">VIDA</div>
      </td></tr>
      <tr><td style="padding:32px;">
        <h2 style="color:#001034;font-size:20px;margin:0 0 12px 0;">${esc(saludo)}</h2>
        ${parrafos.map((p) => `<p style="color:#4B5B73;font-size:15px;line-height:1.6;margin:0 0 14px 0;">${esc(p)}</p>`).join('')}
        ${destacado ? `<div style="margin:22px 0;text-align:center;"><span style="display:inline-block;background:#DDF2F8;color:#001034;
          font-size:30px;font-weight:900;letter-spacing:6px;padding:14px 26px;border-radius:14px;">${esc(destacado)}</span></div>` : ''}
        ${pie ? `<p style="color:#8C9BB0;font-size:12px;text-align:center;margin:18px 0 0 0;">${esc(pie)}</p>` : ''}
      </td></tr>
      <tr><td style="background:#F7FBFD;padding:14px 32px;border-top:1px solid #E6F2F6;text-align:center;">
        <p style="color:#8C9BB0;font-size:11px;margin:0;">VIDA · Correo automático, no respondas a este mensaje.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

// d***o@gmail.com — para decirle al cliente a dónde llegó sin revelar el correo
export function enmascararCorreo(email) {
  const [u, d] = String(email || '').split('@');
  if (!u || !d) return '';
  return `${u[0]}${'*'.repeat(Math.max(2, Math.min(5, u.length - 2)))}${u.length > 1 ? u[u.length - 1] : ''}@${d}`;
}
