-- ============================================================
-- 65 — PRODUCTOS PLUS Y ESTRELLA DE CADA TIENDA (tareas 7, 8 y 13; audios de Lila)
-- "Cada tienda tendrá su producto PLUS" (se define al afiliarla) y VIDA le
-- asigna su producto estrella, el de mayor margen, para que el empresario se
-- enfoque en venderlo.
--   · Tipo PLUS: si una tienda tiene al menos uno, esos son SUS PLUS (en la
--     app, el punto de venta, Rentabilidad y el Plan PLUS). Si no tiene
--     ninguno, sigue valiendo la marca PLUS del producto (EsProductoPlus).
--   · Tipo ESTRELLA: el producto (o los productos) en que se enfoca la tienda.
-- ============================================================
IF OBJECT_ID('VIDA_TIENDA_PRODUCTOS_DESTACADOS','U') IS NULL
CREATE TABLE VIDA_TIENDA_PRODUCTOS_DESTACADOS (
  idBranch     BIGINT      NOT NULL,
  idCuenta     BIGINT      NOT NULL,
  idPuntoVenta BIGINT      NOT NULL,
  Tipo         VARCHAR(10) NOT NULL CONSTRAINT CK_DESTACADO_TIPO CHECK (Tipo IN ('PLUS','ESTRELLA')),
  idProducto   BIGINT      NOT NULL,
  FechaAlta    DATETIME    NOT NULL CONSTRAINT DF_DESTACADO_FECHA DEFAULT GETUTCDATE(),
  UsuAlta      VARCHAR(30) NULL,
  CONSTRAINT PK_TIENDA_PRODUCTOS_DESTACADOS PRIMARY KEY (idBranch, idCuenta, idPuntoVenta, Tipo, idProducto)
);
GO
