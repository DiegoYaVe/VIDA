-- ============================================================
-- 15 — ONBOARDING DE LA RED (T-0050)
-- Estados simples del ciclo de vida de una tienda de la red:
-- PROSPECTO → EN_PROCESO → ACTIVA → SUSPENDIDA
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('VIDA_CUENTA_PUNTOS_VENTA') AND name='EstadoOnboarding')
  ALTER TABLE VIDA_CUENTA_PUNTOS_VENTA ADD EstadoOnboarding VARCHAR(20) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('VIDA_CUENTA_PUNTOS_VENTA') AND name='FechaActivacion')
  ALTER TABLE VIDA_CUENTA_PUNTOS_VENTA ADD FechaActivacion DATETIME NULL;
GO

-- Las tiendas existentes ya están operando → ACTIVA (con su fecha de alta)
UPDATE VIDA_CUENTA_PUNTOS_VENTA
  SET EstadoOnboarding = 'ACTIVA',
      FechaActivacion  = ISNULL(FechaActivacion, FechaAlta)
  WHERE EstadoOnboarding IS NULL;
