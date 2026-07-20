-- ═══════════════════════════════════════════════════════════════════════════
-- 12: Contraseña para repartidores
-- El login de repartidor pasaba solo con el teléfono; se agrega credencial.
-- Los repartidores existentes (Contrasena NULL) la definen en su primer login.
-- ═══════════════════════════════════════════════════════════════════════════

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('VIDA_REPARTIDORES') AND name = 'Contrasena'
)
BEGIN
  ALTER TABLE VIDA_REPARTIDORES ADD Contrasena NVARCHAR(200) NULL;
END
GO
