import test from 'node:test';
import assert from 'node:assert/strict';
import {plazoPagoMinutos,PLAZO_PAGO_MOVIL_DEFAULT_MIN} from '../src/services/pagoMovil.service.js';

test('plazo de Pago Móvil: sin configurar usa el valor por defecto',()=>{
 assert.equal(PLAZO_PAGO_MOVIL_DEFAULT_MIN,60);
 for(const v of [undefined,null,'','  ']) assert.equal(plazoPagoMinutos(v),60);
});
test('plazo de Pago Móvil: respeta minutos enteros configurados',()=>{
 assert.equal(plazoPagoMinutos('30'),30);assert.equal(plazoPagoMinutos(90),90);
});
test('plazo de Pago Móvil: 0 desactiva el vencimiento',()=>{
 assert.equal(plazoPagoMinutos('0'),0);
});
test('plazo de Pago Móvil: valores inválidos no desactivan, vuelven al defecto',()=>{
 for(const v of ['-5','abc','12.5','1e9x']) assert.equal(plazoPagoMinutos(v),60);
});
