-- ============================================================================
-- POS VENEZUELA — Índices de integridad
-- Garantías a nivel de BD contra race conditions de la aplicación
-- Idempotente: se puede correr múltiples veces
-- ============================================================================

-- Un solo turno ABIERTO por punto de venta.
-- Aunque la app ya serializa la apertura con transacción + UPDLOCK, este índice
-- filtrado es la última línea de defensa: un segundo INSERT de turno abierto
-- falla con violación de índice único.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_CAJA_TURNO_ABIERTO')
CREATE UNIQUE NONCLUSTERED INDEX UX_CAJA_TURNO_ABIERTO
ON VIDA_CAJA_TURNOS (idBranch, idCuenta, idPuntoVenta)
WHERE Status = 'ABIERTO';
GO

-- Búsquedas frecuentes de pedidos por sucursal y status (dashboard, POS, jobs)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PEDIDOS_PV_STATUS_FECHA')
CREATE NONCLUSTERED INDEX IX_PEDIDOS_PV_STATUS_FECHA
ON VIDA_PEDIDOS (idBranch, idCuenta, idPuntoVenta, Status, FechaAlta)
INCLUDE (TotalUSD, MetodoPago, Canal);
GO
