-- SQL Server. Requiere 01 y 43. Movimientos de caja por moneda.
-- Egresos/ingresos/retiros/devoluciones en efectivo que afectan el efectivo
-- ESPERADO del arqueo por moneda, SIN netear entre USD y VES.
-- No toca ventas, inventario ni cierres históricos.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('VIDA_CAJA_MOVIMIENTOS','U') IS NULL
BEGIN
  CREATE TABLE VIDA_CAJA_MOVIMIENTOS (
    idBranch      BIGINT        NOT NULL,
    idCuenta      BIGINT        NOT NULL,
    idMovimiento  BIGINT        NOT NULL,
    idTurno       BIGINT        NOT NULL,
    idPuntoVenta  BIGINT        NOT NULL,
    Tipo          VARCHAR(20)   NOT NULL,   -- INGRESO | EGRESO | RETIRO | DEVOLUCION
    Moneda        VARCHAR(3)    NOT NULL,   -- USD | VES
    Monto         DECIMAL(18,2) NOT NULL,
    Motivo        VARCHAR(300)  NULL,
    idUsuario     BIGINT        NULL,
    NombreUsuario VARCHAR(200)  NULL,
    Status        VARCHAR(20)   NOT NULL CONSTRAINT DF_CAJA_MOV_STATUS DEFAULT 'ACTIVO',
    UsuAnula      VARCHAR(10)   NULL,
    FechaAnula    DATETIME      NULL,
    UsuAlta       VARCHAR(10)   NULL,
    FechaAlta     DATETIME      NOT NULL CONSTRAINT DF_CAJA_MOV_FECHA DEFAULT (GETUTCDATE()),
    CONSTRAINT PK_VIDA_CAJA_MOVIMIENTOS PRIMARY KEY CLUSTERED (idBranch, idCuenta, idMovimiento),
    CONSTRAINT CK_CAJA_MOV_TIPO   CHECK (Tipo   IN ('INGRESO','EGRESO','RETIRO','DEVOLUCION')),
    CONSTRAINT CK_CAJA_MOV_MONEDA CHECK (Moneda IN ('USD','VES')),
    CONSTRAINT CK_CAJA_MOV_MONTO  CHECK (Monto > 0),
    CONSTRAINT CK_CAJA_MOV_STATUS CHECK (Status IN ('ACTIVO','ANULADO'))
  );
  CREATE INDEX IX_CAJA_MOV_TURNO
    ON VIDA_CAJA_MOVIMIENTOS (idBranch, idCuenta, idTurno, Status);
END
COMMIT;
