# VIDA / VenezPOS — Checklist de despliegue a producción (paso a paso)

Guía operativa para publicar una versión nueva a producción. Marca cada casilla al completarla.
Stack prod: **SmarterASP.NET / IIS + iisnode** (backend Node), **SQL Server** remoto, panel React servido por el mismo sitio bajo `/api`, apps **Expo/EAS**.

> Para arquitectura y convenciones, ver [HANDOFF-VIDA.md](HANDOFF-VIDA.md). Para arranque local, [INSTALACION.md](INSTALACION.md).
> ⚠️ Es **SQL Server**, NO MySQL. Y `NODE_ENV=production` es obligatorio: sin un `JWT_SECRET` propio de 32+ caracteres el backend **no arranca a propósito**.

---

## 0. Antes de tocar producción (pre-vuelo)

- [ ] Rama correcta y limpia: `git status` sin cambios sin commitear; `git pull --rebase` al día.
- [ ] Build del panel compila sin errores: `cd frontend && npm run build`.
- [ ] Backend arranca local contra QA sin errores (`/health` → `{"status":"ok","db":"ok"}`).
- [ ] Flujo E2E verde (auditoría + día-en-la-tienda) — ver `AUDITORIA-VIDA.md`.
- [ ] **Backup de la BD de producción** tomado y verificado (restaurable). Las migraciones no tienen rollback automático.
- [ ] Ventana de mantenimiento acordada si habrá downtime.
- [ ] Anota la lista de migraciones nuevas respecto al último despliegue (no hay tabla de control; es responsabilidad de quien despliega).

---

## 1. Base de datos (SQL Server de producción)

- [ ] Confirmar a qué servidor/BD apunta producción (puede **diferir** de QA `db_a3fa0b_vidaqa` en `sql5065.site4now.net`). El migrador usa el `backend/.env`, así que confirma que ese `.env` apunte a **producción** antes de correrlo.

**Opción A — migrador (recomendado).** Lleva la tabla de control `VIDA_SCHEMA_MIGRATIONS` y aplica solo lo pendiente, en orden, respetando los `GO`. Desde `backend/`:
- [ ] `npm run migrate:status` — ver qué está aplicado y qué falta (crea la tabla de control la primera vez).
- [ ] **Solo la PRIMERA vez en una BD que ya traía migraciones** (QA/prod existentes): `node scripts/migrate.mjs baseline` marca las actuales como ya aplicadas **sin ejecutarlas**. Verifica antes que de verdad estén (objetos/columnas), porque baseline las da por hechas. En una **BD nueva desde cero NO se hace baseline** — se corre `up` directo.
- [ ] `npm run migrate` — aplica las pendientes. Se detiene en la primera que falle (esa no queda registrada; se corrige y se re-corre).
- [ ] `npm run migrate:status` de nuevo → **0 pendientes**.

**Opción B — manual (fallback).** Abrir **SSMS** conectado a la BD de producción (no QA) y correr en orden las migraciones pendientes de `sql/`, una por una, del número más bajo al más alto (usan `GO`, no mandar el archivo como una sola sentencia).

- [ ] Las migraciones que **insertan pantallas del sidebar** (`VIDA_CUENTA_PANTALLAS`: 25–29, 32 cupones) conceden acceso a roles; revisa que el sidebar del panel las muestre tras desplegar.
- [ ] Si es una BD nueva desde cero: insertar el primer usuario a mano en `VIDA_CUENTA_USUARIOS` (bcrypt 12 rounds) — ningún `.sql` crea usuarios.
- [ ] Sanity check: `SELECT COUNT(*) FROM VIDA_CUENTA_PANTALLAS;` y confirmar tiendas/productos esperados.

---

## 2. Backend (Node + Fastify sobre IIS/iisnode)

- [ ] `cd backend && npm install` (en el entorno de despliegue, con las mismas versiones de Node 20 LTS+).
- [ ] Preparar el `.env` de producción (NO viaja en git). Mínimo:
  ```env
  DB_SERVER=<host prod>
  DB_DATABASE=<bd prod>
  DB_USER=<usuario>
  DB_PASSWORD=<password>
  DB_PORT=1433

  JWT_SECRET=<propio, 32+ caracteres>      # distinto al de QA/dev
  AUDIT_SECRET=<propio, 32+ caracteres>

  NODE_ENV=production                       # OBLIGATORIO
  PORT=3001
  FRONTEND_URL=https://app.comercializadoravida.com
  BASE_URL=https://app.comercializadoravida.com   # URLs de correos de registro/delivery
  ```
- [ ] Completar SMTP y credenciales de Google Sign-In en el `.env` si aplican (ver `.env.example`).
- [ ] Confirmar que `web.config` (IIS + iisnode) está presente en `backend/`.
- [ ] Subir el backend por FTP/panel de SmarterASP (incluye `node_modules` si el hosting no corre `npm install`, o instálalos allá).
- [ ] **Preservar `backend/uploads/`** — las imágenes subidas viven ahí y NO están en git; no borrarlas en el deploy.
- [ ] Reiniciar el sitio/pool de IIS.
- [ ] Verificar: `https://app.comercializadoravida.com/api/health` → `{"status":"ok","db":"ok"}`.
  - Si el server falla al arrancar, lo más común es `NODE_ENV=production` sin `JWT_SECRET` de 32+ caracteres.

---

## 3. Panel web (React + Vite)

- [ ] `cd frontend && npm install && npm run build`.
- [ ] **No** completar `frontend/.env.production`: en prod el panel consume `/api` del mismo origen; las URLs vacías son a propósito (solo cámbialas si el API se muda de host).
- [ ] Confirmar que `public/web.config` (rewrite del SPA) quede incluido en el `dist/`.
- [ ] Subir el contenido de `frontend/dist/` al sitio (misma raíz donde cuelga `/api`).
- [ ] Verificar en el navegador:
  - [ ] `https://app.comercializadoravida.com/login` carga.
  - [ ] Login real (SUPER_ADMIN) entra y el **sidebar muestra las pantallas nuevas** (Academia, Operaciones, etc.).
  - [ ] Las **imágenes de productos cargan** (CORP policy cross-origin ya corregida en helmet).
  - [ ] Recarga dura en una ruta interna (p. ej. `/operaciones`) no da 404 (rewrite OK).

---

## 4. Apps móviles (Expo / EAS)

> Solo si esta versión cambia las apps. El backend/panel pueden desplegarse sin re-publicar apps.

- [ ] `eas.json` lleva la URL de **producción** del API (revisar que no apunte a una IP LAN).
- [ ] Build de cliente: `cd app-cliente && eas build --platform android` (y/o iOS).
- [ ] Build de repartidor: `cd app-repartidor && eas build --platform android`.
- [ ] Probar el APK/dev build real (no Expo Go) para validar **Google Sign-In** y push notifications (no funcionan en Expo Go).
- [ ] Distribuir (tiendas o APK directo) según el canal acordado.

---

## 5. Verificación post-despliegue (smoke test en producción)

- [ ] `/api/health` ok.
- [ ] Login panel ok; alcance por rol correcto (ADMIN de tienda solo ve su tienda).
- [ ] **Abrir caja → venta POS → cierre de caja** con el resumen cuadrando (día-en-la-tienda).
- [ ] Cliente app: tienda → carrito → pedido → tracking.
- [ ] Repartidor app: conectarse → aceptar → avanzar hasta ENTREGADO; cliente acumula puntos.
- [ ] Correo de registro/delivery sale con la URL correcta (`app.comercializadoravida.com`, no la URL vieja de Israel Ceballos).
- [ ] WebSocket de tracking vivo (mapa en Logística se actualiza).

---

## 6. Rollback

- [ ] Backend/panel: re-subir el build anterior (guarda el paquete previo antes de sobrescribir).
- [ ] BD: restaurar desde el backup del paso 0 **solo si una migración dejó la BD inconsistente**. Las migraciones son aditivas; evalúa si basta con no usar la feature nueva antes de restaurar.
- [ ] Apps: las versiones en tienda no se revierten solas; si una build rompe, publicar una corrección.

---

## Pendientes conocidos (no bloquean el deploy, informar al negocio)

- **Cupones:** NO existe módulo de cupones todavía. El spec lo menciona como Marketing fase 2 (pendiente). Lo que sí hay es **promociones** (descuento por producto/categoría) y **puntos/canje**.
- Integración **real de telco/pagos** y **Google Maps key** de producción: validar credenciales propias de prod.
- `INSTALACION.md` menciona migraciones "01..24" (desactualizado) — el rango real hoy es **01..29**.
