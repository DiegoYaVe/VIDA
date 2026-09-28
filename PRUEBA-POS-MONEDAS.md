# Prueba de cobro combinado y caja por moneda

## Preparación

1. Usar una base de pruebas SQL Server y una tienda de prueba. Tener aplicadas las migraciones 40, 41, 42 y **43_arqueo_monedas.sql**, en ese orden. La 43 agrega apertura VES y el resumen histórico de arqueo, sin alterar stock ni cierres anteriores.
2. Reiniciar backend con `backend/src/` completo (incluido `domain/pagoPos.mjs`). Compilar el frontend desde este repositorio completo y publicar el contenido de `frontend/dist/`. Backend y panel se actualizan juntos: el nuevo cierre exige conteo USD y VES.
3. Entrar con usuario de esa tienda. En Cuentas, configuración de moneda: AMBAS. Para los ejemplos numéricos siguientes, **solo en pruebas**, usar origen MANUAL y tasa vigente 40 VES/USD. No sustituir la tasa real de producción por estos ejemplos.
4. Preparar productos cuyo total sea 10 USD y existencias suficientes. Sincronizar pendientes de todos los dispositivos de la tienda antes de empezar.

## Cobro, inventario y comprobantes

1. Abrir caja con 20 USD y 100 VES.
2. Vender 10 USD: moneda «USD + bolívares», efectivo USD=5, efectivo VES=200, tarjetas=0. Cambio esperado=0. Ticket y reimpresión deben conservar ambos recibidos y tasa 40. Solo una venta y un descuento de inventario por operación.
3. Otra venta de 10 USD: efectivo USD=2, efectivo VES=200, tarjeta VES=200 y cambio en VES. Cambio esperado=80 VES. Efectivo neto de esta venta: 2 USD + 120 VES. Tarjeta: equivalente 5 USD, fuera de los billetes contados.
4. En ambas ventas revisar el total equivalente: 10 USD / 400 VES. No volver a cobrar una venta guardada pendiente de sincronización.
5. Cambiar la tasa de prueba y reimprimir las ventas anteriores: sus importes y TC deben seguir iguales. La nueva tasa aplica solo a nuevas operaciones confirmadas.

## Cierre

Después de las dos ventas anteriores:

| Concepto | USD físicos | VES físicos |
|---|---:|---:|
| Apertura | 20 | 100 |
| Efectivo neto vendido | 7 | 320 |
| Esperado | 27 | 420 |
| Contado de prueba | 26 | 460 |
| Diferencia | -1 | +40 |

El faltante USD y sobrante VES deben mostrarse separados, aunque equivalgan a la misma cantidad con la tasa del ejemplo. No consultar una tasa nueva para contar caja. Cerrar, pulsar Listo y revisar Historial: ambos conteos y diferencias deben permanecer. Cierres anteriores sin desglose se identifican como históricos en equivalente USD; no se inventa su efectivo VES.

## Casos de rechazo y red

- Pago 5 USD + 190 VES para una deuda de 10 USD: no confirmar.
- Tarjeta equivalente 11 USD para deuda de 10 USD: no confirmar.
- Efectivo 800 VES sin USD y cambio elegido USD: no confirmar; seleccionar VES y comprobar cambio 400 VES. No se permite entregar cambio mayor al efectivo recibido en esa moneda.
- Configuración USD o VES únicamente: no debe aparecer cobro combinado. Backend también lo rechaza.
- Conteos negativos, no numéricos o con más de dos decimales: rechazar. Cero explícito sí se acepta.
- Tasa/configuración cambia entre abrir y confirmar pago: pedir revisar y confirmar de nuevo.
- Desconectar después de obtener cotización válida: la venta conserva la autorización/tasa. Reconectar y sincronizar; no recalcular con tasa nueva ni duplicar venta.
- Intentar cerrar con pendientes de esta tienda en el navegador: bloquea y pide sincronizar. Pendientes de otros equipos no pueden detectarse desde este navegador: sincronizarlos antes de cerrar.
- Dos cierres simultáneos del mismo turno: uno debe cerrar y el otro responder conflicto. Validar esto contra SQL Server de prueba, no inferirlo solo de pruebas unitarias.
- ADMIN sin tienda o de otra tienda: no puede consultar/cerrar ese turno ni consultar historial de otra tienda.

## Límites pendientes

- No se han realizado estas pruebas SQL/E2E desde el agente. Sí hay pruebas unitarias de cálculos y compilación.
- Ventas offline que lleguen después de cerrar no modifican el arqueo guardado. Falta conciliación formal de ventas tardías y asociación explícita de cada venta a idTurno; hoy se usa tienda + fechas. El listado de transacciones puede incluir sincronizaciones tardías aunque el resumen cerrado permanece congelado.
- Arqueo POS: no incluye depósitos, retiros manuales ni devoluciones aún. Ventas sin turno siguen el comportamiento previo.
- Pagos con tarjeta aquí son registro de importes; no integran una pasarela.
- Las apps aún no tienen cobro USD/VES. Facturas/exportaciones y consolidación financiera por moneda siguen pendientes.
- Redondeo combinado: deuda a centavos USD y cambio a centavos de la moneda elegida. Diferencias menores a medio centavo USD se registran en AjusteRedondeoUSD (4 decimales); los importes físicos originales no cambian.
