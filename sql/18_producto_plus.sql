-- ============================================================
-- Migración 18: Producto PLUS (alta rentabilidad)
-- El empresario ve un badge dorado PLUS y su margen preferente.
-- ============================================================

-- Bandera EsProductoPlus en el catálogo de productos
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('VIDA_INVENTARIO_PRODUCTOS') AND name = 'EsProductoPlus'
)
  ALTER TABLE VIDA_INVENTARIO_PRODUCTOS ADD EsProductoPlus BIT NOT NULL DEFAULT 0;
GO

-- Verificación
SELECT idProducto, Nombre, EsProductoPlus, CostoUSD, PrecioUSD
FROM VIDA_INVENTARIO_PRODUCTOS
WHERE idBranch=1 AND idCuenta=1
ORDER BY idProducto;
