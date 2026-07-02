-- ============================================================================
-- POS VENEZUELA — Audit log inmutable de transacciones financieras
-- Idempotente: se puede correr múltiples veces
-- ============================================================================

-- Registro append-only: cada operación financiera (venta, cierre de caja,
-- liquidación, ajuste de inventario) deja una entrada firmada con
-- HMAC-SHA256 (secreto del servidor, AUDIT_SECRET). Alterar una fila en la
-- BD invalida su firma; el trigger de abajo impide UPDATE/DELETE.
IF OBJECT_ID('VIDA_AUDIT_LOG','U') IS NULL
CREATE TABLE VIDA_AUDIT_LOG (
  idAudit    BIGINT IDENTITY(1,1) NOT NULL,
  idBranch   BIGINT        NOT NULL,
  idCuenta   BIGINT        NOT NULL,
  EntityType VARCHAR(50)   NOT NULL,  -- PEDIDO | CAJA_TURNO | LIQUIDACION | INVENTARIO
  EntityId   VARCHAR(50)   NOT NULL,
  Accion     VARCHAR(50)   NOT NULL,  -- VENTA_CREADA | ENTREGADO | CANCELADO | ...
  Actor      VARCHAR(50)   NOT NULL,  -- idUsuario, REP:id o SISTEMA
  DataJSON   NVARCHAR(MAX) NOT NULL,  -- snapshot de la operación (incluye _ts)
  Hash       VARCHAR(64)   NOT NULL,  -- HMAC-SHA256 de los campos anteriores
  FechaAlta  DATETIME      NOT NULL DEFAULT GETDATE(),
  CONSTRAINT PK_VIDA_AUDIT_LOG PRIMARY KEY CLUSTERED (idAudit)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AUDIT_ENTIDAD')
CREATE NONCLUSTERED INDEX IX_AUDIT_ENTIDAD
ON VIDA_AUDIT_LOG (idBranch, idCuenta, EntityType, EntityId);
GO

-- Inmutabilidad a nivel BD: cualquier UPDATE o DELETE se rechaza,
-- incluso desde SSMS con el usuario de la aplicación
IF OBJECT_ID('TR_AUDIT_LOG_INMUTABLE','TR') IS NULL
EXEC('CREATE TRIGGER TR_AUDIT_LOG_INMUTABLE ON VIDA_AUDIT_LOG
INSTEAD OF UPDATE, DELETE
AS
BEGIN
  RAISERROR(''VIDA_AUDIT_LOG es inmutable: UPDATE y DELETE no están permitidos'', 16, 1);
  ROLLBACK TRANSACTION;
END');
GO
