import test from 'node:test';
import assert from 'node:assert/strict';
import {libroCuenta,pdfCuenta} from '../../frontend/src/utils/exportCuenta.js';
// Requiere dependencias frontend instaladas; no necesita navegador ni BD.
const data={cuenta:{idDocumento:77,Tipo:'CXC',TotalUSD:500,Saldo:250,Abonado:250},abonos:Array.from({length:120},(_,i)=>({idAbono:i+1,MontoUSD:2,Referencia:'=1+1',Notas:'Descripción extensa de prueba para verificar salto de página y ajuste del texto en la tabla del documento.'}))};
test('Excel mantiene cantidades numéricas y referencias externas como texto',()=>{
 const wb=libroCuenta(data),s=wb.Sheets['Pagos y reversos'];
 assert.equal(s.F2.v,2);assert.equal(s.F2.t,'n');
 assert.equal(s.L2.t,'s');assert.equal(s.L2.f,undefined);
 assert.equal(s.L2.v,'=1+1');assert.equal(wb.SheetNames.length,3);
});
test('PDF con muchos movimientos produce varias páginas',()=>{
 const pdf=pdfCuenta(data);assert.ok(pdf.getNumberOfPages()>3);
 assert.ok(pdf.output('arraybuffer').byteLength>1000);
});
