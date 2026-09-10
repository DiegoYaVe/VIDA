// src/controllers/club.controller.js
// Club Digital VIDA — membresía del consumidor. El nivel sube con los puntos
// GANADOS de por vida (compras + racha de hidratación). Nivel 1 desde el registro.
import { getPool, sql } from '../db/sqlserver.js';
import QRCode from 'qrcode';

const codigoMembresia = (idCliente) => `VIDA-${String(idCliente).padStart(6, '0')}`;

// GET /delivery/cliente/membresia
export async function obtenerMembresia(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  try {
    const pool = await getPool();

    // Puntos GANADOS de por vida (excluye canjes/reembolsos)
    const gR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`SELECT ISNULL(SUM(Puntos),0) AS Ganados
              FROM VIDA_CLIENTE_PUNTOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente AND Tipo='GANADO'`);
    const puntosGanados = Number(gR.recordset[0]?.Ganados || 0);

    // Datos del cliente para la tarjeta
    const cR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`SELECT Nombre, Apellidos, ISNULL(PuntosSaldo,0) AS PuntosSaldo, FechaAlta
              FROM VIDA_APP_CLIENTES WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);
    const cli = cR.recordset[0] || {};

    // Catálogo de niveles
    const nR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT Nivel, Nombre, MinPuntos, Beneficios, Color
              FROM VIDA_CLUB_NIVELES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Status='ACTIVO'
              ORDER BY Nivel`);
    let niveles = nR.recordset;
    // Fallback si no hay seed cargado
    if (!niveles.length) niveles = [{ Nivel: 1, Nombre: 'Club Vida Digital', MinPuntos: 0, Beneficios: 'Tarjeta digital y acumulación de puntos.', Color: '#54C4E0' }];

    // Nivel actual = el mayor cuyo MinPuntos ya alcanzó
    let actual = niveles[0];
    for (const n of niveles) if (puntosGanados >= n.MinPuntos) actual = n;
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
