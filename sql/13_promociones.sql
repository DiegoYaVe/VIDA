-- ============================================================
-- 13 — PROMOCIONES (T-0049): descuentos y combos
-- Tipos soportados:
--   DESCUENTO_PCT   -> Valor = % de descuento sobre el precio
--   DESCUENTO_USD   -> Valor = $ fijo de descuento por unidad
--   PRECIO_ESPECIAL -> Valor = precio fijo especial por unidad
--   NXM             -> "lleva N paga M": Valor = N (lleva), Valor2 = M (paga)
-- Alcance: TODO | CATEGORIA | PRODUCTO
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='VIDA_PROMOCIONES' AND type='U')
CREATE TABLE VIDA_PROMOCIONES (
  idBranch     BIGINT        NOT NULL,
  idCuenta     BIGINT        NOT NULL,
  idPromocion  BIGINT        NOT NULL,
  Nombre       VARCHAR(150)  NOT NULL,
  Tipo         VARCHAR(20)   NOT NULL,   -- DESCUENTO_PCT|DESCUENTO_USD|PRECIO_ESPECIAL|NXM
  Valor        DECIMAL(18,4) NOT NULL,   -- % / $ / precio / N (según tipo)
  Valor2       DECIMAL(18,4) NULL,       -- M en el tipo NXM
  Alcance      VARCHAR(20)   NOT NULL DEFAULT 'TODO',  -- TODO|CATEGORIA|PRODUCTO
  idCategoria  BIGINT        NULL,
  idProducto   BIGINT        NULL,
  FechaInicio  DATE          NULL,
  FechaFin     DATE          NULL,
  Descripcion  VARCHAR(300)  NULL,
  Status       VARCHAR(20)   NOT NULL DEFAULT 'ACTIVO',  -- ACTIVO|INACTIVO
  FechaAlta    DATETIME      NOT NULL DEFAULT GETDATE(),
  UsuAlta      VARCHAR(30)   NULL,
  CONSTRAINT PK_VIDA_PROMOCIONES PRIMARY KEY (idBranch, idCuenta, idPromocion)
);

-- Índice para buscar promos vigentes rápido
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_PROMOCIONES_VIGENCIA' AND object_id=OBJECT_ID('VIDA_PROMOCIONES'))
  CREATE INDEX IX_PROMOCIONES_VIGENCIA
    ON VIDA_PROMOCIONES (idBranch, idCuenta, Status)
    INCLUDE (Tipo, Alcance, idCategoria, idProducto, FechaInicio, FechaFin);
