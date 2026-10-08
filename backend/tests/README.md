# Tests del backend

Runner **nativo de Node** (`node --test`) — sin dependencias extra.

```bash
cd backend
npm test
```

## Qué se cubre

Tests **unitarios de la lógica de negocio pura** (dinero), deterministas y sin
base de datos, así que corren en cualquier lado (local/CI) sin conexión:

- `cupones.test.js` — motor `evaluarCupon`: tipos (% / $ fijo), compra mínima,
  tope de descuento, tope al subtotal, vigencia por fechas, canal, usos
  agotados, alcance por producto, redondeo.
- `promociones.test.js` — `mejorPromoUnitaria` (mejor precio por unidad, alcance
  TODO/PRODUCTO/CATEGORIA, clamp a 0) y `calcularLinea` (combos NxM vs
  descuento por unidad, se queda con el más barato).

Se eligieron estas funciones porque son **puras y exportadas**: reciben datos y
devuelven un resultado, sin tocar la BD. Importarlas no abre conexión (`getPool`
es perezoso), por eso los tests son rápidos y estables.

## Integración contra la BD (`tests/db/`)

Pruebas contra SQL Server de los flujos con dinero y documentos fiscales:
factura (total en Bs, IVA, una por pedido), número de control, notas de
crédito parciales, inmutabilidad, IGTF, devoluciones (stock, caja y NC) y
ventas offline tardías. Van **detrás de una bandera** para que `npm test` no
exija BD (por defecto aparecen como *skipped*):

```bash
RUN_DB_TESTS=1 npm run test:db      # usa la BD de backend/.env
```

Cada prueba crea datos ficticios (tienda, venta, turno) **dentro de una
transacción que siempre se revierte**: no dejan rastro, cosa necesaria porque
las facturas son inmutables (trigger) y no se podrían borrar. Pendiente:
cupones y vencimiento de puntos.

## Punta a punta contra QA (`tests/e2e/`)

`puntaAPunta.e2e.mjs` recorre con los controladores reales (sin HTTP):

- **Pago Móvil en bolívares:** comprobante subido antes → pedido → aprobación
  en el panel → repartidor acepta → entrega (stock, comisión, puntos) → factura.
- **Efectivo en dólares con IGTF** (tienda marcada temporalmente como
  contribuyente especial): pedido sin el IGTF rechazado → pedido → cobro en la
  app del repartidor → entrega → liquidación → factura con IGTF.
- **Venta offline rechazada** que pasa a revisión y al reintentar se registra;
  el reenvío del POS se reconoce como duplicado.

```bash
RUN_E2E_QA=1 npm run test:e2e
```

**Escribe en la BD de `backend/.env`** y por eso solo corre con la bandera y si
el nombre de la BD contiene "qa". Usa un repartidor de prueba propio, emite las
facturas en una transacción revertida y bloquea los push a Expo dentro del
proceso. Al terminar borra lo que creó y restaura stock, puntos y la tienda;
quedan solo las filas de auditoría (inmutables, unas 5 por corrida). Requiere
en QA la tienda 3 con stock del producto 1, el cliente 1 y una tasa vigente.
QA a veces rechaza la primera conexión: si falla por "Failed to connect",
vuelve a correrla.

### Monedas y tasa externa

`moneda.test.js` y `tasaBcv.test.js`: conversión, fecha efectiva Caracas,
rechazo de tasas futuras/vencidas, error de red/JSON, consulta por operación,
selección manual explícita y cambio concurrente de tasa. HTTP simulado en suite;
no se escribe SQL ni se llama al proveedor en tests. Pendiente SQL aislado para
índice único y bloqueos de snapshots/reversos (migraciones 40/41).
