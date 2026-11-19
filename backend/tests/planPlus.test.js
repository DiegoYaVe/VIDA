import test from 'node:test';
import assert from 'node:assert/strict';
import { margenesProducto, planEquilibrio, seleccionInicial, fueraDeRango } from '../src/services/planPlus.service.js';

test('márgenes: bruto y contribución', () => {
  const m = margenesProducto(10, 6, 5);   // 5 % variables = $0.50
  assert.equal(m.brutoUSD, 4);
  assert.equal(m.brutoPct, 40);
  assert.equal(m.contribUSD, 3.5);
  assert.equal(m.contribPct, 35);
  assert.equal(margenesProducto(0, 1).brutoPct, null);
});

test('plan: reparte los costos fijos y calcula unidades (redondeo hacia arriba)', () => {
  const plan = planEquilibrio({
    costosFijos: 1000, pctVar: 0,
    productos: [
      { idProducto: 1, PrecioUSD: 10, CostoUSD: 6, PesoPct: 60, Vendidas30: 75 },  // contrib 4
      { idProducto: 2, PrecioUSD: 5, CostoUSD: 4, PesoPct: 40, Vendidas30: 0 },    // contrib 1
    ],
  });
  const [a, b] = plan.lineas;
  assert.equal(a.aCubrirUSD, 600);
  assert.equal(a.unidadesMes, 150);
  assert.equal(a.unidadesDia, 5);
  assert.equal(a.avancePct, 50);
  assert.equal(b.unidadesMes, 400);
  assert.equal(plan.totales.ventasMesUSD, 150 * 10 + 400 * 5);
  assert.equal(plan.totales.cubiertoUSD, 300);
  assert.equal(plan.totales.coberturaPct, 30);
  assert.equal(a.netoPct, 0);   // en el equilibrio exacto no queda ganancia
});

test('plan: sin pesos reparte igual; pesos que no suman 100 se normalizan', () => {
  const igual = planEquilibrio({ costosFijos: 100, productos: [
    { idProducto: 1, PrecioUSD: 2, CostoUSD: 1 }, { idProducto: 2, PrecioUSD: 2, CostoUSD: 1 }] });
  assert.deepEqual(igual.lineas.map(l => l.PesoPct), [50, 50]);
  const prop = planEquilibrio({ costosFijos: 100, productos: [
    { idProducto: 1, PrecioUSD: 2, CostoUSD: 1, PesoPct: 1 }, { idProducto: 2, PrecioUSD: 2, CostoUSD: 1, PesoPct: 3 }] });
  assert.deepEqual(prop.lineas.map(l => l.PesoPct), [25, 75]);
});

test('plan: con meta de ganancia sube el objetivo y el margen neto queda positivo', () => {
  const plan = planEquilibrio({ costosFijos: 100, metaGanancia: 100, incluirMeta: true,
    productos: [{ idProducto: 1, PrecioUSD: 10, CostoUSD: 5 }] });
  assert.equal(plan.objetivoUSD, 200);
  assert.equal(plan.lineas[0].unidadesMes, 40);
  assert.equal(plan.lineas[0].netoPct, 25);
});

test('plan: los productos que no dejan margen no cuentan y se avisan', () => {
  const plan = planEquilibrio({ costosFijos: 100, pctVar: 10, productos: [
    { idProducto: 1, Nombre: 'Agua', PrecioUSD: 1, CostoUSD: 0.95 },
    { idProducto: 2, Nombre: 'Harina', PrecioUSD: 2, CostoUSD: 1 }] });
  assert.equal(plan.lineas.length, 1);
  assert.equal(plan.sinMargen[0].Nombre, 'Agua');
  assert.equal(plan.lineas[0].PesoPct, 100);
});

test('selección inicial = los PLUS; precio fuera de piso/techo', () => {
  assert.deepEqual(seleccionInicial([{ idProducto: 1, EsProductoPlus: true }, { idProducto: 2, EsProductoPlus: false }]),
    [{ idProducto: 1, PesoPct: null }]);
  assert.equal(fueraDeRango(5, 6, 10), 'BAJO_PISO');
  assert.equal(fueraDeRango(11, 6, 10), 'SOBRE_TECHO');
  assert.equal(fueraDeRango(8, 6, 10), null);
  assert.equal(fueraDeRango(8, null, null), null);
});
