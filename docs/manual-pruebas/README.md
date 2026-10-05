# Manual de Pruebas VIDA

Recorrido guiado de pruebas por cada tipo de usuario del sistema: 6 roles, 81 pasos.
Es un **archivo HTML suelto** — no necesita internet, ni servidor, ni cuenta de nada.

## Cómo abrirlo

Doble clic en `index.html`. Se abre en cualquier navegador.

## Cómo repartirlo al equipo

Comprimí **toda la carpeta** `manual-pruebas/` (el `index.html` más `capturas/`) y mandala
por correo o chat. Cada persona la descomprime y abre el `index.html`.

Si preferís un enlace en vez de un archivo, la carpeta se puede subir tal cual a cualquier
hosting estático. Para servirla desde el panel, copiala a `frontend/public/manual/` y queda
en `https://app.comercializadoravida.com/manual/` después del próximo build —
**pero ojo: ahí queda accesible sin login**, y el manual describe la arquitectura interna
y las claves de configuración del sistema.

## El avance de cada uno

Marcar pasos guarda el avance **en el navegador de cada persona**, no en un lugar común.
Para juntar el trabajo de varios:

1. Cada uno usa **Guardar mi avance** (baja un `avance-pruebas-vida.json`).
2. Quien consolida usa **Cargar un avance** con cada archivo recibido.

Se fusionan: lo marcado se suma y las notas se concatenan, no se sobreescriben.

## Cómo poner las capturas reales

Cada pantalla del manual trae un **diagrama** dibujado a partir del código — etiquetas,
botones y orden reales, pero no es una foto del sistema corriendo. Para reemplazarlo por la
captura de verdad hay dos caminos:

**Recomendado — carpeta `capturas/`.** Guardá la imagen con el nombre exacto de la tabla de
abajo. Viaja con el manual, así que la ve todo el equipo. Tienen que ser `.png`.

**Rápido — botón "＋ Pegar la captura real"** en cada pantalla. Se reduce a 900 px y se
guarda en el navegador. Solo la ve quien la pegó, en esa computadora.

Mientras el archivo no exista, la pantalla muestra el diagrama y el nombre que le
corresponde. No queda ningún hueco roto.

## Nombres de archivo de las capturas

### Consumidor final

| Archivo | Pantalla | Dónde |
|---|---|---|
| `capturas/cli-login.png` | VIDA · Iniciar sesión | App móvil |
| `capturas/cli-carrito.png` | Mi carrito | App móvil |
| `capturas/cli-tracking.png` | Seguimiento del pedido | App móvil |
| `capturas/cli-perfil.png` | Perfil | App móvil |

### Repartidor

| Archivo | Pantalla | Dónde |
|---|---|---|
| `capturas/rep-login.png` | VIDA REPARTIDOR | App móvil |
| `capturas/rep-oferta.png` | ¡Nuevo pedido!  ·  60s | App móvil |
| `capturas/rep-inicio.png` | Hola, Repartidor · ● En línea | App móvil |
| `capturas/rep-motivo.png` | Cancelar pedido #20 | App móvil |

### Cajero

| Archivo | Pantalla | Dónde |
|---|---|---|
| `capturas/caj-pass.png` | Cambiar contraseña | Panel web |
| `capturas/caj-pos.png` | Punto de venta | Panel web |
| `capturas/caj-caja.png` | Cierre de Caja | Panel web |

### Empresario

| Archivo | Pantalla | Dónde |
|---|---|---|
| `capturas/emp-inv.png` | Inventario | Panel web |
| `capturas/emp-precios.png` | Precios y promociones | Panel web |
| `capturas/emp-pedidos.png` | Pedidos de delivery | Panel web |
| `capturas/emp-rep.png` | Reportes | Panel web |

### Supervisor

| Archivo | Pantalla | Dónde |
|---|---|---|
| `capturas/sup-usuarios.png` | Usuarios | Panel web |

### Corporativo

| Archivo | Pantalla | Dónde |
|---|---|---|
| `capturas/cor-tablero.png` | Corporativo | Panel web |
| `capturas/cor-ops.png` | Operaciones | Panel web |
| `capturas/cor-cat.png` | Catálogos | Panel web |

## Qué falta antes de probar

- **Expo Go SDK 56** en el teléfono (el de la Play Store es SDK 57 y rechaza las apps).
- **Migración `sql/30_liberar_pedido.sql`** corrida, o los botones de liberar y cancelar del
  repartidor responden 500.
- **Credenciales** del panel: no están en el repositorio, hay que pedirlas al equipo.
- Probar contra **QA**, no contra producción: estas pruebas dejan datos reales.

El detalle completo está en la sección **Antes de empezar** del manual.
