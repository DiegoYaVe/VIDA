// src/controllers/suscripcion.controller.js
// Afiliación con kit y mensualidad por nivel (sql/63, tareas 14–16).
// VIDA (SUPER_ADMIN y la Matriz) define los niveles, la configuración del
// cobro y el nivel/kit de cada tienda. La tienda ve su estado y lo que debe.
// Los pagos se registran en Cuentas (son cuentas por cobrar a la tienda).
import { getPool, sql } from '../db/sqlserver.js';
import { conIdUnico } from '../db/idUnico.js';
import { registrarAuditoria } from '../services/audit.service.js';
import { idPuntoVentaMatriz } from '../services/alcance.service.js';
import { prepararMoneda } from '../services/moneda.service.js';
import {
  ORIGEN, hoyVenezuela, estadoSuscripcion, nivelSugerido,
} from '../services/suscripcion.service.js';
import {
  leerConfigSuscripcion, guardarConfigSuscripcion, cargosSuscripcion, estadoDeTienda,
  generarCargosSuscripcion, emitirEnTx, limpiarCache,
} from '../services/suscripcionDatos.service.js';

const num = (v) => (v === '' || v == null ? null : Number(v));

// ── Niveles ──────────────────────────────────────────────────────────────
// GET /suscripcion/niveles
export async function listarNiveles(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT n.idNivel, n.Nombre, n.MaxProductos, n.InscripcionUSD, n.MensualidadUSD, n.KitDescripcion, n.Orden, n.Status,
                     (SELECT COUNT(*) FROM VIDA_CUENTA_PUNTOS_VENTA pv
                      WHERE pv.idBranch=n.idBranch AND pv.idCuenta=n.idCuenta AND pv.idNivel=n.idNivel AND pv.Status='ACTIVO') AS Tiendas
              FROM VIDA_NIVELES_TIENDA n
              WHERE n.idBranch=@idBranch AND n.idCuenta=@idCuenta
              ORDER BY n.Orden, n.idNivel`);
    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener los niveles' });
  }
}

function datosNivel(b = {}) {
  const Nombre = String(b.Nombre || '').trim();
  if (!Nombre) return { error: 'El nombre del nivel es requerido' };
  const MaxProductos = num(b.MaxProductos), Inscripcion = num(b.InscripcionUSD) ?? 0, Mensualidad = num(b.MensualidadUSD) ?? 0;
  if (MaxProductos != null && !(Number.isInteger(MaxProductos) && MaxProductos > 0)) return { error: 'El tope de productos debe ser un número entero mayor que cero (o vacío: sin límite)' };
  if (!(Inscripcion >= 0) || !(Mensualidad >= 0)) return { error: 'La inscripción y la mensualidad no pueden ser negativas' };
  return {
    Nombre: Nombre.slice(0, 80), MaxProductos, Inscripcion, Mensualidad,
    Kit: String(b.KitDescripcion || '').trim().slice(0, 1000) || null,
    Orden: parseInt(b.Orden) || 0, Status: b.Status === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO',
  };
}

// POST /suscripcion/niveles · PUT /suscripcion/niveles/:idNivel
export async function guardarNivel(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const d = datosNivel(request.body);
  if (d.error) return reply.code(400).send({ error: d.error });
  const idNivel = request.params.idNivel ? parseInt(request.params.idNivel) : null;
  try {
    const pool = await getPool();
    const req = () => pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .input('Nombre', sql.VarChar(80), d.Nombre).input('Max', sql.Int, d.MaxProductos)
      .input('Insc', sql.Decimal(18, 2), d.Inscripcion).input('Mens', sql.Decimal(18, 2), d.Mensualidad)
      .input('Kit', sql.VarChar(1000), d.Kit).input('Orden', sql.Int, d.Orden).input('Status', sql.VarChar(20), d.Status);
    if (idNivel) {
      const r = await req().input('idNivel', sql.BigInt, idNivel)
        .query(`UPDATE VIDA_NIVELES_TIENDA SET Nombre=@Nombre, MaxProductos=@Max, InscripcionUSD=@Insc, MensualidadUSD=@Mens,
                  KitDescripcion=@Kit, Orden=@Orden, Status=@Status
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idNivel=@idNivel`);
      if (!r.rowsAffected[0]) return reply.code(404).send({ error: 'Nivel no encontrado' });
      return reply.send({ idNivel, message: 'Nivel actualizado. Las mensualidades ya emitidas no cambian.' });
    }
    const nuevo = await conIdUnico(async () => {
      const id = (await pool.request().input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
        .query(`SELECT ISNULL(MAX(idNivel),0)+1 AS id FROM VIDA_NIVELES_TIENDA WHERE idBranch=@idBranch AND idCuenta=@idCuenta`)).recordset[0].id;
      await req().input('idNivel', sql.BigInt, id).input('Usu', sql.VarChar(30), `U:${idUsuario}`)
        .query(`INSERT INTO VIDA_NIVELES_TIENDA (idBranch,idCuenta,idNivel,Nombre,MaxProductos,InscripcionUSD,MensualidadUSD,KitDescripcion,Orden,Status,UsuAlta)
                VALUES (@idBranch,@idCuenta,@idNivel,@Nombre,@Max,@Insc,@Mens,@Kit,@Orden,@Status,@Usu)`);
      return id;
    });
    return reply.code(201).send({ idNivel: nuevo, message: 'Nivel creado' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al guardar el nivel' });
  }
}

// ── Configuración del cobro ──────────────────────────────────────────────
// GET /suscripcion/config · PUT /suscripcion/config
export async function obtenerConfig(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    return reply.send(await leerConfigSuscripcion(await getPool(), idBranch, idCuenta));
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al leer la configuración' });
  }
}

export async function guardarConfig(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const b = request.body || {};
  const dia = parseInt(b.DiaVencimiento), tol = parseInt(b.DiasTolerancia), multa = Number(b.MultaUSD);
  if (!(dia >= 1 && dia <= 28)) return reply.code(400).send({ error: 'El día de vencimiento va del 1 al 28' });
  if (!(tol >= 0 && tol <= 60)) return reply.code(400).send({ error: 'La tolerancia va de 0 a 60 días' });
  if (!(multa >= 0)) return reply.code(400).send({ error: 'La multa no puede ser negativa' });
  try {
    const pool = await getPool();
    await guardarConfigSuscripcion(pool, idBranch, idCuenta, {
      SuscripcionDiaVencimiento: dia, SuscripcionDiasTolerancia: tol, SuscripcionMultaUSD: multa,
      SuscripcionCorteActivo: b.CorteActivo ? '1' : '0',
      ...(b.DatosPagoVida !== undefined ? { DatosPagoVida: String(b.DatosPagoVida || '').trim() } : {}),
    });
    registrarAuditoria(pool, {
      idBranch, idCuenta, entityType: 'SUSCRIPCION_CONFIG', entityId: idCuenta, accion: 'CONFIGURAR', actor: `U:${idUsuario}`,
      data: { dia, tol, multa, corte: !!b.CorteActivo },
    }, request.log).catch(() => {});
    return reply.send({ message: 'Configuración guardada' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al guardar la configuración' });
  }
}

// ── Tiendas ──────────────────────────────────────────────────────────────
// GET /suscripcion/tiendas → cada tienda con su nivel, kit, productos, estado y deuda
export async function listarTiendasSuscripcion(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const pool = await getPool();
    const [cfg, nivR, pvR, cargos] = await Promise.all([
      leerConfigSuscripcion(pool, idBranch, idCuenta),
      pool.request().input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
        .query(`SELECT idNivel, Nombre, MaxProductos, InscripcionUSD, MensualidadUSD, Orden, Status
                FROM VIDA_NIVELES_TIENDA WHERE idBranch=@idBranch AND idCuenta=@idCuenta`),
      pool.request().input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
        .query(`SELECT pv.idPuntoVenta, pv.NomComercial, pv.Ciudad, pv.Estado, pv.idNivel, pv.KitEntrega, pv.KitNotas,
                       CONVERT(char(10), pv.FechaAfiliacion, 23) AS FechaAfiliacion,
                       (SELECT COUNT(*) FROM VIDA_INVENTARIO_STOCK s
                        JOIN VIDA_INVENTARIO_PRODUCTOS p ON p.idBranch=s.idBranch AND p.idCuenta=s.idCuenta AND p.idProducto=s.idProducto AND p.Status='ACTIVO'
                        WHERE s.idBranch=pv.idBranch AND s.idCuenta=pv.idCuenta AND s.idPuntoVenta=pv.idPuntoVenta AND s.Cantidad > 0) AS Productos
                FROM VIDA_CUENTA_PUNTOS_VENTA pv
                WHERE pv.idBranch=@idBranch AND pv.idCuenta=@idCuenta AND pv.Status='ACTIVO' AND ISNULL(pv.EsMatriz,0)=0
                ORDER BY pv.NomComercial`),
      cargosSuscripcion(pool, idBranch, idCuenta),
    ]);
    const niveles = nivR.recordset;
    const hoy = hoyVenezuela();
    return reply.send({
      config: { ...cfg, DatosPagoVida: undefined },
      tiendas: pvR.recordset.map(t => {
        const deudas = cargos.filter(c => String(c.idPuntoVenta) === String(t.idPuntoVenta));
        const est = estadoSuscripcion({ tieneNivel: t.idNivel != null, deudas, hoy, toleranciaDias: cfg.DiasTolerancia, corteActivo: cfg.CorteActivo });
        const sug = nivelSugerido(niveles, t.Productos);
        return {
          ...t, ...est,
          NombreNivel: niveles.find(n => String(n.idNivel) === String(t.idNivel))?.Nombre || null,
          idNivelSugerido: sug?.idNivel ?? null, NombreNivelSugerido: sug?.Nombre ?? null,
          cargos: deudas.map(({ idDocumento, OrigenTipo, Notas, FechaVencimiento, Saldo }) => ({ idDocumento, OrigenTipo, Notas, FechaVencimiento, Saldo })),
        };
      }),
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener las tiendas' });
  }
}

// PUT /suscripcion/tiendas/:idPuntoVenta { idNivel, KitEntrega, KitNotas, FechaAfiliacion? }
// Al asignar el primer nivel queda afiliada (hoy, o la fecha indicada) y nace
// el cargo de inscripción del nivel. Cambiar de nivel después no cobra otra
// inscripción: cambia la mensualidad desde el siguiente cargo.
export async function asignarNivelTienda(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const idPuntoVenta = parseInt(request.params.idPuntoVenta);
  const b = request.body || {};
  const idNivel = b.idNivel === '' || b.idNivel == null ? null : parseInt(b.idNivel);
  const kit = b.KitEntrega || null;
  if (kit && !['PENDIENTE', 'PARCIAL', 'COMPLETO'].includes(kit)) return reply.code(400).send({ error: 'Entrega del kit inválida' });
  const fecha = b.FechaAfiliacion ? String(b.FechaAfiliacion).slice(0, 10) : null;
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return reply.code(400).send({ error: 'Fecha de afiliación inválida' });
  try {
    const pool = await getPool();
    const actualR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('pv', sql.BigInt, idPuntoVenta)
      .query(`SELECT pv.idNivel, pv.EsMatriz, CONVERT(char(10), pv.FechaAfiliacion, 23) AS FechaAfiliacion
              FROM VIDA_CUENTA_PUNTOS_VENTA pv WHERE pv.idBranch=@idBranch AND pv.idCuenta=@idCuenta AND pv.idPuntoVenta=@pv`);
    const actual = actualR.recordset[0];
    if (!actual) return reply.code(404).send({ error: 'Tienda no encontrada' });
    if (actual.EsMatriz) return reply.code(400).send({ error: 'La Matriz es VIDA: no paga mensualidad' });
    let nivel = null;
    if (idNivel != null) {
      nivel = (await pool.request()
        .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('n', sql.BigInt, idNivel)
        .query(`SELECT idNivel, Nombre, InscripcionUSD FROM VIDA_NIVELES_TIENDA
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idNivel=@n AND Status='ACTIVO'`)).recordset[0];
      if (!nivel) return reply.code(400).send({ error: 'Ese nivel no existe o está inactivo' });
    }
    const afiliacion = idNivel == null ? actual.FechaAfiliacion : (actual.FechaAfiliacion || fecha || hoyVenezuela());
    await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('pv', sql.BigInt, idPuntoVenta)
      .input('idNivel', sql.BigInt, idNivel).input('Kit', sql.VarChar(12), kit)
      .input('KitNotas', sql.VarChar(500), String(b.KitNotas || '').trim().slice(0, 500) || null)
      .input('Fecha', sql.Date, afiliacion)
      .query(`UPDATE VIDA_CUENTA_PUNTOS_VENTA SET idNivel=@idNivel, KitEntrega=@Kit, KitNotas=@KitNotas, FechaAfiliacion=@Fecha, FechaMod=GETUTCDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@pv`);

    // Inscripción: una sola vez por tienda (idOrigen = la tienda)
    let inscripcion = null;
    if (nivel && Number(nivel.InscripcionUSD) > 0 && actual.idNivel == null) {
      await prepararMoneda(pool, request.user);
      inscripcion = await emitirEnTx(pool, {
        idBranch, idCuenta, Tipo: 'CXC', OrigenTipo: ORIGEN.INSCRIPCION, idOrigen: idPuntoVenta,
        idPuntoVenta, idPuntoVentaEmisor: await idPuntoVentaMatriz(pool, idBranch, idCuenta),
        TotalUSD: Number(nivel.InscripcionUSD), DiasPlazo: 0,
        Notas: `Inscripción a VIDA con kit · ${nivel.Nombre}`, UsuAlta: idUsuario,
      });
    }
    limpiarCache();
    registrarAuditoria(pool, {
      idBranch, idCuenta, entityType: 'PUNTO_VENTA', entityId: idPuntoVenta, accion: 'NIVEL_SUSCRIPCION', actor: `U:${idUsuario}`,
      data: { antes: actual.idNivel, despues: idNivel, kit },
    }, request.log).catch(() => {});
    return reply.send({ message: 'Tienda actualizada', inscripcionEmitida: !!(inscripcion && !inscripcion.yaExistia) });
  } catch (err) {
    request.log.error(err);
    return reply.code(err.statusCode || 500).send({ error: err.statusCode ? err.message : 'Error al actualizar la tienda' });
  }
}

// POST /suscripcion/generar → corre ahora lo que hace el job diario (solo esta cuenta)
export async function generarAhora(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const r = await generarCargosSuscripcion(await getPool(), request.log, { idBranch, idCuenta });
    return reply.send(r);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al generar los cargos' });
  }
}

// ── La tienda ────────────────────────────────────────────────────────────
// GET /suscripcion/mia → estado de la tienda del usuario, lo que debe y cómo pagar
export async function miSuscripcion(request, reply) {
  const { idBranch, idCuenta, idPuntoVenta } = request.user;
  if (!idPuntoVenta) return reply.send({ estado: 'SIN_PLAN' });
  try {
    const pool = await getPool();
    const [estado, cfg, cargos, nivR] = await Promise.all([
      estadoDeTienda(pool, idBranch, idCuenta, idPuntoVenta),
      leerConfigSuscripcion(pool, idBranch, idCuenta),
      cargosSuscripcion(pool, idBranch, idCuenta, idPuntoVenta),
      pool.request().input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('pv', sql.BigInt, idPuntoVenta)
        .query(`SELECT n.Nombre, n.MensualidadUSD, pv.KitEntrega FROM VIDA_CUENTA_PUNTOS_VENTA pv
                LEFT JOIN VIDA_NIVELES_TIENDA n ON n.idBranch=pv.idBranch AND n.idCuenta=pv.idCuenta AND n.idNivel=pv.idNivel
                WHERE pv.idBranch=@idBranch AND pv.idCuenta=@idCuenta AND pv.idPuntoVenta=@pv`),
    ]);
    return reply.send({
      ...estado,
      nivel: nivR.recordset[0]?.Nombre || null, MensualidadUSD: Number(nivR.recordset[0]?.MensualidadUSD || 0),
      DiasTolerancia: cfg.DiasTolerancia, CorteActivo: cfg.CorteActivo, DatosPagoVida: cfg.DatosPagoVida,
      cargos: cargos.map(({ idDocumento, OrigenTipo, Notas, FechaVencimiento, Saldo }) => ({ idDocumento, OrigenTipo, Notas, FechaVencimiento, Saldo })),
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al consultar la suscripción' });
  }
}
