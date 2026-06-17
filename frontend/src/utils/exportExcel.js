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
