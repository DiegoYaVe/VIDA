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

## Pendiente (siguiente paso)

Tests de **integración** contra una BD de prueba (los flujos que hoy se validan
con scripts E2E manuales: aplicar/redimir cupón, vencimiento de puntos, IDs
concurrentes). Conviene dejarlos **detrás de una bandera de entorno**
(p. ej. `RUN_DB_TESTS=1`) para no exigir BD en el `npm test` por defecto, ya que
mutan datos.

### Monedas y tasa externa

`moneda.test.js` y `tasaBcv.test.js`: conversión, fecha efectiva Caracas,
rechazo de tasas futuras/vencidas, error de red/JSON, consulta por operación,
selección manual explícita y cambio concurrente de tasa. HTTP simulado en suite;
no se escribe SQL ni se llama al proveedor en tests. Pendiente SQL aislado para
índice único y bloqueos de snapshots/reversos (migraciones 40/41).
