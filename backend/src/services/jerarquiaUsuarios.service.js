// Jerarquía para gestionar usuarios del panel. Cada rol solo crea, edita o
// desactiva usuarios de un rango ESTRICTAMENTE inferior al suyo, dentro de su
// ámbito geográfico, y solo les da módulos que él mismo tiene:
//   SUPER_ADMIN > ADMIN_PAIS > ADMIN_ESTADO > ADMIN (tienda) > SUPERVISOR > CAJERO
// Excepción: el SUPER_ADMIN también gestiona a otros SUPER_ADMIN (decisión de
// negocio, 2026-10-09). Nadie se gestiona a sí mismo desde Usuarios.
import { sql } from '../db/sqlserver.js';
import { ROLES_TIENDA } from './alcance.service.js';

export const RANGO_ROL = { SUPER_ADMIN: 0, ADMIN_PAIS: 1, ADMIN_ESTADO: 2, ADMIN: 3, SUPERVISOR: 4, CAJERO: 5, CASHIER: 5 };
const ASIGNABLES = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN', 'SUPERVISOR', 'CAJERO']; // CASHIER = alias histórico de CAJERO

export const esRolValido = (rol) => Object.prototype.hasOwnProperty.call(RANGO_ROL, rol);

export function puedeGestionarRol(rolCaller, rolTarget) {
  if (!esRolValido(rolCaller) || !esRolValido(rolTarget)) return false;
  if (rolCaller === 'SUPER_ADMIN') return true;
  return RANGO_ROL[rolTarget] > RANGO_ROL[rolCaller];
}

// Quienes administran usuarios (el SUPERVISOR solo los consulta)
export const ROLES_GESTORES = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN'];
export const rolesAsignables = (rolCaller) => (ROLES_GESTORES.includes(rolCaller)
  ? ASIGNABLES.filter((r) => puedeGestionarRol(rolCaller, r)) : []);

const vacio = (v) => v == null || v === '';

// Completa la ubicación a partir de lo más específico: la tienda define su
// estado y su país; el estado define su país.
export async function resolverUbicacion(pool, idBranch, idCuenta, { idPuntoVenta, idEstado, idPais }) {
  const u = { idPuntoVenta: vacio(idPuntoVenta) ? null : idPuntoVenta, idEstado: vacio(idEstado) ? null : idEstado, idPais: vacio(idPais) ? null : idPais };
  const req = () => pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta);
  if (u.idPuntoVenta != null) {
    const t = (await req().input('pv', sql.BigInt, u.idPuntoVenta)
      .query(`SELECT idEstado, idPais FROM VIDA_CUENTA_PUNTOS_VENTA WHERE idBranch=@b AND idCuenta=@c AND idPuntoVenta=@pv`)).recordset[0];
    if (!t) return { error: 'La tienda no existe' };
    u.idEstado = t.idEstado ?? u.idEstado;
    u.idPais = t.idPais ?? u.idPais;
  }
  if (u.idEstado != null && u.idPais == null) {
    const e = (await req().input('e', sql.BigInt, u.idEstado)
      .query(`SELECT idPais FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@b AND idCuenta=@c AND idEstado=@e`)).recordset[0];
    if (!e) return { error: 'El estado no existe' };
    u.idPais = e.idPais;
  }
  return u;
}

// ¿La ubicación (ya resuelta) cae dentro del ámbito del usuario que gestiona?
export function ubicacionEnAlcance(caller, u) {
  const igual = (a, b) => a != null && b != null && String(a) === String(b);
  switch (caller?.TipoUsuario) {
    case 'SUPER_ADMIN': return true;
    // Sin país asignado ve toda la cuenta (mismo criterio que alcance.service)
    case 'ADMIN_PAIS': return caller.idPais == null || igual(u.idPais, caller.idPais);
    case 'ADMIN_ESTADO': return igual(u.idEstado, caller.idEstado);
    case 'ADMIN': return igual(u.idPuntoVenta, caller.idPuntoVenta);
    default: return false;
  }
}

// Ámbito del usuario nuevo o editado según su rol, validado contra quien lo
// gestiona. Devuelve { idPuntoVenta, idEstado, idPais } o { error, status }.
export async function ambitoParaRol(pool, caller, rolTarget, body) {
  const { idBranch, idCuenta } = caller;
  let pedido;
  if (ROLES_TIENDA.includes(rolTarget)) {
    // El ADMIN de tienda solo da de alta en su propia tienda
    const pv = caller.TipoUsuario === 'ADMIN' && vacio(body.idPuntoVenta) ? caller.idPuntoVenta : body.idPuntoVenta;
    if (vacio(pv)) return { error: 'Elige la tienda del usuario', status: 400 };
    pedido = { idPuntoVenta: pv };
  } else if (rolTarget === 'ADMIN_ESTADO') {
    if (vacio(body.idEstado)) return { error: 'Elige el estado del administrador', status: 400 };
    pedido = { idEstado: body.idEstado };
  } else if (rolTarget === 'ADMIN_PAIS') {
    const pais = vacio(body.idPais) && caller.TipoUsuario === 'ADMIN_PAIS' ? caller.idPais : body.idPais;
    if (vacio(pais)) return { error: 'Elige el país del administrador', status: 400 };
    pedido = { idPais: pais };
  } else {
    pedido = {};
  }
  const u = await resolverUbicacion(pool, idBranch, idCuenta, pedido);
  if (u.error) return { error: u.error, status: 400 };
  if (!ubicacionEnAlcance(caller, u)) return { error: 'Solo puedes gestionar usuarios de tu ámbito (tu país, estado o tienda)', status: 403 };
  return u;
}

// Módulos que el usuario puede asignar: null = todos (SUPER_ADMIN); si no,
// los que él mismo tiene activos.
export async function modulosAsignables(pool, caller) {
  if (caller.TipoUsuario === 'SUPER_ADMIN') return null;
  const r = await pool.request()
    .input('b', sql.BigInt, caller.idBranch).input('c', sql.BigInt, caller.idCuenta).input('u', sql.BigInt, caller.idUsuario)
    .query(`SELECT idPantalla FROM VIDA_CUENTA_PANTALLAS_ACCESOS_USUARIO
            WHERE idBranch=@b AND idCuenta=@c AND idUsuario=@u AND StatusAcceso='ACTIVO'`);
  return new Set(r.recordset.map((x) => String(x.idPantalla)));
}

// Módulos finales al guardar. `actuales` son los que ya tenía (edición): los
// que quien edita no puede asignar se conservan tal cual (no los ve ni los
// quita). Agregar uno que no tiene → error.
export function modulosFinales(pedidos, permitidos, actuales = []) {
  const pedidosS = [...new Set((pedidos || []).map(String))];
  if (permitidos == null) return { modulos: pedidosS };
  const actualesS = new Set(actuales.map(String));
  const nuevosNoPermitidos = pedidosS.filter((p) => !permitidos.has(p) && !actualesS.has(p));
  if (nuevosNoPermitidos.length) return { error: 'No puedes dar acceso a módulos que tú no tienes' };
  const conservados = [...actualesS].filter((p) => !permitidos.has(p));
  return { modulos: [...new Set([...pedidosS.filter((p) => permitidos.has(p)), ...conservados])] };
}
