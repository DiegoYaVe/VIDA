import {jsPDF} from 'jspdf';
import {autoTable} from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {prepararDocumentoCuenta} from './documentoCuenta.mjs';

export function libroCuenta(data) {
 const d=prepararDocumentoCuenta(data),wb=XLSX.utils.book_new();
 const hojas=[['Documento',[['COMERCIALIZADORA VIDA — ESTADO DE CUENTA'],[d.aviso],['Generado',new Date().toISOString()],[],...d.cabecera]],
  ['Pagos y reversos',[d.columnasPagos,...d.pagos]],['Notas de crédito',[d.columnasNotas,...d.notas]]];
 for(const [nombre,filas] of hojas) {
  // aoa_to_sheet conserva strings como texto, incluso si empiezan con = o +.
  const ws=XLSX.utils.aoa_to_sheet(filas);
  ws['!cols']=Array.from({length:Math.max(...filas.map(f=>f.length))},(_,i)=>({wch:i===0?28:24}));
  XLSX.utils.book_append_sheet(wb,ws,nombre);
 }
 return wb;
}

export function pdfCuenta(data) {
 const d=prepararDocumentoCuenta(data),doc=new jsPDF({orientation:'landscape'});
 const tabla=(head,body,startY=32)=>autoTable(doc,{head,body,startY,margin:{top:32,bottom:18},
  styles:{fontSize:8,overflow:'linebreak',cellPadding:2},headStyles:{fillColor:[10,30,63]},rowPageBreak:'avoid'});
 tabla([['Concepto','Dato']],d.cabecera.map(f=>f.map(v=>v??'No registrado')));
 doc.addPage();
 tabla([d.columnasPagos],d.pagos.length?d.pagos.map(f=>f.map(v=>v??'Sin dato')):[['Sin movimientos']]);
 doc.addPage();
 tabla([d.columnasNotas],d.notas.length?d.notas:[['Sin notas de crédito']]);
 const paginas=doc.getNumberOfPages();
 for(let i=1;i<=paginas;i++) {
  doc.setPage(i);doc.setFillColor(10,30,63);doc.rect(0,0,297,23,'F');
  doc.setTextColor(255);doc.setFontSize(15);doc.text('VIDA | Estado de cuenta #'+d.id,14,14);
  doc.setTextColor(70);doc.setFontSize(7);
  doc.text(doc.splitTextToSize(d.aviso,268),14,198);
  doc.text(`${i}/${paginas} · Generado ${new Date().toISOString()}`,282,190,{align:'right'});
 }
 return doc;
}

export function exportarCuenta(data,formato) {
 const nombre=`VIDA-cuenta-${prepararDocumentoCuenta(data).id}`;
 if(formato==='pdf') pdfCuenta(data).save(nombre+'.pdf');
 else XLSX.writeFile(libroCuenta(data),nombre+'.xlsx');
}
