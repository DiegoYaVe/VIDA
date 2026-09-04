-- ============================================================
-- Migración 23: Salud — Programa "Mi Consumo Vida" (hidratación)
-- El cliente activa el programa, define meta diaria de vasos y
-- registra su consumo. Racha de 7 días => puntos extra.
-- ============================================================

-- Config del programa en el cliente
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('VIDA_APP_CLIENTES') AND name='HidratacionActiva')
  ALTER TABLE VIDA_APP_CLIENTES ADD HidratacionActiva BIT NOT NULL DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('VIDA_APP_CLIENTES') AND name='HidratacionMetaVasos')
  ALTER TABLE VIDA_APP_CLIENTES ADD HidratacionMetaVasos INT NOT NULL DEFAULT 8;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('VIDA_APP_CLIENTES') AND name='HidratacionMlVaso')
  ALTER TABLE VIDA_APP_CLIENTES ADD HidratacionMlVaso INT NOT NULL DEFAULT 250;
GO

-- Registro diario de vasos
IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='VIDA_CLIENTE_HIDRATACION_DIA' AND xtype='U')
CREATE TABLE VIDA_CLIENTE_HIDRATACION_DIA (
  idBranch  BIGINT   NOT NULL,
  idCuenta  BIGINT   NOT NULL,
  idCliente BIGINT   NOT NULL,
  Fecha     DATE     NOT NULL,
  Vasos     INT      NOT NULL DEFAULT 0,
  FechaMod  DATETIME NOT NULL DEFAULT GETDATE(),
  CONSTRAINT PK_VIDA_CLIENTE_HIDRATACION_DIA PRIMARY KEY (idBranch, idCuenta, idCliente, Fecha)
);
GO

-- Config: puntos extra al completar una racha de 7 días cumpliendo la meta
IF NOT EXISTS (SELECT 1 FROM VIDA_CONFIG_DELIVERY WHERE idBranch=1 AND idCuenta=1 AND Clave='PuntosRachaHidratacion')
  INSERT INTO VIDA_CONFIG_DELIVERY (idBranch, idCuenta, Clave, Valor) VALUES (1, 1, 'PuntosRachaHidratacion', '50');
