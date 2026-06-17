// src/utils/exportPDF.js
// Exportación a PDF usando jsPDF + jspdf-autotable
// npm install jspdf jspdf-autotable
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Paleta de colores VIDA ───────────────────────────────────────────────────
const AZUL   = [13,  43,  69];   // #0D2B45 — fondo header
const VERDE  = [39, 174,  96];   // #27AE60 — acento verde
const AZUL2  = [26, 106, 154];   // #1A6A9A — azul secundario
const BLANCO = [255, 255, 255];
const GRIS1  = [245, 247, 250];
const GRIS2  = [220, 225, 232];
const NEGRO  = [30,  30,  30];

// ─── Encabezado del documento ─────────────────────────────────────────────────
function agregarEncabezado(doc, titulo, subtitulo) {
  const W = doc.internal.pageSize.getWidth();

  // Banda azul superior
  doc.setFillColor(...AZUL);
  doc.rect(0, 0, W, 28, 'F');

  // Intentar cargar logo (debe existir en /public/logo-reporte.png)
  try {
    const img = new Image();
    img.src = '/logo-reporte.png';
    // Solo se agrega si la imagen ya está en el cache del navegador
    doc.addImage(img, 'PNG', 8, 3, 36, 22);
  } catch { /* sin logo — solo texto */ }

  // Texto VIDA
  doc.setTextColor(...BLANCO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('COMERCIALIZADORA', 50, 9);
  doc.setFontSize(16);
  doc.text('VIDA', 50, 17);

  // Tag verde "Plataforma de Desarrollo Empresarial"
  doc.setFillColor(...VERDE);
  doc.roundedRect(50, 19, 58, 6, 1, 1, 'F');
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLANCO);
  doc.text('PLATAFORMA DE DESARROLLO EMPRESARIAL', 79, 23, { align: 'center' });

  // Título del reporte (derecha)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...BLANCO);
  doc.text(titulo.toUpperCase(), W - 10, 12, { align: 'right' });
  if (subtitulo) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(subtitulo, W - 10, 20, { align: 'right' });
  }

  // Línea separadora
  doc.setDrawColor(...VERDE);
  doc.setLineWidth(0.8);
  doc.line(0, 28, W, 28);
}

// ─── Pie de página ────────────────────────────────────────────────────────────
function agregarPiePagina(doc) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const totalPags = doc.internal.getNumberOfPages();

  for (let i = 1; i <= totalPags; i++) {
    doc.setPage(i);
    doc.setDrawColor(...GRIS2);
    doc.setLineWidth(0.4);
    doc.line(10, H - 12, W - 10, H - 12);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text('Comercializadora VIDA — Por Venezuela, sus productos y su gente', 10, H - 7);
    doc.text(`Pág. ${i} / ${totalPags}`, W - 10, H - 7, { align: 'right' });
    doc.text(`Generado: ${new Date().toLocaleString('es-VE')}`, W / 2, H - 7, { align: 'center' });
  }
}

// ─── Tarjetas de resumen ──────────────────────────────────────────────────────
function tarjetasResumen(doc, tarjetas, startY) {
  const W    = doc.internal.pageSize.getWidth();
  const n    = tarjetas.length;
  const pad  = 10;
  const gap  = 4;
  const w    = (W - pad * 2 - gap * (n - 1)) / n;
  const h    = 18;

  tarjetas.forEach((t, i) => {
    const x = pad + i * (w + gap);
    doc.setFillColor(...GRIS1);
    doc.roundedRect(x, startY, w, h, 2, 2, 'F');
    doc.setDrawColor(...GRIS2);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, startY, w, h, 2, 2, 'S');
    // Barra de color izquierda
    doc.setFillColor(...(t.color || AZUL2));
    doc.roundedRect(x, startY, 2.5, h, 1, 1, 'F');
    // Etiqueta
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 100, 100);
    doc.text(t.label, x + 6, startY + 6);
    // Valor
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...NEGRO);
    doc.text(String(t.valor), x + 6, startY + 14);
  });

  return startY + h + 6;
}

// ─── Opciones comunes autoTable ───────────────────────────────────────────────
function opTabla(startY, columns, body) {
  return {
    startY,
    head: [columns.map(c => c.header)],
    body: body.map(row => columns.map(c => row[c.key] ?? '')),
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: 2.5,
      font: 'helvetica',
      textColor: NEGRO,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: AZUL,
      textColor: BLANCO,
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: GRIS1 },
    columnStyles: columns.reduce((acc, c, i) => {
      if (c.width) acc[i] = { cellWidth: c.width };
      if (c.align) acc[i] = { ...(acc[i] || {}), halign: c.align };
      return acc;
    }, {}),
    margin: { left: 10, right: 10 },
    didDrawPage: (data) => {
      // Encabezado en páginas adicionales
      if (data.pageNumber > 1) {
        const doc = data.doc;
        doc.setFillColor(...AZUL);
        doc.rect(0, 0, doc.internal.pageSize.getWidth(), 10, 'F');
      }
    },
  };
}

const USD = (v) => `$${Number(v || 0).toFixed(2)}`;
const FMT = (v) => Number(v || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 });
const FECHA = (f) => f ? new Date(f).toLocaleDateString('es-VE') : '';

// ─────────────────────────────────────────────────────────────────────────────
// REPORTE VENTAS
// ─────────────────────────────────────────────────────────────────────────────
export function exportarVentasPDF({ filas, totales, graficaDiaria, fechaInicio, fechaFin }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  agregarEncabezado(doc, 'Reporte de Ventas', `Período: ${fechaInicio} al ${fechaFin}`);

  const nextY = tarjetasResumen(doc, [
    { label: 'Total Ventas',   valor: totales.NumVentas,                color: AZUL2  },
    { label: 'Total USD',      valor: USD(totales.TotalUSD),            color: VERDE  },
    { label: 'Efectivo',       valor: USD(totales.TotalEfectivo),       color: [39, 174, 96]  },
    { label: 'Tarjeta',        valor: USD(totales.TotalTarjeta),        color: [52, 152, 219] },
    { label: 'Cambio devuelto',valor: USD(totales.TotalCambio),         color: [231, 76, 60]  },
  ], 33);

  const columns = [
    { header: 'País',       key: 'Pais',             width: 22 },
    { header: 'Estado',     key: 'Estado',           width: 22 },
    { header: 'Ciudad',     key: 'Ciudad',           width: 22 },
    { header: 'Sucursal',   key: 'NombrePuntoVenta', width: 40 },
    { header: 'Ventas',     key: 'NumVentas',        width: 16, align: 'right' },
    { header: 'Total USD',  key: '_TotalUSD',        width: 22, align: 'right' },
    { header: 'Efectivo',   key: '_Efectivo',        width: 22, align: 'right' },
    { header: 'Tarjeta',    key: '_Tarjeta',         width: 22, align: 'right' },
    { header: 'Cambio',     key: '_Cambio',          width: 18, align: 'right' },
  ];

  const body = [
    ...filas.map(r => ({
      ...r,
      _TotalUSD:  USD(r.TotalUSD),
      _Efectivo:  USD(r.TotalEfectivo),
      _Tarjeta:   USD(r.TotalTarjeta),
      _Cambio:    USD(r.TotalCambio),
    })),
    {
      Pais: '', Estado: '', Ciudad: '', NombrePuntoVenta: 'TOTALES',
      NumVentas:  totales.NumVentas,
      _TotalUSD:  USD(totales.TotalUSD),
      _Efectivo:  USD(totales.TotalEfectivo),
      _Tarjeta:   USD(totales.TotalTarjeta),
      _Cambio:    USD(totales.TotalCambio),
    },
  ];

  autoTable(doc, opTabla(nextY, columns, body));
  agregarPiePagina(doc);
  doc.save(`ventas_${fechaInicio}_${fechaFin}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORTE PRODUCTOS
// ─────────────────────────────────────────────────────────────────────────────
export function exportarProductosPDF({ filas, totales, fechaInicio, fechaFin }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  agregarEncabezado(doc, 'Productos más Vendidos', `Período: ${fechaInicio} al ${fechaFin}`);

  const nextY = tarjetasResumen(doc, [
    { label: 'Productos distintos', valor: totales.NumProductos,              color: AZUL2 },
    { label: 'Total unidades',      valor: FMT(totales.TotalCantidad),        color: VERDE },
    { label: 'Ingresos totales',    valor: USD(totales.TotalRevenue),         color: [231, 76, 60] },
  ], 33);

  const columns = [
    { header: '#',           key: '_rank',          width: 8,  align: 'center' },
    { header: 'Producto',    key: 'NombreProducto', width: 60 },
    { header: 'Categoría',   key: 'Categoria',      width: 30 },
    { header: 'Unidad',      key: 'UnidadMedida',   width: 18, align: 'center' },
    { header: 'Cant.',       key: '_cant',          width: 18, align: 'right' },
    { header: 'Ingresos',    key: '_rev',           width: 22, align: 'right' },
    { header: 'Pedidos',     key: 'NumPedidos',     width: 16, align: 'right' },
    { header: 'Precio',      key: '_precio',        width: 20, align: 'right' },
  ];

  const body = filas.map((r, i) => ({
    ...r,
    _rank:   i + 1,
    _cant:   FMT(r.TotalCantidad),
    _rev:    USD(r.TotalRevenue),
    _precio: USD(r.PrecioActual),
  }));

  autoTable(doc, opTabla(nextY, columns, body));
  agregarPiePagina(doc);
  doc.save(`productos_${fechaInicio}_${fechaFin}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORTE INVENTARIO
// ─────────────────────────────────────────────────────────────────────────────
export function exportarInventarioPDF({ filas, resumen }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const hoy = new Date().toLocaleDateString('es-VE');
  agregarEncabezado(doc, 'Inventario Actual', `Corte al ${hoy}`);

  const nextY = tarjetasResumen(doc, [
    { label: 'Total productos',  valor: resumen.TotalProductos,              color: AZUL2 },
    { label: 'Bajo stock',       valor: resumen.TotalBajoStock,              color: [231, 76, 60] },
    { label: 'Valor total stock',valor: USD(resumen.ValorTotalStock),        color: VERDE },
  ], 33);

  const columns = [
    { header: 'País',      key: 'Pais',            width: 18 },
    { header: 'Estado',    key: 'Estado',          width: 20 },
    { header: 'Sucursal',  key: 'NombrePuntoVenta',width: 34 },
    { header: 'Producto',  key: 'Producto',        width: 44 },
    { header: 'SKU',       key: 'SKU',             width: 18 },
    { header: 'Categoría', key: 'Categoria',       width: 22 },
    { header: 'Unidad',    key: 'UnidadMedida',    width: 14, align: 'center' },
    { header: 'Stock',     key: '_stock',          width: 14, align: 'right' },
    { header: 'Mín.',      key: '_min',            width: 12, align: 'right' },
    { header: 'Precio',    key: '_precio',         width: 18, align: 'right' },
    { header: 'Valor',     key: '_valor',          width: 18, align: 'right' },
    { header: 'Alerta',    key: '_alerta',         width: 16, align: 'center' },
  ];

  const body = filas.map(r => ({
    ...r,
    _stock:  FMT(r.Stock),
    _min:    FMT(r.StockMinimo),
    _precio: USD(r.PrecioUSD),
    _valor:  USD(r.ValorStock),
    _alerta: r.StockBajo ? '⚠ BAJO' : '',
  }));

  const opts = opTabla(nextY, columns, body);
  opts.didParseCell = (data) => {
    if (data.section === 'body') {
      const row = body[data.row.index];
      if (row && row.StockBajo) {
        data.cell.styles.textColor = [192, 57, 43];
        data.cell.styles.fontStyle = 'bold';
      }
    }
  };

  autoTable(doc, opts);
  agregarPiePagina(doc);
  doc.save(`inventario_${new Date().toISOString().split('T')[0]}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORTE MOVIMIENTOS
// ─────────────────────────────────────────────────────────────────────────────
export function exportarMovimientosPDF({ filas, resumen, fechaInicio, fechaFin }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  agregarEncabezado(doc, 'Movimientos de Inventario', `Período: ${fechaInicio} al ${fechaFin}`);

  const nextY = tarjetasResumen(doc, [
    { label: 'Entradas',           valor: resumen.TotalEntradas,            color: VERDE },
    { label: 'Cant. entrada',      valor: FMT(resumen.CantEntradas),        color: VERDE },
    { label: 'Salidas',            valor: resumen.TotalSalidas,             color: [231, 76, 60] },
    { label: 'Cant. salida',       valor: FMT(resumen.CantSalidas),         color: [231, 76, 60] },
    { label: 'Ajustes',            valor: resumen.TotalAjustes,             color: AZUL2 },
  ], 33);

  const columns = [
    { header: 'Fecha',     key: '_fecha',          width: 20 },
    { header: 'Estado',    key: 'Estado',          width: 18 },
    { header: 'Sucursal',  key: 'NombrePuntoVenta',width: 32 },
    { header: 'Producto',  key: 'Producto',        width: 44 },
    { header: 'SKU',       key: 'SKU',             width: 16 },
    { header: 'Tipo',      key: 'TipoMovimiento',  width: 16, align: 'center' },
    { header: 'Cantidad',  key: '_cant',           width: 16, align: 'right' },
    { header: 'Antes',     key: '_antes',          width: 14, align: 'right' },
    { header: 'Después',   key: '_despues',        width: 14, align: 'right' },
    { header: 'Motivo',    key: 'Motivo',          width: 30 },
    { header: 'Usuario',   key: 'UsuAlta',         width: 16 },
  ];

  const TIPO_COLOR = {
    ENTRADA: [39, 174, 96],
    SALIDA:  [231, 76, 60],
    AJUSTE:  [52, 152, 219],
  };

  const body = filas.map(r => ({
    ...r,
    _fecha:   FECHA(r.FechaAlta),
    _cant:    FMT(r.Cantidad),
    _antes:   FMT(r.CantidadAntes),
    _despues: FMT(r.CantidadDespues),
  }));

  const opts = opTabla(nextY, columns, body);
  opts.didParseCell = (data) => {
    if (data.section === 'body' && data.column.index === 5) {
      const row = body[data.row.index];
      if (row) data.cell.styles.textColor = TIPO_COLOR[row.TipoMovimiento] || NEGRO;
    }
  };

  autoTable(doc, opts);
  agregarPiePagina(doc);
  doc.save(`movimientos_${fechaInicio}_${fechaFin}.pdf`);
}
