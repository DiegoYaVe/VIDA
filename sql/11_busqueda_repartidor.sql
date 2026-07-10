-- ============================================================
-- 11 — BÚSQUEDA DE REPARTIDOR: radio escalonado, aviso al
-- cliente y cancelación automática con extensión opcional
-- ============================================================

-- Deadline de búsqueda (se fija al crear el pedido; el cliente puede extenderlo)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('VIDA_PEDIDOS') AND name='FechaLimiteBusqueda')
  ALTER TABLE VIDA_PEDIDOS ADD FechaLimiteBusqueda DATETIME NULL;

-- Marca de que ya se avisó al cliente que no hay repartidor
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('VIDA_PEDIDOS') AND name='AvisoSinRepartidor')
  ALTER TABLE VIDA_PEDIDOS ADD AvisoSinRepartidor BIT NOT NULL DEFAULT 0;

-- Configuración del despacho escalonado (ajusta idBranch/idCuenta a tu entorno)
IF NOT EXISTS (SELECT 1 FROM VIDA_CONFIG_DELIVERY WHERE idBranch=1 AND idCuenta=1 AND Clave='RadioBusquedaKm')
  INSERT INTO VIDA_CONFIG_DELIVERY (idBranch, idCuenta, Clave, Valor, Descripcion)
  VALUES (1, 1, 'RadioBusquedaKm', '3', 'Radio inicial en km para ofrecer pedidos a repartidores');

IF NOT EXISTS (SELECT 1 FROM VIDA_CONFIG_DELIVERY WHERE idBranch=1 AND idCuenta=1 AND Clave='RadioMaxKm')
  INSERT INTO VIDA_CONFIG_DELIVERY (idBranch, idCuenta, Clave, Valor, Descripcion)
  VALUES (1, 1, 'RadioMaxKm', '10', 'Radio máximo en km al escalar la búsqueda');

IF NOT EXISTS (SELECT 1 FROM VIDA_CONFIG_DELIVERY WHERE idBranch=1 AND idCuenta=1 AND Clave='IncrementoRadioKm')
  INSERT INTO VIDA_CONFIG_DELIVERY (idBranch, idCuenta, Clave, Valor, Descripcion)
  VALUES (1, 1, 'IncrementoRadioKm', '2', 'Km que crece el radio en cada escalada');

IF NOT EXISTS (SELECT 1 FROM VIDA_CONFIG_DELIVERY WHERE idBranch=1 AND idCuenta=1 AND Clave='IntervaloEscaladaMin')
  INSERT INTO VIDA_CONFIG_DELIVERY (idBranch, idCuenta, Clave, Valor, Descripcion)
  VALUES (1, 1, 'IntervaloEscaladaMin', '2', 'Minutos entre cada escalada del radio de búsqueda');

IF NOT EXISTS (SELECT 1 FROM VIDA_CONFIG_DELIVERY WHERE idBranch=1 AND idCuenta=1 AND Clave='TiempoAvisoClienteMin')
  INSERT INTO VIDA_CONFIG_DELIVERY (idBranch, idCuenta, Clave, Valor, Descripcion)
  VALUES (1, 1, 'TiempoAvisoClienteMin', '10', 'Minutos sin repartidor antes de avisar al cliente');

IF NOT EXISTS (SELECT 1 FROM VIDA_CONFIG_DELIVERY WHERE idBranch=1 AND idCuenta=1 AND Clave='TiempoCancelacionBusquedaMin')
  INSERT INTO VIDA_CONFIG_DELIVERY (idBranch, idCuenta, Clave, Valor, Descripcion)
  VALUES (1, 1, 'TiempoCancelacionBusquedaMin', '25', 'Minutos sin repartidor antes de cancelar el pedido automáticamente');

IF NOT EXISTS (SELECT 1 FROM VIDA_CONFIG_DELIVERY WHERE idBranch=1 AND idCuenta=1 AND Clave='ExtensionBusquedaMin')
  INSERT INTO VIDA_CONFIG_DELIVERY (idBranch, idCuenta, Clave, Valor, Descripcion)
  VALUES (1, 1, 'ExtensionBusquedaMin', '10', 'Minutos extra cuando el cliente decide seguir esperando');
