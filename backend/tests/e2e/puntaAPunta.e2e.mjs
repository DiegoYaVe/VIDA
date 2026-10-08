// E2E de punta a punta contra QA con los controladores reales (sin HTTP):
//  A) Pago Móvil VES: comprobante previo → pedido → aprobación → repartidor → entrega → factura
//  B) Efectivo USD con IGTF (tienda contribuyente especial): pedido → entrega → liquidación → factura
//  C) Venta offline rechazada que al reintentar SÍ se registra
// Las facturas se emiten en una transacción REVERTIDA (son inmutables). Los
// push a Expo se bloquean en este proceso (nada llega a teléfonos). Al final se
// borran pedidos, comprobantes, movimientos, puntos, liquidación, cotización y
// el repartidor de prueba, y se restauran stock, puntos del cliente y la tienda.
// Quedan solo las filas de auditoría (inmutables).
//
// Escribe en la BD de backend/.env: solo contra QA. Uso:
//   RUN_E2E_QA=1 npm run test:e2e
// Se niega a correr si la BD no parece de QA (nombre sin "qa"). Requiere en
// QA la tienda 3 con stock del producto 1, el cliente 1 y una tasa vigente.
import { pathToFileURL, fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const BK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
process.chdir(BK); // las imágenes van a backend/uploads
(await import('dotenv')).default.config({ path: path.join(BK, '.env') });
if (process.env.RUN_E2E_QA !== '1') { console.log('E2E omitida: usa RUN_E2E_QA=1 (escribe en la BD de QA)'); process.exit(0); }
if (!/qa/i.test(process.env.DB_DATABASE || '')) { console.error(`E2E abortada: la BD "${process.env.DB_DATABASE}" no parece de QA`); process.exit(1); }

// ── Bloquear push reales ────────────────────────────────────────────────────
const fetchReal = globalThis.fetch;
const pushes = [];
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('exp.host')) { pushes.push(JSON.parse(opts?.body || '[]')); return new Response(JSON.stringify({ data: [] }), { status: 200 }); }
  return fetchReal(url, opts);
};

const D = await import(pathToFileURL(BK + '/src/controllers/delivery.controller.js').href);
const P = await import(pathToFileURL(BK + '/src/controllers/pedidos.controller.js').href);
const { cotizarMonedaPOS } = await import(pathToFileURL(BK + '/src/controllers/posMoneda.controller.js').href);
const F = await import(pathToFileURL(BK + '/src/services/factura.service.js').href);
const { promocionesVigentes, calcularLinea } = await import(pathToFileURL(BK + '/src/controllers/promociones.controller.js').href);
const { getPool, sql } = await import(pathToFileURL(BK + '/src/db/sqlserver.js').href);

const log = { error: (e) => console.error('   log.error:', e?.message || e), info() {}, warn() {} };
const CLIENTE = { idBranch: '1', idCuenta: '1', idCliente: '1' };
const PANEL = { idBranch: '1', idCuenta: '1', idUsuario: '1', TipoUsuario: 'SUPER_ADMIN', idPuntoVenta: null };
const PV = 3, PROD = 1, CANT = 2;
const red2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const mkReply = () => { const r = { _code: 200 }; r.code = c => { r._code = c; return r; }; r.send = o => { r._payload = o; return r; }; return r; };
const run = async (fn, req) => { const reply = mkReply(); const ret = await fn({ log, ...req }, reply); if (reply._payload === undefined && ret && ret !== reply) reply._payload = ret; return reply; };
let fallas = 0;
const ok = (c, m) => { console.log(c ? '  ✓' : '  ❌', m); if (!c) fallas++; };
const pool = await getPool();
const q = async (s, inputs = {}) => { const rq = pool.request(); for (const [k, [t, v]] of Object.entries(inputs)) rq.input(k, t, v); return (await rq.query(s)).recordset; };
const pedido = async (id) => (await q(`SELECT * FROM VIDA_PEDIDOS WHERE idBranch=1 AND idCuenta=1 AND idPedido=${Number(id)}`))[0];

const creados = [];
let idRep = null, idCotPOS = null, uuidC = null, archivos = [];
const tiendaAntes = (await q(`SELECT ContribuyenteEspecial FROM VIDA_CUENTA_PUNTOS_VENTA WHERE idBranch=1 AND idCuenta=1 AND idPuntoVenta=${PV}`))[0];
const stockAntes = (await q(`SELECT Cantidad FROM VIDA_INVENTARIO_STOCK WHERE idBranch=1 AND idCuenta=1 AND idPuntoVenta=${PV} AND idProducto=${PROD}`))[0]?.Cantidad;
const puntosAntes = (await q(`SELECT ISNULL(PuntosSaldo,0) s FROM VIDA_APP_CLIENTES WHERE idBranch=1 AND idCuenta=1 AND idCliente=1`))[0].s;
const auditAntes = (await q(`SELECT COUNT(*) n FROM VIDA_AUDIT_LOG`))[0].n;
const maxMov = (await q(`SELECT ISNULL(MAX(idMovimiento),0) m FROM VIDA_INVENTARIO_MOVIMIENTOS WHERE idBranch=1 AND idCuenta=1`))[0].m;

// Factura en transacción revertida: datos fiscales de prueba solo dentro de ella
async function facturaRevertida(idPedido) {
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx).query(`UPDATE VIDA_CUENTA_PUNTOS_VENTA SET RIF='J000029610', RazonSocial=ISNULL(RazonSocial,'TIENDA PRUEBA'),
      DomicilioFiscal=ISNULL(DomicilioFiscal,'Av. de prueba'), ModalidadFiscal='IMPRENTA_DIGITAL' WHERE idBranch=1 AND idCuenta=1 AND idPuntoVenta=${PV}`);
    const r = await F.emitirFactura(tx, PANEL, { idPedido, receptor: { Documento: 'V12345678', Nombre: 'Cliente de prueba' } });
    return await F.obtenerFactura(tx, PANEL, r.idFactura);
  } finally { try { await tx.rollback(); } catch { /* ya revertida */ } }
}

async function entregar(idPedido, rep) {
  for (const s of ['IR_A_SUCURSAL', 'EN_SUCURSAL', 'EN_CAMINO', 'ENTREGADO']) {
    const r = await run(D.actualizarStatusPedido, { repartidor: rep, body: { idPedido, nuevoStatus: s } });
    if (r._code !== 200) return `${s}: ${r._code} ${JSON.stringify(r._payload)}`;
  }
  return 'ok';
}

try {
  console.log(`tienda ${PV} · producto ${PROD} · stock ${stockAntes} · puntos cliente ${puntosAntes}`);
  // Repartidor de prueba (no se toca el saldo de nadie real)
  idRep = Number((await q(`SELECT ISNULL(MAX(idRepartidor),0)+1 n FROM VIDA_REPARTIDORES WHERE idBranch=1 AND idCuenta=1`))[0].n);
  await q(`INSERT INTO VIDA_REPARTIDORES (idBranch,idCuenta,idRepartidor,Nombre,Telefono,ComisionPct,StatusRepartidor,Status,StatusAprobacion)
           VALUES (1,1,${idRep},'E2E Repartidor — borrar','0000',10,'DISPONIBLE','ACTIVO','APROBADO')`);
  const REP = { idBranch: '1', idCuenta: '1', idRepartidor: String(idRep) };
  await q(`UPDATE VIDA_CUENTA_PUNTOS_VENTA SET ContribuyenteEspecial=1 WHERE idBranch=1 AND idCuenta=1 AND idPuntoVenta=${PV}`);

  const prod = (await q(`SELECT idProducto, PrecioUSD, idCategoria FROM VIDA_INVENTARIO_PRODUCTOS WHERE idBranch=1 AND idCuenta=1 AND idProducto=${PROD}`))[0];
  const subtotal = red2(calcularLinea(await promocionesVigentes(pool, 1, 1), prod, CANT).subtotal);
  let r = await run(D.cotizacionMonedaCliente, { cliente: CLIENTE, query: { idPuntoVenta: PV } });
  ok(r._code === 200 && r._payload.AplicaIGTF === true, `cotización del cliente: modo ${r._payload?.Modo}, IGTF ${r._payload?.AplicaIGTF}`);
  const tasa = r._payload.tasa, tc = Number(tasa.VESporUSD);
  console.log(`   tasa ${tc} · subtotal ${subtotal} USD`);

  // ══ A) Pago Móvil ══════════════════════════════════════════════════════════
  console.log('\n== A) Pago Móvil VES ==');
  r = await run(D.subirComprobantePrevio, { cliente: CLIENTE, file: async () => ({ mimetype: 'image/png', filename: 'c.png', fields: {}, toBuffer: async () => Buffer.from('png-e2e') }) });
  const token = r._payload?.token;
  r = await run(D.crearPedidoApp, { cliente: CLIENTE, body: {
    idPuntoVenta: PV, items: [{ idProducto: PROD, Cantidad: CANT }], MetodoPago: 'PAGO_MOVIL', DireccionEntrega: 'E2E punta a punta — borrar',
    PagoMoneda: { idTasa: tasa.idTasa, Moneda: 'VES', MontoOriginal: red2(subtotal * tc) }, Comprobante: { token, Referencia: 'REF-E2E-A' } } });
  const A = r._payload?.idPedido; if (A) creados.push(A);
  ok(r._code === 201 && r._payload.ComprobanteRegistrado, `pedido A #${A} creado con comprobante (${r._code})`);
  const compA = (await q(`SELECT idComprobante, ImagenURL FROM VIDA_PEDIDOS_COMPROBANTES WHERE idBranch=1 AND idCuenta=1 AND idPedido=${A}`))[0];
  r = await run(P.revisarComprobante, { user: PANEL, params: { idPedido: String(A), idComprobante: String(compA.idComprobante) }, body: { StatusRevision: 'APROBADO' } });
  let pA = await pedido(A);
  ok(r._code === 200 && pA.Status === 'BUSCANDO_REPARTIDOR' && pA.StatusPago === 'PAGADO', `aprobado → ${pA.Status}/${pA.StatusPago}`);
  r = await run(D.aceptarPedido, { repartidor: REP, body: { idPedido: A } });
  ok(r._code === 200, `repartidor acepta A (${r._code}${r._code !== 200 ? ' ' + JSON.stringify(r._payload) : ''})`);
  r = await run(D.pedidosActivos, { repartidor: REP });
  const actA = (r._payload || []).find(p => Number(p.idPedido) === Number(A));
  ok(actA?.Cobro?.CobrarEfectivo === false, 'la app del repartidor dice: no cobrar efectivo (Pago Móvil)');
  ok((await entregar(A, REP)) === 'ok', 'A: sucursal → en camino → entregado');
  pA = await pedido(A);
  const stockTrasA = (await q(`SELECT Cantidad FROM VIDA_INVENTARIO_STOCK WHERE idBranch=1 AND idCuenta=1 AND idPuntoVenta=${PV} AND idProducto=${PROD}`))[0].Cantidad;
  ok(Number(stockTrasA) === Math.max(0, Number(stockAntes) - CANT), `stock descontado ${stockAntes} → ${stockTrasA}`);
  ok(Math.abs(Number(pA.ComisionRepartidor) - subtotal * 0.1) < 0.0001 && pA.MontoEfectivoRepartidor == null, `comisión ${Number(pA.ComisionRepartidor).toFixed(2)} y nada que rendir`);
  const ptsA = (await q(`SELECT Puntos FROM VIDA_CLIENTE_PUNTOS WHERE idBranch=1 AND idCuenta=1 AND idPedido=${A} AND Tipo='GANADO'`))[0];
  ok(ptsA?.Puntos > 0, `cliente ganó ${ptsA?.Puntos} puntos`);
  const fA = await facturaRevertida(A);
  ok(Number(fA.TotalVES) === red2(subtotal * tc) && Number(fA.IGTFVES) === 0, `factura A: total ${fA.TotalVES} Bs = lo cobrado, IGTF 0 (pagó en Bs)`);

  // ══ B) Efectivo USD con IGTF ═══════════════════════════════════════════════
  console.log('\n== B) Efectivo USD con IGTF ==');
  const igtf = red2(subtotal * 0.03), cobro = red2(subtotal + igtf);
  r = await run(D.crearPedidoApp, { cliente: CLIENTE, body: {
    idPuntoVenta: PV, items: [{ idProducto: PROD, Cantidad: CANT }], MetodoPago: 'EFECTIVO', DireccionEntrega: 'E2E punta a punta — borrar',
    PagoMoneda: { idTasa: tasa.idTasa, Moneda: 'USD', MontoOriginal: subtotal } } });
  ok(r._code === 409, `sin el IGTF en el monto → 409 (${r._code})`);
  r = await run(D.crearPedidoApp, { cliente: CLIENTE, body: {
    idPuntoVenta: PV, items: [{ idProducto: PROD, Cantidad: CANT }], MetodoPago: 'EFECTIVO', DireccionEntrega: 'E2E punta a punta — borrar',
    PagoMoneda: { idTasa: tasa.idTasa, Moneda: 'USD', MontoOriginal: cobro } } });
  const B = r._payload?.idPedido; if (B) creados.push(B);
  ok(r._code === 201 && r._payload.PagoMoneda?.TotalCobradoUSD === cobro && r._payload.PagoMoneda?.IGTFUSD === igtf && r._payload.TotalUSD === subtotal, `pedido B #${B}: venta $${r._payload?.TotalUSD} + IGTF $${r._payload?.PagoMoneda?.IGTFUSD} = $${r._payload?.PagoMoneda?.TotalCobradoUSD}`);
  r = await run(D.aceptarPedido, { repartidor: REP, body: { idPedido: B } });
  ok(r._code === 200, `repartidor acepta B (${r._code})`);
  r = await run(D.pedidosActivos, { repartidor: REP });
  const actB = (r._payload || []).find(p => Number(p.idPedido) === Number(B));
  ok(actB?.Cobro?.Moneda === 'USD' && actB.Cobro.Monto === cobro && actB.Cobro.IGTFUSD === igtf, `la app del repartidor: cobrar $${actB?.Cobro?.Monto} con IGTF`);
  ok((await entregar(B, REP)) === 'ok', 'B: sucursal → en camino → entregado');
  const pB = await pedido(B);
  const comB = red2(subtotal * 0.1);
  ok(red2(pB.MontoEfectivoRepartidor) === red2(cobro - comB), `rinde $${red2(pB.MontoEfectivoRepartidor)} = cobrado $${cobro} − comisión $${comB}`);
  let rep = (await q(`SELECT SaldoPendiente, SaldoPendienteVES FROM VIDA_REPARTIDORES WHERE idBranch=1 AND idCuenta=1 AND idRepartidor=${idRep}`))[0];
  ok(red2(rep.SaldoPendiente) === red2(cobro - comB) && Number(rep.SaldoPendienteVES) === 0, `saldo del repartidor $${red2(rep.SaldoPendiente)} USD, 0 Bs`);
  r = await run(D.liquidarRepartidor, { user: PANEL, params: { idRepartidor: String(idRep) }, body: { Observaciones: 'E2E' } });
  ok(r._code === 200 && red2(r._payload.MontoLiquidadoUSD) === red2(cobro - comB), `liquidación $${r._payload?.MontoLiquidadoUSD} (${r._code})`);
  rep = (await q(`SELECT SaldoPendiente FROM VIDA_REPARTIDORES WHERE idBranch=1 AND idCuenta=1 AND idRepartidor=${idRep}`))[0];
  ok(Number(rep.SaldoPendiente) === 0 && (await pedido(B)).idLiquidacionRepartidor != null, 'saldo en cero y el pedido queda liquidado');
  const fB = await facturaRevertida(B);
  const baseVES = red2(subtotal * tc);
  ok(Number(fB.IGTFBaseVES) === baseVES && Number(fB.IGTFVES) === red2(baseVES * 0.03), `factura B: IGTF ${fB.IGTFVES} Bs sobre ${fB.IGTFBaseVES} Bs; a pagar ${fB.TotalPagarVES} Bs`);

  // ══ C) Venta offline rechazada que al reintentar se registra ════════════════
  console.log('\n== C) Venta offline: rechazo → revisión → reintento OK ==');
  r = await run(cotizarMonedaPOS, { user: PANEL, body: { idPuntoVenta: PV } });
  idCotPOS = r._payload?.idCotizacion;
  ok(!!idCotPOS, `cotización POS ${idCotPOS?.slice(0, 8)} (modo ${r._payload?.Modo}, IGTF ${r._payload?.AplicaIGTF})`);
  const precio = Number(prod.PrecioUSD), totalC = red2(precio);
  const igtfC = r._payload?.AplicaIGTF ? red2(totalC * 0.03) : 0;
  uuidC = 'e2e-pap-' + Date.now();
  const ventaC = { ClienteUUID: uuidC, idPuntoVenta: PV, FechaVenta: new Date().toISOString(),
    items: [{ idProducto: PROD, Cantidad: 1, PrecioUnitario: precio }],
    PagoMoneda: { idCotizacion: idCotPOS, Moneda: 'USD', Metodo: 'EFECTIVO', Efectivo: red2(totalC + igtfC), Tarjeta: 0 } };
  // El cajero fue movido a otra tienda antes de sincronizar: el servidor la rechaza
  r = await run(P.sincronizarVentasOffline, { user: { ...PANEL, TipoUsuario: 'ADMIN', idPuntoVenta: String(PV + 1000) }, body: { ventas: [ventaC] } });
  ok(r._payload.failed?.[0]?.enRevision === true, `rechazada y en revisión: ${r._payload.failed?.[0]?.motivo}`);
  r = await run(P.reintentarVentaRevision, { user: PANEL, params: { uuid: uuidC } });
  const C = r._payload?.idPedido; if (C) creados.push(C);
  ok(r._code === 200 && C, `reintento registra el pedido #${C} (${r._code}${r._code !== 200 ? ' ' + JSON.stringify(r._payload) : ''})`);
  const fila = (await q(`SELECT Status, idPedido, idUsuarioResuelve FROM VIDA_POS_VENTAS_REVISION WHERE idBranch=1 AND idCuenta=1 AND ClienteUUID='${uuidC}'`))[0];
  ok(fila?.Status === 'REGISTRADA' && Number(fila.idPedido) === Number(C), `revisión REGISTRADA con su pedido`);
  const pC = await pedido(C);
  ok(pC?.ClienteUUID === uuidC && pC.Canal === 'POS' && red2(pC.TotalUSD) === totalC, `pedido POS con el UUID de la venta, total $${pC?.TotalUSD}${pC?.VentaTardia ? ' (venta tardía / fuera de turno)' : ''}`);
  r = await run(P.sincronizarVentasOffline, { user: PANEL, body: { ventas: [ventaC] } });
  ok(r._payload.synced?.[0]?.duplicado === true, 'el POS la reenvía → se reconoce como ya registrada (idempotente)');
  ok(pushes.length >= 0, `push bloqueados en este proceso: ${pushes.length}`);
} catch (e) {
  fallas++; console.error('💥', e);
} finally {
  console.log('\n== Limpieza ==');
  try {
    if (tiendaAntes) await q(`UPDATE VIDA_CUENTA_PUNTOS_VENTA SET ContribuyenteEspecial=${tiendaAntes.ContribuyenteEspecial ? 1 : 0} WHERE idBranch=1 AND idCuenta=1 AND idPuntoVenta=${PV}`);
    const ids = creados.map(Number).filter(Boolean);
    if (ids.length) {
      for (const { ImagenURL } of await q(`SELECT ImagenURL FROM VIDA_PEDIDOS_COMPROBANTES WHERE idBranch=1 AND idCuenta=1 AND idPedido IN (${ids.join(',')})`))
        archivos.push(path.join(process.cwd(), ImagenURL));
      // Toda tabla con idPedido (menos auditoría y facturas), en varias pasadas por las FK
      const tablas = (await q(`SELECT DISTINCT TABLE_NAME t FROM INFORMATION_SCHEMA.COLUMNS c
        WHERE COLUMN_NAME='idPedido' AND TABLE_NAME LIKE 'VIDA[_]%' AND TABLE_NAME NOT LIKE 'VIDA_AUDIT%' AND TABLE_NAME NOT LIKE 'VIDA_FACTURA%'
          AND EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES x WHERE x.TABLE_NAME=c.TABLE_NAME AND x.TABLE_TYPE='BASE TABLE')`)).map(x => x.t);
      for (let pasada = 0; pasada < 4; pasada++) {
        for (const t of [...tablas.filter(t => t !== 'VIDA_PEDIDOS'), 'VIDA_PEDIDOS']) {
          try { await q(`DELETE FROM ${t} WHERE idBranch=1 AND idCuenta=1 AND idPedido IN (${ids.join(',')})`); } catch { /* FK: otra pasada */ }
        }
      }
      await q(`DELETE FROM VIDA_INVENTARIO_MOVIMIENTOS WHERE idBranch=1 AND idCuenta=1 AND idMovimiento>${maxMov} AND Referencia IN (${ids.map(i => `'${i}'`).join(',')})`);
    }
    if (idRep) {
      await q(`DELETE FROM VIDA_REPARTIDOR_LIQUIDACIONES WHERE idBranch=1 AND idCuenta=1 AND idRepartidor=${idRep}`);
      const tablasRep = (await q(`SELECT DISTINCT c.TABLE_NAME t FROM INFORMATION_SCHEMA.COLUMNS c JOIN INFORMATION_SCHEMA.TABLES x ON x.TABLE_NAME=c.TABLE_NAME AND x.TABLE_TYPE='BASE TABLE'
        WHERE c.COLUMN_NAME='idRepartidor' AND c.TABLE_NAME LIKE 'VIDA[_]%' AND c.TABLE_NAME NOT IN ('VIDA_REPARTIDORES','VIDA_PEDIDOS') AND c.TABLE_NAME NOT LIKE 'VIDA_AUDIT%'`)).map(x => x.t);
      for (const t of tablasRep) { try { await q(`DELETE FROM ${t} WHERE idBranch=1 AND idCuenta=1 AND idRepartidor=${idRep}`); } catch (e) { console.log('   no se pudo limpiar', t, e.message); } }
      await q(`DELETE FROM VIDA_REPARTIDORES WHERE idBranch=1 AND idCuenta=1 AND idRepartidor=${idRep}`);
    }
    if (uuidC) await q(`DELETE FROM VIDA_POS_VENTAS_REVISION WHERE idBranch=1 AND idCuenta=1 AND ClienteUUID='${uuidC}'`);
    if (idCotPOS) await q(`DELETE FROM VIDA_POS_COTIZACIONES WHERE idCotizacion='${idCotPOS}'`);
    if (stockAntes != null) await q(`UPDATE VIDA_INVENTARIO_STOCK SET Cantidad=${Number(stockAntes)} WHERE idBranch=1 AND idCuenta=1 AND idPuntoVenta=${PV} AND idProducto=${PROD}`);
    await q(`UPDATE VIDA_APP_CLIENTES SET PuntosSaldo=${Number(puntosAntes)} WHERE idBranch=1 AND idCuenta=1 AND idCliente=1`);
    for (const f of archivos) { try { fs.unlinkSync(f); } catch {} }
    for (const f of fs.existsSync('uploads/comprobantes') ? fs.readdirSync('uploads/comprobantes') : [])
      if (f.startsWith('prev_1_1_1_')) { try { fs.unlinkSync(path.join('uploads/comprobantes', f)); } catch {} }

    const quedan = creados.length ? (await q(`SELECT COUNT(*) n FROM VIDA_PEDIDOS WHERE idBranch=1 AND idCuenta=1 AND idPedido IN (${creados.join(',')})`))[0].n : 0;
    const stockFin = (await q(`SELECT Cantidad FROM VIDA_INVENTARIO_STOCK WHERE idBranch=1 AND idCuenta=1 AND idPuntoVenta=${PV} AND idProducto=${PROD}`))[0]?.Cantidad;
    const puntosFin = (await q(`SELECT ISNULL(PuntosSaldo,0) s FROM VIDA_APP_CLIENTES WHERE idBranch=1 AND idCuenta=1 AND idCliente=1`))[0].s;
    const tiendaFin = (await q(`SELECT ContribuyenteEspecial FROM VIDA_CUENTA_PUNTOS_VENTA WHERE idBranch=1 AND idCuenta=1 AND idPuntoVenta=${PV}`))[0];
    const facturas = creados.length ? (await q(`SELECT COUNT(*) n FROM VIDA_FACTURAS WHERE idBranch=1 AND idCuenta=1 AND idPedido IN (${creados.join(',')})`))[0].n : 0;
    const auditFin = (await q(`SELECT COUNT(*) n FROM VIDA_AUDIT_LOG`))[0].n;
    ok(quedan === 0, `pedidos de prueba borrados (${creados.join(', ')})`);
    ok(Number(stockFin) === Number(stockAntes) && Number(puntosFin) === Number(puntosAntes), `stock ${stockFin} y puntos ${puntosFin} restaurados`);
    ok(!!tiendaFin?.ContribuyenteEspecial === !!tiendaAntes?.ContribuyenteEspecial, 'tienda restaurada (contribuyente especial como estaba)');
    ok(facturas === 0, 'sin facturas (se emitieron en transacción revertida)');
    console.log(`   auditoría: ${auditFin - auditAntes} fila(s) nuevas (inmutables, quedan como registro de la prueba)`);
  } catch (e) { fallas++; console.error('💥 limpieza:', e); }
  await pool.close();
  console.log(fallas ? `\n❌ ${fallas} falla(s)` : '\n✅ Punta a punta: TODO OK');
  process.exit(fallas ? 1 : 0);
}
