// Espejo del modelo de portales del backend (src/config/portales.js).
// Sirve como fallback cuando la sesión aún no trae usuario.Portal.

export const PORTAL = {
  CORPORATIVO: 'CORPORATIVO',
  EMPRESARIO:  'EMPRESARIO',
  REPARTIDOR:  'REPARTIDOR',
  CLIENTE:     'CLIENTE',
};

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

export const PORTAL_LABEL = {
  CORPORATIVO: 'Corporativo',
  EMPRESARIO:  'Empresario',
  REPARTIDOR:  'Repartidor',
  CLIENTE:     'Cliente',
};

// Color del badge por portal (Tailwind)
export const PORTAL_BADGE = {
  CORPORATIVO: 'bg-indigo-100 text-indigo-700',
  EMPRESARIO:  'bg-emerald-100 text-emerald-700',
  REPARTIDOR:  'bg-orange-100 text-orange-700',
  CLIENTE:     'bg-sky-100 text-sky-700',
};

export function portalDeUsuario(usuario) {
  if (!usuario) return null;
  return usuario.Portal || ROL_PORTAL[usuario.TipoUsuario] || null;
}
