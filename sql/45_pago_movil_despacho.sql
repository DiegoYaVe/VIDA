-- Evita que el tiempo de búsqueda de repartidor empiece antes de aprobar pago.
IF COL_LENGTH('VIDA_PEDIDOS','FechaInicioBusqueda') IS NULL
  ALTER TABLE VIDA_PEDIDOS ADD FechaInicioBusqueda DATETIME NULL;
GO
UPDATE VIDA_PEDIDOS
SET FechaInicioBusqueda = FechaAlta
WHERE Status='BUSCANDO_REPARTIDOR' AND FechaInicioBusqueda IS NULL;
GO
