// src/controllers/club.controller.js
// Club Digital VIDA — membresía del consumidor. El nivel sube con los puntos
// GANADOS de por vida (compras + racha de hidratación). Nivel 1 desde el registro.
import { getPool, sql } from '../db/sqlserver.js';
import QRCode from 'qrcode';

const codigoMembresia = (idCliente) => `VIDA-${String(idCliente).padStart(6, '0')}`;
const NIVEL_BASE = { Nivel: 1, Nombre: 'Club Vida Digital', MinPuntos: 0, Beneficios: 'Tarjeta digital y acumulación de puntos.', Color: '#54C4E0' };

// Nivel actual = el mayor cuyo MinPuntos ya alcanzó con los puntos ganados de por vida
export function nivelPorPuntos(niveles, puntosGanados) {
  const lista = niveles?.length ? niveles : [NIVEL_BASE];
  let actual = lista[0];
  for (const n of lista) if (puntosGanados >= n.MinPuntos) actual = n;
  return actual;
}

// Nivel del Club de un cliente: { nivel, nombre, puntosGanados, niveles }
export async function nivelDelCliente(pool, idBranch, idCuenta, idCliente) {
  const r = await pool.request()
    .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cli', sql.BigInt, idCliente)
    .query(`SELECT ISNULL(SUM(Puntos),0) AS Ganados FROM VIDA_CLIENTE_PUNTOS
            WHERE idBranch=@b AND idCuenta=@c AND idCliente=@cli AND Tipo='GANADO';
            SELECT Nivel, Nombre, MinPuntos, Beneficios, Color FROM VIDA_CLUB_NIVELES
            WHERE idBranch=@b AND idCuenta=@c AND Status='ACTIVO' ORDER BY Nivel;`);
  const puntosGanados = Number(r.recordsets[0][0]?.Ganados || 0);
  const niveles = r.recordsets[1].length ? r.recordsets[1] : [NIVEL_BASE];
  const actual = nivelPorPuntos(niveles, puntosGanados);
  return { nivel: actual.Nivel, nombre: actual.Nombre, actual, puntosGanados, niveles };
}

// GET /delivery/cliente/membresia
export async function obtenerMembresia(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  try {
    const pool = await getPool();

    // Puntos GANADOS de por vida (excluye canjes/reembolsos) y nivel
    const { puntosGanados, niveles, actual } = await nivelDelCliente(pool, idBranch, idCuenta, idCliente);

    // Datos del cliente para la tarjeta
    const cR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`SELECT Nombre, Apellidos, ISNULL(PuntosSaldo,0) AS PuntosSaldo, FechaAlta
              FROM VIDA_APP_CLIENTES WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);
    const cli = cR.recordset[0] || {};

    const siguiente = niveles.find(n => n.Nivel === actual.Nivel + 1) || null;

    const codigo = codigoMembresia(idCliente);
    let qrDataUrl = null;
    try { qrDataUrl = await QRCode.toDataURL(codigo, { margin: 1, width: 320 }); } catch { /* opcional */ }

    return reply.send({
      codigoMembresia: codigo,
      nombre: `${cli.Nombre || ''} ${cli.Apellidos || ''}`.trim(),
      miembroDesde: cli.FechaAlta || null,
      puntosGanados,
      puntosSaldo: Number(cli.PuntosSaldo || 0),
      nivel: actual.Nivel,
      nombreNivel: actual.Nombre,
      color: actual.Color || '#0A1E3F',
      beneficios: actual.Beneficios || '',
      qrDataUrl,
      siguiente: siguiente ? {
        nivel: siguiente.Nivel, nombre: siguiente.Nombre, minPuntos: siguiente.MinPuntos,
        faltan: Math.max(0, siguiente.MinPuntos - puntosGanados),
      } : null,
      niveles: niveles.map(n => ({ nivel: n.Nivel, nombre: n.Nombre, minPuntos: n.MinPuntos, beneficios: n.Beneficios, color: n.Color })),
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener la membresía' });
  }
}
