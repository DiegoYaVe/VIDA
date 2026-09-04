# VIDA / VenezPOS — Handoff de contexto para otro Claude

> Documento para que otro asistente retome el proyecto sabiendo **qué ya está construido**, **cómo está armado** y **en qué seguir**. Escrito 2026-09-04.
>
> **Actualizado 2026-09-04** tras una sesión de auditoría + correcciones: se arreglaron un exploit de puntos, el API sobre HTTPS (ahora mismo origen) y la página pública de tienda del QR. Ver §4.
>
> Documentos hermanos: [CHANGELOG.md](CHANGELOG.md) (qué cambió en cada sesión, con su verificación) e [INSTALACION.md](INSTALACION.md) (cómo levantarlo en local).

---

## 1. Qué es el proyecto

**Comercializadora VIDA** es una plataforma de **POS + delivery + red de franquicias** de tiendas retail en Venezuela. Meta de negocio: 16.291 tiendas para 2035. Opera **exclusivamente en USD** (se descartó todo lo de Bs/dual).

Cuatro actores:
1. **Consumidor final** — app móvil (pedidos, tracking, puntos).
2. **Empresario / dueño de tienda** — panel web (inventario, ventas, finanzas, metas).
3. **Repartidor** — app móvil.
4. **Corporativo (Matriz/CEDIS)** — panel web (onboarding de tiendas, reabasto, reportes de red).

### Stack
- **Backend:** Node.js + **Fastify 4.29** + **SQL Server** (driver `mssql`/tedious). Multi-tenant por `(idBranch, idCuenta)`; stock por `idPuntoVenta`. JWT (`@fastify/jwt`, HS256), `@fastify/helmet` v11, `@fastify/rate-limit` v9, `@fastify/static`, `@fastify/multipart`, WebSocket.
- **Panel web:** React 18 + Vite + TailwindCSS. Sidebar **dinámico por BD** (`VIDA_CUENTA_PANTALLAS` + accesos por usuario). Tokens de color: `vida-blue` #0A1E3F, `vida-green` #5BBE6A, `vida-aqua/teal` #54C4E0.
- **Apps móviles:** Expo (React Native) — `app-cliente` y `app-repartidor`. Mapas dual: Google Maps nativo en APK / Leaflet+OSM en Expo Go.

### Estructura del repo
```
pos-venezuela/
  backend/           # Fastify (src/controllers, src/routes, src/services, src/middlewares, src/db)
  frontend/          # Panel React+Vite (src/pages, src/services, src/store, src/utils)
  app-cliente/       # Expo (app/(tabs), app/(auth), app/*)
  app-repartidor/    # Expo (app/(main), app/*)
  sql/               # Migraciones numeradas 01..22 (correr en orden en SQL Server)
```

### Repo / rama / deploy
- **Git remote:** `https://github.com/DiegoYaVe/VIDA.git`
- **Rama de trabajo:** `feature/multipedido-rutas-mapas` (todo el trabajo de esta sesión está aquí y pusheado). Rama principal en GitHub: `sandbox`.
- **Credencial local de git:** `diegoyanez117` (a veces da 403 intermitente al push; reintentar suele funcionar).
- **Producción:** SmarterASP.NET / IIS + iisnode, todo bajo **https://app.comercializadoravida.com**: el panel (SPA por `web.config`) en la raíz y el **API como aplicación IIS en `/api`** del mismo sitio. El host viejo `israceballos-001-site18.mtempurl.com` **está muerto** — sin binding HTTPS y 404 en todas las rutas. No apuntar ahí. Pasos y verificación en §6.
- **BD de QA (la que usa el backend local):** SQL Server `sql5065.site4now.net`, base `db_a3fa0b_vidaqa`. ⚠️ **Producción puede usar otra base**: confirmar antes de correr migraciones en prod. **NO es MySQL** (el usuario una vez corrió un script en el phpMyAdmin equivocado de otro proyecto — VIDA es SQL Server).

---

## 2. Convenciones y arquitectura clave

- **Roles (`TipoUsuario`)** y niveles: `SUPER_ADMIN`(0), `ADMIN_PAIS`(1), `ADMIN_ESTADO`(1), `ADMIN`(2, = admin de **tienda**), `SUPERVISOR`(3), `CAJERO`/`CASHIER`(4).
- **Roles de RED** (ven toda la red): `SUPER_ADMIN`, `ADMIN_PAIS`, `ADMIN_ESTADO`. Los demás (`ADMIN` de tienda, `SUPERVISOR`, `CAJERO`) están **scopeados a su `idPuntoVenta`**. **Ojo:** no es un solo patrón sino **tres variantes** del mismo control — `esRed` (dashboard, inventario, pedidos, caja, matriz, finanzas), `pvEfectivo`, y listas de roles escritas a mano *inline* (`reportes.controller.js:14`). Van a divergir. **Al agregar endpoints que exponen datos por tienda, respetar este scope**, y si se toca el tema, unificarlas en un helper compartido.
- **Portales** (`backend/src/config/portales.js`, fuente de verdad): SUPER_ADMIN/ADMIN_PAIS → `CORPORATIVO`; ADMIN/ADMIN_ESTADO/SUPERVISOR/CAJERO → `EMPRESARIO`. También `CLIENTE` y `REPARTIDOR`.
- **Gestión de roles:** `puedeGestionarRol` es **estricto** (`>`): solo creas/editas usuarios de rol **inferior** al tuyo. Solo **un ADMIN por tienda**.
- **Config de cuenta:** dos tablas de config → `VIDA_CONFIGURACION` (clave/valor, ej. SMTP_*, `URL_SISTEMA`) y `VIDA_CONFIG_DELIVERY` (clave/valor, ej. `PuntosPorDolar`, `PuntosPorDolarCanje`, `RadioBusquedaKm`). Helpers `getConfig` (usuarios) y `getConfigVal` (delivery).
- **URLs por ambiente:** los links de correo/API se resuelven por ambiente: `usuarios.controller.resolverUrlSistema()` (frontend) y `delivery.controller.resolverBaseUrl(request)` (API). Prioridad: env var → si no es producción `localhost` → en prod valor de BD / derivado del request. En `.env` de prod conviene fijar `NODE_ENV=production`, `FRONTEND_URL`, `BASE_URL`.
- **Mismo origen (desde 2026-09-04):** el panel y el API se sirven desde `https://app.comercializadoravida.com`, con el backend montado como **aplicación IIS en `/api`** de ese mismo sitio. Consecuencias: el panel hereda el certificado (no hay mixed content posible), no hay CORS entre panel y API, y **el build de producción del panel no lleva dominio hardcodeado** — `frontend/.env.production` tiene `VITE_API_URL` y `VITE_WS_URL` vacías a propósito y el código usa `/api` y `wss://<host actual>/api/ws` relativos (`services/api.js`, `hooks/useWebSocket.js`). Las apps Expo sí llevan la URL absoluta (`https://.../api`, `wss://.../api/ws`) en sus `eas.json`. El host viejo `israceballos-001-site18.mtempurl.com` **está muerto** (sin HTTPS y 404 en todas las rutas): no volver a apuntar ahí.
- **Imágenes:** se sirven desde `/uploads/...` (backend). Helmet lleva `crossOriginResourcePolicy: { policy: 'cross-origin' }` para que el front (otro origen) pueda mostrarlas. Producto: `POST /inventario/productos/:id/imagen` (multipart) → `uploads/productos/`.
- **Body JSON vacío:** `app.js` registra un content-type parser que trata un body JSON vacío como `{}` (acciones POST sin payload, ej. "+1 vaso"). Sin esto Fastify responde 400 `FST_ERR_CTP_EMPTY_JSON_BODY`.
- **Migraciones:** ejecutar los `.sql` de `sql/` en orden en SQL Server. Contienen `GO` como separador de batch. En esta sesión las corrí contra QA con un runner temporal Node (`mssql`), no hay migrador automático en el repo.
- **Runner temporal:** varias veces creé `backend/run-migration.mjs` para correr SQL o probar endpoints con un JWT forjado (HS256 con `JWT_SECRET` del `.env`), y **lo borré al terminar**. Es un patrón útil para verificar sin front.

---

## 3. Estado del producto (DONE vs PENDIENTE)

### App Consumidor
| Módulo | Estado |
|---|---|
| A) Tiendas + catálogo por tienda (GPS/lista, catálogo en tiempo real) | ✅ (GPS "más cercana" parcial) |
| B) Carrito + checkout (1 tienda/pedido, retiro/delivery, métodos de pago) | ✅ |
| **C) Puntos / Fidelización** (ganar, billetera, historial, **canje**, reembolso) | ✅ (esta sesión) |
| G) Tracking de pedidos (estados + mapa en vivo) | ✅ |
| H) Perfil (compras, direcciones, tarjetas, contraseña) | ✅ |
| Login OTP / Apple | ❌ (hay teléfono+password y Google) |
| **D) Salud – consumo de agua** ("Mi Consumo Vida": activar, meta diaria, registrar vasos, gráfica 14 días, racha 7 días → puntos extra) | ✅ v1 (esta sesión). Falta: **push recordatorio cada 2h** (notificación local del dispositivo) |
| E) Membresía Club Vida | ❌ |
| F) Servicios integrados (Amazon, recargas) | ❌ |
| Landing "¿Cómo quieres unirte?" (redes + roles + form→WhatsApp) | ✅ (la hizo **otro dev**, ya existe) |

### Panel Empresario
| Módulo | Estado |
|---|---|
| A) Conexión con Comercializadora = módulo **Matriz** (vitrina, pedido a CEDIS: PEDIDO→PAGADO→DESPACHADO→RECIBIDO; solo lo recibido entra al inventario) | ✅ |
| **B) Calculadora de Rentabilidad** (punto de equilibrio, 3 modos Plus/Mixto/Normal, meta diaria, ROI) | ✅ (esta sesión) |
| **Producto PLUS** (badge dorado alta rentabilidad) | ✅ (esta sesión) |
| C) Dashboard de ventas / compras | ✅ |
| **C) Metas** (diaria/semanal/mensual + barra de progreso + insignia) | ✅ (esta sesión) |
| D) Inventario tiempo real, pedidos entrantes, cuentas por pagar (Matriz), base de clientes | ✅ |
| **E) Marketing — Flyer + QR** ("Crear promo hoy": elige producto, precio promo, genera flyer PNG con QR de la tienda para WhatsApp/IG) | ✅ parcial. El QR ya abre una **página pública de tienda** (`/t/:idPuntoVenta`, commit `30b81e1e`). Falta: replicar redes, cupones automáticos |
| F) Academia Vida (cursos/videos + puntos por ver) | ❌ |

### Corporativo / Repartidor
- Portal Corporativo (onboarding de tiendas con wizard país→estado→ciudad, razón social, lada; meta 2035), Matriz/reabasto, reportes de red, gestión de repartidores (incl. **cambiar contraseña** desde el panel): ✅.

---

## 4. Lo que se hizo (commits en `feature/multipedido-rutas-mapas`)

### 4.a — Sesión de correcciones (2026-09-04)

Salieron de auditar el código contra este mismo documento. Del más reciente al más antiguo:

- `30b81e1e` **Página pública de tienda `/t/:idPuntoVenta`** — el QR de los flyers apuntaba a una página que no existía: todo flyer impreso llevaba a un 404. Nuevo endpoint público `GET /delivery/tienda/:idPuntoVenta?idBranch=&idCuenta=` (datos públicos de una tienda activa) + `frontend/src/pages/Tienda.jsx` en ruta pública, fuera del `Layout` y de `PublicRoute`. El catálogo reusa `/delivery/productos`. **Además el QR estaba mal formado:** `idPuntoVenta` solo no identifica una tienda (la PK es `idBranch+idCuenta+idPuntoVenta`), así que ahora el enlace lleva el tenant: `/t/8?b=1&c=1`. La página asume 1/1 si faltan, para que los flyers ya impresos sigan sirviendo. Sin migración. *Falta verificar cómo se ve renderizada.*
- `33607199` **El API pasa a HTTPS, sirviéndose desde el mismo origen** — el bundle desplegado tenía compilado `http://israceballos-001-site18.mtempurl.com/api`: el navegador lo bloqueaba por mixed content y además ese host devuelve 404 en todo. Ver el bullet "Mismo origen" en §2 y los pasos de despliegue en §6. Incluye: exclusión de `/api` y `/uploads` en el rewrite del SPA (`frontend/public/web.config`), y `/uploads` + `/health` expuestos **también** bajo `/api` en el backend (montado en `/api`, las rutas sin prefijo no le llegan). Sin migración.
- `c07aa003` **FIX exploit: el bono de racha de hidratación se cobraba sin límite** (sql/24) — ver §5.

**Qué quedó verificado y qué no** (importante antes de confiar en esto):

| Cambio | Verificación |
|---|---|
| Bono de racha (`c07aa003`) | **End-to-end contra QA** ejecutando los controllers reales, 7 asserts. El mismo test contra el código anterior falla en 4 de 6, o sea que el exploit está reproducido y cerrado. |
| HTTPS / mismo origen (`33607199`) | Build limpio (cero rastros del host viejo) y las 4 rutas (`/health`, `/api/health`, `/uploads`, `/api/uploads`) responden 200 vía `fastify.inject()`. **No probado contra un IIS real.** |
| Página `/t/:id` (`30b81e1e`) | Endpoint contra QA: 200 con datos, 404 inexistente, 404 desde otro tenant, 400 sin tenant. **Falta verla renderizada** — no se pudo levantar el panel en esa sesión. |
| `backend/web.config` (`18864321`) | **Sin verificar.** Escrito de memoria del contrato de iisnode. La contingencia por si recorta el prefijo `/api` está al final del propio archivo. |

**Cambios en la base de QA:** migración 24 aplicada en `db_a3fa0b_vidaqa` (dos
columnas nuevas + `VIDA_CLIENTE_PUNTOS.Descripcion` ahora `NVARCHAR(200)`). Los
datos de prueba del cliente 4 quedaron restaurados; el cliente 1 no se tocó.

### 4.b — Sesión de features (anterior)

Del más reciente al más antiguo:

- **Salud — "Mi Consumo Vida"** (hidratación) — columnas `Hidratacion*` en cliente + tabla `VIDA_CLIENTE_HIDRATACION_DIA` + config `PuntosRachaHidratacion=50` (sql/23). Endpoints cliente `GET/PUT /delivery/cliente/hidratacion`, `POST .../vaso`, `POST .../quitar`. Gamificación: al cumplir la meta y completar múltiplo de 7 días de racha → acredita puntos (helper `acreditarPuntosCliente`). Pantalla `app-cliente/app/mi-consumo.jsx` (activar, botón "Tomé 1 vaso", progreso, racha, gráfica 14 días, meta ajustable) + tarjeta en perfil. **Fix backend general:** `app.js` ahora acepta **body JSON vacío** en POST/PUT (content-type parser) — antes Fastify respondía 400 `FST_ERR_CTP_EMPTY_JSON_BODY` (rompía acciones sin payload como "+1 vaso"). Pendiente: **push recordatorio cada 2h** (usar `expo-notifications` con notificación local repetida; Expo Go tiene límites, va mejor en dev build/APK).
- **Marketing — Flyer + QR** (frontend, tab "Flyer" en Precios): "Crear promo hoy" — elige un producto de su inventario, precio de promoción opcional y mensaje; genera un **flyer 1080×1350 en canvas** (header VIDA, foto, nombre, precio normal tachado + promo, badge PLUS, **QR** que apunta a `https://app.comercializadoravida.com/t/{idPuntoVenta}`) y lo **descarga en PNG** o comparte texto por WhatsApp. **Nueva dependencia frontend: `qrcode@1.5.4`** (correr `npm install` en `frontend/` al desplegar). Sin cambios de backend ni migración.
- `87c50fa9` **DOCS**: este HANDOFF.
- `e14c4c34` **Metas del empresario** — tab "Metas" en Reportes. Tabla `VIDA_TIENDA_METAS`; endpoints `GET/PUT /metas`, `GET /metas/progreso` (ventas POS entregadas hoy / últimos 7 días / mes actual vs meta, % + insignia). (sql/22)
- `57022423` **Puntos fase 2 — canje + reembolso** — `crearPedidoApp` acepta `PuntosUsar` (descuento topado a saldo y subtotal, débito atómico, movimiento `CANJEADO`); helper `reembolsarPuntosPedido` idempotente enganchado en las 3 rutas de cancelación (repartidor, cliente, dispatch job). Checkout del cliente con "Usar mis puntos". Config `PuntosPorDolarCanje=100`. (sql/21)
- `8c0cfed8` **Puntos v1 — ganar + billetera + historial** — tabla `VIDA_CLIENTE_PUNTOS` (ledger) + `PuntosSaldo` en cliente + config `PuntosPorDolar=10`. Acreditación automática e idempotente al ENTREGAR (dentro de la transacción). `GET /delivery/cliente/puntos`. UI: tarjeta "Mis Puntos VIDA" en perfil + pantalla `mis-puntos`. (sql/20)
- `4b86e84f` **Calculadora de Rentabilidad** — tab "Rentabilidad" en Reportes. Tabla `VIDA_TIENDA_FINANZAS`; `GET/PUT /finanzas`, `GET /finanzas/rentabilidad`. (sql/19)
- `2370080d` **Producto Plus** — columna `EsProductoPlus`; toggle+badge en panel y app cliente; catálogos lo devuelven. (sql/18)
- `34c6f8bf` **FIX repartidor no cambiaba estatus** — causa: **teléfono duplicado** (2 repartidores igual teléfono → login resolvía a otro id que el dueño del pedido). Guard de duplicado en `crearRepartidor`, `loginRepartidor` determinista, y se desactivó el duplicado en BD.
- `7a617740` **Cambiar contraseña de repartidor** desde el panel (`PATCH /delivery/admin/repartidores/:id/contrasena`).
- `06e8628c` **FIX app-cliente en Expo Go** — Google Sign-In es módulo nativo que Expo Go no trae; carga condicional con `expo-constants` (`executionEnvironment==='storeClient'`).
- `6176e476` + `5229c2ad` **FIX/UX POS** — muestra catálogo de la tienda por defecto y ya no se queda en blanco al agregar al carrito.
- `28b42ad7` + `9c9d73ae` + `abc34410` **Scope por rol (#9)** — ADMIN de tienda solo ve SU tienda en Dashboard, Inventario, Ventas, Reportes, Pedidos, Cierre de Caja, Matriz. Además **fix de imágenes** (helmet CORP cross-origin).
- `c08eb72f` + `ea801dcf` **URLs por ambiente** (correos y API base local vs prod).
- (Lotes reunión 21-ago, en commits previos `6809bb53` y anteriores) Ciudades por estado (`VIDA_CUENTA_CIUDADES`, sql/16, ~256 ciudades reales de Venezuela), razón social + lada de país (sql/17), rename visible "punto de venta"→"Tienda", proveedores activos en dashboard, wizard de alta de tienda con back + país default Venezuela.

### Migraciones pendientes de correr en prod (en orden)
`16_ciudades.sql`, `17_razonsocial_lada.sql`, `18_producto_plus.sql`, `19_tienda_finanzas.sql`, `20_puntos_fidelizacion.sql`, `21_canje_puntos.sql`, `22_tienda_metas.sql`, `23_hidratacion.sql`, `24_hidratacion_bonus_idempotente.sql`.

**Estado:** 16→24 aplicadas y verificadas en **QA** (`db_a3fa0b_vidaqa`). En **producción no hay ninguna aplicada que se sepa** — ni siquiera está confirmado a qué base apunta el API de prod. La 24 es obligatoria antes de desplegar el backend: sin sus columnas el módulo de hidratación falla.

---

## 5. Detalle de los módulos nuevos (para continuar)

### Producto Plus
- Columna `VIDA_INVENTARIO_PRODUCTOS.EsProductoPlus BIT`.
- Backend: `inventario.controller` (crear/editar/SELECTs) y `delivery.controller` (catálogo cliente) lo devuelven.
- Front: toggle dorado con margen en el form de producto (`Inventario.jsx`), badge PLUS en lista, Catálogo Central y tarjeta de la app cliente.

### Calculadora de Rentabilidad (`finanzas.controller.js`, tab en Reportes)
- Tabla `VIDA_TIENDA_FINANZAS(idPuntoVenta)`: CostosFijosMensualUSD, PctComisionDelivery/Impuestos/Pasarela, InversionInicialUSD, MetaGananciaMensualUSD.
- `GET/PUT /finanzas`, `GET /finanzas/rentabilidad`: punto de equilibrio, 3 modos (Solo Plus/Mixto/Solo Normal con margen bruto, margen de contribución y ganancia/venta), meta diaria y ROI (con ventas reales 30 días). Scope por rol (`pvEfectivo`).

### Metas del empresario (`finanzas.controller.js`, tab en Reportes)
- Tabla `VIDA_TIENDA_METAS(idPuntoVenta)`: MetaDiariaUSD/SemanalUSD/MensualUSD.
- `GET/PUT /metas`, `GET /metas/progreso`: ventas POS entregadas hoy / últimos 7 días / mes calendario vs meta → `{ventas, meta, pct, cumplida, falta}`. Insignia 🏅 al cumplir.

### Puntos / Fidelización (`delivery.controller.js`)
- `VIDA_CLIENTE_PUNTOS` (ledger: GANADO/CANJEADO/REEMBOLSO, +/- Puntos, idPedido) + `VIDA_APP_CLIENTES.PuntosSaldo`.
- Config `VIDA_CONFIG_DELIVERY`: `PuntosPorDolar=10` (ganar), `PuntosPorDolarCanje=100` (canjear, 100 pts = $1).
- **Ganar:** en `actualizarStatusPedido` al ENTREGADO, idempotente por pedido, dentro de la transacción.
- **Canjear:** `crearPedidoApp` acepta `PuntosUsar`, aplica descuento (cap a saldo y subtotal), débito atómico + movimiento CANJEADO; guarda `DescuentoPuntosUSD`/`PuntosUsados` en el pedido.
- **Reembolso:** `reembolsarPuntosPedido(makeReq, idBranch, idCuenta, idPedido)` idempotente; llamado en las 3 rutas de cancelación.
- `GET /delivery/cliente/puntos` → `{saldo, puntosPorDolar, puntosPorDolarCanje, movimientos}`. UI: perfil + pantalla `mis-puntos` + sección "Usar mis puntos" en `carrito.jsx`.
- **Pendiente fase 3:** catálogo de premios (canje por premio específico) y vencimiento de puntos.

### Marketing — Flyer + QR (`frontend/src/pages/Precios.jsx`, tab "Flyer")
- **Solo frontend**, sin backend ni migración. Componente `TabFlyer`.
- Dep nueva: **`qrcode@1.5.4`** (frontend). Dibuja el flyer en un `<canvas>` 1080×1350 y exporta PNG (`canvas.toDataURL`); QR generado con `QRCode.toDataURL`.
- El QR apunta a `STORE_BASE/t/{idPuntoVenta}?b={idBranch}&c={idCuenta}` con `STORE_BASE = https://app.comercializadoravida.com` (constante en el archivo). **Esa página ya existe** (`frontend/src/pages/Tienda.jsx`, commit `30b81e1e`). El tenant va en la query porque `idPuntoVenta` solo no identifica una tienda. La tienda se toma de `usuario.idPuntoVenta` / `/sucursales/puntos-venta`.
- Ojo CORS: para exportar la foto del producto en el canvas, la imagen se carga con `crossOrigin='anonymous'`; el backend ya manda CORP cross-origin y CORS a `FRONTEND_URL`. Si la imagen "tainta" el canvas, se captura el error y se avisa (fallback sin foto).
- **Pendiente:** replicar publicaciones de la matriz en redes de la tienda; cupones automáticos ("cliente no viene hace 15 días").

### Salud — "Mi Consumo Vida" (hidratación) (`delivery.controller.js` + `app-cliente/app/mi-consumo.jsx`)
- Config en el cliente: `HidratacionActiva/MetaVasos/MlVaso`. Registro diario en `VIDA_CLIENTE_HIDRATACION_DIA` (upsert +1 por tap). Config global `PuntosRachaHidratacion=50`.
- Endpoints (authenticateCliente): `GET/PUT /delivery/cliente/hidratacion`, `POST /delivery/cliente/hidratacion/vaso` (+1, devuelve vasosHoy/meta/mlHoy/racha/bonus), `POST /delivery/cliente/hidratacion/quitar` (-1).
- **Racha:** `contarRachaHidratacion` cuenta días consecutivos terminando hoy con vasos≥meta. **No es UTC** (este documento lo decía mal): el "hoy" sale de `CAST(GETDATE() AS DATE)` del SQL Server, o sea hora local del servidor — que está en SmarterASP, **no en Venezuela**. Un vaso registrado de noche en Caracas puede contar como el día siguiente.
- **El bono de racha se pagaba infinitas veces** (arreglado en `c07aa003` + sql/24). `acreditarPuntosCliente` no era idempotente y existe `POST /hidratacion/quitar`: alternando quitar/tomar vaso se cobraba en bucle, y esos puntos se canjean por dinero (100 pts = 1 USD). Medido en QA: **50 → 250 puntos en 4 toques**. Ahora hay dos candados: (1) `VIDA_CLIENTE_HIDRATACION_DIA.BonusPuntos`, reclamado con un UPDATE condicional + `@@ROWCOUNT` — un solo pago por día, atómico ante concurrencia; (2) `VIDA_APP_CLIENTES.HidratacionRachaPremiada`, el último múltiplo de 7 pagado, que se reinicia solo si la racha se rompe y arranca más corta (si no, el usuario legítimo que reempieza no cobraría nunca más).
- **Riesgo residual:** bajar `HidratacionMetaVasos` recalcula la racha hacia atrás, así que se puede forzar un múltiplo de 7. Queda topado en **1 bono/día** por el candado (1). Para cerrarlo del todo habría que congelar la meta vigente en cada fila diaria.
- **Pendiente fase 2:** push recordatorio cada 2h (notificación local con `expo-notifications`).

---

## 6. Cosas de entorno / operación (para no tropezar)

- **Correr migraciones en prod:** confirmar primero a qué BD apunta el API de prod. Si es la misma `db_a3fa0b_vidaqa`, ya están aplicadas (yo corrí 16–22 en QA). Si es otra, correr 16→22 en orden en el **SQL Server de SmarterASP** (no phpMyAdmin).
- **Desplegar a prod — orden obligatorio** (cambió con el paso a mismo origen):
  1. **Migraciones** en el SQL Server de SmarterASP (no phpMyAdmin), 16→24 en orden. Va primero: el backend nuevo necesita las columnas de la 24.
  2. **Backend por FTP** a su carpeta, y en el **panel de SmarterASP** convertir esa carpeta en **aplicación IIS montada en `/api`** del sitio de `app.comercializadoravida.com`. Esto **no se hace por FTP**. El repo ya trae `backend/web.config` (handler de iisnode + `<webSocket enabled="false" />`, que es lo que permite que el WS lo maneje Node). Subir también `node_modules` (no hay shell; se venía haciendo con un `.rar` y descomprimiendo desde el file manager).
  3. **Frontend por FTP**: `npm run build` y subir `frontend/dist/` completo — **incluido su `web.config`**, que es el que excluye `/api` y `/uploads` del rewrite del SPA. Sin ese archivo IIS le devuelve `index.html` a cada llamada del API. No subir los `.jsx`.
  4. **Apps**: rebuild/republish con EAS para que tomen las URLs `https`/`wss`.
- **Chequeos de que quedó bien:**
  - `https://app.comercializadoravida.com/api/health` → `{"status":"ok","db":"ok",...}`. Si devuelve el HTML del panel, el paso 2 o el 3 quedó a medias.
  - `https://app.comercializadoravida.com/t/1?b=1&c=1` → la página pública de la tienda con su catálogo.
  - Si `/api/health` da 404 pero `/health` responde, iisnode está recortando el prefijo `/api`: ver la nota al final de `backend/web.config`.
- **`.env` de producción del backend:** fijar `NODE_ENV=production` (si no, el hardening del JWT no corre), `JWT_SECRET` de 32+ chars distinto al de desarrollo, `AUDIT_SECRET`, y `FRONTEND_URL=https://app.comercializadoravida.com`. `BASE_URL` puede omitirse: `resolverBaseUrl()` lo deriva del request respetando `x-forwarded-proto`.
- **Apps en Expo Go:** las `.env` (`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WS_URL`) apuntan a la **IP LAN** de la PC (cambia con DHCP; si hay "Network Error", correr `ipconfig` y actualizar). No están trackeadas en git. Reiniciar Expo con `npx expo start -c` tras cambiar `.env`. Google Sign-In no funciona en Expo Go (sí en APK/dev client).
- **Datos demo que dejé en QA:** cuenta maestra `admin` promovida a `SUPER_ADMIN`; tienda 8 = "TIENDA PRUEBA 9" con finanzas y metas de ejemplo; cliente 1 (Diego) con 50 puntos de prueba; producto sin marcar PLUS aún. Son inofensivos, se pueden sobrescribir.
- **Verificación sin front:** patrón usado = runner Node temporal que forja un JWT (HS256, `JWT_SECRET` del `.env`, payload con rol correcto: usuarios `{idBranch,idCuenta,idUsuario,TipoUsuario,idPuntoVenta}`; cliente `{...,rol:'CLIENTE',idCliente}`; repartidor `rol` + `idRepartidor`) y pega al endpoint. Borrar el runner al terminar.

---

## 7. Próximos candidatos (sugerencia de prioridad)

**Antes que cualquier feature: desplegar.** Nada de lo hecho en §4.a sirve hasta que el API esté montado en `/api` y las migraciones corridas (§6). Hoy el panel en producción está roto y el API no responde en ningún host.

### Deuda técnica detectada en la auditoría (sin tocar)

1. **`MAX(id)+1` sin lock** para generar IDs, en 7 controllers. Algunos usan `WITH (UPDLOCK, HOLDLOCK)` (`caja:19`, `matriz:27`, `pedidos:24`), pero las variantes sin lock siguen en uso (`inventario.controller.js:14`, `acreditarPuntosCliente`). Dos operaciones simultáneas = PK duplicada. Con una tienda no se nota; con 16.291 sí.
2. **`delivery.controller.js`: 3.270 líneas / 166 KB** — clientes, repartidores, pedidos, puntos, hidratación y config de admin en un archivo. Cada feature nueva cae ahí. Conviene partirlo por dominio.
3. **Cero tests.** No hay un solo `.test.js` propio, con dinero y puntos canjeables de por medio.
4. **Sin migrador.** No hay registro de qué migración se aplicó a qué base — de ahí que no se sepa el estado de prod. Una tabla `schema_migrations` de 10 líneas lo resuelve.
5. **`audit.service.js:9`** cae a `'audit_dev_secret'` sin fallar en producción (el JWT sí valida, el de auditoría no): firmas de auditoría falsificables.
6. **`usesCleartextTraffic: true`** sigue en el `app.json` de las apps. Ya no hace falta con https, pero ponerlo en `false` rompe los dev builds que apuntan a la IP LAN por http.

### Features

1. **Push recordatorio de hidratación** — cerrar fase 2 de Salud con `expo-notifications` (notificación local repetida cada 2h).
2. **Membresía Club Vida (E)** — QR de membresía por nivel, eventos, beneficios.
3. **Academia Vida (F)** — cursos + puntos al empresario.
4. **Fidelización fase 3** — catálogo de premios + vencimiento de puntos.
5. **Servicios integrados (F)** — recargas (Movilnet/Movistar/Digitel/…) y Amazon curado.

**Cómo continuar técnicamente:** los módulos "de panel" nuevos conviene colgarlos como **tab dentro de un módulo existente** (ej. Reportes) para evitar fricción con el sidebar dinámico por BD (que requiere insertar `pantalla` + accesos). Respetar siempre el **scope por rol** (`esRed`/`pvEfectivo`) y la operación **USD-only**. Al tocar el flujo de pedidos, cuidar idempotencia y transacciones (como en puntos).
