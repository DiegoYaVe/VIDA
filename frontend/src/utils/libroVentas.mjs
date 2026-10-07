// src/utils/libroVentas.mjs
// Filas del libro de ventas (formato SENIAT): una por documento; las notas de
// crédito restan. Sin dependencias para poder probarlo con node --test.

export const bs = (v) => Number(v || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const numeroDoc = (n) => String(n ?? '').padStart(8, '0');

// 'J000029610' → 'J-00002961-0'; 'V12345678' → 'V-12345678'
export function formatearDocumento(doc) {
  const d = String(doc ?? '');
  if (/^[VEJPGC]\d{9}$/.test(d)) return `${d[0]}-${d.slice(1, 9)}-${d[9]}`;
  return d.replace(/^([VE])(\d+)$/, '$1-$2');
}

export const ENCABEZADO_LIBRO = [
  'N° op.', 'Fecha', 'Tienda', 'RIF / C.I. cliente', 'Nombre o razón social', 'Tipo', 'N° documento',
  'N° control', 'Factura afectada', 'Total con IVA (Bs)', 'Exento (Bs)',
  'Base general (Bs)', '% general', 'IVA general (Bs)', 'Base reducida (Bs)', '% reducida', 'IVA reducida (Bs)',
  'IGTF (Bs)', 'Equivalente USD',
];

const r2 = (v) => Math.round(v * 100) / 100;

export function filasLibroVentas(documentos) {
  const filas = documentos.map((f, i) => {
    const s = f.TipoDocumento === 'NOTA_CREDITO' ? -1 : 1;
    return [
      i + 1,
      String(f.FechaFiscal).slice(0, 10),
      f.NombreTienda || `Tienda ${f.idPuntoVenta}`,
      formatearDocumento(f.ReceptorDocumento),
      f.ReceptorNombre,
      f.TipoDocumento === 'NOTA_CREDITO' ? 'NC' : 'FAC',
      numeroDoc(f.Numero),
      f.NumeroControl || 'PENDIENTE',
      f.NumeroAfectada != null ? numeroDoc(f.NumeroAfectada) : '',
      r2(s * f.TotalVES), r2(s * f.ExentoVES),
      r2(s * f.BaseGeneralVES), Number(f.PctGeneral), r2(s * f.IVAGeneralVES),
      r2(s * f.BaseReducidaVES), Number(f.PctReducida), r2(s * f.IVAReducidaVES),
      r2(s * f.IGTFVES), r2(s * f.TotalUSD),
    ];
  });
  const col = (k) => r2(filas.reduce((t, f) => t + f[k], 0));
  const totales = ['', '', '', '', 'TOTALES', '', '', '', '', col(9), col(10), col(11), '', col(13), col(14), '', col(16), col(17), col(18)];
  return { encabezado: ENCABEZADO_LIBRO, filas, totales };
}
