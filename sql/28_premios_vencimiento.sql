-- ============================================================
-- Migración 28: Fidelización fase 3 — Catálogo de premios + canje
-- + vencimiento de puntos por inactividad.
-- Reutiliza el ledger VIDA_CLIENTE_PUNTOS (Tipo CANJEADO/REEMBOLSO/VENCIDO).
-- ============================================================

-- Catálogo de premios (editable por corporativo)
IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='VIDA_PREMIOS' AND xtype='U')
CREATE TABLE VIDA_PREMIOS (
  idBranch    BIGINT       NOT NULL,
  idCuenta    BIGINT       NOT NULL,
  idPremio    BIGINT       NOT NULL,
  Nombre      VARCHAR(150) NOT NULL,
  Descripcion VARCHAR(500) NULL,
  CostoPuntos INT          NOT NULL DEFAULT 0,
  Stock       INT          NOT NULL DEFAULT 0,   -- -1 = ilimitado
  ImagenUrl   VARCHAR(400) NULL,
  Orden       INT          NOT NULL DEFAULT 0,
  Status      VARCHAR(20)  NOT NULL DEFAULT 'ACTIVO',
  CONSTRAINT PK_VIDA_PREMIOS PRIMARY KEY (idBranch, idCuenta, idPremio)
);
GO

-- Canjes de premios
IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='VIDA_PREMIOS_CANJES' AND xtype='U')
CREATE TABLE VIDA_PREMIOS_CANJES (
  idBranch    BIGINT       NOT NULL,
  idCuenta    BIGINT       NOT NULL,
  idCanje     BIGINT       NOT NULL,
  idCliente   BIGINT       NOT NULL,
  idPremio    BIGINT       NOT NULL,
  NombrePremio VARCHAR(150) NULL,
  CostoPuntos INT          NOT NULL DEFAULT 0,
  Codigo      VARCHAR(40)  NULL,       -- se muestra/entrega en tienda
  Status      VARCHAR(20)  NOT NULL DEFAULT 'PENDIENTE', -- PENDIENTE | ENTREGADO | CANCELADO
  FechaAlta   DATETIME     NOT NULL DEFAULT GETDATE(),
  FechaMod    DATETIME     NULL,
  CONSTRAINT PK_VIDA_PREMIOS_CANJES PRIMARY KEY (idBranch, idCuenta, idCanje)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_PREMIOS_CANJES_CLIENTE' AND object_id=OBJECT_ID('VIDA_PREMIOS_CANJES'))
  CREATE INDEX IX_PREMIOS_CANJES_CLIENTE ON VIDA_PREMIOS_CANJES (idBranch, idCuenta, idCliente, FechaAlta DESC);
GO

-- Config: meses de inactividad para que venzan los puntos (0 = no vencen)
IF NOT EXISTS (SELECT 1 FROM VIDA_CONFIG_DELIVERY WHERE idBranch=1 AND idCuenta=1 AND Clave='MesesInactividadVence')
  INSERT INTO VIDA_CONFIG_DELIVERY (idBranch, idCuenta, Clave, Valor) VALUES (1, 1, 'MesesInactividadVence', '12');
GO

-- Seed de premios base
IF NOT EXISTS (SELECT 1 FROM VIDA_PREMIOS WHERE idBranch=1 AND idCuenta=1)
INSERT INTO VIDA_PREMIOS (idBranch,idCuenta,idPremio,Nombre,Descripcion,CostoPuntos,Stock,Orden) VALUES
  (1,1,1,'Botellón de agua VIDA','Un botellón de agua purificada gratis.',500,-1,1),
  (1,1,2,'Gorra VIDA','Gorra oficial de Comercializadora VIDA.',800,50,2),
  (1,1,3,'Termo VIDA','Termo reutilizable para tu hidratación diaria.',1200,30,3),
  (1,1,4,'Descuento $5','Cupón de $5 en tu próxima compra.',500,-1,4);
