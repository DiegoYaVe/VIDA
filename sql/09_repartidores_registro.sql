-- ============================================================================
-- POS VENEZUELA — Registro de repartidores desde la app + columnas faltantes
-- (el código ya referenciaba StatusAprobacion/Email/FotoURL/StatusActividad
--  pero las columnas no existían en la BD)
-- Idempotente: se puede correr múltiples veces
-- ============================================================================

IF COL_LENGTH('VIDA_REPARTIDORES', 'StatusAprobacion') IS NULL
  ALTER TABLE VIDA_REPARTIDORES ADD StatusAprobacion VARCHAR(20) NOT NULL DEFAULT 'APROBADO';
GO
IF COL_LENGTH('VIDA_REPARTIDORES', 'Email') IS NULL
  ALTER TABLE VIDA_REPARTIDORES ADD Email VARCHAR(100) NULL;
GO
IF COL_LENGTH('VIDA_REPARTIDORES', 'FotoURL') IS NULL
  ALTER TABLE VIDA_REPARTIDORES ADD FotoURL VARCHAR(300) NULL;
GO
IF COL_LENGTH('VIDA_REPARTIDORES', 'StatusActividad') IS NULL
  ALTER TABLE VIDA_REPARTIDORES ADD StatusActividad VARCHAR(20) NULL;
GO
