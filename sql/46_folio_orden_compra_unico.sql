-- Folio interno automatico y unico para ordenes de compra a proveedor.
-- El API usa el formato OC-AAAA-000001 y lo asigna dentro de una transaccion.

-- Los registros historicos sin folio reciben un identificador estable.
UPDATE VIDA_ORDENES_COMPRA
SET Folio = CONCAT('LEGACY-OC-', idOrden)
WHERE Folio IS NULL OR LTRIM(RTRIM(Folio)) = '';
GO

-- Si historicamente se reutilizo un folio, se conserva el primero y se
-- distingue el resto antes de crear la restriccion.
;WITH repetidos AS (
  SELECT idBranch, idCuenta, idOrden, Folio,
         ROW_NUMBER() OVER (
           PARTITION BY idBranch, idCuenta, Folio
           ORDER BY idOrden
         ) AS rn
  FROM VIDA_ORDENES_COMPRA
)
UPDATE oc
SET Folio = CONCAT(LEFT(oc.Folio, 32), '-D', oc.idOrden)
FROM VIDA_ORDENES_COMPRA oc
JOIN repetidos r
  ON r.idBranch=oc.idBranch AND r.idCuenta=oc.idCuenta AND r.idOrden=oc.idOrden
WHERE r.rn > 1;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name='UX_ORDEN_COMPRA_FOLIO'
    AND object_id=OBJECT_ID('VIDA_ORDENES_COMPRA')
)
  CREATE UNIQUE INDEX UX_ORDEN_COMPRA_FOLIO
    ON VIDA_ORDENES_COMPRA (idBranch, idCuenta, Folio);
GO
