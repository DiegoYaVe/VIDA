// src/services/planPlus.service.js
// Plan PLUS (audios de Lila, nov 2026): con pocos productos (los PLUS, el
// producto ancla o estrella) decirle al empresario cuántas unidades de cada uno
// tiene que vender para cubrir los costos fijos de su bodega. El resto de lo
// que venda paga los gastos variables y es ganancia.
// Reglas puras, sin BD, para poder probarlas solas.

const r2 = (v) => Math.round(v * 100) / 100;
const r4 = (v) => Math.round(v * 10000) / 10000;

// Márgenes de un producto. pctVar = % de la venta que se va en costos
// variables (comisión de delivery + impuestos + pasarela).
//   · bruto        = precio − costo
//   · contribución = precio − costo − costos variables  (lo que deja cada unidad
//                    para pagar los costos fijos)
export function margenesProducto(precio, costo, pctVar = 0) {
  const p = Number(precio) || 0, c = Number(costo) || 0;
  if (!(p > 0)) return { brutoUSD: 0, brutoPct: null, contribUSD: 0, contribPct: null, variableUSD: 0 };
  const variable = p * (Number(pctVar) || 0) / 100;
  const bruto = p - c, contrib = bruto - variable;
  return {
    brutoUSD: r4(bruto), brutoPct: r2(bruto / p * 100),
    variableUSD: r4(variable),
    contribUSD: r4(contrib), contribPct: r2(contrib / p * 100),
  };
}

// Reparte el objetivo (costos fijos, y si se quiere la ganancia deseada) entre
// los productos elegidos según su peso, y calcula cuántas unidades de cada uno
// hay que vender. Los pesos se normalizan: si no suman 100, se reparte en
// proporción; si ninguno tiene peso, se reparte igual.
//
// productos: [{ idProducto, Nombre, PrecioUSD, CostoUSD, PesoPct, Vendidas30 }]
// Devuelve { objetivoUSD, lineas[], totales, sinMargen[] }.
export function planEquilibrio({ costosFijos, metaGanancia = 0, incluirMeta = false, pctVar = 0, productos = [], diasMes = 30 }) {
  const objetivo = (Number(costosFijos) || 0) + (incluirMeta ? Number(metaGanancia) || 0 : 0);
  const conMargen = [], sinMargen = [];
  for (const p of productos) {
    const m = margenesProducto(p.PrecioUSD, p.CostoUSD, pctVar);
    (m.contribUSD > 0 ? conMargen : sinMargen).push({ ...p, ...m });
  }
  const pesoTotal = conMargen.reduce((s, p) => s + Math.max(0, Number(p.PesoPct) || 0), 0);
  const lineas = conMargen.map((p) => {
    const peso = pesoTotal > 0 ? Math.max(0, Number(p.PesoPct) || 0) / pesoTotal : 1 / conMargen.length;
    const aCubrir = objetivo * peso;
    const unidadesMes = aCubrir > 0 ? Math.ceil(aCubrir / p.contribUSD) : 0;
    const ventasMes = unidadesMes * Number(p.PrecioUSD);
    const contribMes = unidadesMes * p.contribUSD;
    const vendidas = Number(p.Vendidas30) || 0;
    return {
      ...p,
      PesoPct: r2(peso * 100),
      aCubrirUSD: r2(aCubrir),
      unidadesMes,
      unidadesDia: Math.ceil(unidadesMes / diasMes),
      ventasMesUSD: r2(ventasMes),
      // Margen neto a ese volumen: lo que queda después de pagar su parte de
      // los costos fijos (0 % en el equilibrio puro; positivo si incluye la meta).
      netoPct: ventasMes > 0 ? r2((contribMes - (Number(costosFijos) || 0) * peso) / ventasMes * 100) : null,
      avancePct: unidadesMes > 0 ? r2(vendidas / unidadesMes * 100) : null,
      cubiertoUSD: r2(vendidas * p.contribUSD),
    };
  });
  const ventasMes = lineas.reduce((s, l) => s + l.ventasMesUSD, 0);
  const cubierto = lineas.reduce((s, l) => s + l.cubiertoUSD, 0);
  return {
    objetivoUSD: r2(objetivo),
    lineas,
    sinMargen: sinMargen.map(p => ({ idProducto: p.idProducto, Nombre: p.Nombre, contribUSD: p.contribUSD })),
    totales: {
      unidadesMes: lineas.reduce((s, l) => s + l.unidadesMes, 0),
      ventasMesUSD: r2(ventasMes),
      ventasDiaUSD: r2(ventasMes / diasMes),
      // Con lo vendido en los últimos 30 días, cuánto de los costos fijos ya se cubrió
      cubiertoUSD: r2(cubierto),
      coberturaPct: objetivo > 0 ? r2(cubierto / objetivo * 100) : null,
    },
  };
}

// Si el empresario todavía no eligió productos, el plan arranca con sus PLUS.
export function seleccionInicial(productos) {
  return productos.filter(p => p.EsProductoPlus).map(p => ({ idProducto: p.idProducto, PesoPct: null }));
}

// Precio fuera del rango piso–techo que definió VIDA.
export function fueraDeRango(precio, piso, techo) {
  const p = Number(precio);
  if (piso != null && p < Number(piso)) return 'BAJO_PISO';
  if (techo != null && p > Number(techo)) return 'SOBRE_TECHO';
  return null;
}
