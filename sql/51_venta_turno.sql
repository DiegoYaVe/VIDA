-- 51_venta_turno.sql
-- Cada venta POS queda ligada al turno de caja que la cubrió (idTurno), en vez
-- de deducirlo por tienda + rango de fechas. Una venta offline que se sincroniza
-- cuando su turno YA cerró queda con ese idTurno y VentaTardia = 1: no cambia
-- las cifras guardadas del cierre, pero el turno la muestra en su conciliación
-- (explica el sobrante del arqueo). Sin turno que la cubra: idTurno NULL y
-- VentaTardia = 1 ("venta fuera de turno").
IF COL_LENGTH('VIDA_PEDIDOS','idTurno') IS NULL
  ALTER TABLE VIDA_PEDIDOS ADD idTurno BIGINT NULL;
GO
IF COL_LENGTH('VIDA_PEDIDOS','VentaTardia') IS NULL
  ALTER TABLE VIDA_PEDIDOS ADD VentaTardia BIT NOT NULL CONSTRAINT DF_PEDIDOS_VENTA_TARDIA DEFAULT (0);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_PEDIDOS_TURNO' AND object_id=OBJECT_ID('VIDA_PEDIDOS'))
  CREATE INDEX IX_PEDIDOS_TURNO ON VIDA_PEDIDOS (idBranch, idCuenta, idTurno) WHERE idTurno IS NOT NULL;
GO

-- Ventas POS ya existentes: el turno de su tienda cuya ventana contiene la
-- venta (lo mismo que hacía la consulta por fechas). Solo filas sin turno.
UPDATE p SET p.idTurno = t.idTurno
FROM VIDA_PEDIDOS p
CROSS APPLY (
  SELECT TOP 1 tt.idTurno FROM VIDA_CAJA_TURNOS tt
  WHERE tt.idBranch = p.idBranch AND tt.idCuenta = p.idCuenta AND tt.idPuntoVenta = p.idPuntoVenta
    AND tt.FechaApertura <= p.FechaAlta
    AND (tt.FechaCierre IS NULL OR tt.FechaCierre >= p.FechaAlta)
  ORDER BY tt.FechaApertura DESC
) t
WHERE p.Canal = 'POS' AND p.Status = 'ENTREGADO' AND p.idTurno IS NULL AND p.VentaTardia = 0;
GO
