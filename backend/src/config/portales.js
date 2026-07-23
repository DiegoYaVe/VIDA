// Modelo de 4 portales de la red VIDA (T-0030/31).
// Un "portal" agrupa los roles que comparten una experiencia y un conjunto de
// módulos. El TipoUsuario del usuario es la fuente de verdad; aquí se mapea a
// su portal. La tabla VIDA_ROLES (migración 12) persiste este catálogo para
// administración, pero el runtime usa este archivo para no pegarle a la BD en
// cada request.

export const PORTAL = {
  CORPORATIVO: 'CORPORATIVO', // Matriz VIDA — ve toda la red
  EMPRESARIO:  'EMPRESARIO',  // Dueño/empleados de una tienda de la red
  REPARTIDOR:  'REPARTIDOR',  // App de reparto
  CLIENTE:     'CLIENTE',     // App de consumidor final
};

// Rol (TipoUsuario) → portal al que pertenece
export const ROL_PORTAL = {
  SUPER_ADMIN:  PORTAL.CORPORATIVO,
  ADMIN_PAIS:   PORTAL.CORPORATIVO,
  ADMIN:        PORTAL.EMPRESARIO,
  ADMIN_ESTADO: PORTAL.EMPRESARIO,
  SUPERVISOR:   PORTAL.EMPRESARIO,
  CAJERO:       PORTAL.EMPRESARIO,
  CASHIER:      PORTAL.EMPRESARIO,
  REPARTIDOR:   PORTAL.REPARTIDOR,
  CLIENTE:      PORTAL.CLIENTE,
};

// Roles administrativos (pueden crear/editar dentro de su portal)
export const ROLES_ADMIN = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN'];

// Roles que operan el panel web (corporativo + empresario)
export const ROLES_PANEL_WEB = [
  'SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN', 'ADMIN_ESTADO', 'SUPERVISOR', 'CAJERO', 'CASHIER',
];

export function portalDeRol(tipoUsuario) {
  return ROL_PORTAL[tipoUsuario] || null;
}

export function esCorporativo(tipoUsuario) {
  return portalDeRol(tipoUsuario) === PORTAL.CORPORATIVO;
}
