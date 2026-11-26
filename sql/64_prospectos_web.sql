-- ============================================================
-- 64 — REGISTROS DEL FORMULARIO DE LA PÁGINA WEB (26 nov 2026)
-- El formulario "Regístrate" de comercializadoravida.com no guardaba nada:
-- mostraba "¡Gracias!" y descartaba los datos. Desde ahora cada registro se
-- guarda aquí y VIDA lo atiende en Portal Corporativo → Registros de la web.
-- ============================================================
IF OBJECT_ID('VIDA_PROSPECTOS_WEB','U') IS NULL
CREATE TABLE VIDA_PROSPECTOS_WEB (
  idBranch     BIGINT        NOT NULL,
  idCuenta     BIGINT        NOT NULL,
  idProspecto  BIGINT        NOT NULL,
  Nombre       NVARCHAR(150) NOT NULL,
  Email        VARCHAR(150)  NOT NULL,
  Telefono     VARCHAR(40)   NULL,
  Interes      VARCHAR(20)   NULL
    CONSTRAINT CK_PROSP_INTERES CHECK (Interes IS NULL OR Interes IN ('tienda','proveedor','inversion','info')),
  Mensaje      NVARCHAR(1000) NULL,
  Origen       VARCHAR(30)   NOT NULL CONSTRAINT DF_PROSP_ORIGEN DEFAULT 'LANDING',
  Status       VARCHAR(20)   NOT NULL CONSTRAINT DF_PROSP_STATUS DEFAULT 'NUEVO'
    CONSTRAINT CK_PROSP_STATUS CHECK (Status IN ('NUEVO','CONTACTADO','CONVERTIDO','DESCARTADO')),
  Notas        NVARCHAR(1000) NULL,
  FechaAlta    DATETIME      NOT NULL CONSTRAINT DF_PROSP_FECHA DEFAULT GETUTCDATE(),
  FechaMod     DATETIME      NULL,
  UsuMod       VARCHAR(30)   NULL,
  CONSTRAINT PK_PROSPECTOS_WEB PRIMARY KEY (idBranch, idCuenta, idProspecto)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_PROSP_FECHA' AND object_id=OBJECT_ID('VIDA_PROSPECTOS_WEB'))
  CREATE NONCLUSTERED INDEX IX_PROSP_FECHA ON VIDA_PROSPECTOS_WEB (idBranch, idCuenta, Status, FechaAlta DESC);
GO
