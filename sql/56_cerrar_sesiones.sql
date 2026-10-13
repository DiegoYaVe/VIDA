-- 56_cerrar_sesiones.sql
-- Cerrar las sesiones abiertas de una cuenta de la app (cliente o repartidor)
-- al cambiar o recuperar la contraseña: los tokens emitidos antes de
-- SesionesDesde dejan de valer. NULL = ninguna sesión cerrada todavía.
-- Una cuenta que deja de estar ACTIVA (eliminada o desactivada) también
-- pierde sus sesiones (lo revisa el middleware).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name='SesionesDesde' AND Object_ID=OBJECT_ID('VIDA_APP_CLIENTES'))
  ALTER TABLE VIDA_APP_CLIENTES ADD SesionesDesde DATETIME2 NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name='SesionesDesde' AND Object_ID=OBJECT_ID('VIDA_REPARTIDORES'))
  ALTER TABLE VIDA_REPARTIDORES ADD SesionesDesde DATETIME2 NULL;
GO
