-- ============================================================
-- 10 — MULTI-PEDIDO POR REPARTIDOR + RUTAS Y ETAs
-- Un repartidor puede llevar varios pedidos a la vez; el sistema
-- ordena las paradas (ruta más corta) y calcula hora estimada
-- de entrega por pedido.
-- ============================================================

-- Columnas de ruta/ETA en VIDA_PEDIDOS
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('VIDA_PEDIDOS') AND name='OrdenRuta')
  ALTER TABLE VIDA_PEDIDOS ADD OrdenRuta INT NULL;            -- posición de la entrega en la ruta del repartidor (1..N)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('VIDA_PEDIDOS') AND name='DistanciaKm')
  ALTER TABLE VIDA_PEDIDOS ADD DistanciaKm DECIMAL(8,2) NULL; -- km acumulados desde la posición del repartidor
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('VIDA_PEDIDOS') AND name='ETAEntrega')
  ALTER TABLE VIDA_PEDIDOS ADD ETAEntrega DATETIME NULL;      -- hora estimada de entrega (recalculada en vivo)

-- Índice para las consultas de pedidos activos por repartidor
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_PEDIDOS_REPARTIDOR_STATUS' AND object_id=OBJECT_ID('VIDA_PEDIDOS'))
  CREATE INDEX IX_PEDIDOS_REPARTIDOR_STATUS
    ON VIDA_PEDIDOS (idBranch, idCuenta, idRepartidor, Status)
    INCLUDE (OrdenRuta, ETAEntrega);

-- Configuración del ruteo (ajusta idBranch/idCuenta a tu entorno)
IF NOT EXISTS (SELECT 1 FROM VIDA_CONFIG_DELIVERY WHERE idBranch=1 AND idCuenta=1 AND Clave='MaxPedidosPorRepartidor')
  INSERT INTO VIDA_CONFIG_DELIVERY (idBranch, idCuenta, Clave, Valor, Descripcion)
  VALUES (1, 1, 'MaxPedidosPorRepartidor', '3', 'Máximo de pedidos activos que un repartidor puede llevar a la vez');

IF NOT EXISTS (SELECT 1 FROM VIDA_CONFIG_DELIVERY WHERE idBranch=1 AND idCuenta=1 AND Clave='VelocidadPromedioKmH')
  INSERT INTO VIDA_CONFIG_DELIVERY (idBranch, idCuenta, Clave, Valor, Descripcion)
  VALUES (1, 1, 'VelocidadPromedioKmH', '22', 'Velocidad promedio urbana usada para estimar tiempos de entrega');

IF NOT EXISTS (SELECT 1 FROM VIDA_CONFIG_DELIVERY WHERE idBranch=1 AND idCuenta=1 AND Clave='MinutosPorParada')
  INSERT INTO VIDA_CONFIG_DELIVERY (idBranch, idCuenta, Clave, Valor, Descripcion)
  VALUES (1, 1, 'MinutosPorParada', '4', 'Minutos fijos que agrega cada parada (recoger/entregar) al ETA');
