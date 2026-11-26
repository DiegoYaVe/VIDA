// src/services/destacadosTienda.service.js
// Productos PLUS y estrella de cada tienda (sql/65). Si una tienda tiene su
// propia lista de PLUS, esos son sus PLUS; si no, vale la marca PLUS del
// producto (EsProductoPlus), como hasta ahora.

// Expresión SQL que dice si `alias` (VIDA_INVENTARIO_PRODUCTOS) es PLUS en la
// tienda `pv` (una columna, p. ej. "inv.idPuntoVenta", o un parámetro, "@pv").
// Devuelve 1/0 con el mismo nombre de columna que antes: EsProductoPlus.
export function sqlEsPlus(alias, pv) {
  const d = `VIDA_TIENDA_PRODUCTOS_DESTACADOS`;
  const deLaTienda = `d.idBranch=${alias}.idBranch AND d.idCuenta=${alias}.idCuenta AND d.idPuntoVenta=${pv} AND d.Tipo='PLUS'`;
  return `CAST(CASE WHEN EXISTS (SELECT 1 FROM ${d} d WHERE ${deLaTienda})
              THEN CASE WHEN EXISTS (SELECT 1 FROM ${d} d WHERE ${deLaTienda} AND d.idProducto=${alias}.idProducto) THEN 1 ELSE 0 END
              ELSE ISNULL(${alias}.EsProductoPlus, 0) END AS BIT)`;
}

// Igual para el producto estrella (no tiene respaldo global).
export function sqlEsEstrella(alias, pv) {
  return `CAST(CASE WHEN EXISTS (SELECT 1 FROM VIDA_TIENDA_PRODUCTOS_DESTACADOS d
              WHERE d.idBranch=${alias}.idBranch AND d.idCuenta=${alias}.idCuenta AND d.idPuntoVenta=${pv}
                AND d.Tipo='ESTRELLA' AND d.idProducto=${alias}.idProducto) THEN 1 ELSE 0 END AS BIT)`;
}

// Regla pura (la misma que sqlEsPlus), para cuando ya se tienen los datos.
export function esPlusEnTienda(producto, plusDeLaTienda) {
  if (plusDeLaTienda && plusDeLaTienda.size > 0) return plusDeLaTienda.has(String(producto.idProducto));
  return !!producto.EsProductoPlus;
}

// Valida lo que manda VIDA al guardar: listas de ids únicos y con tope.
export function validarDestacados({ plus, estrella } = {}) {
  const lista = (v, nombre, max) => {
    if (v == null) return [];
    if (!Array.isArray(v)) throw Object.assign(new Error(`${nombre} debe ser una lista`), { statusCode: 400 });
    const ids = v.map(Number);
    if (ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw Object.assign(new Error(`Hay un producto inválido en ${nombre}`), { statusCode: 400 });
    if (new Set(ids).size !== ids.length) throw Object.assign(new Error(`Hay productos repetidos en ${nombre}`), { statusCode: 400 });
    if (ids.length > max) throw Object.assign(new Error(`Elige como máximo ${max} productos en ${nombre}`), { statusCode: 400 });
    return ids;
  };
  return { plus: lista(plus, 'PLUS', 30), estrella: lista(estrella, 'estrella', 3) };
}
