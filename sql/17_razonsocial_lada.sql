-- ============================================================
-- Migración 17: Razón social (tienda) + Lada telefónica (país)
-- Reunión VIDA 21-ago-2026:
--   #3 Razón social al dar de alta una tienda.
--   #4 Lada del país en los formularios que piden teléfono.
-- idBranch = 1 | idCuenta = 1
-- ============================================================

DECLARE @idBranch BIGINT = 1;
DECLARE @idCuenta BIGINT = 1;

-- ── #3. Razón social en Puntos de Venta (tienda) ────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('VIDA_CUENTA_PUNTOS_VENTA') AND name = 'RazonSocial'
)
  ALTER TABLE VIDA_CUENTA_PUNTOS_VENTA ADD RazonSocial VARCHAR(200) NULL;

-- ── #4. Lada telefónica en Países ───────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('VIDA_CUENTA_PAISES') AND name = 'LadaTelefono'
)
  ALTER TABLE VIDA_CUENTA_PAISES ADD LadaTelefono VARCHAR(10) NULL;
GO

-- Seed de ladas reales (código telefónico internacional)
DECLARE @idBranch BIGINT = 1;
DECLARE @idCuenta BIGINT = 1;

UPDATE VIDA_CUENTA_PAISES SET LadaTelefono = '+58'
WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND NombrePais = 'Venezuela' AND (LadaTelefono IS NULL OR LadaTelefono = '');

UPDATE VIDA_CUENTA_PAISES SET LadaTelefono = '+57'
WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND NombrePais = 'Colombia' AND (LadaTelefono IS NULL OR LadaTelefono = '');

-- ── Verificación ────────────────────────────────────────────
SELECT 'PAISES/LADA' AS Tabla, idPais, NombrePais, CodigoISO, LadaTelefono
FROM VIDA_CUENTA_PAISES WHERE idBranch=1 AND idCuenta=1 ORDER BY idPais;
