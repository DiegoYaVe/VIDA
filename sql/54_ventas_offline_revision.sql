-- 54_ventas_offline_revision.sql
-- Ventas offline que el servidor rechaza al sincronizar (cotización inválida,
-- producto inexistente, tienda fuera de alcance...). El dinero ya se cobró, así
-- que no pueden quedarse reintentando en el navegador del cajero ni perderse:
-- se guardan aquí tal como llegaron y un administrador las resuelve desde el
-- panel, reintentando el registro (REGISTRADA, con su pedido) o anulándolas
-- con motivo (ANULADA). El navegador las saca de su cola al quedar guardadas.
IF OBJECT_ID('VIDA_POS_VENTAS_REVISION','U') IS NULL
  CREATE TABLE VIDA_POS_VENTAS_REVISION (
    idBranch          BIGINT        NOT NULL,
    idCuenta          BIGINT        NOT NULL,
    ClienteUUID       VARCHAR(40)   NOT NULL,
    idPuntoVenta      BIGINT        NULL,
    idUsuario         BIGINT        NOT NULL,     -- cajero que cobró (dueño de la cotización)
    VentaJSON         NVARCHAR(MAX) NOT NULL,     -- la venta tal como la envió el POS
    TotalUSD          DECIMAL(18,2) NULL,
    FechaVenta        DATETIME2     NULL,
    Motivo            NVARCHAR(500) NOT NULL,     -- último rechazo del servidor
    Intentos          INT           NOT NULL CONSTRAINT DF_VREV_INTENTOS DEFAULT (1),
    Status            VARCHAR(12)   NOT NULL CONSTRAINT DF_VREV_STATUS DEFAULT ('PENDIENTE')
                      CONSTRAINT CK_VREV_STATUS CHECK (Status IN ('PENDIENTE','REGISTRADA','ANULADA')),
    idPedido          BIGINT        NULL,
    Resolucion        NVARCHAR(500) NULL,
    idUsuarioResuelve BIGINT        NULL,
    FechaAlta         DATETIME      NOT NULL CONSTRAINT DF_VREV_ALTA DEFAULT (GETUTCDATE()),
    FechaMod          DATETIME      NULL,
    FechaResuelta     DATETIME      NULL,
    CONSTRAINT PK_VIDA_POS_VENTAS_REVISION PRIMARY KEY (idBranch, idCuenta, ClienteUUID),
    CONSTRAINT CK_VREV_RESUELTA CHECK (Status = 'PENDIENTE'
      OR (idUsuarioResuelve IS NOT NULL AND FechaResuelta IS NOT NULL
          AND (Status = 'ANULADA' AND Resolucion IS NOT NULL OR Status = 'REGISTRADA' AND idPedido IS NOT NULL)))
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_VREV_PENDIENTES' AND object_id=OBJECT_ID('VIDA_POS_VENTAS_REVISION'))
  CREATE INDEX IX_VREV_PENDIENTES ON VIDA_POS_VENTAS_REVISION (idBranch, idCuenta, Status, idPuntoVenta);
GO
