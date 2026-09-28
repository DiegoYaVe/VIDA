// Cantidades expresadas en unidades de 0.0001, igual que SQL Decimal(18,4).
export function validarRecepcion(lineas, items, status) {
  const fallo = (mensaje) => { const e = new Error(mensaje); e.statusCode = 422; throw e; };
  if (!Array.isArray(items) || !items.length) fallo('Indica las cantidades de esta entrega');
  const porId = new Map(lineas.map(l => [String(l.idDetalle), l]));
  const vistos = new Set();
  const aplicar = [];
  const unidades = n => Math.round(Number(n) * 10000);
  for (const item of items) {
    const id = String(item?.idDetalle);
    if (vistos.has(id)) fallo('No repitas un renglón en la misma recepción');
    vistos.add(id);
    const linea = porId.get(id);
    if (!linea) fallo('El renglón no pertenece a esta orden');
    const valor = item.CantidadRecibida;
    const cant = Number(valor);
    if (valor === null || valor === '' || !['number', 'string'].includes(typeof valor) || !Number.isFinite(cant) || cant < 0)
      fallo('La cantidad debe ser un número válido mayor o igual a cero');
    if (Math.abs(cant * 10000 - unidades(cant)) > 1e-6) fallo('Usa como máximo cuatro decimales');
    const pendiente = unidades(linea.CantidadOrdenada) - unidades(linea.CantidadRecibida || 0);
    if (unidades(cant) > pendiente) fallo(`Solo faltan ${pendiente / 10000} unidades de este renglón`);
    if (cant > 0) aplicar.push({ idDetalle: linea.idDetalle, idProducto: linea.idProducto, cantidad: unidades(cant) / 10000, precio: Number(linea.PrecioUnitario) || 0 });
  }
  if (!aplicar.length) fallo('No hay cantidades que recibir');
  const recibidas = new Map(aplicar.map(a => [String(a.idDetalle), unidades(a.cantidad)]));
  const completa = lineas.every(l => unidades(l.CantidadRecibida || 0) + (recibidas.get(String(l.idDetalle)) || 0) === unidades(l.CantidadOrdenada));
  if (status === 'RECIBIDA_COMPLETA' && !completa) fallo('Todavía queda mercancía pendiente; registra una recepción parcial');
  if (status === 'RECIBIDA_PARCIAL' && completa) fallo('Esta entrega completa la orden; selecciona Completa');
  return aplicar;
}
