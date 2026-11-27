# Tareas pendientes VIDA

Tareas pedidas para incluir en el sistema. **Solo anotadas: todavía no se desarrollan.**
Cada una indica de dónde salió y su estado.

| # | Tarea | Origen | Estado |
|---|---|---|---|
| 1 | Afiliación del empresario con tarjeta digital | Flujograma, etapa 1 "Abrir una tienda nueva" (propuesta) | Propuesta aprobada · anotada |
| 2 | La Matriz no guarda mercancía: el proveedor entrega directo en la tienda o el empresario compra directo en la fábrica | Flujograma, etapa 2 "Abastecer la red" (corrección) | Anotada |
| 3 | Modalidad proveedor directo, coordinada por VIDA | Flujograma, etapa 2 "Abastecer la red" (propuesta) | Propuesta aprobada · anotada |
| 4 | Reabasto sugerido por stock mínimo, que se envía solo después de negociarlo con el empresario | Flujograma, etapa 3 "Surtir la tienda" | Propuesta original rechazada · versión negociada anotada |
| 5 | El empresario puede ir a comprar al centro de distribución con su tarjeta digital, además de recibir el reabasto | Flujograma, etapa 3 "Surtir la tienda" (propuesta) | Propuesta aprobada (confirmada por audio) · anotada |
| 6 | Cuadro de arranque del mes | Flujograma, etapa 4 "Arrancar el mes con una meta" (propuesta) | **Programada** (26 nov): Reportes → Arranque del mes |
| 7 | Producto estrella por tienda | Flujograma, etapa 4 (propuesta) | **Programada** (26 nov): VIDA lo asigna en Arranque del mes; se ve en la caja |
| 8 | Indicador de unidades PLUS vendidas | Flujograma, etapa 4 (propuesta) | **Programada** (26 nov): por tienda y ranking de la red |
| 9 | Cobro de pedidos a domicilio y pago de comisión al repartidor | Flujograma, etapa 6 (paso 7) y "Cómo se mueve el dinero" | **En observación** · el modelo actual se rechazó, falta definir el nuevo |
| 10 | Repartidor propio de la tienda | Flujograma, etapa 6 "Pedido a domicilio" (propuesta) | Propuesta aprobada · anotada |
| 11 | Tarjeta de crédito VIDA para clientes | Flujograma, etapa 7 "Fidelizar al cliente: Club VIDA" (propuesta) | Propuesta aprobada · anotada |
| 12 | Punto de equilibrio calculado con los datos reales, por tienda y para la Matriz (todas las tiendas o un grupo) | Audios de WhatsApp | Anotada |
| 13 | Productos PLUS de cada tienda visibles en la app, y sección "Productos Club VIDA" con todos | Audios de WhatsApp | **Programada**: sección Productos Club VIDA en la app y PLUS propios de cada tienda (26 nov) |
| 14 | Afiliación de la tienda con kit y paquetes por nivel | Audios de WhatsApp | **Programada** (19 nov): Portal Corporativo → Afiliación y mensualidades |
| 15 | Mantenimiento mensual de la plataforma según el nivel de la tienda | Audios de WhatsApp | **Programada** (19 nov): cargo mensual automático en Cuentas |
| 16 | Cobro de la suscripción: activar o suspender la tienda según su pago, con multa al reactivar | Audios de WhatsApp | **Programada** (19 nov): corte y multa configurables, nacen apagados |
| 17 | Ingreso de VIDA: porcentaje sobre lo que los proveedores le venden a las tiendas | Audios de WhatsApp | Anotada |
| 18 | Metas de la Matriz por ventas y por número de tiendas, y pago al personal en Finanzas | Audios de WhatsApp | Anotada |
| 19 | Carga del inventario de una tienda desde un archivo Excel | Audios de WhatsApp | **Programada** (26 nov): Inventario → Productos → Carga por layout |
| 20 | Video tutorial para empresarios y guía para instalar el sistema en las tiendas | Mensajes de WhatsApp | Anotada |
| 21 | Responder las dudas del empresario sobre la plataforma | Audios y mensajes de WhatsApp | Respuestas listas (abajo) · faltan las comerciales |
| 22 | Pago Móvil, transferencia y Zelle como formas de pago en el punto de venta de la tienda | Preguntas del empresario (tarea 21) | **Programada** (26 nov), junto con **Biopago**: se cobran con su referencia; la conexión directa con el banco queda fuera (requiere convenio) |
| 23 | Conexión directa con la máquina fiscal o la imprenta digital (número de control automático) | Preguntas del empresario (tarea 21) | Anotada |
| 24 | **Pedido de la tienda al proveedor por su API, con cobro en línea y seguimiento GPS hasta la tienda** (flujo que propone Israel; reúne las tareas 2, 3, 5 y 17) | Audio de Israel (28 oct 2026) + decisiones de Diego | **Fase 1 programada** (28 oct, sin subir): pedido a VIDA, pago, paquetes por proveedor, Portal de proveedores, recepción · falta: app del repartidor de proveedores |
| 25 | Activar Google Routes (rutas por las calles en los mapas de las apps) | Diego (28 oct 2026) | **Código listo** · falta la llave de la API |
| 26 | **Catálogo del proveedor por layout de Excel** (costos, precios y productos), para los proveedores que no tienen API | Diego (27 nov 2026) | **Programada** (27 nov): Proveedores → Lista de precios (Excel) y Productos por aprobar |
| 27 | **Ajuste del flujo de reabasto:** sin días de crédito, VIDA valida el pedido y genera la orden de compra al proveedor; se define si la tienda recoge o va un repartidor de la app. Actualizar el flujograma | Diego (27 nov 2026) | **Anotada · se empieza** |

---

## 1. Afiliación del empresario con tarjeta digital

**Qué se pide:** al afiliarse, el empresario (dueño de la tienda) recibe una **tarjeta digital** que presenta en los **centros de distribución** cuando va a comprar.

**Origen:** propuesta de la etapa 1 del flujograma ("Abrir una tienda nueva"), que viene del audio de octubre de 2026. En el audio se mencionan dos modalidades de compra del empresario: ir él mismo al centro de distribución o recibir del proveedor directo a través de VIDA.

**Cómo está hoy:** el empresario se da de alta en Portal Corporativo y queda como administrador de su tienda, pero no tiene tarjeta ni identificación para comprar en persona. El reabasto solo se pide desde el panel (Matriz y Reabasto) y la Matriz lo envía.

**Por definir antes de desarrollar:**
- Qué datos muestra la tarjeta (nombre, tienda, número de afiliado, QR) y dónde la ve el empresario (panel, correo o app).
- Cómo la valida el centro de distribución al presentarla.
- Si la compra presencial queda registrada como un pedido a la Matriz (con su deuda y su movimiento de inventario) o como un flujo nuevo.

---

## 2. La Matriz no guarda mercancía: compra directa de la tienda al proveedor

**Qué se pide:** la Matriz **no almacena mercancía**, al menos al inicio. El producto llega a la tienda por una de dos vías:
- **el proveedor lo lleva directo a la tienda**;
- **el empresario va directo a la fábrica o al proveedor** a comprar.

**Origen:** corrección a la etapa 2 del flujograma ("Abastecer la red"), que hoy dice que la Matriz le compra al proveedor y guarda la mercancía para repartirla.

**Cómo está hoy (choca con lo pedido):**
- Toda orden de compra tiene como destino obligatorio la Matriz; sin Matriz designada no se puede crear ninguna.
- Solo los administradores de red y el administrador de la tienda Matriz ven "Órdenes de compra". Las tiendas no pueden comprarle al proveedor.
- Al recibir una compra, la mercancía entra al inventario de la Matriz y la deuda con el proveedor queda a nombre de la Matriz.
- Las tiendas se surten únicamente con pedidos a la Matriz (Matriz y Reabasto), que generan su deuda con la Matriz.

**Qué implicaría cambiar:**
- Que una orden de compra pueda tener como destino una tienda, y que esa tienda reciba la mercancía en su propio inventario.
- Registrar la compra presencial del empresario en la fábrica (relacionado con la tarea 1: la tarjeta digital se presentaría ante el proveedor).
- Corregir el texto del flujograma (etapa 2 y mapa de la red), que hoy dice que la Matriz guarda la mercancía.

**Por definir antes de desarrollar:**
- Qué papel tiene la Matriz en este esquema: ¿negocia precios y da de alta proveedores, coordina las entregas, o solo supervisa?
- A quién le debe la tienda: directo al proveedor, o a la Matriz que a su vez le paga al proveedor.
- Quién crea la orden de compra cuando el proveedor entrega en tienda: la tienda, la Matriz en nombre de la tienda, o ambos.
- Cuándo la Matriz empezaría a guardar mercancía ("no inicialmente") y si deben convivir los dos esquemas.

---

## 3. Modalidad proveedor directo, coordinada por VIDA

**Qué se pide:** el proveedor lleva el producto **directo al negocio del empresario**, y VIDA **coordina** la entrega. Es la segunda propuesta del flujograma que se aprobó.

**Origen:** propuesta de la etapa 2 del flujograma ("Abastecer la red").

**Relación con la tarea 2:** son la misma dirección. La tarea 2 dice que la Matriz no guarda mercancía y que el producto llega directo a la tienda; esta tarea responde una de sus preguntas abiertas: **el papel de VIDA (la Matriz) es coordinar** la entrega, no almacenar. Conviene diseñarlas y desarrollarlas juntas.

**Cómo está hoy:** no existe. El proveedor solo le entrega a la Matriz, la Matriz recibe en su inventario y después la tienda le pide a la Matriz (ver tarea 2).

**Qué implicaría:**
- Una orden de compra que la Matriz (VIDA) arma y coordina, con **destino la tienda** del empresario.
- Que la tienda reciba la mercancía en **su propio inventario** y confirme lo que llegó, como hoy se hace al recibir un reabasto.
- Que la Matriz pueda seguir el estado de cada entrega (pedida, en camino, recibida) por tienda y por proveedor.

**Por definir antes de desarrollar:**
- Quién inicia el pedido: la tienda lo solicita y VIDA lo coordina con el proveedor, o VIDA lo arma por su cuenta (por ejemplo, con el stock mínimo de la tienda).
- A quién le paga la tienda (al proveedor directo o a VIDA) y si VIDA cobra un margen o comisión por coordinar.
- Si el proveedor confirma la entrega en el sistema o solo la tienda la registra al recibir.

---

## 4. Reabasto sugerido por stock mínimo, confirmado con el empresario antes de enviar

**Qué se pide:** la propuesta original era que la Matriz enviara el reabasto **sola** cuando una tienda bajara de su stock mínimo. **Esa propuesta no gustó y se descartó el envío automático.** En su lugar:

1. **Automático:** el sistema arma por cada tienda una **lista (checklist) de los productos que están por debajo de su mínimo**, con la cantidad sugerida para reponer.
2. **Negociación:** antes de enviar, la Matriz **revisa esa lista con el empresario** de la tienda.
3. **Envío:** el reabasto sale **solo cuando el empresario lo acordó**, con las cantidades negociadas.

**Por qué se negocia antes de enviar:**
1. **Espacio:** la tienda puede no tener lugar para recibir todo.
2. **Dinero:** el empresario puede no tener disponible para pagar el pedido (genera deuda con la Matriz).
3. **Seguridad:** confirmar que el stock bajo es real y no un error de inventario.

**Origen:** propuesta de la etapa 3 del flujograma ("Surtir la tienda"), modificada por el equipo.

**Cómo está hoy:**
- El Dashboard muestra los productos bajo su mínimo, pero no arma ninguna lista ni pedido.
- La tienda arma su pedido a mano en Matriz y Reabasto (Solicitado → Preparando → Enviado → Recibido).
- La Matriz no puede crear un pedido de reabasto por iniciativa propia para una tienda.

**Qué implicaría:**
- Un reporte de la Matriz con todas las tiendas y sus productos bajo mínimo, con la cantidad sugerida (por ejemplo, hasta volver al mínimo o a un nivel objetivo).
- Convertir esa lista en una **propuesta de pedido** que el empresario ve y puede ajustar (quitar productos, bajar cantidades) antes de aceptarla.
- Que solo la propuesta **aceptada** pase a pedido y siga el flujo normal: Preparando → Enviado → Recibido, con su deuda y su movimiento de inventario.
- Un nuevo estado antes de "Solicitado", como "Propuesta" o "En negociación", y el registro de quién aceptó y cuándo.

**Relación con otras tareas:** si se aprueban las tareas 2 y 3 (la Matriz no guarda mercancía y el proveedor entrega directo), la propuesta negociada se convertiría en una orden al proveedor con destino la tienda, en lugar de un envío desde la Matriz.

**Por definir antes de desarrollar:**
- Cómo se calcula la cantidad sugerida: hasta el mínimo, hasta un máximo por producto, o según lo vendido en las últimas semanas.
- Dónde negocian: dentro del sistema (el empresario acepta o ajusta en su panel) o por fuera (llamada, WhatsApp) y la Matriz solo registra lo acordado.
- Cada cuánto se genera la lista (diaria, semanal) y si se avisa al empresario por correo o notificación.

---

## 5. Compra presencial del empresario en el centro de distribución con su tarjeta digital

**Qué se pide:** además de recibir el reabasto en su tienda, el empresario puede **ir en persona a comprar al centro de distribución** y se identifica con su **tarjeta digital**.

**Origen:** segunda propuesta de la etapa 3 del flujograma ("Surtir la tienda"). Esta sí gustó; la primera de esa misma etapa (envío automático) no, y quedó reemplazada por la tarea 4. **Confirmada después por audio:** "el empresario puede ir a comprar al centro de distribución con su tarjeta digital, además de recibirlo; eso sí está bien".

**Relación con otras tareas:**
- **Tarea 1:** es la tarjeta digital que recibe el empresario al afiliarse. Esta tarea es su uso principal; conviene hacerlas juntas.
- **Tareas 2 y 3:** si la Matriz no guarda mercancía, hay que definir qué es el "centro de distribución" donde compra el empresario: un almacén de VIDA o la fábrica/proveedor (la tarea 2 menciona que el empresario puede ir directo a la fábrica).

**Cómo está hoy:** no existe compra presencial. La tienda solo puede pedir desde el panel (Matriz y Reabasto) y esperar el envío.

**Qué implicaría:**
- Que en el centro de distribución se pueda **leer o buscar la tarjeta** del empresario y ver su tienda y su crédito disponible.
- Registrar la compra en el momento (como una venta de mostrador hacia la tienda), con salida de inventario del centro de distribución y entrada al inventario de la tienda.
- Generar la deuda de la tienda o cobrar en el momento, igual que un reabasto recibido.

**Por definir antes de desarrollar:**
- Si la compra presencial se paga al momento o queda a crédito como el reabasto.
- Quién registra la compra en el sistema: el personal del centro de distribución o el propio empresario.
- Si el centro de distribución usa el punto de venta del panel con un modo "venta a tienda afiliada" o una pantalla nueva.

---

## 6, 7 y 8. Propuestas de la etapa 4 "Arrancar el mes con una meta" (las tres aprobadas)

**Origen:** las tres propuestas de la etapa 4 del flujograma; al equipo le gustaron todas.

**Lo que ya existe hoy y sirve de base:**
- **Reportes → Rentabilidad:** calculadora de punto de equilibrio, mezcla de productos PLUS y normales, meta diaria y retorno de la inversión.
- **Reportes → Metas:** metas diaria, semanal y mensual en dólares, con barra de avance e insignia al cumplirlas.
- **Reportes → Productos:** productos más y menos vendidos del período.
- **Producto PLUS:** marca en cada producto (etiqueta dorada) para los de mayor ganancia.

### 6. Cuadro de arranque del mes

**Qué se pide:** una sola vista, pensada para el inicio de cada mes, que junte:
- el **comportamiento de los meses anteriores** (ventas por mes y su tendencia);
- la **meta contra el resultado** de cada mes;
- el **producto más vendido**.

**Cómo está hoy:** esos datos están repartidos en pestañas distintas de Reportes y no hay comparación entre meses.

**Por definir:** cuántos meses hacia atrás mostrar; si es una pestaña de Reportes o la portada del Dashboard al iniciar el mes; si se ve por tienda, por red o ambos.

### 7. Producto estrella por tienda

**Qué se pide:** VIDA define para cada tienda **el producto de mayor margen** para que el empresario se enfoque en venderlo.

**Cómo está hoy:** solo existe la marca PLUS, que es igual para toda la red; no hay un producto destacado por tienda.

**Qué implicaría:** que Corporativo o la Matriz asignen el producto estrella de cada tienda (o que el sistema lo sugiera según el margen), que el empresario lo vea destacado en su Dashboard y en el punto de venta, y que se mida cuánto se vendió.

**Por definir:** si lo elige VIDA a mano o el sistema lo calcula por margen; cada cuánto cambia (mensual); si puede haber más de uno por tienda.

### 8. Indicador de unidades PLUS vendidas

**Qué se pide:** un indicador de **cuántas unidades de productos PLUS vende cada tienda**, para medir cuánto empuja los productos de mayor ganancia.

**Cómo está hoy:** Rentabilidad usa la mezcla PLUS/normal para calcular, pero no hay un conteo real de unidades PLUS vendidas por tienda y período.

**Por definir:** si se muestra como unidades, como porcentaje de la venta o ambos; si tiene meta propia; si se compara entre tiendas (ranking de la red).

**Relación entre las tres:** el producto estrella (7) y el indicador PLUS (8) encajan naturalmente dentro del cuadro de arranque del mes (6); conviene diseñarlas como una sola pantalla.

**Cómo quedó (26 nov 2026, programado):** una sola pestaña, **Reportes → Arranque del mes**.
- **Por tienda:** lo vendido en el mes contra la meta mensual (con barra de avance y el día del mes), la proyección al cierre, los **últimos 6 meses** en gráfica contra la meta, las unidades PLUS por mes, el % de la venta que es PLUS, el producto estrella (unidades este mes y el pasado), los PLUS de la tienda y lo más vendido este mes y el anterior.
- **Toda la red** (VIDA, sin elegir tienda): ranking de tiendas por unidades PLUS del mes, con venta PLUS y % en PLUS.
- **Producto estrella:** lo elige VIDA a mano, hasta 3 por tienda, con el botón "Definir PLUS y estrella". Sale con la etiqueta ★ ESTRELLA en la caja.
- **PLUS por tienda:** en el mismo editor VIDA elige hasta 30 PLUS propios de cada tienda; si no elige ninguno, la tienda usa la marca PLUS general del producto. Aplica en la app, la caja, Rentabilidad y el Plan PLUS (sql/65).

---

## 9. Cobro de pedidos a domicilio y pago de comisión al repartidor — EN OBSERVACIÓN

**Estado:** el equipo pidió **analizarlo mejor** antes de decidir. No desarrollar hasta que se cierre.

**Lo que ya está decidido:** **no les gustó el modelo actual**, descrito en "Cómo se mueve el dinero" del flujograma: *el efectivo que cobra el repartidor es de la tienda, él lo entrega, la tienda lo liquida y él se queda con su comisión*. Lo que falta es definir el detalle del modelo nuevo (puntos de abajo).

**Origen:** paso 7 de la etapa 6 del flujograma ("Liquida al repartidor: recibe el efectivo cobrado; él se queda con su comisión").

**Lo que plantearon:**
1. **El repartidor llevará un punto de venta** para cobrar con tarjeta.
2. **Antes del despacho el cliente ya debió pagar por Pago Móvil.** Solo si no lo hizo, debe **avisar antes** para que el repartidor lleve el punto de venta.
3. **La comisión se le paga al repartidor por transferencia**, directo a su cuenta.
4. **Falta definir quién hace esa transferencia** (la tienda, VIDA u otro).

**Cómo está hoy:**
- El cliente elige en la app: efectivo al recibir ($, Bs o combinado, con cambio), tarjeta al recibir (el repartidor lleva el punto) o Pago Móvil antes del despacho (la tienda valida el comprobante).
- El efectivo que cobra el repartidor es de la tienda: el sistema lleva su **saldo por rendir** en $ y en Bs, ya **descontada su comisión**, y la tienda lo liquida en Repartidores y Logística.
- O sea, hoy la comisión se paga "quedándose" con parte del efectivo; no existe el pago de comisión por transferencia.

**Qué implicaría si se aprueba:**
- Que el **Pago Móvil previo sea la forma normal** de pagar en la app y la tarjeta al recibir quede como excepción avisada (el pedido marcaría "llevar punto de venta" para el repartidor, como hoy marca "llevar cambio").
- Revisar si se **mantiene el efectivo** al recibir: lo planteado no lo menciona.
- Cambiar la liquidación: registrar la **comisión por pagar** a cada repartidor y el **pago por transferencia** (fecha, referencia, quién pagó), en lugar de descontarla del efectivo.
- Que el repartidor vea en su app la comisión pendiente y las transferencias recibidas.

**Lo que se agregó por audio (WhatsApp):**
- La responsable **no quiere que el repartidor cargue con la responsabilidad de llevar dinero** (ni recibir efectivo de los clientes). Esto choca con el punto 1 de arriba (que lleve un punto de venta): hay que aclarar si el punto de venta sigue o se elimina también.
- Quiere que el **pago al repartidor** sea por un medio electrónico (se mencionó Pago Móvil, sin confirmar).
- La idea es un **cierre al final del día por repartidor**: "tus repartos de hoy fueron estos, tu dinero es este", y con eso se le paga.
- **Sigue sin definir quién le paga** (la tienda o la Matriz); quedaron de volver a preguntarlo.

**Preguntas abiertas:**
- ¿Quién le transfiere la comisión al repartidor: la tienda, VIDA o la Matriz?
- ¿El repartidor lleva punto de venta o no lleva nada (todo prepagado por Pago Móvil)?
- ¿Se elimina el pago en efectivo al recibir, o convive con Pago Móvil y tarjeta?
- Si el cobro con tarjeta cae en el punto de venta del repartidor, ¿cómo le llega ese dinero a la tienda?
- ¿Cada cuánto se paga la comisión (por pedido, diario, semanal)?

---

## 10. Repartidor propio de la tienda

**Qué se pide:** que una tienda pueda tener **su propio repartidor**, además de los repartidores independientes que hoy toman pedidos por cercanía.

**Origen:** propuesta de la etapa 6 del flujograma ("Pedido a domicilio"). Aprobada.

**Cómo está hoy:**
- Todos los repartidores son independientes: se registran desde la app, la administración los aprueba y no pertenecen a ninguna tienda.
- Cuando un pedido queda listo, el sistema avisa a los repartidores más cercanos a la tienda y amplía el radio cada pocos minutos si nadie acepta.
- La tienda puede asignar un repartidor a mano desde el detalle del pedido.

**Qué implicaría:**
- Poder **vincular un repartidor a una tienda** (desde Repartidores y Logística).
- Que los pedidos de esa tienda se ofrezcan **primero a su repartidor propio** y, si no acepta o está ocupado, pasen a los independientes por cercanía.
- Ver en reportes las entregas hechas por repartidores propios y por independientes.

**Relación con otras tareas:** la **tarea 9** (pago de comisión por transferencia) también aplica aquí: hay que definir si el repartidor propio cobra comisión por pedido, un sueldo de la tienda o ambos.

**Por definir antes de desarrollar:**
- ¿Un repartidor propio puede atender a varias tiendas, o solo a una?
- ¿Cuánto tiempo tiene el repartidor propio para aceptar antes de que el pedido pase a los independientes?
- ¿Puede el repartidor propio tomar también pedidos de otras tiendas cuando está libre?
- ¿Cómo se le paga (comisión, sueldo de la tienda o ambos)?

---

## 11. Tarjeta de crédito VIDA para clientes

**Qué se pide:** una **tarjeta de crédito** para que el cliente compre **a crédito** en las tiendas VIDA. Aprobada.

**Origen:** propuesta de la etapa 7 del flujograma ("Fidelizar al cliente: Club VIDA"). En el audio de octubre se mencionó como "tarjeta UVIS" y que se estaba definiendo esa semana.

**Cómo está hoy:**
- En la app de clientes existe la pantalla **Perfil → Mis tarjetas**, que solo dice "Próximamente".
- No existe ningún pago a crédito: ni en la app ni en el punto de venta de la tienda.
- El cliente sí tiene tarjeta digital del Club VIDA (con QR), pero es de puntos, no de crédito.

**Qué implicaría:**
- Dar de alta la línea de crédito de cada cliente: **límite, saldo disponible, fecha de corte y de pago**.
- Agregar **"Crédito VIDA"** como forma de pago en la app y en el punto de venta de la tienda, validando que haya saldo disponible.
- Un **estado de cuenta** para el cliente (en la app, en Mis tarjetas) y la **cobranza**: abonos, atrasos y bloqueo por falta de pago.
- Definir **quién asume el riesgo**: la tienda donde se compró o VIDA.

**Por definir antes de desarrollar:**
- ¿La tarjeta la emite VIDA directamente o un banco/aliado? (Si es un tercero, el sistema solo se integra con él.)
- ¿Quién aprueba el crédito de cada cliente y con qué requisitos?
- ¿Cobra intereses o comisiones?
- ¿La compra a crédito suma puntos del Club VIDA?
- ¿Es la misma tarjeta digital del Club (con QR) o una tarjeta aparte?

---

## 12. Punto de equilibrio con los datos reales, por tienda y para la Matriz

**Qué se pide (audio):** que el punto de equilibrio (donde la tienda no gana ni pierde) se calcule **con un clic, con la fórmula ya incluida en el sistema y los datos que ya tiene**, en lugar de calcularlo a mano. Que funcione en dos niveles:
- **el empresario**, para su tienda, con sus productos y sus datos;
- **la Matriz (VIDA)**, para **todas las tiendas o para un grupo** de tiendas.

**Cómo está hoy (Reportes → Rentabilidad):**
- La fórmula ya está en el sistema y da punto de equilibrio mensual y diario, meta diaria y retorno de la inversión.
- Pero **hay que capturar a mano** los costos fijos mensuales, % de comisión de delivery, % de impuestos, % de pasarela, la inversión inicial y la ganancia objetivo.
- El margen sale del **catálogo** (precio contra costo, PLUS y normales), no de lo que la tienda **vendió realmente**; las ventas reales solo se usan para el retorno (últimos 30 días).
- Es **por una tienda a la vez**: los administradores de red eligen una tienda; no hay cálculo para todas o para un grupo.

**Qué implicaría:**
- Calcular el margen con la **mezcla real de ventas** de la tienda (lo que vende de cada producto), no con el promedio del catálogo.
- Tomar del sistema lo que ya exista (por ejemplo, comisiones de delivery reales e impuestos cobrados) y dejar a mano solo lo que el sistema no puede saber (renta, sueldos, servicios).
- Una vista para la Matriz que **sume varias tiendas**: todas, por estado o un grupo elegido.

**Duda de Lila (audio):** preguntó **de dónde salen** las estadísticas del punto de equilibrio y la meta. También se comentó que **ellos ya tienen otra fórmula**. Respuesta (fórmula que usa hoy el sistema, la estándar de contabilidad de costos):
- **Margen de contribución** de cada producto = precio − costo − gastos variables (comisión de delivery + impuestos + pasarela, en % del precio). Se usa el **promedio simple de todos los productos activos del catálogo**.
- **Punto de equilibrio mensual** = costos fijos del mes ÷ margen de contribución %. Diario = mensual ÷ 30.
- **Meta mensual** = (costos fijos + ganancia deseada) ÷ margen de contribución %. Meta diaria = mensual ÷ 30.
- **Retorno de la inversión** = (ventas de mostrador de los últimos 30 días × margen de contribución % − costos fijos) ÷ inversión inicial.

**Pendiente:** pedirles **su fórmula** para compararla y, si es distinta, adoptarla en el sistema.

**Por definir:** qué es un "grupo de tiendas" (por estado, por nivel de tienda de la tarea 14, o un grupo libre); si los costos fijos de cada tienda los captura el empresario o la Matriz.

---

## 13. Productos PLUS de cada tienda visibles en la app de clientes

**Qué se pide (audio):** cada tienda tendrá **su producto PLUS**, y el cliente debe poder verlo en la app al entrar a esa tienda. Además, una sección tipo **"Productos Club VIDA"** donde salgan **todos** los productos PLUS.

**Cómo está hoy:** la marca PLUS existe en el panel (etiqueta dorada en Inventario y Catálogos), pero **la app de clientes no la muestra** ni tiene una sección de productos PLUS.

**Relación:** con la **tarea 7** (producto estrella por tienda) y la **tarea 14** (el producto PLUS se define al afiliar la tienda).

**Por definir:** si "producto PLUS" y "producto estrella" son lo mismo; si la sección "Productos Club VIDA" muestra los de la tienda elegida o los de todas las tiendas cercanas; si comprar productos PLUS da más puntos del Club.

**Cómo quedó (programado):** la app tiene la sección **Productos Club VIDA**. Desde el 26 nov cada tienda puede tener **sus propios PLUS** (los define VIDA en Reportes → Arranque del mes); la app muestra los PLUS de la tienda donde está el producto. PLUS y estrella quedaron como cosas distintas: PLUS = productos de mayor ganancia de la tienda; estrella = el producto en que se enfoca este mes.

---

## 14. Afiliación de la tienda con kit y paquetes por nivel

**Qué se pide (audio):** cuando una tienda **se afilia a VIDA** se le entrega un **kit que tiene costo**: esa es la **inscripción (suscripción con el kit)**. El kit se entrega **completo o en parte según el nivel** con el que entre la tienda; habrá **varios paquetes de oportunidad**. El producto PLUS de la tienda se establece en ese momento.

**Cómo está hoy:** Portal Corporativo da de alta la tienda y al empresario (Prospecto → En proceso → Activa), pero **no registra nivel, paquete, kit ni pago de inscripción**.

**Qué implicaría:**
- Catálogo de **niveles/paquetes** con su costo de inscripción y lo que incluye el kit.
- Al dar de alta la tienda: elegir el paquete, registrar el pago de la inscripción y la entrega del kit (completo o parcial).
- Definir el producto PLUS de la tienda en ese mismo paso.

**Por definir:** cuántos paquetes hay, cuánto cuesta cada uno y qué trae cada kit; si el nivel puede cambiar después (subir o bajar).

---

## 15. Mantenimiento mensual de la plataforma según el nivel de la tienda

**Qué se pide (audio):** cada tienda paga un **mantenimiento mensual** por usar el sistema, "algo muy pequeño": se mencionaron **25, 30 o 75** (moneda por confirmar, probablemente USD) según el nivel. Los niveles se definen por el **número de productos que maneja la tienda**; habrá **tres tipos de tienda**. La tienda **solo paga la inscripción y el mantenimiento mensual** (ver tarea 17).

**Cómo está hoy:** no existe ningún cobro de VIDA a las tiendas.

**Qué implicaría:** asignar a cada tienda su nivel (o calcularlo por número de productos), generar cada mes el cargo de mantenimiento y llevar su estado de cuenta (se puede apoyar en Cuentas por cobrar, que ya existe).

**Por definir:** los rangos de productos de cada nivel; la moneda y los montos exactos; qué pasa si una tienda cambia de nivel a mitad de mes.

---

## 16. Cobro de la suscripción: activación y suspensión automática

**Qué se pide (audio):** como serán muchas tiendas, **no revisar una por una**. Que sea configurable: al registrarse el pago de una tienda, **su sistema queda encendido** (activo en la computadora de la tienda); si no paga, **se corta**. Y al reactivarse, la tienda que dejó que la cortaran **paga una multa**; la que paga a tiempo paga solo su membresía normal. Se comentó que antes "peleábamos pero no terminaba cobrando", así que debe ser automático.

**Cómo está hoy:** Corporativo puede **suspender o reactivar una tienda a mano**, pero no está ligado a ningún pago.

**Qué implicaría:**
- Fechas de vencimiento por tienda y una **tolerancia** antes de suspender.
- **Suspensión automática** al vencer sin pago: la tienda no puede vender ni entrar al panel (con un aviso claro de por qué y cómo pagar).
- **Reactivación automática** al registrar el pago, sumando la **multa por reconexión** si estuvo suspendida.
- Avisos previos al empresario (correo o notificación) antes del corte.

**Por definir:** días de tolerancia; monto de la multa; quién registra los pagos (Corporativo, o se concilian solos como hoy el Pago Móvil); si la suspensión bloquea también la app de clientes para esa tienda.

---

## 17. Ingreso de VIDA: porcentaje sobre las ventas de los proveedores a las tiendas

**Qué se pide (audio):** el otro ingreso de Comercializadora VIDA es un **porcentaje de lo que los proveedores le venden a las tiendas**. Ese porcentaje **se le cobra al proveedor, no a la tienda**.

**Cómo está hoy (choca con lo pedido):** la Matriz le cobra a la tienda el reabasto con un **margen sobre el costo** (`MargenMatrizPct`, 0 % por defecto) o con un precio de suministro fijo. O sea, si hubiera ganancia, hoy la pagaría la tienda. No existe ningún cobro a proveedores.

**Relación:** encaja con las **tareas 2 y 3** (el proveedor entrega directo a la tienda, coordinado por VIDA) y responde una de sus preguntas abiertas: **VIDA cobra al proveedor, no a la tienda**.

**Qué implicaría:**
- Configurar el **porcentaje de comisión por proveedor** (o uno general).
- Calcular, por cada venta del proveedor a una tienda, la comisión que el proveedor le debe a VIDA, y llevarla como **cuenta por cobrar al proveedor**.
- Que el precio a la tienda sea el del proveedor, sin margen de la Matriz.

**Por definir:** el porcentaje (general o por proveedor); si VIDA lo descuenta de lo que le paga al proveedor o se lo factura aparte; cada cuánto se liquida.

---

## 18. Metas de la Matriz por ventas y por número de tiendas, y pago al personal

**Qué se pide (audio):** la Matriz llevará **metas por ventas y por número de tiendas**, porque **habrá pagos (comisiones o bonos) al personal**: a una persona **por número de tiendas** (por ejemplo, quien afilia tiendas) y a otra **por ventas**. Todo eso debe llevarse en la parte de **Finanzas**.

**Cómo está hoy:**
- Las metas existen solo **por tienda** (Reportes → Metas: diaria, semanal y mensual en dólares).
- Portal Corporativo muestra el crecimiento de la red hacia la meta 2035 y las altas por mes, pero no metas por persona.
- No existe registro de comisiones ni pagos al personal de VIDA.

**Qué implicaría:**
- Metas de la Matriz por período: **ventas de la red** y **tiendas nuevas afiliadas**, con avance.
- Asignar responsables (personal de VIDA) y calcular lo que se le paga a cada uno según su meta (por tienda afiliada o por % de ventas).
- Un apartado en Finanzas con lo que se debe y lo que se pagó a cada persona.

**Por definir:** quiénes son esas personas (¿usuarios del panel con un rol nuevo, como promotor o ejecutivo?); cómo se calcula el pago (monto fijo por tienda, % de ventas, bono al cumplir la meta); si las ventas que cuentan son de toda la red o de las tiendas que cada uno afilió.

---

## 19. Carga del inventario de una tienda desde Excel

**Qué se pide (audio):** hay plataformas en Venezuela parecidas a Comercializadora VIDA que permiten **cargar el inventario desde una hoja de Excel**. Capturarlo a mano producto por producto es lento; la idea es subir el archivo y que el sistema **lo cargue automáticamente a la tienda del empresario**.

**Cómo está hoy:**
- Los productos se crean uno por uno en Inventario, y el stock se carga con movimientos de entrada uno por uno.
- El panel ya **exporta** a Excel (en Reportes), y tiene instaladas las librerías para leer archivos Excel, pero **no hay ninguna importación**.

**Qué implicaría:**
- Una **plantilla de Excel** descargable (nombre, SKU, código de barras, categoría, unidad, precio, costo, stock inicial, stock mínimo).
- Subir el archivo, ver una **vista previa con errores marcados** (precios vacíos, SKU repetidos, categorías que no existen) y confirmar.
- Crear los productos nuevos, actualizar los existentes (por SKU o código de barras) y cargar el stock de la tienda elegida, con su movimiento de entrada.

**Por definir:** quién puede importar (la Matriz para cualquier tienda, el empresario para la suya); si el Excel puede crear categorías nuevas; qué hacer si un producto ya existe (actualizar precio o ignorar).

**Programada (26 nov 2026):** en Inventario → Productos, botón **Carga por layout**.
- **Descargar layout (.xlsx):** hoja «Productos» (con los productos que ya tiene la tienda, si se marca), listas desplegables para categoría, unidad, IVA y PLUS, hoja «Categorías» y hoja «Instrucciones».
- **Subirlo ya lleno:** se revisa cada fila antes de guardar (nuevo, se actualiza, solo existencia, sin cambios o error con el motivo). Con un solo error no se carga nada; se guarda todo o nada.
- **Quién:** la tienda carga en la suya; VIDA y los roles de red eligen la tienda, y pueden mandar los productos nuevos al catálogo de VIDA.
- **Decisiones tomadas:** el producto se busca por SKU (o por código de barras si no trae SKU) y se **actualiza**; lo que la fila trae vacío no borra lo que ya había. Solo VIDA puede crear categorías nuevas desde el Excel. Un producto del catálogo de VIDA solo carga su existencia en la tienda. «Existencia en tienda» deja el stock en ese número, con su movimiento (Entrada si es nuevo, Ajuste si ya existía, motivo «Carga por layout»). Máximo 500 productos por archivo.

---

## 20. Video tutorial para empresarios y guía de instalación en tiendas

**Qué se pide (mensajes):**
- Un **video o tutorial para los empresarios de tienda**, para cuando se les instale el sistema. Ya se había pedido antes ("¿te acuerdas que te dije?").
- Que se le explique a quien va a las tiendas **cómo instalar el sistema** en cada una.

**Qué ya existe y sirve de base:** el **manual de usuario** publicado en `app.comercializadoravida.com/manual-vida.html`, el **flujograma** en `/flujograma-vida.html`, y `INSTALACION.md` / `DESPLIEGUE-VIDA.md` en el repositorio (técnicos, no para la tienda).

**Qué implicaría:**
- Un video corto (o una serie) por tarea: entrar al sistema, abrir y cerrar caja, vender, recibir reabasto, ver reportes.
- Una **guía de instalación en tienda** paso a paso para el instalador: requisitos de la computadora e impresora, entrar al panel, instalarlo como aplicación (PWA), crear el usuario del cajero, configurar la tienda (ubicación, datos fiscales), probar una venta y el ticket.

**Por definir:** si el video lo graba el equipo con guion nuestro o se genera con capturas; qué equipos tendrá cada tienda (computadora, lector de código de barras, impresora térmica).

---

## 21. Dudas del empresario sobre la plataforma

**Origen:** el equipo le pidió a un empresario una guía de preguntas; estas son las que llegaron. Las respuestas técnicas están verificadas contra el sistema (27 de octubre de 2026). Las marcadas **[comercial]** las tiene que definir VIDA.

**1. Multimoneda y caja**
- *¿Cobro parte en dólares en efectivo, parte en Pago Móvil y parte por Zelle, y la caja cuadra sola?* **Parcialmente.** En la tienda se cobra en dólares, bolívares o combinado, con efectivo, tarjeta o efectivo + tarjeta, y el sistema calcula el cambio. Al cerrar la caja compara lo contado contra lo esperado **por moneda**, sin conversiones a mano. Pero en el punto de venta de la tienda **no existen todavía Pago Móvil, transferencia ni Zelle** (Pago Móvil solo está en los pedidos por la app). → **Tarea 22.**
- *¿La tasa BCV se actualiza sola?* **Sí.** Al cobrar, el sistema consulta la tasa oficial del día (servicio bcv.today) y cada venta guarda la tasa con la que se cobró. Sin internet usa la última tasa autorizada mientras siga vigente.

**2. Puesta en marcha e inventario**
- *¿Me ayudan a subir el inventario desde Excel?* **Hoy no hay importación**: los productos se crean uno por uno. → **Tarea 19.** [comercial] Mientras tanto, VIDA puede ofrecer hacer la carga inicial por la tienda.
- *¿Cuánto tarda en estar operativo?* [comercial] Depende de la carga del inventario. La configuración en el sistema (alta de la tienda, usuario del empresario por correo, ubicación, datos fiscales y cajeros) toma minutos.

**3. Soporte y disponibilidad**
- *¿Quién responde un viernes o fin de semana?* [comercial] Por definir: canal (la app de clientes ya muestra WhatsApp y correo en Ayuda), horario y tiempo de respuesta.
- *Si se va la luz o el internet, ¿puedo seguir vendiendo?* **Sí, en el punto de venta.** Sin internet sigue vendiendo: cada venta se guarda en esa computadora y se envía sola al volver la conexión (no hay que borrar los datos del navegador ni cambiar de equipo mientras tanto). El panel es en la nube y se puede abrir desde el celular con datos móviles. Lo que **sí necesita internet**: facturar, los pedidos por la app y los reportes. Si se va la luz, depende del equipo (laptop con batería o UPS).

**4. Facturación legal (SENIAT)**
- *¿Está homologado o se integra con impresora fiscal / imprenta digital?* **Emite facturas fiscales y notas de crédito** con el RIF y la numeración de cada tienda, IVA e IGTF, en la modalidad de **imprenta digital o máquina fiscal** (Providencia SNAT/2024/000102). Pero **el número de control se registra a mano**: el sistema no se conecta todavía con la máquina fiscal ni con la imprenta digital, y mientras no se registre la factura dice "PENDIENTE DE NÚMERO DE CONTROL — NO VÁLIDA COMO DOCUMENTO FISCAL". Tampoco está homologado por el SENIAT como sistema. → **Tarea 23.**

**5. Costos**
- *¿Hay cobros extra por usuarios, almacenamiento, soporte o actualizaciones?* [comercial] Según los audios (tareas 14 a 16): inscripción con kit y mantenimiento mensual de 25, 30 o 75 según el nivel. Falta decir explícitamente si los usuarios, el soporte y las actualizaciones están incluidos. El sistema hoy **no limita** el número de usuarios por tienda.

---

## Reportes de errores (no son tareas nuevas)

- **Inventario → Stock: "dice stock bajo 7 y no deja bajar con el mouse para ver los otros productos".** Es el mismo problema de scroll que ya se corrigió en todo el panel (commit `c60023f5`, 22 de octubre de 2026) y que ya está publicado: la versión en producción al 27 de octubre de 2026 (`index-Dhk4C9Mk.js`) lo incluye, junto con las tablas de datos. Si todavía lo ve, debe recargar con Ctrl+F5.

---

## 22. Pago Móvil, transferencia y Zelle en el punto de venta de la tienda

**Qué se pide:** que en la tienda se pueda cobrar con **Pago Móvil, transferencia y Zelle**, también combinados con efectivo o tarjeta, y que el cierre de caja los cuadre solos.

**Origen:** pregunta del empresario (tarea 21, punto 1).

**Cómo está hoy:** el punto de venta acepta efectivo, tarjeta y efectivo + tarjeta, en dólares, bolívares o combinado. Pago Móvil solo existe en los pedidos por la app, con comprobante.

**Qué implicaría:** agregar esas formas de pago al cobro (con referencia del pago), incluirlas en el ticket, en la factura, en el arqueo de caja por forma de pago y en los reportes; definir si la tienda verifica el pago antes de entregar.

**Por definir:** Zelle es en dólares y fuera de Venezuela: ¿cómo lo verifica la tienda? ¿Se acepta pago dividido en más de dos formas a la vez?

---

## 23. Conexión directa con la máquina fiscal o la imprenta digital

**Qué se pide:** que la factura salga **válida al momento**, sin registrar el número de control a mano.

**Origen:** pregunta del empresario (tarea 21, punto 4).

**Cómo está hoy:** el sistema emite la factura con todo su contenido fiscal, pero el número de control lo escribe la tienda después; mientras tanto la factura no es válida.

**Qué implicaría:** integrarse con el proveedor de **imprenta digital** autorizado que elija VIDA (por su API) o con el modelo de **máquina fiscal** de las tiendas (por su controlador), para pedir el número de control al emitir.

**Por definir:** qué imprenta digital o qué máquinas fiscales van a usar las tiendas; si cada tienda elige o VIDA define una sola para toda la red.

---

## 24. Pedido al proveedor por su API, cobro en línea y seguimiento GPS hasta la tienda

**Origen:** audio de Israel (HW Consulting), 28 de octubre de 2026, más lo que Diego entendió del equipo. Israel ofreció revisar un diagrama del proceso y anotarlo, o una reunión de 10 minutos para cerrarlo. Reúne y concreta las tareas **2, 3, 5 y 17**.

**Decisiones ya tomadas (Diego, 28 oct):**
- **La Matriz no guarda mercancía.** VIDA es solo **intermediario** de la compra.
- La intermediación debe ser **invisible para la tienda**.
- **La tienda le paga a VIDA y VIDA le paga al proveedor**, para que VIDA quede como intermediario.
- Recomendación de Claude (sin confirmar): la orden al proveedor la genera el sistema cuando VIDA aprueba el pedido de la tienda; nunca la tienda directo.

**El flujo que describe Israel:**
1. **Levantar el pedido** como hoy se hace hacia la Matriz, pero **a un proveedor específico, por la API del proveedor**. La conexión debe quedar **versátil**, para enchufar cualquier proveedor.
2. **Cobro en línea** del pedido ya levantado, para que **el dinero le llegue al proveedor**; si el proveedor tiene una API de cobro ("aquí págame"), se liquida por ahí.
3. Al pagarse se genera una **factura que VIDA guarda solo como informativa**, para saber **lo que se le tiene que pagar a VIDA** (su comisión).
4. **Retiro en el proveedor:** el dueño de la tienda o un repartidor llega con la app ("tengo el pedido tal"), le surten, y tanto en el sistema del proveedor como en la app de VIDA aparece que **ya está pagado**.
5. **Seguimiento GPS** desde el proveedor **hasta la tienda**. Se reutiliza la logística de repartidores, pero ahora **de proveedor a tienda** (no de tienda a cliente final). "Eso es lo que quiere Lila: esa logística".
6. **Llegada a la tienda:** se ingresa el producto y **afecta el inventario**, igual que hoy al recibir de la Matriz.

**Lo que ya existe y se puede reutilizar:**
- El pedido de la tienda a la Matriz (carrito, estados, recepción que suma al inventario) → base del pedido al proveedor.
- La app del repartidor con GPS en vivo, rutas y entrega con foto → base del viaje proveedor → tienda.
- Cuentas por cobrar y por pagar → base de la comisión de VIDA y de los pagos.

**Choques con lo decidido (hay que alinearlos con Israel y el equipo):**
- **¿A dónde va el dinero?** Diego: la tienda le paga a VIDA y VIDA al proveedor. Israel: el cobro en línea hace que el dinero le llegue al proveedor y VIDA solo guarda la factura para cobrar su parte. Son dos modelos distintos de riesgo y de facturación.
- **¿La tienda ve al proveedor?** Israel dice "levantar el pedido a un proveedor específico" y "llegas al proveedor con tu app": la tienda sabe quién es el proveedor. Eso choca con que la intermediación sea invisible para la tienda.

**Por definir:**
1. A dónde va el dinero (ver arriba) y quién emite la factura fiscal a la tienda.
2. Con qué se cobra en línea en Venezuela (Pago Móvil, tarjeta, pasarela) y quién recibe el pago.
3. Qué pasa con los proveedores **sin API**: ¿se les manda el pedido por correo o WhatsApp, o tienen una pantalla sencilla en VIDA?
4. Quién trae el pedido: el dueño, un repartidor de VIDA o el proveedor. Si es repartidor, cuánto cobra y quién le paga (ver tarea 9).
5. Si la tienda elige el proveedor o elige el producto y VIDA asigna el proveedor (esto decide si la intermediación es invisible).

---

## 25. Activar Google Routes en los mapas de las apps

**Qué se pide:** que la ruta del repartidor en los mapas (app de clientes y app del repartidor) se trace con **Google Routes**, por las calles, con distancia y tiempo reales.

**Cómo está hoy:** el código ya está listo (commit `6c1f06f8`). Sin llave, el backend usa el servidor público de OSRM (con límites de uso). En cuanto tenga la llave usa Google, y si Google falla vuelve a OSRM antes de dibujar la línea recta.

**Lo único que falta (cuando llegue la llave):**
1. En Google Cloud: activar **Routes API** (con facturación) y crear una **llave nueva de servidor**, restringida por la **IP del servidor** y solo a **Routes API**. No sirve la llave de Android de los mapas.
2. En el `.env` de producción del backend (en el servidor; `publicar.bat` no lo sube): `GOOGLE_ROUTES_API_KEY=<llave>`. Opcional: `GOOGLE_ROUTES_TRAFICO=1` para tiempos con tráfico (tarifa más alta).
3. Subir el backend con `publicar.bat` y reiniciar el sitio o el pool de IIS.
4. Probar: abrir un pedido en la app y ver la ruta por las calles. Si Google rechaza la llave, el log del backend dice "Google Routes falló; se usa OSRM".
5. Poner una alerta de presupuesto en Google Cloud (cada consulta tiene costo; el backend guarda cada ruta 10 minutos).

### Decisiones finales del 28 de octubre de 2026 (Diego)

1. **La tienda le paga a VIDA y VIDA le paga al proveedor.** VIDA es el vendedor ante la tienda.
2. **La tienda NO debe saber quién es el proveedor.**

**Cómo queda el flujo (reemplaza los choques anotados arriba):**
1. La tienda **le pide a VIDA** desde su panel (como hoy en Matriz y Reabasto), eligiendo **productos**, no proveedores. Opcional: parte de la lista de faltantes negociada (tarea 4).
2. La tienda **le paga a VIDA** (en línea).
3. El sistema **asigna el proveedor** de cada producto y le envía el pedido (API o portal) **con folio de VIDA y sin datos de la tienda**.
4. **VIDA le paga al proveedor** al precio de lista menos su comisión (ejemplo: lista $10, comisión 8 %: la tienda paga $10, VIDA paga $9,20 y se queda $0,80).
5. Un **repartidor de VIDA** recoge en el proveedor con el QR del pedido y lo lleva con **GPS hasta la tienda**.
6. La tienda recibe e ingresa el producto: sube su inventario. **VIDA le factura a la tienda**; el proveedor le factura a VIDA.

**Consecuencias de que la tienda no conozca al proveedor:**
- **El dueño no puede ir a recoger al proveedor**, ni un repartidor propio de la tienda (tarea 10): solo **repartidores de VIDA** hacen recolecciones.
- **La tarea 5 (compra presencial en el centro de distribución) choca:** si el empresario va a la fábrica, conoce al proveedor. Solo funciona si el "centro de distribución" es un **local de VIDA**. Hay que replantearla.
- **El módulo Proveedores del panel debe ocultarse a las tiendas.** Hoy cualquier usuario con ese módulo ve la lista de proveedores con su RIF y contacto; debe quedar solo para VIDA.
- **Tampoco el proveedor debería ver a qué tienda va el pedido** (recomendado), para que no la contacte directo y se salte a VIDA.
- La tienda solo ve **precios de VIDA**, nunca costos ni comisión.

**Qué queda por definir (detalles, no bloquean el diseño):**
- Medio de pago en línea (Pago Móvil, tarjeta, pasarela) y si también se permite crédito con VIDA.
- Porcentaje de comisión (general o por proveedor).
- Qué hacer con proveedores sin API (portal sencillo, correo o WhatsApp).
- Tarifa del viaje del repartidor de VIDA: si se suma al pedido de la tienda o la absorbe VIDA.
- Validar con el contador la facturación (VIDA factura a la tienda; el proveedor a VIDA).

### Ajustes del 28 de octubre de 2026 (tarde)

**Dos formas de recibir el pedido** (la tienda elige al pedir):
- **Envío VIDA:** lo trae un repartidor de proveedores de VIDA con GPS; la tienda **no sabe** de dónde viene.
- **Recojo yo:** el dueño o su repartidor propio (tarea 10) recoge en la sucursal del proveedor; la tienda ve **solo el punto de retiro** (dirección, horario y QR del pedido), nunca RIF, contactos ni precios del proveedor.
- En los dos casos la tienda le paga a VIDA. Esto **resuelve la tarea 5** (compra en persona) sin un centro de distribución de VIDA.
- Para que no se salten a VIDA: mostrar solo lo necesario para recoger; acuerdo con el proveedor de no venderle por fuera a tiendas de la red (o mismo precio de lista); envío barato o gratis a partir de cierto monto, para que no todos elijan recoger.
- Implica registrar las **sucursales de cada proveedor** (dirección, horario, ubicación) y asignar la más cercana que tenga el producto.

**Repartidor de proveedores** (tipo nuevo dentro de la app VIDA Repartidor, idea de Diego):
- Separado del repartidor de pedidos a clientes, porque un pedido de tienda puede no caber en una moto.
- Vehículo con **capacidad declarada** (moto, carro, camioneta, camión; kilos o bultos). Hoy la app pide Moto/Bicicleta/Carro al registrarse, pero el despacho no lo usa.
- Requiere **peso o bultos por producto** en el inventario (hoy no existen) para calcular el tamaño de cada pedido; el viaje se ofrece solo a repartidores cuyo vehículo lo aguanta. Si nadie puede, VIDA lo asigna a mano o lo divide.
- Puede juntar recolecciones para varias tiendas en una ruta (ya existe el ruteo "recoger antes de entregar").
- Aprobación más estricta (placa, documentos, posible garantía) y tarifa por distancia y tamaño.
- Un repartidor puede activar los dos tipos.

Diagrama actualizado: `pos-venezuela-deploy/reabasto-vida.html` y https://claude.ai/artifact/UFD7hfPM9jJbsd7eZqPmYj

---

## 26. Catálogo del proveedor por layout de Excel

**Origen:** Diego, 27 nov 2026.

**Qué se pide:** la conexión por API con cadenas grandes (los ejemplos eran Walmart o Bodega Aurrerá en México, o cadenas de Colombia) no es viable por ahora: la mayoría de los supermercados y proveedores no tiene API. En su lugar, **el proveedor nos manda un layout de Excel** con sus productos, precios y costos; VIDA lo carga en el sistema y así, al hacer las órdenes de compra, el catálogo del proveedor está al día: qué productos tiene y cuánto nos cuesta cada uno.

**Lo que ya existe:**
- Cada proveedor tiene una lista de productos con su costo y su código propio (`VIDA_PROVEEDORES_PRODUCTOS`), pero se llena a mano.
- La carga por layout de Excel del inventario de una tienda (tarea 19) sirve de modelo: descargar plantilla, llenarla, revisar antes de guardar.
- El proveedor puede tener canal **PORTAL** o **API** (tarea 24); el layout sería la tercera forma de mantener su catálogo.

**Columnas propuestas del layout** (* obligatorias):

| Columna | Para qué |
|---|---|
| Código del proveedor * | Su SKU; con él se hacen las órdenes de compra |
| Código de barras | Relacionar con el mismo producto del catálogo VIDA y comparar proveedores |
| Nombre del producto * | |
| Marca · Categoría | Ordenar y crear el producto en VIDA si es nuevo |
| Unidad de compra * (pieza, caja, bulto) · Unidades por empaque | Saber cuántas piezas llegan por cada unidad pedida |
| Costo para VIDA * · Moneda (USD o Bs) | Lo que nos cuesta |
| Precio de venta sugerido al público | Calcular el margen de la tienda |
| IVA (% o exento) | Factura y costo real |
| Pedido mínimo | No pedir menos de lo que vende |
| Peso por unidad (kg) | Elegir el repartidor cuyo vehículo lo aguanta (tarea 24) |
| Disponible (sí/no) o existencia | Ofrecer solo lo que hay |
| Días de entrega | Planear el reabasto |
| Vigencia de la lista (desde / hasta), en el encabezado | Saber cuándo pedir la lista nueva |

**Cómo funcionaría:**
1. VIDA descarga la plantilla del proveedor, ya llena con lo que tenemos de él, y se la manda.
2. El proveedor la devuelve con sus precios y productos.
3. VIDA la sube y el sistema muestra antes de guardar: productos nuevos, cambios de costo (con alerta si sube más de cierto %), productos que ya no vienen y errores.
4. VIDA aprueba: se actualiza el catálogo del proveedor y se guarda el historial de costos.

**Qué más podemos hacer con esa información:**
- **Comparar proveedores** del mismo producto (por código de barras) y partir cada pedido con el más barato o el más rápido.
- **Historial de costos y alertas de aumento**, para renegociar a tiempo.
- **Margen real por producto** (costo del proveedor contra el precio de la tienda): detectar productos que dejan de ser rentables y ajustar precios piso y techo.
- **Proponer PLUS y producto estrella** con base en el margen real (tareas 7 y 13).
- **Reabasto sugerido** (tarea 4) con costo, pedido mínimo y días de entrega reales.
- **Ofrecer a las tiendas solo lo disponible**, con su peso para el envío.
- **Avisar cuando una lista vence**, para pedir la actualización al proveedor.

**Cómo quedó (27 nov 2026, programado):**
- **Proveedores → botón «Lista de precios» (ícono de Excel)** en cada proveedor: se baja el layout ya lleno con lo que tenemos de él (con hoja de instrucciones para el proveedor), se sube el que devuelve, se revisa y se carga todo o nada. Se puede poner hasta cuándo vale la lista.
- **Revisión antes de cargar:** qué se actualiza, qué precio sube o baja (en naranja si cambia más de 15%), qué productos se ligan solos a uno de VIDA por código de barras, cuáles son nuevos, cuáles ya no vienen (se marcan como no disponibles, no se borran) y el margen que le queda a la tienda (en rojo si perdería).
- **Pestaña «Productos por aprobar»:** lo nuevo de cada proveedor no se ofrece hasta que VIDA lo aprueba: «Crear en el catálogo» (categoría, precio de venta en tiendas y margen) o «Ya lo tenemos» (se liga a un producto existente). También se puede rechazar con motivo.
- Se guarda el **historial de cada cambio de precio**. El catálogo que ven las tiendas y el pedido a VIDA dejan fuera lo no disponible.
- La lista de proveedores muestra cuándo se cargó la lista, si está vencida y cuántos productos esperan aprobación.
- Decisión tomada: el precio del layout es el **precio de lista por unidad** (lo que paga la tienda), igual que hoy; VIDA le descuenta su comisión al pagarle al proveedor. Solo en USD.
- Base de datos: migración 66 (aplicada el 27 nov).

**Por definir:**
- Si el layout trae **precio de lista y costo para VIDA** (la comisión sale de la diferencia), o solo el costo y VIDA le suma su comisión (hoy: VIDA le paga al proveedor el precio de lista menos su comisión).
- ~~Si un producto nuevo del proveedor se crea solo en el catálogo VIDA o espera aprobación.~~ Decidido: **VIDA lo aprueba**.
- Cada cuánto debe mandar el proveedor su lista (mensual).

---

## 27. Ajuste del flujo de reabasto: sin crédito y con orden de compra

**Origen:** Diego, 27 nov 2026.

**Qué se pide (flujo nuevo):**
1. Los proveedores reabastecen **directo a la tienda**; la Matriz no guarda mercancía.
2. **Ya no hay días de crédito.**
3. La tienda hace su pedido y **VIDA es el intermediario**.
4. Cuando **VIDA lo valida**, se genera la **orden de compra** a ese proveedor.
5. Se define **cómo se recoge** el pedido: va la tienda (el empresario) o se contrata un **repartidor por la app** que lo lleve.
6. Actualizar el **flujograma** con este flujo.

**Lo que ya existe (tarea 24):** la tienda le pide a VIDA; paga; VIDA valida el pago; el pedido se parte en uno por proveedor; el proveedor lo ve en su portal o por API; la entrega es **Envío VIDA** (repartidor de proveedores de la app) o **Recojo** (la tienda recoge con código QR); la tienda confirma la recepción y sube su inventario.

**Lo que cambia:**
- **Quitar los días de crédito** del flujo de reabasto: hoy existen en la tienda (cuenta por cobrar del reabasto de la Matriz) y en el proveedor (cuenta por pagar).
- **Orden de compra formal** con folio al validar: documento (PDF) para el proveedor, con su código de producto y su costo (tarea 26). Para el proveedor sin portal ni API, se le manda por WhatsApp o correo.
- **Elegir la forma de recoger** al validar o al pedir, según se decida.
- **Flujograma:** actualizar los diagramas del panel (`flujograma-vida.html`, `diagrama-flujo-vida-futuro.html`) quitando el crédito y el almacén de la Matriz.

**Por definir:**
- ¿Sin crédito también entre VIDA y el proveedor (VIDA le paga de contado), o solo para la tienda?
- ¿Quién elige la forma de recoger y cuándo: la tienda al pedir, o VIDA al validar?
- ¿VIDA valida solo el pago, o también confirma con el proveedor que tiene el producto antes de cobrarle a la tienda?

