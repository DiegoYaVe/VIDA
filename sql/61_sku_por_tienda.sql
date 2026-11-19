-- ============================================================
-- 61 — SKU ÚNICO SOLO CUANDO SE ESCRIBE, Y POR TIENDA (19 nov 2026)
-- UQ_PROD_SKU (idBranch, idCuenta, SKU) trataba todos los SKU vacíos (NULL)
-- como el mismo valor: solo podía existir UN producto sin SKU en toda la
-- cuenta y el segundo fallaba al guardarse. Además, con los productos
-- propios de cada tienda (sql/60), dos tiendas deben poder usar el mismo SKU.
-- Queda: único entre los productos del mismo dueño (catálogo de VIDA o cada
-- tienda), y solo si el SKU no está vacío. Que el SKU de una tienda no choque
-- con el catálogo de VIDA lo revisa el backend al guardar.
-- ============================================================
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name='UQ_PROD_SKU' AND parent_object_id=OBJECT_ID('VIDA_INVENTARIO_PRODUCTOS'))
  ALTER TABLE VIDA_INVENTARIO_PRODUCTOS DROP CONSTRAINT UQ_PROD_SKU;
ELSE IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='UQ_PROD_SKU' AND object_id=OBJECT_ID('VIDA_INVENTARIO_PRODUCTOS'))
  DROP INDEX UQ_PROD_SKU ON VIDA_INVENTARIO_PRODUCTOS;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_PROD_SKU_DUENO' AND object_id=OBJECT_ID('VIDA_INVENTARIO_PRODUCTOS'))
  CREATE UNIQUE NONCLUSTERED INDEX UX_PROD_SKU_DUENO
    ON VIDA_INVENTARIO_PRODUCTOS (idBranch, idCuenta, idPuntoVentaDueno, SKU)
    WHERE SKU IS NOT NULL;
GO
