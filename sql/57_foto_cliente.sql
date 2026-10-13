-- 57_foto_cliente.sql
-- Foto de perfil del cliente de la app. El código (subir foto, editar perfil,
-- GET /delivery/cliente/perfil) ya usaba VIDA_APP_CLIENTES.FotoURL, pero
-- ninguna migración la creaba: editar el perfil y subir la foto fallaban.
IF COL_LENGTH('VIDA_APP_CLIENTES', 'FotoURL') IS NULL
  ALTER TABLE VIDA_APP_CLIENTES ADD FotoURL VARCHAR(500) NULL;
GO
