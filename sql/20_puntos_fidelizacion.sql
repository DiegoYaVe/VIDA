-- ============================================================
-- Migración 20: Puntos / Fidelización (consumidor)
-- Cada compra pagada acumula puntos (config PuntosPorDolar, ej. 1$=10pts).
-- Billetera (saldo) en el cliente + ledger de movimientos para el historial.
-- ============================================================

-- Saldo de puntos cacheado en el cliente
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('VIDA_APP_CLIENTES') AND name = 'PuntosSaldo'
)
  ALTER TABLE VIDA_APP_CLIENTES ADD PuntosSaldo INT NOT NULL DEFAULT 0;
GO

-- Ledger de movimientos de puntos (ganados / canjeados / ajustes)
IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='VIDA_CLIENTE_PUNTOS' AND xtype='U')
CREATE TABLE VIDA_CLIENTE_PUNTOS (
  idBranch     BIGINT        NOT NULL,
  idCuenta     BIGINT        NOT NULL,
  idMovimiento BIGINT        NOT NULL,
  idCliente    BIGINT        NOT NULL,
  Tipo         VARCHAR(20)   NOT NULL,        -- GANADO | CANJEADO | AJUSTE
  Puntos       INT           NOT NULL,        -- + gana, - canjea
  idPedido     BIGINT        NULL,
  Descripcion  VARCHAR(200)  NULL,
  FechaAlta    DATETIME      NOT NULL DEFAULT GETDATE(),
  CONSTRAINT PK_VIDA_CLIENTE_PUNTOS PRIMARY KEY (idBranch, idCuenta, idMovimiento)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_PUNTOS_CLIENTE' AND object_id=OBJECT_ID('VIDA_CLIENTE_PUNTOS'))
  CREATE INDEX IX_PUNTOS_CLIENTE ON VIDA_CLIENTE_PUNTOS (idBranch, idCuenta, idCliente, FechaAlta DESC);
GO

-- Config: puntos por dólar (default 10 → 1$ = 10 puntos)
IF NOT EXISTS (SELECT 1 FROM VIDA_CONFIG_DELIVERY WHERE idBranch=1 AND idCuenta=1 AND Clave='PuntosPorDolar')
  INSERT INTO VIDA_CONFIG_DELIVERY (idBranch, idCuenta, Clave, Valor) VALUES (1, 1, 'PuntosPorDolar', '10');
