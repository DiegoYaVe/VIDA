-- SQL Server. Aplicar después de 37/38, antes de desplegar el backend.
-- No cambia costos, deudas emitidas ni pedidos históricos.
IF COL_LENGTH('VIDA_INVENTARIO_PRODUCTOS','PrecioSuministroUSD') IS NULL
 ALTER TABLE VIDA_INVENTARIO_PRODUCTOS ADD PrecioSuministroUSD DECIMAL(18,4) NULL;
GO
IF COL_LENGTH('VIDA_PEDIDOS_MATRIZ_DETALLE','PrecioTiendaUnitario') IS NULL
 ALTER TABLE VIDA_PEDIDOS_MATRIZ_DETALLE ADD PrecioTiendaUnitario DECIMAL(18,4) NULL;
GO
IF COL_LENGTH('VIDA_PEDIDOS_MATRIZ','TotalSuministroUSD') IS NULL
 ALTER TABLE VIDA_PEDIDOS_MATRIZ ADD TotalSuministroUSD DECIMAL(18,4) NULL;
GO
-- NULL identifica el pedido legado: no se inventa un precio histórico.
