// src/utils/ordenCompraPDF.js
// Orden de compra de VIDA a un proveedor (tarea 27), en PDF. La usan el panel
// de VIDA y el Portal de proveedores. Nunca lleva datos de la tienda: solo el
// folio de VIDA, quién recoge (repartidor o cliente de VIDA) y el punto de retiro.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const NAVY = [10, 30, 63], VERDE = [70, 166, 87], GRIS = [107, 114, 128], LINEA = [227, 232, 238];
const usd = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaLarga = (f) => new Date(f || Date.now()).toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Caracas' });
export const ENTREGA_TEXTO = {
  REPARTIDOR_VIDA: 'La recoge un repartidor de VIDA',
  RECOGE_CLIENTE_VIDA: 'La recoge un cliente de VIDA en su punto de retiro',
};

async function logoDataUrl() {
  try {
    const blob = await (await fetch('/logo-reporte.png')).blob();
    return await new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = mal; r.readAsDataURL(blob); });
  } catch { return null; }
}

// oc: { Folio, Fecha, Entrega, proveedor:{Nombre, RIF}, retiro:{Sucursal, Direccion, Horario}|null,
//       lineas:[{CodigoProveedor, Nombre, UnidadMedida, Cantidad, PrecioLista}], TotalListaUSD, ComisionPct,
//       TotalPagarUSD, Condiciones, portalUrl? }
export async function descargarOrdenCompra(oc) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), M = 16;

  // Encabezado: logo y título
  const logo = await logoDataUrl();
  if (logo) doc.addImage(logo, 'PNG', M, 10, 44, 25);
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text('ORDEN DE COMPRA', W - M, 19, { align: 'right' });
  doc.setFontSize(11); doc.setTextColor(...GRIS); doc.setFont('helvetica', 'normal');
  doc.text(`Folio ${oc.Folio}`, W - M, 26, { align: 'right' });
  doc.text(fechaLarga(oc.Fecha), W - M, 31.5, { align: 'right' });
  doc.setDrawColor(...VERDE); doc.setLineWidth(0.8); doc.line(M, 39, W - M, 39);

  // Comprador / proveedor / entrega
  const col = (x, y, titulo, lineas) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...GRIS);
    doc.text(titulo.toUpperCase(), x, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(31, 41, 55);
    let yy = y + 5;
    for (const l of lineas.filter(Boolean)) { const t = doc.splitTextToSize(l, (W - 2 * M) / 3 - 4); doc.text(t, x, yy); yy += 4.6 * t.length; }
    return yy;
  };
  const ancho = (W - 2 * M) / 3;
  const r = oc.retiro;
  const fin = Math.max(
    col(M, 47, 'Comprador', ['Comercializadora VIDA', 'Plataforma de Desarrollo Empresarial']),
    col(M + ancho, 47, 'Proveedor', [oc.proveedor?.Nombre, oc.proveedor?.RIF ? `RIF ${oc.proveedor.RIF}` : null]),
    col(M + 2 * ancho, 47, 'Entrega', [ENTREGA_TEXTO[oc.Entrega] || oc.Entrega,
      r ? `Punto de retiro: ${[r.Sucursal, r.Direccion].filter(Boolean).join(' · ')}` : null, r?.Horario ? `Horario: ${r.Horario}` : null]),
  );

  // Productos
  autoTable(doc, {
    startY: fin + 4,
    margin: { left: M, right: M },
    head: [['Código', 'Producto', 'Unidad', 'Cantidad', 'Precio lista', 'Importe']],
    body: oc.lineas.map(l => [l.CodigoProveedor || '—', l.Nombre, l.UnidadMedida || '', Number(l.Cantidad).toLocaleString('es-VE'),
      usd(l.PrecioLista), usd(Number(l.Cantidad) * Number(l.PrecioLista))]),
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.2, textColor: [31, 41, 55], lineColor: LINEA, lineWidth: 0.2 },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 249, 251] },
    columnStyles: { 0: { cellWidth: 26, font: 'courier' }, 2: { cellWidth: 18 }, 3: { halign: 'right', cellWidth: 20 }, 4: { halign: 'right', cellWidth: 24 }, 5: { halign: 'right', cellWidth: 26 } },
  });

  // Totales
  let y = doc.lastAutoTable.finalY + 6;
  const fila = (t, v, fuerte = false) => {
    doc.setFont('helvetica', fuerte ? 'bold' : 'normal'); doc.setFontSize(fuerte ? 12 : 10);
    doc.setTextColor(...(fuerte ? NAVY : GRIS));
    doc.text(t, W - M - 42, y, { align: 'right' }); doc.text(v, W - M, y, { align: 'right' }); y += fuerte ? 7 : 5.5;
  };
  fila('Total a precio de lista', usd(oc.TotalListaUSD));
  // Guion normal: la tipografía del PDF no trae el signo menos (−) y lo deforma
  fila(`Comisión VIDA (${Number(oc.ComisionPct)} %)`, `- ${usd(Number(oc.TotalListaUSD) - Number(oc.TotalPagarUSD))}`);
  fila('Total a pagar al proveedor', usd(oc.TotalPagarUSD), true);

  // Condiciones
  y += 4;
  doc.setFillColor(234, 247, 238); doc.roundedRect(M, y, W - 2 * M, 25, 2, 2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...NAVY);
  doc.text('Condiciones', M + 4, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(31, 41, 55);
  const cond = [
    oc.Condiciones || 'Pago de contado al recibir la mercancía, sin días de crédito.',
    'Entregue la mercancía solo contra el código QR que presenta quien la recoge.',
    oc.portalUrl ? `Confirme el pedido y avise cuando esté listo en su portal: ${oc.portalUrl}` : 'Confirme el pedido y avise a VIDA cuando esté listo.',
  ];
  doc.text(cond.flatMap(c => doc.splitTextToSize(`• ${c}`, W - 2 * M - 8)), M + 4, y + 11.5);

  // Pie
  const H = doc.internal.pageSize.getHeight();
  doc.setFontSize(8); doc.setTextColor(...GRIS);
  doc.text('Comercializadora VIDA · Por Venezuela, sus productos y su gente', M, H - 10);
  doc.text(`OC ${oc.Folio}`, W - M, H - 10, { align: 'right' });

  doc.save(`orden-compra-${oc.Folio}.pdf`);
}

// Mensaje de WhatsApp para el proveedor que no entra a su portal
export function mensajeWhatsApp(oc) {
  const lineas = oc.lineas.map(l => `• ${Number(l.Cantidad)} × ${l.Nombre}${l.CodigoProveedor ? ` (${l.CodigoProveedor})` : ''}`).join('\n');
  return `Hola, ${oc.proveedor?.Nombre || ''}. Comercializadora VIDA le envía la orden de compra ${oc.Folio}:\n${lineas}\n`
    + `Total a pagarle: ${usd(oc.TotalPagarUSD)}, de contado al recibir.\n${ENTREGA_TEXTO[oc.Entrega] || ''}.`
    + (oc.portalUrl ? `\nConfírmela en su portal: ${oc.portalUrl}` : '');
}

// Teléfono venezolano a formato de WhatsApp (58…); null si no sirve
export function telefonoWhatsApp(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('0')) d = '58' + d.slice(1);
  else if (d.length === 10) d = '58' + d;
  return d.length >= 11 ? d : null;
}
