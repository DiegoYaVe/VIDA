// E2E del reabasto por proveedor con VIDA intermediaria (tarea 24), contra QA,
// con los controladores reales (sin HTTP). Cubre lo nuevo de esta tanda:
//   · crearPedidoVida (Envío VIDA) arma el pedido y el paquete por proveedor
//   · API del proveedor: confirmar → CONFIRMADO → listo → LISTO (auth Bearer)
//   · despacho por capacidad: el envío disponible solo lo ve quien aguanta el peso
//   · repartidor: aceptar, recoger con el código, avisar entrega
//   · recepción de la tienda: ingresa al inventario y el pedido queda RECIBIDO
//   · asignación manual de VIDA cuando hace falta
// Crea sus fixtures y los borra al final (quedan solo filas de auditoría).
//
// Uso:  RUN_E2E_QA=1 node tests/e2e/reabastoProveedor.e2e.mjs
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
const BK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
process.chdir(BK);
(await import('dotenv')).default.config({ path: path.join(BK, '.env') });
if (process.env.RUN_E2E_QA !== '1') { console.log('E2E omitida: usa RUN_E2E_QA=1 (escribe en la BD de QA)'); process.exit(0); }
if (!/qa/i.test(process.env.DB_DATABASE || '')) { console.error(`E2E abortada: la BD "${process.env.DB_DATABASE}" no parece de QA`); process.exit(1); }

// Bloquear push reales a Expo
const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('exp.host')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
  return fetchReal(url, opts);
};

const imp = (p) => import(pathToFileURL(BK + p).href);
const R = await imp('/src/controllers/reabastoVida.controller.js');
const D = await imp('/src/controllers/delivery.controller.js');
const { avanzarPedidoApi } = await imp('/src/controllers/portalProveedor.controller.js');
const { procesarEnviosProveedor } = await imp('/src/services/reabastoDispatch.service.js');
const { getPool, sql } = await imp('/src/db/sqlserver.js');

const log = { error: (e) => console.error('   log.error:', e?.message || e), info() {}, warn() {} };
const PANEL = { idBranch: '1', idCuenta: '1', idUsuario: '1', TipoUsuario: 'SUPER_ADMIN', idPuntoVenta: null };
const BR = 1, CU = 1, TIENDA = 3, P1 = 1, P2 = 2, PROV = 1;
const TOKEN = 'e2e' + 'a'.repeat(45); // 48 hex

const mkReply = () => { const r = { _code: 200 }; r.code = c => { r._code = c; return r; }; r.send = o => { r._payload = o; return r; }; return r; };
const run = async (fn, req) => { const reply = mkReply(); const ret = await fn({ log, ...req }, reply); if (reply._payload === undefined && ret && ret !== reply) reply._payload = ret; return reply; };
let fallas = 0;
const ok = (c, m) => { console.log(c ? '  ✓' : '  ❌', m); if (!c) fallas++; };

const pool = await getPool();
const q = async (s, inputs = {}) => { const rq = pool.request(); for (const [k, [t, v]] of Object.entries(inputs)) rq.input(k, t, v); return (await rq.query(s)).recordset; };
const scalar = async (s) => (await q(s))[0];
const estadoPaq = async (pp) => (await scalar(`SELECT Status, idRepartidor, CodigoRetiro, Folio FROM VIDA_PEDIDOS_PROVEEDOR WHERE idBranch=${BR} AND idCuenta=${CU} AND idPedidoProveedor=${pp}`));
const stock = async (prod) => Number((await scalar(`SELECT Cantidad FROM VIDA_INVENTARIO_STOCK WHERE idBranch=${BR} AND idCuenta=${CU} AND idPuntoVenta=${TIENDA} AND idProducto=${prod}`))?.Cantidad || 0);

// ── Estado previo para restaurar ──
const pesoP1Antes = (await scalar(`SELECT PesoKg FROM VIDA_INVENTARIO_PRODUCTOS WHERE idBranch=${BR} AND idCuenta=${CU} AND idProducto=${P1}`))?.PesoKg ?? null;
const pesoP2Antes = (await scalar(`SELECT PesoKg FROM VIDA_INVENTARIO_PRODUCTOS WHERE idBranch=${BR} AND idCuenta=${CU} AND idProducto=${P2}`))?.PesoKg ?? null;
const tokenAntes = (await scalar(`SELECT PortalToken FROM VIDA_PROVEEDORES WHERE idBranch=${BR} AND idCuenta=${CU} AND idProveedor=${PROV}`))?.PortalToken ?? null;
const stockP1Antes = await stock(P1), stockP2Antes = await stock(P2);
const maxMov = Number((await scalar(`SELECT ISNULL(MAX(idMovimiento),0) m FROM VIDA_INVENTARIO_MOVIMIENTOS WHERE idBranch=${BR} AND idCuenta=${CU}`)).m);
const sucNueva = Number((await scalar(`SELECT ISNULL(MAX(idSucursal),0)+1 n FROM VIDA_PROVEEDORES_SUCURSALES WHERE idBranch=${BR} AND idCuenta=${CU} AND idProveedor=${PROV}`)).n);
const repBase = Number((await scalar(`SELECT ISNULL(MAX(idRepartidor),0) n FROM VIDA_REPARTIDORES WHERE idBranch=${BR} AND idCuenta=${CU}`)).n);
const REP_BIG = repBase + 1, REP_SMALL = repBase + 2;

const pedidos = [];   // idPedidoMatriz creados
const paquetes = [];  // idPedidoProveedor creados

try {
  // ── FIXTURES ──
  await q(`UPDATE VIDA_INVENTARIO_PRODUCTOS SET PesoKg=1.5 WHERE idBranch=${BR} AND idCuenta=${CU} AND idProducto=${P1}`);
  await q(`UPDATE VIDA_INVENTARIO_PRODUCTOS SET PesoKg=0.5 WHERE idBranch=${BR} AND idCuenta=${CU} AND idProducto=${P2}`);
  await q(`UPDATE VIDA_PROVEEDORES SET PortalToken='${TOKEN}' WHERE idBranch=${BR} AND idCuenta=${CU} AND idProveedor=${PROV}`);
  await q(`INSERT INTO VIDA_PROVEEDORES_PRODUCTOS (idBranch,idCuenta,idProveedor,idProducto,PrecioCosto,CodigoProveedor) VALUES
            (${BR},${CU},${PROV},${P1},10,'E2E-1'),(${BR},${CU},${PROV},${P2},4,'E2E-2')`);
  await q(`INSERT INTO VIDA_PROVEEDORES_SUCURSALES (idBranch,idCuenta,idProveedor,idSucursal,Nombre,Direccion,Status,FechaAlta,Latitud,Longitud)
            VALUES (${BR},${CU},${PROV},${sucNueva},'Sucursal E2E','Calle de prueba','ACTIVO',GETUTCDATE(),20.075,-98.74)`);
  const insRep = (id, cap, nom) => q(`INSERT INTO VIDA_REPARTIDORES
      (idBranch,idCuenta,idRepartidor,Nombre,Telefono,SaldoPendiente,SaldoPendienteVES,StatusRepartidor,Status,StatusAprobacion,TotalCalificaciones,TipoReparto,CapacidadKg,UltimaLatitud,UltimaLongitud,FechaAlta)
      VALUES (${BR},${CU},${id},'${nom}','0000${id}',0,0,'DISPONIBLE','ACTIVO','APROBADO',0,'PROVEEDORES',${cap},20.075,-98.74,GETUTCDATE())`);
  await insRep(REP_BIG, 500, 'E2E Grande');
  await insRep(REP_SMALL, 1, 'E2E Chico');

  const repBig = { idBranch: '1', idCuenta: '1', idRepartidor: REP_BIG };
  const repSmall = { idBranch: '1', idCuenta: '1', idRepartidor: REP_SMALL };
  const itemsBody = { items: [{ idProducto: P1, Cantidad: 2 }, { idProducto: P2, Cantidad: 3 }], ModoRecepcion: 'ENVIO_VIDA', idPuntoVentaSolicita: TIENDA };

  // ── Pedido A: flujo del repartidor (aceptar / recoger / recibir) ──
  console.log('\nPedido A — repartidor acepta, recoge y la tienda recibe');
  const ra = await run(R.crearPedidoVida, { user: PANEL, body: itemsBody });
  ok(ra._code === 201, `crearPedidoVida → ${ra._code}`);
  const pedA = ra._payload.idPedidoMatriz; pedidos.push(pedA);
  const paqARow = await scalar(`SELECT idPedidoProveedor FROM VIDA_PEDIDOS_PROVEEDOR WHERE idBranch=${BR} AND idCuenta=${CU} AND idPedidoMatriz=${pedA}`);
  const paqA = paqARow.idPedidoProveedor; paquetes.push(paqA);

  // Simular que VIDA aprobó el pago (sin correr el flujo de pago de fase 1)
  await q(`UPDATE VIDA_PEDIDOS_MATRIZ SET Status='EN_PROCESO' WHERE idBranch=${BR} AND idCuenta=${CU} AND idPedidoMatriz=${pedA}`);
  await q(`UPDATE VIDA_PEDIDOS_PROVEEDOR SET Status='ENVIADO' WHERE idBranch=${BR} AND idCuenta=${CU} AND idPedidoProveedor=${paqA}`);

  // API del proveedor: confirmar → listo (auth Bearer con el PortalToken)
  const folioA = (await estadoPaq(paqA)).Folio;
  const apiCall = (accion) => run(avanzarPedidoApi, { headers: { authorization: `Bearer ${TOKEN}` }, params: { folio: folioA, accion }, body: {} });
  ok((await apiCall('confirmar'))._code === 200 && (await estadoPaq(paqA)).Status === 'CONFIRMADO', 'proveedor confirmar → CONFIRMADO');
  ok((await apiCall('listo'))._code === 200 && (await estadoPaq(paqA)).Status === 'LISTO', 'proveedor listo → LISTO');
  const apiMal = await run(avanzarPedidoApi, { headers: { authorization: 'Bearer ' + 'b'.repeat(48) }, params: { folio: folioA, accion: 'listo' }, body: {} });
  ok(apiMal._code === 401, 'API con token inválido → 401');

  // El despacho corre sin romperse
  let dispatchOk = true; try { await procesarEnviosProveedor(log); } catch (e) { dispatchOk = false; log.error(e); }
  ok(dispatchOk, 'procesarEnviosProveedor corre sin error');

  // Disponibles: lo ve el grande (4.5 kg), no el chico (1 kg)
  const dispBig = await run(D.enviosProveedorDisponibles, { repartidor: repBig });
  const dispSmall = await run(D.enviosProveedorDisponibles, { repartidor: repSmall });
  const veBig = (dispBig._payload || []).some(e => String(e.idPedidoProveedor) === String(paqA));
  const veSmall = (dispSmall._payload || []).some(e => String(e.idPedidoProveedor) === String(paqA));
  ok(veBig && !veSmall, `disponible solo para quien aguanta (grande=${veBig}, chico=${veSmall})`);
  const elEnvio = (dispBig._payload || []).find(e => String(e.idPedidoProveedor) === String(paqA));
  ok(elEnvio && Math.abs(elEnvio.PesoKg - 4.5) < 1e-6, `peso del paquete = 4.5 kg (${elEnvio?.PesoKg})`);

  // Aceptar (grande); el chico ya no puede
  ok((await run(D.aceptarEnvioProveedor, { repartidor: repBig, body: { idPedidoProveedor: paqA } }))._code === 200, 'repartidor grande acepta');
  ok(String((await estadoPaq(paqA)).idRepartidor) === String(REP_BIG), 'paquete queda asignado al grande');
  ok((await run(D.aceptarEnvioProveedor, { repartidor: repSmall, body: { idPedidoProveedor: paqA } }))._code === 409, 'segundo que acepta → 409');

  // Recoger con código (mal y bien)
  ok((await run(D.recogerEnvioProveedor, { repartidor: repBig, body: { idPedidoProveedor: paqA, Codigo: 'XXXXXXXX' } }))._code === 400, 'código incorrecto → 400');
  const codA = (await estadoPaq(paqA)).CodigoRetiro;
  ok((await run(D.recogerEnvioProveedor, { repartidor: repBig, body: { idPedidoProveedor: paqA, Codigo: codA } }))._code === 200 && (await estadoPaq(paqA)).Status === 'RETIRADO', 'recoger con código → RETIRADO');
  ok((await run(D.entregarEnvioProveedor, { repartidor: repBig, body: { idPedidoProveedor: paqA } }))._code === 200, 'avisar entrega en la tienda');

  // La tienda recibe → ingresa al inventario y el pedido queda RECIBIDO
  const det = await q(`SELECT idDetalle, CantidadSolicitada FROM VIDA_PEDIDOS_MATRIZ_DETALLE WHERE idBranch=${BR} AND idCuenta=${CU} AND idPedidoProveedor=${paqA}`);
  const recibir = await run(R.recibirPaquete, { user: PANEL, params: { idPedidoProveedor: paqA }, body: { cantidades: det.map(d => ({ idDetalle: Number(d.idDetalle), CantidadRecibida: Number(d.CantidadSolicitada) })) } });
  ok(recibir._code === 200 && (await estadoPaq(paqA)).Status === 'RECIBIDO', 'recibirPaquete → RECIBIDO');
  ok((await stock(P1)) - stockP1Antes === 2 && (await stock(P2)) - stockP2Antes === 3, 'inventario de la tienda subió (2 y 3)');
  ok((await scalar(`SELECT Status FROM VIDA_PEDIDOS_MATRIZ WHERE idBranch=${BR} AND idCuenta=${CU} AND idPedidoMatriz=${pedA}`)).Status === 'RECIBIDO', 'pedido a VIDA queda RECIBIDO');

  // ── Pedido B: asignación manual de VIDA ──
  console.log('\nPedido B — VIDA asigna el repartidor a mano');
  const rb = await run(R.crearPedidoVida, { user: PANEL, body: itemsBody });
  const pedB = rb._payload.idPedidoMatriz; pedidos.push(pedB);
  const paqB = (await scalar(`SELECT idPedidoProveedor FROM VIDA_PEDIDOS_PROVEEDOR WHERE idBranch=${BR} AND idCuenta=${CU} AND idPedidoMatriz=${pedB}`)).idPedidoProveedor; paquetes.push(paqB);
  await q(`UPDATE VIDA_PEDIDOS_MATRIZ SET Status='EN_PROCESO' WHERE idBranch=${BR} AND idCuenta=${CU} AND idPedidoMatriz=${pedB}`);
  await q(`UPDATE VIDA_PEDIDOS_PROVEEDOR SET Status='LISTO' WHERE idBranch=${BR} AND idCuenta=${CU} AND idPedidoProveedor=${paqB}`);

  const cand = await run(R.repartidoresEnvioProveedor, { user: PANEL, params: { idPedidoProveedor: paqB } });
  const cBig = (cand._payload?.repartidores || []).find(r => String(r.idRepartidor) === String(REP_BIG));
  const cSmall = (cand._payload?.repartidores || []).find(r => String(r.idRepartidor) === String(REP_SMALL));
  ok(Math.abs(cand._payload?.PesoKg - 4.5) < 1e-6, `candidatos: peso = 4.5 (${cand._payload?.PesoKg})`);
  ok(cBig?.aguanta === true && cSmall?.aguanta === false, `aguanta: grande=${cBig?.aguanta} chico=${cSmall?.aguanta}`);
  ok((await run(R.asignarRepartidorEnvio, { user: PANEL, params: { idPedidoProveedor: paqB }, body: { idRepartidor: REP_BIG } }))._code === 200, 'VIDA asigna a mano');
  ok(String((await estadoPaq(paqB)).idRepartidor) === String(REP_BIG), 'paquete B queda asignado');
  ok((await run(R.asignarRepartidorEnvio, { user: PANEL, params: { idPedidoProveedor: paqB }, body: { idRepartidor: REP_SMALL } }))._code === 409, 'reasignar ocupado → 409');

  // El detalle que ve VIDA trae repartidor y peso
  const detalle = await run(R.obtenerPedidoVida, { user: PANEL, params: { idPedidoMatriz: pedB } });
  const paqVista = (detalle._payload?.paquetes || [])[0];
  ok(String(paqVista?.idRepartidor) === String(REP_BIG) && Math.abs(paqVista?.PesoKg - 4.5) < 1e-6, 'detalle de VIDA trae repartidor y peso');

} catch (e) {
  console.error('\n  💥 Error en el flujo:', e.message); fallas++;
} finally {
  // ── TEARDOWN ──
  console.log('\nLimpiando…');
  try {
    for (const pp of paquetes) await q(`DELETE FROM VIDA_CUENTAS WHERE idBranch=${BR} AND idCuenta=${CU} AND OrigenTipo='PEDIDO_PROVEEDOR' AND idOrigen=${pp}`);
    await q(`DELETE FROM VIDA_INVENTARIO_MOVIMIENTOS WHERE idBranch=${BR} AND idCuenta=${CU} AND idMovimiento > ${maxMov}`);
    for (const id of pedidos) {
      await q(`DELETE FROM VIDA_PEDIDOS_MATRIZ_DETALLE WHERE idBranch=${BR} AND idCuenta=${CU} AND idPedidoMatriz=${id}`);
      await q(`DELETE FROM VIDA_PEDIDOS_PROVEEDOR WHERE idBranch=${BR} AND idCuenta=${CU} AND idPedidoMatriz=${id}`);
      await q(`DELETE FROM VIDA_PEDIDOS_MATRIZ_HISTORIAL WHERE idBranch=${BR} AND idCuenta=${CU} AND idPedidoMatriz=${id}`);
      await q(`DELETE FROM VIDA_PEDIDOS_MATRIZ WHERE idBranch=${BR} AND idCuenta=${CU} AND idPedidoMatriz=${id}`);
    }
    await q(`DELETE FROM VIDA_REPARTIDORES WHERE idBranch=${BR} AND idCuenta=${CU} AND idRepartidor IN (${REP_BIG},${REP_SMALL})`);
    await q(`DELETE FROM VIDA_PROVEEDORES_PRODUCTOS WHERE idBranch=${BR} AND idCuenta=${CU} AND idProveedor=${PROV} AND idProducto IN (${P1},${P2})`);
    await q(`DELETE FROM VIDA_PROVEEDORES_SUCURSALES WHERE idBranch=${BR} AND idCuenta=${CU} AND idProveedor=${PROV} AND idSucursal=${sucNueva}`);
    // Restaurar stock de la tienda (por si la recepción lo cambió)
    await q(`UPDATE VIDA_INVENTARIO_STOCK SET Cantidad=${stockP1Antes} WHERE idBranch=${BR} AND idCuenta=${CU} AND idPuntoVenta=${TIENDA} AND idProducto=${P1}`);
    await q(`UPDATE VIDA_INVENTARIO_STOCK SET Cantidad=${stockP2Antes} WHERE idBranch=${BR} AND idCuenta=${CU} AND idPuntoVenta=${TIENDA} AND idProducto=${P2}`);
    await q(`UPDATE VIDA_INVENTARIO_PRODUCTOS SET PesoKg=${pesoP1Antes == null ? 'NULL' : pesoP1Antes} WHERE idBranch=${BR} AND idCuenta=${CU} AND idProducto=${P1}`);
    await q(`UPDATE VIDA_INVENTARIO_PRODUCTOS SET PesoKg=${pesoP2Antes == null ? 'NULL' : pesoP2Antes} WHERE idBranch=${BR} AND idCuenta=${CU} AND idProducto=${P2}`);
    await q(`UPDATE VIDA_PROVEEDORES SET PortalToken=${tokenAntes == null ? 'NULL' : `'${tokenAntes}'`} WHERE idBranch=${BR} AND idCuenta=${CU} AND idProveedor=${PROV}`);
    console.log('  limpieza OK');
  } catch (e) { console.error('  ⚠️ limpieza incompleta:', e.message); }
  await pool.close();
}

console.log(fallas ? `\n❌ ${fallas} verificación(es) fallaron\n` : '\n✅ Todo el flujo de reabasto pasó contra la BD\n');
process.exit(fallas ? 1 : 0);
