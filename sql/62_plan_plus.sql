-- ============================================================
-- 62 — PLAN PLUS: PISO/TECHO DE PRECIO Y PRODUCTOS DEL PLAN (19 nov 2026)
-- Audios de Lila: a cada producto se le definen sus costos y su precio "desde
-- el piso y el techo"; con unos pocos productos (los PLUS, el ancla o el
-- estrella) se le dice al empresario cuántas unidades vender para cubrir los
-- costos fijos de su bodega.
-- ============================================================
IF COL_LENGTH('VIDA_INVENTARIO_PRODUCTOS','PrecioPisoUSD') IS NULL
  ALTER TABLE VIDA_INVENTARIO_PRODUCTOS ADD PrecioPisoUSD DECIMAL(18,4) NULL, PrecioTechoUSD DECIMAL(18,4) NULL;
GO

-- Productos que cada tienda eligió para cubrir sus costos fijos, con el peso
-- (qué parte de los costos cubre cada uno). PesoPct NULL = reparto igual.
IF OBJECT_ID('VIDA_TIENDA_PLAN_PLUS','U') IS NULL
CREATE TABLE VIDA_TIENDA_PLAN_PLUS (
  idBranch     BIGINT       NOT NULL,
  idCuenta     BIGINT       NOT NULL,
  idPuntoVenta BIGINT       NOT NULL,
  idProducto   BIGINT       NOT NULL,
  PesoPct      DECIMAL(5,2) NULL,
  FechaAlta    DATETIME     NOT NULL CONSTRAINT DF_PLANPLUS_FECHA DEFAULT GETUTCDATE(),
  UsuAlta      VARCHAR(30)  NULL,
  CONSTRAINT PK_TIENDA_PLAN_PLUS PRIMARY KEY (idBranch, idCuenta, idPuntoVenta, idProducto)
);
GO
-- Si la tienda nunca guardó su plan, se arranca con sus productos PLUS.
-- Esta marca distingue "nunca lo guardó" de "lo guardó vacío".
IF COL_LENGTH('VIDA_TIENDA_FINANZAS','PlanPlusGuardado') IS NULL
  ALTER TABLE VIDA_TIENDA_FINANZAS ADD PlanPlusGuardado BIT NOT NULL CONSTRAINT DF_FIN_PLANPLUS DEFAULT 0,
    PlanPlusIncluyeMeta BIT NOT NULL CONSTRAINT DF_FIN_PLANMETA DEFAULT 0;
GO
