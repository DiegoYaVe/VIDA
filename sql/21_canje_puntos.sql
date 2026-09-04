-- ============================================================
-- Migración 21: Canje de puntos en el checkout
-- El cliente puede pagar parte (o todo) con puntos.
-- Conversión: PuntosPorDolarCanje puntos = $1 de descuento (default 100).
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('VIDA_PEDIDOS') AND name='DescuentoPuntosUSD')
  ALTER TABLE VIDA_PEDIDOS ADD DescuentoPuntosUSD DECIMAL(18,4) NOT NULL DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('VIDA_PEDIDOS') AND name='PuntosUsados')
  ALTER TABLE VIDA_PEDIDOS ADD PuntosUsados INT NOT NULL DEFAULT 0;
GO

-- Config: cuántos puntos equivalen a $1 al canjear (default 100)
IF NOT EXISTS (SELECT 1 FROM VIDA_CONFIG_DELIVERY WHERE idBranch=1 AND idCuenta=1 AND Clave='PuntosPorDolarCanje')
  INSERT INTO VIDA_CONFIG_DELIVERY (idBranch, idCuenta, Clave, Valor) VALUES (1, 1, 'PuntosPorDolarCanje', '100');
