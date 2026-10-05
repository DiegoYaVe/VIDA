import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { prepararDocumentoCuenta } from './documentoCuenta.mjs';

const NAVY = '0A1E3F';
const AQUA = '54C4E0';
const GREEN = '5BBE6A';
const LIGHT = 'F3F7FA';
const GRAY = '667085';

const money = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const safe = (v, fallback = 'No registrado') => v === null || v === undefined || v === '' ? fallback : String(v);
const cabeceraObjeto = (d) => Object.fromEntries(d.cabecera);

async function cargarLogo() {
  if (typeof fetch !== 'function') return null;
  try {
    const response = await fetch('/logo-reporte.png');
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

// Se conserva para las pruebas automatizadas de integridad y compatibilidad.
export function libroCuenta(data) {
  const d = prepararDocumentoCuenta(data), wb = XLSX.utils.book_new();
  const hojas = [
    ['Documento', [['COMERCIALIZADORA VIDA — ESTADO DE CUENTA'], [d.aviso], ['Generado', new Date().toISOString()], [], ...d.cabecera]],
    ['Pagos y reversos', [d.columnasPagos, ...d.pagos]],
    ['Notas de crédito', [d.columnasNotas, ...d.notas]],
  ];
  for (const [nombre, filas] of hojas) {
    const ws = XLSX.utils.aoa_to_sheet(filas);
    ws['!cols'] = Array.from({ length: Math.max(...filas.map(f => f.length)) }, (_, i) => ({ wch: i === 0 ? 28 : 24 }));
    XLSX.utils.book_append_sheet(wb, ws, nombre);
  }
  return wb;
}

function dibujarEncabezado(doc, d, logo) {
  doc.setFillColor(10, 30, 63); doc.rect(0, 0, 210, 39, 'F');
  if (logo) {
    doc.setFillColor(255, 255, 255); doc.roundedRect(12, 7, 48, 25, 2, 2, 'F');
    doc.addImage(logo, 'PNG', 14, 9, 44, 21);
  } else {
    doc.setTextColor(84, 196, 224); doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text('VIDA', 14, 23);
  }
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.text('Estado de cuenta', 69, 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(`Documento #${d.id} · Emitido ${new Date().toLocaleString('es-VE')}`, 69, 26);
}

function tarjeta(doc, x, y, ancho, titulo, valor, color) {
  doc.setFillColor(247, 249, 252); doc.setDrawColor(229, 234, 240); doc.roundedRect(x, y, ancho, 25, 2, 2, 'FD');
  doc.setFillColor(...color); doc.roundedRect(x, y, 3, 25, 2, 2, 'F');
  doc.setTextColor(102, 112, 133); doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.text(titulo.toUpperCase(), x + 7, y + 8);
  doc.setTextColor(10, 30, 63); doc.setFontSize(14); doc.text(valor, x + 7, y + 18);
}

function agregarPie(doc, d) {
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i); doc.setDrawColor(220, 226, 232); doc.line(14, 281, 196, 281);
    doc.setTextColor(110, 120, 135); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
    doc.text('COMERCIALIZADORA VIDA · Documento informativo, no sustituye factura fiscal.', 14, 286);
    doc.text(`Página ${i} de ${paginas} · Cuenta #${d.id}`, 196, 286, { align: 'right' });
  }
}

export function pdfCuenta(data, logo = null) {
  const d = prepararDocumentoCuenta(data), c = cabeceraObjeto(d);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  dibujarEncabezado(doc, d, logo);
  doc.setTextColor(10, 30, 63); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(safe(c.Contraparte, 'Sin contraparte'), 14, 49);
  doc.setTextColor(102, 112, 133); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text(`${safe(c.Tipo)} · Folio ${safe(c.Folio, 'sin folio')} · ${safe(c.Origen)}`, 14, 55);
  tarjeta(doc, 14, 62, 55, 'Total', money(c['Total USD']), [84, 196, 224]);
  tarjeta(doc, 77, 62, 55, 'Abonado', money(c['Abonos netos USD']), [91, 190, 106]);
  tarjeta(doc, 140, 62, 56, 'Saldo pendiente', money(c['Saldo USD']), [10, 30, 63]);
  autoTable(doc, {
    startY: 95, margin: { left: 14, right: 14, bottom: 20 }, head: [['INFORMACIÓN DEL DOCUMENTO', 'DETALLE']],
    body: [
      ['Estado', safe(c.Estado)], ['Fecha de emisión', safe(c.Emisión)], ['Fecha de vencimiento', safe(c.Vencimiento)],
      ['Plazo acordado', `${safe(c['Plazo (días)'], '0')} días`], ['Notas de crédito', money(c['Notas de crédito USD'])],
      ['Equivalente al emitir', c['Equivalente VES al emitir'] == null ? 'Sin equivalencia registrada' : `${Number(c['Equivalente VES al emitir']).toLocaleString('es-VE')} VES`],
      ['Tasa histórica', c['Tasa de emisión VES/USD'] == null ? 'Sin tasa registrada' : `1 USD = ${Number(c['Tasa de emisión VES/USD']).toLocaleString('es-VE', { maximumFractionDigits: 8 })} VES`],
      ['Fecha y fuente de tasa', `${safe(c['Fecha de tasa de emisión'])} · ${safe(c['Fuente de emisión'])}`],
    ],
    theme: 'plain', styles: { fontSize: 8.5, cellPadding: 3, textColor: [55, 65, 81], lineColor: [232, 236, 241], lineWidth: 0.15 },
    headStyles: { fillColor: [10, 30, 63], textColor: 255, fontStyle: 'bold' }, columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold', textColor: [102, 112, 133] } },
    alternateRowStyles: { fillColor: [247, 249, 252] },
  });
  let y = doc.lastAutoTable.finalY + 10;
  doc.setTextColor(10, 30, 63); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Movimientos de la cuenta', 14, y); y += 4;
  autoTable(doc, {
    startY: y, margin: { left: 14, right: 14, bottom: 20 }, head: [['Fecha', 'Movimiento', 'Moneda / importe', 'Equivalente USD', 'Método', 'Referencia']],
    body: d.pagos.length ? d.pagos.map(p => [safe(p[1], '—'), safe(p[2], '—'), `${safe(p[3], '—')} ${p[4] ?? ''}`.trim(), money(p[5]), safe(p[10], '—'), safe(p[11], '—')]) : [['—', 'Sin movimientos registrados', '—', '—', '—', '—']],
    styles: { fontSize: 7.5, cellPadding: 2.5, overflow: 'linebreak', textColor: [55, 65, 81] }, headStyles: { fillColor: [84, 196, 224], textColor: [10, 30, 63], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 249, 252] }, rowPageBreak: 'avoid',
  });
  if (d.notas.length) {
    y = doc.lastAutoTable.finalY + 9; if (y > 245) { doc.addPage(); y = 20; }
    doc.setTextColor(10, 30, 63); doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text('Notas de crédito', 14, y);
    autoTable(doc, { startY: y + 4, margin: { left: 14, right: 14, bottom: 20 }, head: [['Fecha', 'Importe', 'Motivo', 'Cierra cuenta']], body: d.notas.map(n => [safe(n[1]), money(n[2]), safe(n[3]), safe(n[4])]), headStyles: { fillColor: [10, 30, 63], textColor: 255 }, styles: { fontSize: 8, cellPadding: 2.5 }, alternateRowStyles: { fillColor: [247, 249, 252] } });
  }
  agregarPie(doc, d); return doc;
}

function estiloTitulo(cell, color = NAVY) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color}` } };
  cell.font = { name: 'Aptos Display', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
}

async function libroEjecutivoCuenta(data, logo) {
  const d = prepararDocumentoCuenta(data), c = cabeceraObjeto(d), wb = new ExcelJS.Workbook();
  wb.creator = 'Comercializadora VIDA'; wb.created = new Date();
  const ws = wb.addWorksheet('Estado de cuenta', { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 24 }, { width: 23 }, { width: 23 }, { width: 23 }, { width: 18 }, { width: 18 }];
  ws.mergeCells('A1:F4'); const title = ws.getCell('A1'); title.value = `ESTADO DE CUENTA  #${d.id}`; estiloTitulo(title); title.alignment = { vertical: 'middle', horizontal: 'right' };
  ws.getRow(1).height = 24; ws.getRow(2).height = 20; ws.getRow(3).height = 20; ws.getRow(4).height = 18;
  if (logo) { const imageId = wb.addImage({ base64: logo, extension: 'png' }); ws.addImage(imageId, { tl: { col: 0.2, row: 0.25 }, ext: { width: 210, height: 72 } }); }
  ws.mergeCells('A6:F6'); ws.getCell('A6').value = safe(c.Contraparte, 'Sin contraparte'); ws.getCell('A6').font = { size: 15, bold: true, color: { argb: `FF${NAVY}` } };
  ws.mergeCells('A7:F7'); ws.getCell('A7').value = `${safe(c.Tipo)} · Folio ${safe(c.Folio, 'sin folio')} · ${safe(c.Origen)}`; ws.getCell('A7').font = { size: 10, color: { argb: `FF${GRAY}` } };
  const cards = [['A9', 'B10', 'TOTAL', money(c['Total USD']), AQUA], ['C9', 'D10', 'ABONADO', money(c['Abonos netos USD']), GREEN], ['E9', 'F10', 'SALDO', money(c['Saldo USD']), NAVY]];
  for (const [ini, fin, label, value, color] of cards) { ws.mergeCells(`${ini}:${fin}`); const cell = ws.getCell(ini); cell.value = `${label}\n${value}`; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color}` } }; cell.font = { size: 12, bold: true, color: { argb: color === AQUA ? `FF${NAVY}` : 'FFFFFFFF' } }; cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; }
  ws.getRow(9).height = 26; ws.getRow(10).height = 26;
  ws.mergeCells('A12:F12'); ws.getCell('A12').value = 'INFORMACIÓN DEL DOCUMENTO'; estiloTitulo(ws.getCell('A12'));
  const detalle = [
    ['Estado', safe(c.Estado), 'Emisión', safe(c.Emisión), 'Vencimiento', safe(c.Vencimiento)],
    ['Plazo', `${safe(c['Plazo (días)'], '0')} días`, 'Nota de crédito', money(c['Notas de crédito USD']), 'Equivalente VES', c['Equivalente VES al emitir'] == null ? 'No registrado' : Number(c['Equivalente VES al emitir'])],
    ['Tasa histórica', c['Tasa de emisión VES/USD'] == null ? 'No registrada' : Number(c['Tasa de emisión VES/USD']), 'Fecha tasa', safe(c['Fecha de tasa de emisión']), 'Fuente', safe(c['Fuente de emisión'])],
  ];
  detalle.forEach((values, idx) => { const row = ws.addRow(values); row.height = 24; row.eachCell((cell, col) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${idx % 2 ? LIGHT : 'FFFFFF'}` } }; cell.font = { size: 10, bold: col % 2 === 1, color: { argb: col % 2 === 1 ? `FF${GRAY}` : `FF${NAVY}` } }; cell.alignment = { vertical: 'middle', wrapText: true }; cell.border = { bottom: { style: 'hair', color: { argb: 'FFE4E7EC' } } }; }); });

  const mov = wb.addWorksheet('Movimientos', { views: [{ state: 'frozen', ySplit: 5, showGridLines: false }] });
  mov.columns = [12, 14, 21, 17, 18, 16, 18, 17, 14, 28, 18, 20, 14, 30].map(width => ({ width }));
  mov.mergeCells('A1:N3'); mov.getCell('A1').value = `VIDA · MOVIMIENTOS DE CUENTA #${d.id}`; estiloTitulo(mov.getCell('A1'));
  mov.mergeCells('A4:N4'); mov.getCell('A4').value = d.aviso; mov.getCell('A4').font = { italic: true, size: 9, color: { argb: `FF${GRAY}` } }; mov.getCell('A4').alignment = { wrapText: true };
  mov.addRow(d.columnasPagos); const header = mov.getRow(5); header.height = 28; header.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${AQUA}` } }; cell.font = { bold: true, color: { argb: `FF${NAVY}` } }; cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; });
  (d.pagos.length ? d.pagos : [['', '', 'Sin movimientos registrados']]).forEach((values, idx) => { const row = mov.addRow(values); row.height = 23; row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 ? 'FFFFFFFF' : `FF${LIGHT}` } }; cell.alignment = { vertical: 'middle', wrapText: true }; cell.border = { bottom: { style: 'hair', color: { argb: 'FFE4E7EC' } } }; }); });
  mov.autoFilter = { from: 'A5', to: 'N5' };
  const nc = wb.addWorksheet('Notas de crédito', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
  nc.columns = [{ width: 12 }, { width: 16 }, { width: 18 }, { width: 55 }, { width: 18 }];
  nc.mergeCells('A1:E3'); nc.getCell('A1').value = `VIDA · NOTAS DE CRÉDITO · CUENTA #${d.id}`; estiloTitulo(nc.getCell('A1'));
  nc.addRow(d.columnasNotas); nc.getRow(4).eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${AQUA}` } }; cell.font = { bold: true, color: { argb: `FF${NAVY}` } }; });
  (d.notas.length ? d.notas : [['', '', '', 'Sin notas de crédito', '']]).forEach((values, idx) => { const row = nc.addRow(values); row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 ? 'FFFFFFFF' : `FF${LIGHT}` } }; cell.alignment = { vertical: 'middle', wrapText: true }; }); });
  return wb;
}

function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportarCuenta(data, formato) {
  const d = prepararDocumentoCuenta(data), folio = Object.fromEntries(d.cabecera).Folio;
  const nombre = `VIDA-${folio || `cuenta-${d.id}`}`.replace(/[^a-zA-Z0-9_-]/g, '-'), logo = await cargarLogo();
  if (formato === 'pdf') { pdfCuenta(data, logo).save(`${nombre}.pdf`); return; }
  const workbook = await libroEjecutivoCuenta(data, logo), buffer = await workbook.xlsx.writeBuffer();
  descargarBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${nombre}.xlsx`);
}
