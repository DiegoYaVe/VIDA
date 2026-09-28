import { convertirImporte, leerMoneda, prepararMoneda } from './moneda.service.js';
// src/services/cuentas.service.js
// Motor único de cuentas por pagar y por cobrar (sql/37).
//
// Las dos son el mismo objeto con distinta contraparte, así que el ciclo de
// vida, el vencimiento y los abonos se escriben UNA sola vez y sirven para las
// dos. Dos reglas que no se negocian:
//
//   1. El saldo se DERIVA (TotalUSD - SUM(abonos)); no hay columna Saldo. Ya
//      hay dos columnas de saldo sumadas a mano en este sistema
//      (VIDA_REPARTIDORES.SaldoPendiente y VIDA_APP_CLIENTES.PuntosSaldo) y las
//      dos se van a negativo cuando dos procesos escriben a la vez.
//   2. Un abono nunca se borra ni se edita. Revertirlo es insertar otro en
//      negativo, igual que VIDA_CLIENTE_PUNTOS.
import { sql } from '../db/sqlserver.js';

export const TIPOS   = ['CXP', 'CXC'];
export const ORIGENES = ['RECEPCION_OC', 'TRASPASO_MATRIZ'];
export const METODOS = ['EFECTIVO', 'TRANSFERENCIA', 'PAGO_MOVIL', 'TARJETA', 'OTRO'];

const dec = (v) => Math.round((Number(v) || 0) * 10000) / 10000;

// Status derivado del saldo. Nunca se decide a mano.
//
// `acreditado` son las notas de crédito: deuda perdonada. Cuentan para cerrar
// el documento igual que un abono, pero se pasan aparte porque no son dinero
// que entró — el reporte de cobranza necesita poder distinguirlos.
export function statusPorSaldo(total, abonado, acreditado = 0) {
  const t = dec(total), a = dec(abonado), nc = dec(acreditado);
  const cubierto = dec(a + nc);
  if (cubierto <= 0) return 'ABIERTA';
  // Cerrado solo por notas de crédito, sin un peso cobrado: es una cancelación
  if (cubierto >= t && a <= 0 && nc > 0) return 'CANCELADA';
  if (cubierto >= t) return 'LIQUIDADA';
  return 'PARCIAL';
}

async function nextIdTx(tx, tabla, campo, idBranch, idCuenta) {
  const r = await new sql.Request(tx)
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(${campo}),0)+1 AS next
            FROM ${tabla} WITH (UPDLOCK, HOLDLOCK)
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);
  return r.recordset[0].next;
}

// Suma de abonos de un documento, leída DENTRO de la transacción dada.
export async function abonadoTx(tx, idBranch, idCuenta, idDocumento) {
  const r = await new sql.Request(tx)
    .input('idBranch',    sql.BigInt, idBranch)
    .input('idCuenta',    sql.BigInt, idCuenta)
    .input('idDocumento', sql.BigInt, idDocumento)
    .query(`SELECT ISNULL(SUM(MontoUSD),0) AS abonado
            FROM VIDA_CUENTAS_ABONOS
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idDocumento=@idDocumento`);
  return dec(r.recordset[0].abonado);
}

// Suma de notas de crédito de un documento, leída DENTRO de la transacción.
export async function acreditadoTx(tx, idBranch, idCuenta, idDocumento) {
  const r = await new sql.Request(tx)
    .input('idBranch',    sql.BigInt, idBranch)
    .input('idCuenta',    sql.BigInt, idCuenta)
    .input('idDocumento', sql.BigInt, idDocumento)
    .query(`SELECT ISNULL(SUM(MontoUSD),0) AS acreditado
            FROM VIDA_CUENTAS_NOTAS_CREDITO
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idDocumento=@idDocumento`);
  return dec(r.recordset[0].acreditado);
}

// ── Emitir un documento ─────────────────────────────────────────────────────
// Se llama DENTRO de la transacción que registra el hecho que le da origen (la
// recepción de mercancía, el traspaso), para que la deuda y la mercancía entren
// o no entren juntas.
//
// Idempotente por el índice único (Tipo, OrigenTipo, idOrigen): si el hecho se
// reintenta, devuelve el documento que ya existía en vez de duplicar la deuda.
export async function emitirCuenta(tx, {
  idBranch, idCuenta, Tipo, OrigenTipo, idOrigen,
  idProveedor = null, idPuntoVenta = null, idPuntoVentaEmisor = null,
  TotalUSD, DiasPlazo = 0, Folio = null, Notas = null, UsuAlta = null,
}) {
  if (!TIPOS.includes(Tipo))        throw new Error(`Tipo de cuenta inválido: ${Tipo}`);
  if (!ORIGENES.includes(OrigenTipo)) throw new Error(`Origen inválido: ${OrigenTipo}`);

  const total = dec(TotalUSD);
  if (!(total > 0)) return null;   // nada que cobrar ni que pagar

  // ¿Ya existía? (reintento del hecho de origen)
  const yaR = await new sql.Request(tx)
    .input('idBranch',   sql.BigInt,      idBranch)
    .input('idCuenta',   sql.BigInt,      idCuenta)
    .input('Tipo',       sql.VarChar(3),  Tipo)
    .input('OrigenTipo', sql.VarChar(20), OrigenTipo)
    .input('idOrigen',   sql.BigInt,      idOrigen)
    .query(`SELECT TOP 1 idDocumento, TotalUSD FROM VIDA_CUENTAS WITH (UPDLOCK, HOLDLOCK)
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta
              AND Tipo=@Tipo AND OrigenTipo=@OrigenTipo AND idOrigen=@idOrigen`);
  if (yaR.recordset.length) {
    return { idDocumento: yaR.recordset[0].idDocumento, TotalUSD: dec(yaR.recordset[0].TotalUSD), yaExistia: true };
  }

  const idDocumento = await nextIdTx(tx, 'VIDA_CUENTAS', 'idDocumento', idBranch, idCuenta);
  const plazo = Math.max(0, parseInt(DiasPlazo) || 0);

  await new sql.Request(tx)
    .input('idBranch',           sql.BigInt,       idBranch)
    .input('idCuenta',           sql.BigInt,       idCuenta)
    .input('idDocumento',        sql.BigInt,       idDocumento)
    .input('Tipo',               sql.VarChar(3),   Tipo)
    .input('idProveedor',        sql.BigInt,       Tipo === 'CXP' ? idProveedor : null)
    .input('idPuntoVenta',       sql.BigInt,       Tipo === 'CXC' ? idPuntoVenta : null)
    .input('idPuntoVentaEmisor', sql.BigInt,       idPuntoVentaEmisor)
    .input('OrigenTipo',         sql.VarChar(20),  OrigenTipo)
    .input('idOrigen',           sql.BigInt,       idOrigen)
    .input('Folio',              sql.VarChar(50),  Folio)
    .input('TotalUSD',           sql.Decimal(18,4), total)
    .input('DiasPlazo',          sql.Int,          plazo)
    .input('Notas',              sql.VarChar(500), Notas)
    .input('UsuAlta',            sql.VarChar(30),  UsuAlta == null ? null : String(UsuAlta))
    // FechaEmision y FechaVencimiento se calculan en el server de BD para que no
    // dependan de la zona horaria del proceso de Node (el desfase que ya mordió
    // en caja, commit c8730023).
    .query(`INSERT INTO VIDA_CUENTAS
              (idBranch, idCuenta, idDocumento, Tipo, idProveedor, idPuntoVenta,
               idPuntoVentaEmisor, OrigenTipo, idOrigen, Folio, TotalUSD,
               FechaEmision, DiasPlazo, FechaVencimiento, Status, Notas, UsuAlta)
            VALUES
              (@idBranch, @idCuenta, @idDocumento, @Tipo, @idProveedor, @idPuntoVenta,
               @idPuntoVentaEmisor, @OrigenTipo, @idOrigen, @Folio, @TotalUSD,
               CAST(GETUTCDATE() AS DATE), @DiasPlazo,
               DATEADD(DAY, @DiasPlazo, CAST(GETUTCDATE() AS DATE)),
               'ABIERTA', @Notas, @UsuAlta)`);

  return { idDocumento, TotalUSD: total, yaExistia: false };
}

// ── Registrar un abono ──────────────────────────────────────────────────────
// Corre en su propia transacción. El SELECT del documento con UPDLOCK serializa
// los abonos concurrentes sobre el MISMO documento: sin eso, dos abonos de $50
// contra un saldo de $60 se leen los dos como válidos y el documento termina
// sobrepagado.
//
// `liquidar: true` ignora el monto y abona exactamente el saldo pendiente, que
// es la "liquidación en una sola exhibición".
export async function registrarAbono(pool, {
  idBranch, idCuenta, idDocumento, MontoUSD, liquidar = false,
  MetodoPago = null, Referencia = null, Notas = null, UsuAlta = null,
  permitirNegativo = false, Moneda = 'USD', MontoOriginal, idTasa, ReversoDe = null,
}) {
  if (!permitirNegativo) await prepararMoneda(pool,{idBranch,idCuenta,idUsuario:UsuAlta});
  const tx = new sql.Transaction(pool);
  let enTx = false;
  try {
    await tx.begin(); enTx = true;

    const docR = await new sql.Request(tx)
      .input('idBranch',    sql.BigInt, idBranch)
      .input('idCuenta',    sql.BigInt, idCuenta)
      .input('idDocumento', sql.BigInt, idDocumento)
      .query(`SELECT idDocumento, Tipo, TotalUSD, Status
              FROM VIDA_CUENTAS WITH (UPDLOCK, HOLDLOCK)
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idDocumento=@idDocumento`);

    const doc = docR.recordset[0];
    if (!doc) { await tx.rollback(); return { ok: false, code: 404, error: 'Cuenta no encontrada' }; }
    if (doc.Status === 'CANCELADA') {
      await tx.rollback();
      return { ok: false, code: 409, error: 'La cuenta está cancelada' };
    }

    const total      = dec(doc.TotalUSD);
    const abonado    = await abonadoTx(tx, idBranch, idCuenta, idDocumento);
    const acreditado = await acreditadoTx(tx, idBranch, idCuenta, idDocumento);
    const saldo      = dec(total - abonado - acreditado);

    let conversion;
    let tasaId = null;
    if (permitirNegativo) {
      if (!ReversoDe) throw Object.assign(new Error('Se requiere el abono original'), {statusCode:400});
      const origen = await new sql.Request(tx).input('b',sql.BigInt,idBranch).input('c',sql.BigInt,idCuenta)
        .input('d',sql.BigInt,idDocumento).input('a',sql.BigInt,ReversoDe)
        .query(`SELECT * FROM VIDA_CUENTAS_ABONOS WITH (UPDLOCK,HOLDLOCK)
          WHERE idBranch=@b AND idCuenta=@c AND idDocumento=@d AND idAbono=@a;
          SELECT idAbono FROM VIDA_CUENTAS_ABONOS WHERE idBranch=@b AND idCuenta=@c AND idDocumento=@d AND ReversoDe=@a;`);
      const o=origen.recordsets[0][0];
      if (!o || Number(o.MontoUSD)<=0 || origen.recordsets[1].length)
        throw Object.assign(new Error('Abono inexistente o ya reversado'),{statusCode:409});
      conversion={MonedaOriginal:o.MonedaOriginal || 'USD',MontoOriginal:-Number(o.MontoOriginal ?? o.MontoUSD),MontoUSD:-Number(o.MontoUSD),MontoVES:o.MontoVES == null?null:-Number(o.MontoVES),TasaVESporUSD:o.TasaVESporUSD};
      tasaId=o.idTasa;
    } else {
      const cfg=await leerMoneda(tx,idBranch,idCuenta);
      if (cfg.Modo !== 'AMBAS' && cfg.Modo !== Moneda)
        throw Object.assign(new Error('Esta moneda no está habilitada en Cuentas'),{statusCode:400});
      const tasa=cfg.tasa?.Vigente ? cfg.tasa : null;
      if (!tasa) throw Object.assign(new Error('No hay tasa vigente; actualízala antes de cobrar'),{statusCode:409});
      if (tasa && String(idTasa)!==String(tasa.idTasa))
        throw Object.assign(new Error('Confirma la tasa vigente recargando el formulario'),{statusCode:409});
      const original=liquidar ? (Moneda==='USD'?saldo:dec(saldo*Number(tasa.VESporUSD))) : (MontoOriginal ?? MontoUSD);
      conversion=convertirImporte(original,Moneda,tasa?.VESporUSD ?? null);
      tasaId=tasa?.idTasa ?? null;
    }
    const monto = conversion.MontoUSD;

    if (monto === 0) { await tx.rollback(); return { ok: false, code: 400, error: 'El monto no puede ser 0' }; }
    if (monto < 0 && !permitirNegativo) {
      await tx.rollback();
      return { ok: false, code: 400, error: 'El monto debe ser mayor a 0' };
    }
    if (monto > 0 && saldo <= 0) {
      await tx.rollback();
      return { ok: false, code: 409, error: 'La cuenta ya está liquidada' };
    }
    if (monto > saldo) {
      await tx.rollback();
      return { ok: false, code: 422, error: `El abono ($${monto.toFixed(2)}) supera el saldo pendiente ($${saldo.toFixed(2)})`, saldo };
    }
    // Un reverso no puede dejar lo abonado por debajo de 0
    if (monto < 0 && abonado + monto < 0) {
      await tx.rollback();
      return { ok: false, code: 422, error: 'El reverso supera lo abonado', abonado };
    }
    if (MetodoPago && !METODOS.includes(MetodoPago)) {
      await tx.rollback();
      return { ok: false, code: 400, error: `Método de pago inválido (${METODOS.join('|')})` };
    }

    const idAbono = await nextIdTx(tx, 'VIDA_CUENTAS_ABONOS', 'idAbono', idBranch, idCuenta);
    await new sql.Request(tx)
      .input('idBranch',    sql.BigInt,       idBranch)
      .input('idCuenta',    sql.BigInt,       idCuenta)
      .input('idAbono',     sql.BigInt,       idAbono)
      .input('idDocumento', sql.BigInt,       idDocumento)
      .input('MontoUSD',    sql.Decimal(18,4), monto)
      .input('MonedaOriginal',sql.VarChar(3),conversion.MonedaOriginal)
      .input('MontoOriginal',sql.Decimal(18,4),conversion.MontoOriginal)
      .input('MontoVES',sql.Decimal(18,4),conversion.MontoVES)
      .input('TasaVESporUSD',sql.Decimal(18,8),conversion.TasaVESporUSD)
      .input('idTasa',sql.BigInt,tasaId)
      .input('ReversoDe',sql.BigInt,ReversoDe)
      .input('MetodoPago',  sql.VarChar(20),  MetodoPago)
      .input('Referencia',  sql.VarChar(100), Referencia)
      .input('Notas',       sql.VarChar(300), Notas)
      .input('UsuAlta',     sql.VarChar(30),  UsuAlta == null ? null : String(UsuAlta))
      .query(`INSERT INTO VIDA_CUENTAS_ABONOS
                (idBranch, idCuenta, idAbono, idDocumento, MontoUSD, FechaAbono,
                 MetodoPago, Referencia, Notas, UsuAlta,MonedaOriginal,MontoOriginal,MontoVES,TasaVESporUSD,idTasa,ReversoDe)
              VALUES
                (@idBranch, @idCuenta, @idAbono, @idDocumento, @MontoUSD,
                 CAST(GETUTCDATE() AS DATE), @MetodoPago, @Referencia, @Notas, @UsuAlta,@MonedaOriginal,@MontoOriginal,@MontoVES,@TasaVESporUSD,@idTasa,@ReversoDe)`);

    const nuevoAbonado = dec(abonado + monto);
    const nuevoStatus  = statusPorSaldo(total, nuevoAbonado, acreditado);

    await new sql.Request(tx)
      .input('idBranch',    sql.BigInt,      idBranch)
      .input('idCuenta',    sql.BigInt,      idCuenta)
      .input('idDocumento', sql.BigInt,      idDocumento)
      .input('Status',      sql.VarChar(20), nuevoStatus)
      .query(`UPDATE VIDA_CUENTAS SET Status=@Status, FechaMod=GETUTCDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idDocumento=@idDocumento`);

    await tx.commit(); enTx = false;

    return {
      ok: true, idAbono, monto,
      total, abonado: nuevoAbonado, acreditado,
      saldo: dec(total - nuevoAbonado - acreditado),
      Status: nuevoStatus,
    };
  } catch (err) {
    if (enTx) { try { await tx.rollback(); } catch { /* la tx ya murió */ } }
    throw err;
  }
}

// ── Nota de crédito ─────────────────────────────────────────────────────────
// Para cancelar una cuenta que YA tenía abonos: el caso del traspaso que se
// revierte después de que la sucursal pagó una parte.
//
// No borra ni edita nada. Emite un documento que perdona deuda, y opcionalmente
// devuelve lo ya cobrado como abono en negativo. Los dos conceptos quedan
// separados a propósito: la NC dice cuánto se dejó de cobrar y el abono negativo
// dice cuánto dinero volvió a salir.
//
//   cancelarTotal: true  → acredita TODO el saldo pendiente y cierra la cuenta
//   MontoUSD             → acredita solo esa parte (rebaja parcial)
//   reintegrar: true     → además devuelve lo abonado con un abono en negativo
export async function emitirNotaCredito(pool, {
  idBranch, idCuenta, idDocumento, MontoUSD, cancelarTotal = false,
  Motivo, reintegrar = false, UsuAlta = null,
}) {
  const motivo = String(Motivo || '').trim().slice(0, 300);
  if (motivo.length < 3) return { ok: false, code: 400, error: 'Indicá el motivo de la nota de crédito' };

  if (reintegrar) return {ok:false,code:409,error:'Reversa cada abono desde su historial para conservar su moneda y tasa; después emite la nota de crédito'};
  const tx = new sql.Transaction(pool);
  let enTx = false;
  try {
    await tx.begin(); enTx = true;

    // UPDLOCK: serializa contra abonos concurrentes sobre el mismo documento.
    // Sin esto, un abono y una NC simultáneos leen el mismo saldo y entre los
    // dos dejan la cuenta sobrecubierta.
    const docR = await new sql.Request(tx)
      .input('idBranch',    sql.BigInt, idBranch)
      .input('idCuenta',    sql.BigInt, idCuenta)
      .input('idDocumento', sql.BigInt, idDocumento)
      .query(`SELECT idDocumento, Tipo, TotalUSD, Status
              FROM VIDA_CUENTAS WITH (UPDLOCK, HOLDLOCK)
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idDocumento=@idDocumento`);

    const doc = docR.recordset[0];
    if (!doc) { await tx.rollback(); return { ok: false, code: 404, error: 'Cuenta no encontrada' }; }
    if (doc.Status === 'CANCELADA') {
      await tx.rollback();
      return { ok: false, code: 409, error: 'La cuenta ya está cancelada' };
    }

    const total      = dec(doc.TotalUSD);
    const abonado    = await abonadoTx(tx, idBranch, idCuenta, idDocumento);
    const acreditado = await acreditadoTx(tx, idBranch, idCuenta, idDocumento);
    const saldo      = dec(total - abonado - acreditado);

    const monto = cancelarTotal ? saldo : dec(MontoUSD);

    if (!(monto > 0)) {
      await tx.rollback();
      return { ok: false, code: 400, error: cancelarTotal ? 'La cuenta no tiene saldo que acreditar' : 'El monto debe ser mayor a 0' };
    }
    if (monto > saldo) {
      await tx.rollback();
      return { ok: false, code: 422, error: `La nota de crédito ($${monto.toFixed(2)}) supera el saldo pendiente ($${saldo.toFixed(2)})`, saldo };
    }

    // Lo que se devuelve hay que perdonarlo TAMBIEN: un abono en negativo baja
    // lo abonado, y si la NC no lo cubre el saldo vuelve a subir y la cuenta
    // recien cancelada queda debiendo otra vez.
    //   saldo = total - abonado - acreditado
    // Devolver X baja `abonado` en X, asi que el credito tiene que subir en X.
    const aReintegrar = (reintegrar && abonado > 0) ? abonado : 0;
    const montoNota = dec(monto + aReintegrar);

    const idNota = await nextIdTx(tx, 'VIDA_CUENTAS_NOTAS_CREDITO', 'idNota', idBranch, idCuenta);
    await new sql.Request(tx)
      .input('idBranch',      sql.BigInt,       idBranch)
      .input('idCuenta',      sql.BigInt,       idCuenta)
      .input('idNota',        sql.BigInt,       idNota)
      .input('idDocumento',   sql.BigInt,       idDocumento)
      .input('MontoUSD',      sql.Decimal(18,4), montoNota)
      .input('Motivo',        sql.VarChar(300), motivo)
      .input('CancelaCuenta', sql.Bit,          cancelarTotal ? 1 : 0)
      .input('UsuAlta',       sql.VarChar(30),  UsuAlta == null ? null : String(UsuAlta))
      .query(`INSERT INTO VIDA_CUENTAS_NOTAS_CREDITO
                (idBranch, idCuenta, idNota, idDocumento, MontoUSD, Motivo,
                 CancelaCuenta, FechaNota, UsuAlta)
              VALUES
                (@idBranch, @idCuenta, @idNota, @idDocumento, @MontoUSD, @Motivo,
                 @CancelaCuenta, CAST(GETUTCDATE() AS DATE), @UsuAlta)`);

    // Devolución de lo ya cobrado: abono en negativo, no un DELETE de los abonos
    let reintegrado = 0;
    if (aReintegrar > 0) {
      const idAbono = await nextIdTx(tx, 'VIDA_CUENTAS_ABONOS', 'idAbono', idBranch, idCuenta);
      await new sql.Request(tx)
        .input('idBranch',    sql.BigInt,       idBranch)
        .input('idCuenta',    sql.BigInt,       idCuenta)
        .input('idAbono',     sql.BigInt,       idAbono)
        .input('idDocumento', sql.BigInt,       idDocumento)
        .input('MontoUSD',    sql.Decimal(18,4), -abonado)
        .input('Notas',       sql.VarChar(300), `Reintegro por nota de crédito #${idNota}: ${motivo}`)
        .input('UsuAlta',     sql.VarChar(30),  UsuAlta == null ? null : String(UsuAlta))
        .query(`INSERT INTO VIDA_CUENTAS_ABONOS
                  (idBranch, idCuenta, idAbono, idDocumento, MontoUSD, FechaAbono, Notas, UsuAlta)
                VALUES
                  (@idBranch, @idCuenta, @idAbono, @idDocumento, @MontoUSD,
                   CAST(GETUTCDATE() AS DATE), @Notas, @UsuAlta)`);
      reintegrado = abonado;
    }

    const abonadoFinal    = dec(abonado - reintegrado);
    const acreditadoFinal = dec(acreditado + montoNota);
    // El status sale del cálculo, no de una decisión: si se devolvió todo lo
    // cobrado y la NC cubrió el resto, queda en 0 y se marca CANCELADA.
    const nuevoStatus = cancelarTotal && abonadoFinal <= 0
      ? 'CANCELADA'
      : statusPorSaldo(total, abonadoFinal, acreditadoFinal);

    await new sql.Request(tx)
      .input('idBranch',    sql.BigInt,      idBranch)
      .input('idCuenta',    sql.BigInt,      idCuenta)
      .input('idDocumento', sql.BigInt,      idDocumento)
      .input('Status',      sql.VarChar(20), nuevoStatus)
      .query(`UPDATE VIDA_CUENTAS SET Status=@Status, FechaMod=GETUTCDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idDocumento=@idDocumento`);

    await tx.commit(); enTx = false;

    return {
      ok: true, idNota, monto: montoNota, perdonado: monto, reintegrado,
      total, abonado: abonadoFinal, acreditado: acreditadoFinal,
      saldo: dec(total - abonadoFinal - acreditadoFinal),
      Status: nuevoStatus,
    };
  } catch (err) {
    if (enTx) { try { await tx.rollback(); } catch { /* la tx ya murió */ } }
    throw err;
  }
}

// SELECT reutilizable: el documento con su saldo derivado y su contraparte
// resuelta. `Vencida` se calcula en la consulta, no se guarda como estado.
export const SELECT_CUENTA = `
  SELECT c.idDocumento, c.Tipo, c.Folio, c.TotalUSD, c.FechaEmision,
         c.DiasPlazo, c.FechaVencimiento, c.Status, c.Notas, c.FechaAlta,
         c.OrigenTipo, c.idOrigen, c.idProveedor, c.idPuntoVenta,
         ISNULL(ab.Abonado, 0)    AS Abonado,
         ISNULL(nc.Acreditado, 0) AS Acreditado,
         c.TotalUSD - ISNULL(ab.Abonado, 0) - ISNULL(nc.Acreditado, 0) AS Saldo,
         CASE WHEN c.Status IN ('ABIERTA','PARCIAL')
               AND c.TotalUSD - ISNULL(ab.Abonado,0) - ISNULL(nc.Acreditado,0) > 0
               AND c.FechaVencimiento IS NOT NULL
               AND c.FechaVencimiento < CAST(GETUTCDATE() AS DATE)
              THEN 1 ELSE 0 END AS Vencida,
         DATEDIFF(DAY, CAST(GETUTCDATE() AS DATE), c.FechaVencimiento) AS DiasParaVencer,
         pr.Nombre        AS NombreProveedor,
         pv.NomComercial  AS NombreSucursal
  FROM VIDA_CUENTAS c
  OUTER APPLY (SELECT SUM(a.MontoUSD) AS Abonado
               FROM VIDA_CUENTAS_ABONOS a
               WHERE a.idBranch=c.idBranch AND a.idCuenta=c.idCuenta
                 AND a.idDocumento=c.idDocumento) ab
  OUTER APPLY (SELECT SUM(n.MontoUSD) AS Acreditado
               FROM VIDA_CUENTAS_NOTAS_CREDITO n
               WHERE n.idBranch=c.idBranch AND n.idCuenta=c.idCuenta
                 AND n.idDocumento=c.idDocumento) nc
  LEFT JOIN VIDA_PROVEEDORES pr
    ON pr.idBranch=c.idBranch AND pr.idCuenta=c.idCuenta AND pr.idProveedor=c.idProveedor
  LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA pv
    ON pv.idBranch=c.idBranch AND pv.idCuenta=c.idCuenta AND pv.idPuntoVenta=c.idPuntoVenta
`;
