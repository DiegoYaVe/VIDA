// src/services/productosTienda.service.js
// Productos propios de cada tienda (sql/60). Un producto con
// idPuntoVentaDueno NULL es del catálogo de VIDA y lo ven todas las tiendas;
// con valor, es propio de esa tienda: solo ella (y VIDA) lo ve y lo cambia.
// Reglas puras, sin BD, para poder probarlas solas.

const ROLES_RED = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO'];
export const esRolRed = (user) => ROLES_RED.includes(user?.TipoUsuario);

// ¿De qué tienda se muestran los productos propios, además del catálogo?
//   · rol de tienda: la suya, siempre (lo que pida por query no cuenta);
//   · rol de red: la que consulte (POS, selector de tienda); sin tienda, todos.
// Devuelve { todos: true } o { pv: idPuntoVenta | null }. pv null = solo catálogo.
export function alcanceProductos(user, pvConsulta = null) {
  if (esRolRed(user)) return pvConsulta ? { pv: String(pvConsulta) } : { todos: true };
  return { pv: user?.idPuntoVenta != null ? String(user.idPuntoVenta) : null };
}

// Fragmento SQL (" AND …") que deja ver el catálogo más los productos propios
// del alcance. Enlaza @pvDueno en `req` cuando hace falta.
export function filtroProductosVisibles(alcance, alias, req, sqlTipos) {
  if (alcance.todos) return '';
  if (!alcance.pv) return ` AND ${alias}.idPuntoVentaDueno IS NULL`;
  req.input('pvDueno', sqlTipos.BigInt, alcance.pv);
  return ` AND (${alias}.idPuntoVentaDueno IS NULL OR ${alias}.idPuntoVentaDueno = @pvDueno)`;
}

export function productoVisible(alcance, idPuntoVentaDueno) {
  if (alcance.todos || idPuntoVentaDueno == null) return true;
  return alcance.pv != null && String(idPuntoVentaDueno) === String(alcance.pv);
}

// ¿Quién puede cambiar un producto (datos, precio, foto, activar/desactivar)?
//   · VIDA (SUPER_ADMIN, la Matriz) y los roles de red: cualquiera;
//   · el ADMIN de una tienda: solo los propios de su tienda. El catálogo de
//     VIDA es el mismo para toda la red; si una tienda lo cambiara, se lo
//     cambiaría a todas.
export function puedeEditarProducto(user, operaMatriz, idPuntoVentaDueno) {
  if (operaMatriz || esRolRed(user)) return true;
  return idPuntoVentaDueno != null && user?.idPuntoVenta != null
    && String(idPuntoVentaDueno) === String(user.idPuntoVenta);
}

// Al crear: la tienda da de alta productos suyos; VIDA y la red, del catálogo.
export function duenoAlCrear(user, operaMatriz) {
  if (operaMatriz || esRolRed(user)) return null;
  return user?.idPuntoVenta ?? null;
}
