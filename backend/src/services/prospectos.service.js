// src/services/prospectos.service.js
// Registros del formulario "Regístrate" de la página web (sql/64). Reglas puras
// para validar lo que llega de un formulario público, sin BD.

export const INTERESES = {
  tienda: 'Abrir una Tienda VIDA',
  proveedor: 'Ser proveedor o aliado',
  inversion: 'Invertir / asociarme',
  info: 'Información general',
};
export const STATUS_PROSPECTO = ['NUEVO', 'CONTACTADO', 'CONVERTIDO', 'DESCARTADO'];

const texto = (v, max) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// Devuelve { error } o { datos } listos para guardar. `honeypot` es un campo
// oculto que una persona no ve ni llena: si viene con algo, es un robot.
export function validarRegistro(body = {}) {
  if (String(body.sitio_web ?? '').trim()) return { robot: true };
  const Nombre = texto(body.nombre, 150);
  const Email = texto(body.email, 150).toLowerCase();
  const Telefono = texto(body.telefono, 40) || null;
  const Interes = body.interes ? String(body.interes) : null;
  // El mensaje conserva sus saltos de línea
  const Mensaje = String(body.mensaje ?? '').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ').trim().slice(0, 1000) || null;
  if (Nombre.length < 2) return { error: 'Escribe tu nombre' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(Email)) return { error: 'Escribe un correo válido' };
  if (Telefono && !/^[+\d][\d\s().-]{6,}$/.test(Telefono)) return { error: 'Escribe un teléfono válido' };
  if (Interes && !INTERESES[Interes]) return { error: 'Elige qué te interesa' };
  return { datos: { Nombre, Email, Telefono, Interes, Mensaje } };
}
