// Comprobante de Pago Móvil subido ANTES de crear el pedido. La app lo sube,
// recibe un token y lo manda con el pedido; el pedido y su comprobante se
// registran en la misma transacción, así nunca queda un pedido de Pago Móvil
// sin comprobante porque falló la subida. El archivo previo es del cliente
// (su id va en el nombre) y se borra al usarse o a las 24 h si no se usó.
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

export const TIPOS_COMPROBANTE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const VIGENCIA_MS = 24 * 3600 * 1000;
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export const dirComprobantes = () => path.join(process.cwd(), 'uploads', 'comprobantes');
const prefijo = ({ idBranch, idCuenta, idCliente }) => `prev_${idBranch}_${idCuenta}_${idCliente}_`;

export function tokenValido(token) {
  return typeof token === 'string' && TOKEN.test(token);
}

// Borra previos abandonados (se llama al subir uno nuevo)
function purgarViejos(dir, ahora = Date.now()) {
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.startsWith('prev_')) continue;
      const p = path.join(dir, f);
      try { if (ahora - fs.statSync(p).mtimeMs > VIGENCIA_MS) fs.unlinkSync(p); } catch { /* otro proceso lo tomó */ }
    }
  } catch { /* sin carpeta todavía */ }
}

export function guardarPrevio(ids, mimetype, buffer) {
  const ext = TIPOS_COMPROBANTE[mimetype];
  if (!ext) throw Object.assign(new Error('Solo se permiten imágenes JPG, PNG o WebP'), { statusCode: 400 });
  if (!buffer?.length) throw Object.assign(new Error('No se recibió el comprobante'), { statusCode: 400 });
  const dir = dirComprobantes();
  fs.mkdirSync(dir, { recursive: true });
  purgarViejos(dir);
  const token = `${randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(dir, prefijo(ids) + token), buffer);
  return token;
}

// Ruta del previo de ESTE cliente, o null si no existe o venció
export function rutaPrevio(ids, token, ahora = Date.now()) {
  if (!tokenValido(token)) return null;
  const p = path.join(dirComprobantes(), prefijo(ids) + token);
  try { return ahora - fs.statSync(p).mtimeMs <= VIGENCIA_MS ? p : null; } catch { return null; }
}
