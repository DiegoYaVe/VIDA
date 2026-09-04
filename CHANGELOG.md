# Changelog

Registro de cambios por sesión de trabajo. Para el contexto del proyecto ver
[HANDOFF-VIDA.md](HANDOFF-VIDA.md); para levantarlo en local, [INSTALACION.md](INSTALACION.md).

---

## 2026-09-04 — Auditoría y correcciones

Rama `feature/multipedido-rutas-mapas`. 4 commits, 18 archivos, +546 / −56.

Salieron de auditar el código contra el handoff. Los tres hallazgos que se
arreglaron estaban en producción o listos para llegar ahí.

### `c07aa003` — FIX: el bono de racha de hidratación se podía cobrar sin límite

`backend/src/controllers/delivery.controller.js`, `sql/24_hidratacion_bonus_idempotente.sql`

`acreditarPuntosCliente` no era idempotente y existe `POST /hidratacion/quitar`:
alternando *quitar vaso* / *tomar vaso* se volvía a cumplir la condición del bono
y se cobraba en bucle. Esos puntos se canjean por dinero en el checkout
(100 pts = 1 USD). **Medido en QA: 50 → 250 puntos en 4 toques.**

Dos candados:

1. **Por día** — `VIDA_CLIENTE_HIDRATACION_DIA.BonusPuntos`, reclamado con un
   `UPDATE` condicional + `@@ROWCOUNT`. Un solo pago por fecha, atómico ante
   llamadas concurrentes.
2. **Por hito** — `VIDA_APP_CLIENTES.HidratacionRachaPremiada` guarda el último
   múltiplo de 7 pagado. Se reinicia solo si la racha se rompe y arranca más
   corta; sin eso, el usuario legítimo que reempieza no volvería a cobrar nunca.

También `vasosHoy === meta` pasó a `>=` (con la igualdad estricta, registrar dos
vasos seguidos se saltaba el bono propio), y `VIDA_CLIENTE_PUNTOS.Descripcion`
pasó a `NVARCHAR(200)`: era `VARCHAR` y guardaba `??` en lugar del emoji de la
racha y del signo menos del texto de canje.

**Verificación:** end-to-end contra `db_a3fa0b_vidaqa` ejecutando los controllers
reales — 7 asserts en verde. El mismo test contra el código anterior falla en 4 de 6.

**Riesgo residual:** bajar `HidratacionMetaVasos` recalcula la racha hacia atrás y
permite forzar un múltiplo de 7. Topado en 1 bono/día por el candado (1).

### `33607199` — FIX: el API pasa a HTTPS, sirviéndose desde el mismo origen

10 archivos entre `backend/src/app.js`, `frontend/` y las dos apps Expo.

El bundle desplegado en `https://app.comercializadoravida.com` tenía compilado
`http://israceballos-001-site18.mtempurl.com/api`. Doble falla: el navegador
bloqueaba la llamada por mixed content, y ese host además **no tiene binding
HTTPS y responde 404 en todas las rutas**.

Se pasó a mismo origen: el API montado como aplicación IIS en `/api` del sitio
del panel. Hereda el certificado, no hay CORS, y el mixed content deja de ser
posible por construcción.

- El panel usa `/api` y `wss://<host actual>/api/ws` **relativos** en el build de
  producción: sin dominio hardcodeado, no hay que recompilar si cambia.
- `frontend/public/web.config` excluye `/api` y `/uploads` del rewrite del SPA
  (sin eso IIS devolvía `index.html` a cada llamada del API — comprobado contra
  el sitio en producción).
- El backend expone `/uploads` y `/health` **también** bajo `/api`: montado ahí,
  las rutas sin prefijo no le llegan.
- Las apps Expo llevan `https`/`wss` en sus `.env.example` y `eas.json`.

**Verificación:** build limpio (cero rastros del host viejo) y las cuatro rutas
responden 200 vía `fastify.inject()`.

### `30b81e1e` — FEAT: página pública de tienda `/t/:idPuntoVenta`

`frontend/src/pages/Tienda.jsx` (nueva), endpoint público, ruta y `Precios.jsx`.

El QR de los flyers apuntaba a `STORE_BASE/t/{idPuntoVenta}`, una página que no
existía: **todo flyer impreso llevaba a un 404.**

Nuevo `GET /delivery/tienda/:idPuntoVenta?idBranch=&idCuenta=` público, y una
página sin sesión con los datos de la tienda, cómo llegar, teléfono y su
catálogo (reusa `/delivery/productos`, no se duplica la consulta).

Además el QR estaba mal formado: `idPuntoVenta` **no identifica una tienda** — la
PK de `VIDA_CUENTA_PUNTOS_VENTA` es `(idBranch, idCuenta, idPuntoVenta)`. Con una
sola cuenta funcionaba por casualidad. Ahora el enlace lleva el tenant:
`/t/8?b=1&c=1`, con fallback a 1/1 para los flyers ya impresos.

**Verificación:** contra QA — 200 con los campos que la página consume, 404 para
tienda inexistente, 404 al pedirla desde otro tenant, 400 sin tenant.
**No verificado: cómo se ve renderizada.**

### `18864321` — DOCS: handoff actualizado + `backend/web.config`

El handoff decía tres cosas que el código desmiente, ya corregidas: la racha no
es UTC (usa `GETDATE()` del servidor), el scope por rol son tres variantes y no
un patrón, y `acreditarPuntosCliente` no era idempotente.

`backend/web.config` no existía en el repo. Sin él iisnode no sabe arrancar el
proceso Node. Lleva el handler y `<webSocket enabled="false" />`, necesario para
que el upgrade del WebSocket lo maneje Node y no IIS.
**No verificado contra un IIS real.**

### Cambios en la base de QA

Migración 24 aplicada en `db_a3fa0b_vidaqa`: dos columnas nuevas y
`VIDA_CLIENTE_PUNTOS.Descripcion` ahora `NVARCHAR(200)`. Los datos de prueba del
cliente 4 quedaron restaurados; el cliente 1 no se tocó.

### Pendiente de desplegar

Nada de esto surte efecto hasta que: (1) corran las migraciones en la base de
producción, y (2) el backend quede montado como aplicación IIS en `/api`.
Pasos y chequeos en HANDOFF §6.
