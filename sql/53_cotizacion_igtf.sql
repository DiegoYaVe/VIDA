-- 53_cotizacion_igtf.sql
-- La cotización del POS (tasa autorizada para cobrar, también offline) guarda
-- si la tienda cobra IGTF (contribuyente especial) al emitirla. La venta se
-- valida al sincronizar con esa regla, no con la configuración de ese momento.
IF COL_LENGTH('VIDA_POS_COTIZACIONES','AplicaIGTF') IS NULL
  ALTER TABLE VIDA_POS_COTIZACIONES ADD AplicaIGTF BIT NOT NULL CONSTRAINT DF_POS_COT_IGTF DEFAULT (0);
GO
