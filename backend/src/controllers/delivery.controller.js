// src/controllers/delivery.controller.js
// Delivery (app cliente, app repartidor y administración). El código vive en
// src/controllers/delivery/, partido por dominio; este archivo reexporta su API
// para que las rutas y los servicios que lo importan no cambien.
export * from './delivery/clienteCuenta.js';
export * from './delivery/pedidosCliente.js';
export * from './delivery/puntos.js';
export * from './delivery/hidratacion.js';
export * from './delivery/repartidorApp.js';
export * from './delivery/adminDelivery.js';
