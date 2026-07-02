-- ============================================================================
-- POS VENEZUELA — Soporte de ventas offline (sync idempotente)
-- Idempotente: se puede correr múltiples veces
-- ============================================================================

-- ClienteUUID: identificador generado en el frontend ANTES de enviar.
-- Permite deduplicar reintentos (el idPedido secuencial se sigue generando
-- en servidor). EsOffline marca ventas que llegaron por la cola offline.
-- RequiereRevision: la venta se sincronizó pero el stock era insuficiente
-- (la venta física ya ocurrió — se registra y se marca para revisión).
IF COL_LENGTH('VIDA_PEDIDOS', 'ClienteUUID') IS NULL
  ALTER TABLE VIDA_PEDIDOS ADD ClienteUUID VARCHAR(40) NULL;
GO
IF COL_LENGTH('VIDA_PEDIDOS', 'EsOffline') IS NULL
  ALTER TABLE VIDA_PEDIDOS ADD EsOffline BIT NOT NULL DEFAULT 0;
GO
IF COL_LENGTH('VIDA_PEDIDOS', 'RequiereRevision') IS NULL
  ALTER TABLE VIDA_PEDIDOS ADD RequiereRevision BIT NOT NULL DEFAULT 0;
GO

-- Última línea de defensa contra duplicados: dos syncs concurrentes del mismo
-- UUID no pueden insertar dos pedidos
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_PEDIDOS_CLIENTE_UUID')
CREATE UNIQUE NONCLUSTERED INDEX UX_PEDIDOS_CLIENTE_UUID
ON VIDA_PEDIDOS (ClienteUUID)
WHERE ClienteUUID IS NOT NULL;
GO
