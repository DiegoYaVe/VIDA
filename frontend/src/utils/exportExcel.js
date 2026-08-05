// src/utils/exportExcel.js
// Exportación a Excel usando SheetJS (xlsx)
// npm install xlsx
import * as XLSX from 'xlsx';

const USD = (v) => `$${Number(v || 0).toFixed(2)}`;
const NUM = (v) => Number(v || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 });

// ─── Helpers internos ────────────────────────────────────────────────────────

function crearLibro(sheets) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ nombre, datos, anchos }) => {
    const ws = XLSX.utils.aoa_to_sheet(datos);
    if (anchos) ws['!cols'] = anchos.map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, nombre);
  });
  return wb;
}

function descargar(wb, nombreArchivo) {
  XLSX.writeFile(wb, nombreArchivo);
}

function fmtFecha(f) {
  if (!f) return '';
  const d = new Date(f);
  return d.toLocaleDateString('es-VE');
}

// ─── Exportaciones ───────────────────────────────────────────────────────────

export function exportarVentasExcel({ filas, totales, graficaDiaria, fechaInicio, fechaFin }) {
  // Hoja 1: detalle por sucursal
  const encabezado = [
    ['COMERCIALIZADORA VIDA — REPORTE DE VENTAS'],
    [`Período: ${fechaInicio} al ${fechaFin}`, '', '', '', `Generado: ${new Date().toLocaleString('es-VE')}`],
    [],
    ['País', 'Estado', 'Ciudad', 'Sucursal', 'Ventas', 'Total USD', 'Efectivo', 'Tarjeta', 'Cambio'],
  ];
  const filasDatos = filas.map(r => [
    r.Pais || '',
    r.Estado || '',
    r.Ciudad || '',
    r.NombrePuntoVenta,
    r.NumVentas,
    Number(r.TotalUSD || 0),
    Number(r.TotalEfectivo || 0),
    Number(r.TotalTarjeta || 0),
    Number(r.TotalCambio || 0),
  ]);
  const filaTotales = [
    'TOTALES', '', '', '',
    totales.NumVentas,
    Number(totales.TotalUSD),
    Number(totales.TotalEfectivo),
    Number(totales.TotalTarjeta),
    Number(totales.TotalCambio),
  ];

  const sheet1 = [...encabezado, ...filasDatos, [], filaTotales];
  const anchos1 = [15, 15, 15, 25, 10, 14, 14, 14, 14];

  // Hoja 2: gráfica diaria
  const encabezadoG = [
    ['VENTAS POR DÍA'],
    ['Fecha', 'Núm. Ventas', 'Total USD'],
  ];
  const filasGrafica = (graficaDiaria || []).map(r => [
    fmtFecha(r.Fecha),
    r.NumVentas,
    Number(r.TotalUSD || 0),
  ]);

  const wb = crearLibro([
    { nombre: 'Por Sucursal', datos: sheet1, anchos: anchos1 },
    { nombre: 'Por Día',      datos: [...encabezadoG, ...filasGrafica], anchos: [14, 12, 14] },
  ]);

  descargar(wb, `ventas_${fechaInicio}_${fechaFin}.xlsx`);
}

export function exportarProductosExcel({ filas, totales, fechaInicio, fechaFin }) {
  const encabezado = [
    ['COMERCIALIZADORA VIDA — PRODUCTOS MÁS VENDIDOS'],
    [`Período: ${fechaInicio} al ${fechaFin}`, '', '', `Generado: ${new Date().toLocaleString('es-VE')}`],
    [],
    ['#', 'Producto', 'Categoría', 'Unidad', 'Cant. Vendida', 'Ingresos USD', 'Pedidos', 'Precio Actual'],
  ];
  const filasDatos = filas.map((r, i) => [
    i + 1,
    r.NombreProducto,
    r.Categoria || '',
    r.UnidadMedida || '',
    Number(r.TotalCantidad || 0),
    Number(r.TotalRevenue  || 0),
    r.NumPedidos,
    Number(r.PrecioActual  || 0),
  ]);
  const filaTotales = [
    '', 'TOTALES', '', '',
    Number(totales.TotalCantidad),
    Number(totales.TotalRevenue),
    '', '',
  ];

  const datos = [...encabezado, ...filasDatos, [], filaTotales];
  const wb = crearLibro([{ nombre: 'Productos', datos, anchos: [5, 30, 18, 10, 14, 14, 10, 14] }]);
  descargar(wb, `productos_${fechaInicio}_${fechaFin}.xlsx`);
}

export function exportarRedExcel({ filas, totales, fechaInicio, fechaFin }) {
  const encabezado = [
    ['COMERCIALIZADORA VIDA — REPORTE EJECUTIVO DE RED'],
    [`Período: ${fechaInicio} al ${fechaFin}`, '', '', '', `Generado: ${new Date().toLocaleString('es-VE')}`],
    [`Tiendas con ventas: ${totales.NumTiendas}/${totales.TotalTiendas} | Total red: ${USD(totales.TotalUSD)} | POS: ${USD(totales.TotalPOS)} | Delivery: ${USD(totales.TotalDelivery)}`],
    [],
    ['#', 'Tienda', 'Ciudad', 'Estado geo', 'Onboarding', 'Ventas POS', 'Ventas Delivery', 'Transacciones', 'Total POS', 'Total Delivery', 'Total USD', '% Red'],
  ];
  const filasDatos = (filas || []).map((r, i) => [
    i + 1, r.NombrePuntoVenta, r.Ciudad || '', r.Estado || '', r.EstadoOnboarding,
    r.VentasPOS, r.VentasDelivery, r.NumTransacciones,
    Number(r.TotalPOS || 0), Number(r.TotalDelivery || 0), Number(r.TotalUSD || 0), Number(r.ParticipacionPct || 0),
  ]);
  const filaTot = [
    '', 'TOTAL RED', '', '', '',
    filas.reduce((s, r) => s + (r.VentasPOS || 0), 0),
    filas.reduce((s, r) => s + (r.VentasDelivery || 0), 0),
    totales.NumTransacciones,
    Number(totales.TotalPOS), Number(totales.TotalDelivery), Number(totales.TotalUSD), 100,
  ];
  const wb = crearLibro([{ nombre: 'Red', datos: [...encabezado, ...filasDatos, [], filaTot], anchos: [5, 26, 16, 16, 12, 12, 14, 13, 14, 14, 14, 8] }]);
  descargar(wb, `red_${fechaInicio}_${fechaFin}.xlsx`);
}

export function exportarDeliveryExcel({ graficaDiaria, porRepartidor, porMetodo, totales, fechaInicio, fechaFin }) {
  // Hoja 1: por repartidor
  const encRep = [
    ['COMERCIALIZADORA VIDA — REPORTE DE DELIVERY'],
    [`Período: ${fechaInicio} al ${fechaFin}`, '', '', '', `Generado: ${new Date().toLocaleString('es-VE')}`],
    [`Entregas: ${totales.NumEntregas} | Generado: ${USD(totales.MontoGenerado)} | Comisiones: ${USD(totales.Comisiones)} | Cancelados: ${totales.Cancelados}`],
    [],
    ['Repartidor', 'Vehículo', 'Calificación', 'Entregas', 'Monto Generado', 'Comisión', 'Efectivo Recaudado'],
  ];
  const filasRep = (porRepartidor || []).map(r => [
    r.Nombre,
    r.Vehiculo || '',
    r.Calificacion != null ? Number(r.Calificacion) : '',
    r.Entregas,
    Number(r.MontoGenerado || 0),
    Number(r.Comisiones || 0),
    Number(r.EfectivoRecaudado || 0),
  ]);
  const filaTotRep = [
    'TOTALES', '', '',
    totales.NumEntregas,
    Number(totales.MontoGenerado),
    Number(totales.Comisiones),
    Number(totales.EfectivoRecaudado),
  ];

  // Hoja 2: por día
  const encDia = [['VENTAS DELIVERY POR DÍA'], ['Fecha', 'Núm. Pedidos', 'Total USD']];
  const filasDia = (graficaDiaria || []).map(r => [fmtFecha(r.Fecha), r.NumPedidos, Number(r.TotalUSD || 0)]);

  // Hoja 3: por método de pago
  const encMet = [['DELIVERY POR MÉTODO DE PAGO'], ['Método', 'Núm. Pedidos', 'Total USD']];
  const filasMet = (porMetodo || []).map(r => [r.MetodoPago, r.NumPedidos, Number(r.TotalUSD || 0)]);

  const wb = crearLibro([
    { nombre: 'Por Repartidor', datos: [...encRep, ...filasRep, [], filaTotRep], anchos: [24, 14, 12, 10, 16, 14, 18] },
    { nombre: 'Por Día',        datos: [...encDia, ...filasDia], anchos: [14, 14, 14] },
    { nombre: 'Por Método',     datos: [...encMet, ...filasMet], anchos: [18, 14, 14] },
  ]);
  descargar(wb, `delivery_${fechaInicio}_${fechaFin}.xlsx`);
}

export function exportarInventarioExcel({ filas, resumen }) {
  const now = new Date().toLocaleString('es-VE');
  const encabezado = [
    ['COMERCIALIZADORA VIDA — INVENTARIO ACTUAL'],
    [`Generado: ${now}`],
    [`Total productos: ${resumen.TotalProductos} | Bajo stock: ${resumen.TotalBajoStock} | Valor total: $${Number(resumen.ValorTotalStock).toFixed(2)}`],
    [],
    ['País', 'Estado', 'Ciudad', 'Sucursal', 'Producto', 'SKU', 'Categoría', 'Unidad', 'Stock', 'Mín.', 'Precio USD', 'Valor Stock', 'Alerta'],
  ];
  const filasDatos = filas.map(r => [
    r.Pais || '',
    r.Estado || '',
    r.Ciudad || '',
    r.NombrePuntoVenta,
    r.Producto,
    r.SKU || '',
    r.Categoria || '',
    r.UnidadMedida || '',
    Number(r.Stock || 0),
    Number(r.StockMinimo || 0),
    Number(r.PrecioUSD || 0),
    Number(r.ValorStock || 0),
    r.StockBajo ? 'BAJO STOCK' : '',
  ]);

  const datos = [...encabezado, ...filasDatos];
  const anchos = [12, 12, 12, 22, 28, 12, 16, 8, 8, 8, 12, 12, 12];
  const wb = crearLibro([{ nombre: 'Inventario', datos, anchos }]);
  descargar(wb, `inventario_${new Date().toISOString().split('T')[0]}.xlsx`);
}

export function exportarMovimientosExcel({ filas, resumen, fechaInicio, fechaFin }) {
  const encabezado = [
    ['COMERCIALIZADORA VIDA — MOVIMIENTOS DE INVENTARIO'],
    [`Período: ${fechaInicio} al ${fechaFin}`, '', `Generado: ${new Date().toLocaleString('es-VE')}`],
    [`Entradas: ${resumen.TotalEntradas} | Salidas: ${resumen.TotalSalidas} | Ajustes: ${resumen.TotalAjustes}`],
    [],
    ['Fecha', 'País', 'Estado', 'Sucursal', 'Producto', 'SKU', 'Categoría', 'Tipo', 'Cantidad', 'Antes', 'Después', 'Motivo', 'Referencia', 'Usuario'],
  ];
  const filasDatos = filas.map(r => [
    fmtFecha(r.FechaAlta),
    r.Pais || '',
    r.Estado || '',
    r.NombrePuntoVenta,
    r.Producto,
    r.SKU || '',
    r.Categoria || '',
    r.TipoMovimiento,
    Number(r.Cantidad || 0),
    Number(r.CantidadAntes   || 0),
    Number(r.CantidadDespues || 0),
    r.Motivo     || '',
    r.Referencia || '',
    r.UsuAlta    || '',
  ]);

  const datos = [...encabezado, ...filasDatos];
  const anchos = [12, 12, 12, 22, 28, 12, 14, 10, 10, 10, 10, 25, 14, 14];
  const wb = crearLibro([{ nombre: 'Movimientos', datos, anchos }]);
  descargar(wb, `movimientos_${fechaInicio}_${fechaFin}.xlsx`);
}
