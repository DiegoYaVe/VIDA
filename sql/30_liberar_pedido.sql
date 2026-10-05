-- ============================================================
-- 30 — LIBERAR PEDIDO: el repartidor devuelve un pedido al pool
-- antes de recogerlo en sucursal, y el despacho lo re-ofrece a
-- otro. Después de recoger ya no puede pasarlo: solo cancelar
-- con motivo.
-- ============================================================

-- Quién liberó qué pedido. Se usa para NO volver a ofrecerle el
-- mismo pedido al repartidor que lo soltó (ni por polling ni por
-- el despacho escalonado).
IF OBJECT_ID('VIDA_PEDIDOS_LIBERADOS','U') IS NULL
CREATE TABLE VIDA_PEDIDOS_LIBERADOS (
  idBranch     BIGINT NOT NULL,
  idCuenta     BIGINT NOT NULL,
  idPedido     BIGINT NOT NULL,
  idRepartidor BIGINT NOT NULL,
  StatusAlLiberar VARCHAR(20) NULL,
  Motivo       VARCHAR(200) NULL,
  FechaAlta    DATETIME NOT NULL DEFAULT (getdate()),
  -- La PK compuesta hace idempotente el registro: un repartidor
  -- aparece a lo sumo una vez por pedido
  CONSTRAINT PK_VIDA_PEDIDOS_LIBERADOS PRIMARY KEY CLUSTERED
    (idBranch, idCuenta, idPedido, idRepartidor)
);
GO

-- Búsqueda por pedido: la usa el filtro de pedidos-disponibles y
-- candidatos() del despacho en cada tick
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id=OBJECT_ID('VIDA_PEDIDOS_LIBERADOS')
                 AND name='IX_PEDIDOS_LIBERADOS_pedido')
  CREATE NONCLUSTERED INDEX IX_PEDIDOS_LIBERADOS_pedido
    ON VIDA_PEDIDOS_LIBERADOS (idBranch, idCuenta, idPedido)
    INCLUDE (idRepartidor);
GO

-- Motivo obligatorio cuando el repartidor cancela un pedido que
-- ya recogió (queda también en VIDA_PEDIDOS_HISTORIAL.Notas)
IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id=OBJECT_ID('VIDA_PEDIDOS') AND name='MotivoCancelacion')
  ALTER TABLE VIDA_PEDIDOS ADD MotivoCancelacion VARCHAR(200) NULL;
GO

-- Cuántas veces rebotó el pedido. El panel lo usa para detectar
-- pedidos problemáticos (dirección mala, zona que nadie quiere)
IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id=OBJECT_ID('VIDA_PEDIDOS') AND name='VecesLiberado')
  ALTER TABLE VIDA_PEDIDOS ADD VecesLiberado INT NOT NULL DEFAULT 0;
GO

-- Plazo que se le repone a la búsqueda cuando un pedido se libera.
-- Sin esto el job de despacho lo auto-cancelaría en el siguiente
-- tick, porque FechaLimiteBusqueda se calcula desde FechaAlta.
IF NOT EXISTS (SELECT 1 FROM VIDA_CONFIG_DELIVERY
               WHERE idBranch=1 AND idCuenta=1 AND Clave='ProrrogaLiberacionMin')
  INSERT INTO VIDA_CONFIG_DELIVERY (idBranch, idCuenta, Clave, Valor, Descripcion)
  VALUES (1, 1, 'ProrrogaLiberacionMin', '15',
          'Minutos de búsqueda que se reponen al pedido cuando un repartidor lo libera');
GO
