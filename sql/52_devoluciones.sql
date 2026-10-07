-- 52_devoluciones.sql
-- Devolución de una venta (total o parcial) en una sola operación: la
-- mercancía vuelve al inventario, el reembolso en efectivo sale de la caja
-- abierta (movimiento DEVOLUCION ligado) y, si la venta tiene factura, se emite
-- la nota de crédito por lo devuelto. Las notas de crédito pasan a poder ser
-- parciales: varias por factura, sin acreditar más de lo facturado.

IF OBJECT_ID('VIDA_DEVOLUCIONES','U') IS NULL
  CREATE TABLE VIDA_DEVOLUCIONES (
    idBranch         BIGINT        NOT NULL,
    idCuenta         BIGINT        NOT NULL,
    idDevolucion     BIGINT        NOT NULL,
    idPedido         BIGINT        NOT NULL,
    idPuntoVenta     BIGINT        NOT NULL,
    MontoUSD         DECIMAL(18,2) NOT NULL,
    MetodoReembolso  VARCHAR(10)   NOT NULL CONSTRAINT CK_DEV_METODO CHECK (MetodoReembolso IN ('EFECTIVO','EXTERNO')),
    Moneda           VARCHAR(3)    NULL CONSTRAINT CK_DEV_MONEDA CHECK (Moneda IN ('USD','VES')),
    MontoReembolso   DECIMAL(18,2) NULL,
    TasaVESporUSD    DECIMAL(18,8) NULL,
    idTurno          BIGINT        NULL,
    idMovimientoCaja BIGINT        NULL,
    idNotaCredito    BIGINT        NULL,
    Motivo           VARCHAR(300)  NOT NULL,
    UsuAlta          VARCHAR(20)   NULL,
    FechaAlta        DATETIME      NOT NULL CONSTRAINT DF_DEV_FECHA DEFAULT (GETUTCDATE()),
    CONSTRAINT PK_VIDA_DEVOLUCIONES PRIMARY KEY (idBranch, idCuenta, idDevolucion),
    CONSTRAINT CK_DEV_EFECTIVO CHECK (MetodoReembolso = 'EXTERNO'
      OR (Moneda IS NOT NULL AND MontoReembolso IS NOT NULL AND idMovimientoCaja IS NOT NULL))
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_DEV_PEDIDO' AND object_id=OBJECT_ID('VIDA_DEVOLUCIONES'))
  CREATE INDEX IX_DEV_PEDIDO ON VIDA_DEVOLUCIONES (idBranch, idCuenta, idPedido);
GO

IF OBJECT_ID('VIDA_DEVOLUCIONES_DETALLE','U') IS NULL
  CREATE TABLE VIDA_DEVOLUCIONES_DETALLE (
    idBranch          BIGINT        NOT NULL,
    idCuenta          BIGINT        NOT NULL,
    idDevolucion      BIGINT        NOT NULL,
    idDetalle         BIGINT        NOT NULL,   -- línea del pedido
    idProducto        BIGINT        NOT NULL,
    Cantidad          DECIMAL(18,4) NOT NULL CONSTRAINT CK_DEVDET_CANT CHECK (Cantidad > 0),
    PrecioUnitarioUSD DECIMAL(18,4) NOT NULL,
    MontoUSD          DECIMAL(18,2) NOT NULL,
    CONSTRAINT PK_VIDA_DEVOLUCIONES_DETALLE PRIMARY KEY (idBranch, idCuenta, idDevolucion, idDetalle),
    CONSTRAINT FK_DEVDET_DEV FOREIGN KEY (idBranch, idCuenta, idDevolucion) REFERENCES VIDA_DEVOLUCIONES (idBranch, idCuenta, idDevolucion)
  );
GO

-- El reembolso en efectivo de una devolución no se anula desde la caja: es
-- parte de la devolución (y de su nota de crédito).
IF COL_LENGTH('VIDA_CAJA_MOVIMIENTOS','idDevolucion') IS NULL
  ALTER TABLE VIDA_CAJA_MOVIMIENTOS ADD idDevolucion BIGINT NULL;
GO

-- Notas de crédito parciales: cada línea apunta a la línea de la factura que
-- acredita, y una factura admite varias notas de crédito.
IF COL_LENGTH('VIDA_FACTURAS_DETALLE','LineaAfectada') IS NULL
  ALTER TABLE VIDA_FACTURAS_DETALLE ADD LineaAfectada INT NULL;
GO
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_FACT_NC_AFECTADA' AND object_id=OBJECT_ID('VIDA_FACTURAS'))
  DROP INDEX UX_FACT_NC_AFECTADA ON VIDA_FACTURAS;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_FACT_AFECTADA' AND object_id=OBJECT_ID('VIDA_FACTURAS'))
  CREATE INDEX IX_FACT_AFECTADA ON VIDA_FACTURAS (idBranch, idCuenta, idFacturaAfectada) WHERE idFacturaAfectada IS NOT NULL;
GO
