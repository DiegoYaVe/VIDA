-- ============================================================
-- Migración 22: Metas de venta por tienda (empresario)
-- El empresario define su meta diaria / semanal / mensual y el
-- sistema le muestra barra de progreso e insignia al cumplir.
-- Operación USD-only.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='VIDA_TIENDA_METAS' AND xtype='U')
CREATE TABLE VIDA_TIENDA_METAS (
  idBranch       BIGINT        NOT NULL,
  idCuenta       BIGINT        NOT NULL,
  idPuntoVenta   BIGINT        NOT NULL,
  MetaDiariaUSD  DECIMAL(18,2) NOT NULL DEFAULT 0,
  MetaSemanalUSD DECIMAL(18,2) NOT NULL DEFAULT 0,
  MetaMensualUSD DECIMAL(18,2) NOT NULL DEFAULT 0,
  FechaAlta      DATETIME      NOT NULL DEFAULT GETDATE(),
  UsuAlta        VARCHAR(20)   NULL,
  FechaMod       DATETIME      NULL,
  UsuMod         VARCHAR(20)   NULL,
  CONSTRAINT PK_VIDA_TIENDA_METAS PRIMARY KEY (idBranch, idCuenta, idPuntoVenta)
);
