-- ============================================================================
-- POS VENEZUELA — Prueba de entrega (foto del repartidor al entregar)
-- Idempotente: se puede correr múltiples veces
-- ============================================================================

IF COL_LENGTH('VIDA_PEDIDOS', 'EvidenciaEntregaURL') IS NULL
  ALTER TABLE VIDA_PEDIDOS ADD EvidenciaEntregaURL VARCHAR(300) NULL;
GO
