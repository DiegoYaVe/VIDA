-- SQL Server. Requiere 01. Agrega quién subió cada comprobante de pago.
-- Los INSERT de comprobantes (app cliente y panel) siempre escribieron UsuAlta,
-- pero la columna nunca existió en el esquema: subir un comprobante fallaba con
-- "Invalid column name 'UsuAlta'" y los pedidos de Pago Móvil quedaban trabados
-- en ESPERANDO_PAGO. Aditiva; no toca comprobantes existentes.
IF COL_LENGTH('VIDA_PEDIDOS_COMPROBANTES','UsuAlta') IS NULL
  ALTER TABLE VIDA_PEDIDOS_COMPROBANTES ADD UsuAlta VARCHAR(20) NULL;
