# POS VENEZUELA — Guía de Instalación y Arranque

## Lo que necesitas instalar en tu máquina

### 1. Node.js 20 LTS
- Descargar de: https://nodejs.org/en (botón "LTS")
- Verificar: `node -v` → debe mostrar v20.x.x

### 2. SQL Server
- Si no tienes: SQL Server Express (gratuito)
  https://www.microsoft.com/es-mx/sql-server/sql-server-downloads
- GUI: SQL Server Management Studio (SSMS)
  https://learn.microsoft.com/es-es/sql/ssms/download-sql-server-management-studio-ssms

### 3. Git
- https://git-scm.com/downloads

### 4. VS Code (editor recomendado)
- https://code.visualstudio.com

---

## Estructura del proyecto

```
pos-venezuela/
├── backend/               ← API Node.js + Fastify
│   ├── src/
│   │   ├── routes/        ← Endpoints
│   │   ├── controllers/   ← Lógica por módulo
│   │   ├── services/      ← Reglas de negocio
│   │   ├── db/            ← Conexión SQL Server
│   │   └── middlewares/   ← Auth, errores
│   ├── .env               ← Variables de entorno (NO en git)
│   └── package.json
│
├── frontend/              ← React + Vite + Tailwind
│   ├── src/
│   │   ├── pages/         ← Login, Dashboard, etc.
│   │   ├── components/    ← Sidebar, Cards, etc.
│   │   ├── services/      ← Llamadas a la API
│   │   └── store/         ← Estado global (Zustand)
│   └── package.json
│
└── sql/
    └── 01_schema.sql      ← Script de base de datos
```

---

## Pasos para arrancar el MVP

### Paso 1 — Base de datos
1. Abrir SSMS y conectarte a tu instancia de SQL Server
2. Abrir el archivo `sql/01_schema.sql`
3. Ejecutar (F5)
4. Verificar que aparece: `✅ POS Venezuela — Schema y seed ejecutados correctamente.`

### Paso 2 — Backend
```bash
cd backend
npm install
# Copiar y editar el .env:
cp .env.example .env
# Editar .env con tus datos de SQL Server
npm run dev
# Debe mostrar: Server running on http://localhost:3001
```

### Paso 3 — Frontend
```bash
cd frontend
npm install
npm run dev
# Abrir: http://localhost:5173
```

### Credenciales de prueba
| Usuario   | Contraseña | Rol        |
|-----------|------------|------------|
| admin     | Admin1234! | Admin      |
| supervisor| Admin1234! | Supervisor |
| cajero1   | Admin1234! | Cajero     |

---

## Variables de entorno del backend (.env)

```env
# SQL Server
DB_SERVER=localhost          # o nombre de tu instancia, ej: DESKTOP-ABC\SQLEXPRESS
DB_DATABASE=POS_VENEZUELA
DB_USER=sa                   # o tu usuario de SQL Server
DB_PASSWORD=tuPasswordAqui
DB_PORT=1433

# JWT
JWT_SECRET=pos_venezuela_secret_32_caracteres_minimo
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Servidor
PORT=3001
NODE_ENV=development

# Frontend URL (para CORS)
FRONTEND_URL=http://localhost:5173
```

---

## Endpoints del API (MVP)

| Método | Ruta                        | Descripción              | Auth |
|--------|-----------------------------|--------------------------|------|
| POST   | /api/auth/login             | Login con Cve + Pass     | No   |
| POST   | /api/auth/refresh           | Renovar access token     | No   |
| POST   | /api/auth/logout            | Cerrar sesión            | Sí   |
| GET    | /api/dashboard/stats        | KPIs del dashboard       | Sí   |
| GET    | /api/auth/pantallas         | Módulos del usuario      | Sí   |
| GET    | /api/sucursales             | Lista de puntos de venta | Sí   |
| GET    | /health                     | Estado del servidor      | No   |
