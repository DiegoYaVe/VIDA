# VIDA — Auditoría E2E de flujos (simulación de punta a punta)

**Fecha:** 2026-09-10 · **Rama:** `feature/multipedido-rutas-mapas` · **Entorno:** backend local (`localhost:3001`) contra BD QA `db_a3fa0b_vidaqa` (SQL Server).

## Metodología
Se ejerció **cada endpoint real** que consumen el panel web y las apps (cliente y repartidor), con aserciones automáticas PASS/FAIL y verificación directa en BD de los efectos (saldos de puntos, stock, estatus). Actores simulados:
- **Panel — SUPER_ADMIN:** login real (`Admin` / contraseña), token JWT emitido por el propio backend.
- **Panel — ADMIN de tienda (pv 8):** token para validar el *scope por tienda*.
- **Cliente app** y **Repartidor app:** tokens JWT válidos (mismo secreto del backend) para ejercer sus endpoints.

Cobertura: **2 rondas, 69 casos** — happy path, alcance por rol, y casos **negativos/límite** (validaciones, transiciones inválidas, agotados, dobles acciones, tokens cruzados).

## Resultado global
**69/69 OK.** En la ronda 2 salieron 2 banderas en `/reportes/red`: una era el test (faltaban `fechaInicio/fechaFin`, validación correcta) y la otra un matiz de permisos que se **corrigió** (ver Hallazgos). Tras el ajuste, todo verde.

---

## Ronda 1 — Flujos principales, alcance y seguridad (38/38)

| Módulo | Casos | Resultado |
|---|---|---|
| **AUTH** | login OK + login con password incorrecto → 401 | ✅ 2/2 |
| **Catálogos** | países / estados / ciudades | ✅ 3/3 |
| **Dashboard** | SUPER_ADMIN ve red; ADMIN de tienda scopeado (sin lista de sucursales) | ✅ 2/2 |
| **Inventario** | ADMIN lista productos; `stock` fuerza su punto de venta | ✅ 2/2 |
| **Rentabilidad/Metas** | 3 modos + punto de equilibrio; guardar metas + progreso | ✅ 2/2 |
| **Pedido + Puntos** | cliente crea → repartidor acepta → IR/EN_SUCURSAL/EN_CAMINO/ENTREGADO → **cliente gana +50 pts** | ✅ 4/4 |
| **Canje** | 50 pts = $0.50 desc en checkout; debita; **cancelar reembolsa** | ✅ 3/3 |
| **Hidratación** | registrar vaso (body vacío OK); consultar | ✅ 2/2 |
| **Membresía** | nivel + QR generado | ✅ 1/1 |
| **Servicios** | operadoras; crear recarga (+puntos); admin lista y **completa** | ✅ 4/4 |
| **Premios** | catálogo + saldo; canje sin saldo → 409 | ✅ 2/2 |
| **Academia** | lista cursos + resumen; completar (idempotente) | ✅ 2/2 |
| **CRUD** | premio crear/editar/baja; curso crear; operadora crear | ✅ 5/5 |
| **Seguridad** | token cliente NO entra al panel (403); sin token → 401; **ADMIN de tienda NO crea otro ADMIN** (regla #10); expirar puntos | ✅ 4/4 |

## Ronda 2 — Casos negativos, límites y módulos restantes (31/31 tras el fix)

| Módulo | Casos | Resultado |
|---|---|---|
| **Pedidos (neg.)** | sin items→400; producto inexistente→400; sin idPuntoVenta→400; transición inválida ENTREGADO→EN_CAMINO→422; status sobre pedido ajeno→404; cancelar entregado→409 | ✅ 6/6 |
| **Premios (full)** | canjear con saldo→201+código; debita; **agotado (stock 0)→409**; admin lista; entrega→200; **re-entregar→409** | ✅ 6/6 |
| **Servicios (neg.)** | monto 0→400; sin número→400; recompletar ya completada→409 | ✅ 3/3 |
| **Hidratación (límite)** | quitar vaso decrementa; **meta fuera de rango se clampa a 30** | ✅ 2/2 |
| **Finanzas (scope)** | ADMIN tienda sin param usa su pv; red sin idPuntoVenta→400 | ✅ 2/2 |
| **Reportes (scope)** | ADMIN tienda solo ve su tienda en filtros; **ADMIN tienda NO accede /reportes/red→403**; SUPER_ADMIN sí→200 | ✅ 3/3 |
| **Caja (scope)** | ADMIN tienda usa su pv; red con pv explícito | ✅ 2/2 |
| **Matriz (scope)** | estado de la Matriz; **ADMIN tienda ve solo SUS pedidos de reabasto** | ✅ 2/2 |
| **Corporativo** | tablero; lista de tiendas de la red (9) | ✅ 2/2 |
| **Auth cruzado** | token REPARTIDOR en endpoint de cliente→403; token CLIENTE en endpoint de repartidor→403; token basura→401 | ✅ 3/3 |

---

## Hallazgos

1. **(Corregido) `/reportes/red` era alcanzable por ADMIN de tienda.** El guard `preRed` incluía `'ADMIN'`. No había fuga de datos (el `buildGeoFilter` ya scopea al ADMIN a su propia tienda y el front oculta la pestaña), pero por defensa/consistencia se restringió a **roles de red** (`SUPER_ADMIN`, `ADMIN_PAIS`, `ADMIN_ESTADO`). Verificado: ADMIN tienda→403, SUPER_ADMIN→200.
2. **`/reportes/red` exige `fechaInicio` y `fechaFin`** (responde 400 sin ellas) — comportamiento correcto; el panel siempre los envía.

## Confirmaciones clave de negocio (verificadas contra BD)
- **Loop de puntos íntegro:** ganar al entregar (+10 pts/$), canjear como descuento, **reembolso automático al cancelar**, canje por premios con débito de saldo y stock, y **reverso** en rechazo/cancelación. Los saldos cuadran en cada paso.
- **Alcance por rol** consistente en Dashboard, Inventario, Ventas/Pedidos, Reportes, Caja y Matriz: el ADMIN de tienda **solo ve/afecta su tienda**.
- **Máquinas de estado** (pedido delivery y órdenes de servicio/canje) rechazan transiciones inválidas y acciones duplicadas.
- **Idempotencia**: completar curso, acreditar puntos por pedido, reembolsos y reversos no se duplican.

## Qué NO cubre esta simulación (requiere prueba manual tuya)
- **Clics de UI** en el panel y render nativo de las apps (aquí se validó la **lógica/datos** vía sus endpoints reales y que el panel **compila**).
- **Push notifications** en dispositivo, **integración real de telco/pagos**, y **mapas** (Google Maps key).
- **Producción**: todo esto corrió contra QA; falta desplegar (migraciones 01→29, `npm install`, build, FTP, EAS) — ver `INSTALACION.md` / `HANDOFF-VIDA.md`.

## Nota sobre datos de prueba
La simulación dejó en QA algunos registros transaccionales (pedidos, recargas y canjes de prueba del cliente `Diego`, saldo de puntos movido). Los registros de **catálogo** de prueba (nombres `E2E…`) ya fueron **eliminados**. Nada de esto afecta producción.

## Para tu prueba manual (sugerencia de recorrido)
1. **Cliente app:** registro/login → tienda → carrito → pedido (con y sin puntos) → tracking → perfil (Puntos, Club, Consumo agua, Servicios, Premios).
2. **Repartidor app:** login → conectarse → aceptar pedido → avanzar estatus hasta ENTREGADO.
3. **Panel (SUPER_ADMIN):** Dashboard → Reportes (Ventas/Rentabilidad/Metas) → Academia → Operaciones (completar recarga, entregar canje, expirar puntos) → catálogos CRUD.
4. **Panel (empresario ADMIN de tienda):** confirmar que **solo ve su tienda** en todo.
