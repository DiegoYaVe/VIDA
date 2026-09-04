# VIDA / POS Venezuela — Guía de instalación y arranque

Cómo levantar el proyecto completo en una máquina nueva.

> Para **arquitectura, convenciones y despliegue a producción**, ver [HANDOFF-VIDA.md](HANDOFF-VIDA.md).
> Esta guía es solo el arranque local.

---

## 1. Qué necesitas instalar

| | Para qué | Dónde |
|---|---|---|
| **Node.js 20 LTS o superior** | backend, panel y apps | https://nodejs.org/en |
| **SQL Server** (Express sirve) | base de datos | https://www.microsoft.com/es-mx/sql-server/sql-server-downloads |
| **SSMS** | correr las migraciones | https://learn.microsoft.com/es-es/sql/ssms/download-sql-server-management-studio-ssms |
| **Git** | | https://git-scm.com/downloads |

Opcional: **Expo Go** en el teléfono (Play Store / App Store) para probar las apps móviles sin compilar un APK.

No hace falta SQL Server local si vas a trabajar contra la base de QA (ver paso 2).

---

## 2. Base de datos

**Las migraciones se corren en orden, del 01 al 24.** No hay migrador automático ni tabla de control: es responsabilidad de quien despliega saber cuáles se aplicaron.

```
sql/01_schema.sql
sql/02_paises_estados.sql
...
sql/24_hidratacion_bonus_idempotente.sql
```

Los archivos usan `GO` como separador de batch, así que hay que ejecutarlos desde **SSMS** (o `sqlcmd`), no desde un cliente que mande todo el archivo como una sola sentencia.

> ⚠️ Es **SQL Server**, no MySQL. Ya pasó una vez que se corrió un script en el phpMyAdmin de otro proyecto.

### Sobre el primer usuario

**Ningún `.sql` crea usuarios.** Después de correr las migraciones, `VIDA_CUENTA_USUARIOS` queda vacía y no vas a poder entrar al panel. Las opciones son:

- **Trabajar contra la base de QA** (`db_a3fa0b_vidaqa` en `sql5065.site4now.net`), que ya tiene usuarios, tiendas, productos y pedidos de prueba. Es lo que hace el `.env` actual del equipo y lo más rápido para desarrollar.
- **Base local desde cero:** hay que insertar el primer usuario a mano en `VIDA_CUENTA_USUARIOS`, con la contraseña hasheada con bcrypt (el backend usa 12 rounds para usuarios de panel). Una vez dentro, el resto de los usuarios se crean desde el módulo de Usuarios.

En QA existen `admin` (SUPER_ADMIN), `supervisor` y `cajero1`. Las contraseñas no están en el repo; pedirlas al equipo.

---

## 3. Backend (API)

```bash
cd backend
npm install
cp .env.example .env
```

Editar `.env` con los datos de tu SQL Server. Lo mínimo para arrancar:

```env
DB_SERVER=localhost          # o sql5065.site4now.net para QA
DB_DATABASE=POS_VENEZUELA    # o db_a3fa0b_vidaqa
DB_USER=sa
DB_PASSWORD=...
DB_PORT=1433

JWT_SECRET=minimo_32_caracteres_aqui
AUDIT_SECRET=otro_secreto_de_32_caracteres

PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

```bash
npm run dev
```

Debe mostrar `✅ Conectado a SQL Server` y quedar escuchando en `http://localhost:3001`.
Verificar: `http://localhost:3001/health` → `{"status":"ok","db":"ok",...}`

`.env.example` documenta el resto de variables (SMTP, Google Sign-In, `BASE_URL`).

> En **producción** `NODE_ENV=production` es obligatorio: activa el hardening que exige un `JWT_SECRET` propio de 32+ caracteres. Sin eso el servidor no arranca, a propósito.

---

## 4. Panel web (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Abre `http://localhost:5173`. En desarrollo apunta solo al backend en `localhost:3001`; no hace falta configurar nada.

> En el build de **producción** el panel usa `/api` del mismo origen (ver HANDOFF §2), por eso `frontend/.env.production` tiene las URLs vacías a propósito. No las completes salvo que el API se mude a otro host.

---

## 5. Apps móviles (Expo)

Son dos proyectos independientes con el mismo procedimiento: `app-cliente` (consumidor) y `app-repartidor`.

```bash
cd app-cliente          # o app-repartidor
npm install
cp .env.example .env
```

En `.env`, para desarrollo, apuntar a la **IP LAN de tu máquina** — no `localhost`, que en el teléfono se refiere al propio teléfono:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.X:3001/api
EXPO_PUBLIC_WS_URL=ws://192.168.1.X:3001/api/ws
EXPO_PUBLIC_ID_BRANCH=1
EXPO_PUBLIC_ID_CUENTA=1
```

```bash
npx expo start -c
```

Escanear el QR con Expo Go.

**Cosas que muerden:**

- La IP LAN **cambia con DHCP**. Si aparece "Network Error", correr `ipconfig` y actualizar el `.env`.
- Después de tocar el `.env` hay que reiniciar con `-c` (limpia la caché); si no, Expo sigue usando el valor viejo.
- **Google Sign-In no funciona en Expo Go** — es un módulo nativo. La app lo detecta y lo oculta; para probarlo hace falta un dev build o el APK de EAS.
- Los `.env` de las apps **no están en git**. Los `eas.json` sí, y llevan la URL de producción para los builds.

---

## 6. Estructura del repo

```
pos-venezuela/
├── backend/          API Node.js + Fastify + SQL Server
│   ├── src/
│   │   ├── routes/         endpoints (159 rutas en 20 archivos)
│   │   ├── controllers/    lógica por módulo
│   │   ├── services/       reglas de negocio (dispatch, rutas, push, auditoría)
│   │   ├── db/             conexión SQL Server
│   │   ├── middlewares/    auth de panel y auth de app
│   │   └── ws/             WebSocket (tracking en vivo)
│   ├── uploads/            imágenes subidas (NO en git)
│   ├── web.config          IIS + iisnode (solo producción)
│   └── .env                NO en git
│
├── frontend/         Panel React + Vite + Tailwind
│   ├── src/pages/          Login, Dashboard, POS, Inventario, Reportes…
│   ├── src/services/       cliente axios
│   ├── src/store/          estado global (Zustand)
│   └── public/web.config   rewrite del SPA para IIS
│
├── app-cliente/      Expo — app del consumidor
├── app-repartidor/   Expo — app del repartidor
├── landing/          landing pública
└── sql/              migraciones 01..24 (correr en orden)
```

### API

El detalle de rutas está en `backend/src/routes/`, un archivo por módulo. Los volúmenes grandes:

| Módulo | Rutas | |
|---|---|---|
| `delivery` | 54 | apps de cliente y repartidor, pedidos, puntos, hidratación, admin de delivery |
| `inventario` | 15 | productos, categorías, stock |
| `pedidos` / `proveedores` | 12 c/u | |
| `usuarios`, `reportes`, `matriz` | 7 c/u | |
| resto (13 módulos) | 1–6 c/u | |

Todas cuelgan del prefijo `/api` (`backend/src/app.js`). `/health` y `/uploads` se exponen además bajo `/api` — el motivo está explicado en HANDOFF §6.

---

## 7. Verificación rápida de que todo quedó bien

| Qué | Cómo |
|---|---|
| Backend vivo y con base | `http://localhost:3001/health` → `{"status":"ok","db":"ok"}` |
| Panel | `http://localhost:5173` levanta el login |
| WebSocket | entrar a Logística y ver que el mapa se actualiza |
| App | abre y lista tiendas sin "Network Error" |
