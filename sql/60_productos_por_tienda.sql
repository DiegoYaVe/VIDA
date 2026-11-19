-- ============================================================
-- 60 — PRODUCTOS PROPIOS DE CADA TIENDA (19 nov 2026)
-- Cada tienda vende también sus propios productos, no solo los de VIDA.
--   · idPuntoVentaDueno NULL  = catálogo de VIDA: lo ven todas las tiendas.
--   · idPuntoVentaDueno = X   = producto propio de la tienda X: solo lo ve y
--                               lo edita esa tienda (y VIDA).
-- Los productos que ya existen quedan como catálogo de VIDA (NULL): no cambia
-- nada para lo que ya se vende.
-- ============================================================
IF COL_LENGTH('VIDA_INVENTARIO_PRODUCTOS','idPuntoVentaDueno') IS NULL
  ALTER TABLE VIDA_INVENTARIO_PRODUCTOS ADD idPuntoVentaDueno BIGINT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_PRODUCTOS_DUENO' AND object_id=OBJECT_ID('VIDA_INVENTARIO_PRODUCTOS'))
  CREATE NONCLUSTERED INDEX IX_PRODUCTOS_DUENO ON VIDA_INVENTARIO_PRODUCTOS (idBranch, idCuenta, idPuntoVentaDueno);
GO
