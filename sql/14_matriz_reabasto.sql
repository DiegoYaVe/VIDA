-- ============================================================
-- 14 — MATRIZ Y REABASTO (T-0038/T-0039)
-- La Matriz es un punto de venta especial (almacén central) que
-- surte a las tiendas. El traspaso se valúa al COSTO (CostoUSD del
-- producto): baja stock en la Matriz, sube en la tienda al recibir.
-- ============================================================

-- ── Marcar un punto de venta como Matriz (almacén central) ──
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('VIDA_CUENTA_PUNTOS_VENTA') AND name='EsMatriz')
  ALTER TABLE VIDA_CUENTA_PUNTOS_VENTA ADD EsMatriz BIT NOT NULL DEFAULT 0;

-- ── Pedido/traspaso de una tienda a la Matriz ───────────────
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='VIDA_PEDIDOS_MATRIZ' AND type='U')
CREATE TABLE VIDA_PEDIDOS_MATRIZ (
  idBranch            BIGINT        NOT NULL,
  idCuenta            BIGINT        NOT NULL,
  idPedidoMatriz      BIGINT        NOT NULL,
  idPuntoVentaSolicita BIGINT       NOT NULL,   -- la tienda que pide reabasto
  idPuntoVentaMatriz  BIGINT        NOT NULL,   -- la Matriz que surte
  Status              VARCHAR(30)   NOT NULL DEFAULT 'SOLICITADO', -- SOLICITADO|PREPARANDO|ENVIADO|RECIBIDO|CANCELADO
  TotalCostoUSD       DECIMAL(18,4) NOT NULL DEFAULT 0,
  Notas               VARCHAR(500)  NULL,
  FechaAlta           DATETIME      NOT NULL DEFAULT GETDATE(),
  FechaMod            DATETIME      NULL,
  UsuAlta             VARCHAR(30)   NULL,
  CONSTRAINT PK_PEDIDOS_MATRIZ PRIMARY KEY (idBranch, idCuenta, idPedidoMatriz)
);

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='VIDA_PEDIDOS_MATRIZ_DETALLE' AND type='U')
CREATE TABLE VIDA_PEDIDOS_MATRIZ_DETALLE (
  idBranch           BIGINT        NOT NULL,
  idCuenta           BIGINT        NOT NULL,
  idPedidoMatriz     BIGINT        NOT NULL,
  idDetalle          BIGINT        NOT NULL,
  idProducto         BIGINT        NOT NULL,
  CantidadSolicitada DECIMAL(18,4) NOT NULL,
  CantidadRecibida   DECIMAL(18,4) NOT NULL DEFAULT 0,
  CostoUnitario      DECIMAL(18,4) NOT NULL DEFAULT 0,  -- CostoUSD al momento del pedido
  CONSTRAINT PK_PEDIDOS_MATRIZ_DETALLE PRIMARY KEY (idBranch, idCuenta, idPedidoMatriz, idDetalle)
);

-- ── Historial de estados del pedido a la matriz ─────────────
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='VIDA_PEDIDOS_MATRIZ_HISTORIAL' AND type='U')
CREATE TABLE VIDA_PEDIDOS_MATRIZ_HISTORIAL (
  idBranch       BIGINT       NOT NULL,
  idCuenta       BIGINT       NOT NULL,
  idHistorial    BIGINT       NOT NULL,
  idPedidoMatriz BIGINT       NOT NULL,
  StatusAnterior VARCHAR(30)  NULL,
  StatusNuevo    VARCHAR(30)  NOT NULL,
  Notas          VARCHAR(500) NULL,
  UsuAlta        VARCHAR(30)  NULL,
  FechaAlta      DATETIME     NOT NULL DEFAULT GETDATE(),
  CONSTRAINT PK_PEDIDOS_MATRIZ_HISTORIAL PRIMARY KEY (idBranch, idCuenta, idHistorial)
);
