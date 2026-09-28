-- SQL Server. Requiere 42. No cambia cierres históricos ni inventario.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH('VIDA_CAJA_TURNOS','MontoAperturaVES') IS NULL
  ALTER TABLE VIDA_CAJA_TURNOS ADD MontoAperturaVES DECIMAL(18,2) NOT NULL
    CONSTRAINT DF_CAJA_APERTURA_VES DEFAULT 0 WITH VALUES;
IF COL_LENGTH('VIDA_CAJA_TURNOS','ArqueoMonedasJSON') IS NULL
  ALTER TABLE VIDA_CAJA_TURNOS ADD ArqueoMonedasJSON NVARCHAR(MAX) NULL;
-- Version=2 conserva apertura/entradas/esperado/contado/diferencia por USD y VES.
-- MontoCierre/Diferencia son USD FÍSICO solo si existe este JSON.
-- Históricos sin JSON mantienen significado anterior (equivalente USD).
COMMIT;
