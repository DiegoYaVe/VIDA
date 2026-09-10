-- ============================================================
-- Migración 26: Servicios y Recargas (consumidor)
-- Catálogo de operadoras + órdenes de servicio. Sin integración
-- real de telco: la orden queda PROCESANDO y ops la completa.
-- El cliente gana puntos al crear la orden (reversibles si se rechaza).
-- ============================================================

-- Catálogo de operadoras / servicios
IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='VIDA_SERVICIOS_OPERADORAS' AND xtype='U')
CREATE TABLE VIDA_SERVICIOS_OPERADORAS (
  idBranch     BIGINT       NOT NULL,
  idCuenta     BIGINT       NOT NULL,
  idOperadora  BIGINT       NOT NULL,
  Nombre       VARCHAR(80)  NOT NULL,
  Tipo         VARCHAR(30)  NOT NULL,      -- RECARGA_MOVIL | TV | INTERNET | TELEFONIA | OTRO
  Categoria    VARCHAR(40)  NULL,          -- etiqueta para agrupar en la app
  Color        VARCHAR(20)  NULL,
  Activo       BIT          NOT NULL DEFAULT 1,
  Orden        INT          NOT NULL DEFAULT 0,
  CONSTRAINT PK_VIDA_SERVICIOS_OPERADORAS PRIMARY KEY (idBranch, idCuenta, idOperadora)
);
GO

-- Órdenes de servicio del cliente
IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='VIDA_SERVICIOS_ORDENES' AND xtype='U')
CREATE TABLE VIDA_SERVICIOS_ORDENES (
  idBranch        BIGINT        NOT NULL,
  idCuenta        BIGINT        NOT NULL,
  idOrden         BIGINT        NOT NULL,
  idCliente       BIGINT        NOT NULL,
  idOperadora     BIGINT        NULL,
  NombreOperadora VARCHAR(80)   NULL,
  Tipo            VARCHAR(30)   NULL,
  NumeroDestino   VARCHAR(60)   NOT NULL,   -- teléfono / cuenta / contrato
  MontoUSD        DECIMAL(18,2) NOT NULL DEFAULT 0,
  MetodoPago      VARCHAR(20)   NULL,
  Referencia      VARCHAR(40)   NULL,
  Status          VARCHAR(20)   NOT NULL DEFAULT 'PROCESANDO', -- PROCESANDO | COMPLETADO | RECHAZADO
  PuntosGanados   INT           NOT NULL DEFAULT 0,
  Notas           VARCHAR(300)  NULL,
  FechaAlta       DATETIME      NOT NULL DEFAULT GETDATE(),
  FechaMod        DATETIME      NULL,
  CONSTRAINT PK_VIDA_SERVICIOS_ORDENES PRIMARY KEY (idBranch, idCuenta, idOrden)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_SERVICIOS_CLIENTE' AND object_id=OBJECT_ID('VIDA_SERVICIOS_ORDENES'))
  CREATE INDEX IX_SERVICIOS_CLIENTE ON VIDA_SERVICIOS_ORDENES (idBranch, idCuenta, idCliente, FechaAlta DESC);
GO

-- Seed de operadoras de Venezuela
IF NOT EXISTS (SELECT 1 FROM VIDA_SERVICIOS_OPERADORAS WHERE idBranch=1 AND idCuenta=1)
INSERT INTO VIDA_SERVICIOS_OPERADORAS (idBranch,idCuenta,idOperadora,Nombre,Tipo,Categoria,Color,Orden) VALUES
  (1,1,1,'Movistar',  'RECARGA_MOVIL','Recargas móviles','#00A9E0',1),
  (1,1,2,'Movilnet',  'RECARGA_MOVIL','Recargas móviles','#E2001A',2),
  (1,1,3,'Digitel',   'RECARGA_MOVIL','Recargas móviles','#FDB913',3),
  (1,1,4,'Inter',     'INTERNET',     'Internet y TV',   '#0057A8',4),
  (1,1,5,'SimpleTV',  'TV',           'Internet y TV',   '#E4002B',5),
  (1,1,6,'CANTV',     'TELEFONIA',    'Telefonía e internet','#1B458F',6);
