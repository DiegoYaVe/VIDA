// Productos Club VIDA: los productos PLUS de todas las tiendas de la red.
// El catálogo de /delivery/productos trae una fila por producto y tienda con
// existencia; aquí se arman las dos vistas de la app.

const clave = (v) => String(v);

// Orden de cercanía de las tiendas (la lista ya viene ordenada por cercanía).
const rangoTiendas = (sucursales) => new Map((sucursales || []).map((s, i) => [clave(s.idPuntoVenta), i]));

// Para el carrusel del inicio: un producto PLUS una sola vez, ofrecido desde tu
// tienda si lo tiene o, si no, desde la tienda más cercana que lo tenga.
export function plusDestacados(productos, sucursales, idTienda, max = 12) {
  const rango = rangoTiendas(sucursales);
  const pos = (p) => (clave(p.idPuntoVenta) === clave(idTienda) ? -1 : rango.get(clave(p.idPuntoVenta)) ?? 9999);
  const elegido = new Map();
  for (const p of productos || []) {
    if (!p.EsProductoPlus) continue;
    const k = clave(p.idProducto);
    const actual = elegido.get(k);
    if (!actual || pos(p) < pos(actual)) elegido.set(k, p);
  }
  return [...elegido.values()]
    .map((p) => ({ ...p, EnOtraTienda: idTienda != null && clave(p.idPuntoVenta) !== clave(idTienda) }))
    .sort((a, b) => pos(a) - pos(b) || String(a.Nombre).localeCompare(String(b.Nombre)))
    .slice(0, max);
}

// Para la pantalla "Productos Club VIDA": todos los PLUS, agrupados por tienda,
// la más cercana primero. Devuelve [{ idPuntoVenta, NombreSucursal, DistanciaKm, productos[] }].
export function plusPorTienda(productos, sucursales) {
  const rango = rangoTiendas(sucursales);
  const porId = new Map((sucursales || []).map((s) => [clave(s.idPuntoVenta), s]));
  const grupos = new Map();
  for (const p of productos || []) {
    if (!p.EsProductoPlus) continue;
    const k = clave(p.idPuntoVenta);
    if (!grupos.has(k)) {
      const s = porId.get(k);
      grupos.set(k, {
        idPuntoVenta: p.idPuntoVenta, NombreSucursal: s?.NomComercial || p.NombreSucursal || 'Tienda',
        DistanciaKm: s?.DistanciaKm ?? null, productos: [],
      });
    }
    grupos.get(k).productos.push(p);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, productos: g.productos.sort((a, b) => String(a.Nombre).localeCompare(String(b.Nombre))) }))
    .sort((a, b) => (rango.get(clave(a.idPuntoVenta)) ?? 9999) - (rango.get(clave(b.idPuntoVenta)) ?? 9999));
}
