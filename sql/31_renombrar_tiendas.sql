-- ============================================================
-- 31 — El menú dice "Puntos de Venta" y la pantalla dice "Tiendas"
--
-- Los nombres del menú lateral viven en VIDA_CUENTA_PANTALLAS.Nombre
-- y los sirve el login (auth.controller.js); el Sidebar solo pinta
-- {p.Nombre}. No hay endpoint que los edite, así que el renombre va
-- por acá.
--
-- Se empareja por Link, que es estable, y no por el nombre actual:
-- así la migración es idempotente y no depende de cómo esté escrito
-- hoy en cada ambiente.
--
-- OJO: NO se toca '/pos'. Esa entrada se llama "Punto de Venta"
-- (singular) y es la caja registradora, no la lista de tiendas.
-- ============================================================

UPDATE VIDA_CUENTA_PANTALLAS
   SET Nombre = 'Tiendas'
 WHERE Link = '/sucursales'
   AND Nombre <> 'Tiendas';
GO

-- Verificación: las dos entradas parecidas, para confirmar que solo
-- cambió la de arriba
SELECT idBranch, idCuenta, idPantalla, Nombre, Modulo, Link, OrdenPantalla
  FROM VIDA_CUENTA_PANTALLAS
 WHERE Link IN ('/sucursales', '/pos')
 ORDER BY idBranch, idCuenta, OrdenPantalla;
GO
