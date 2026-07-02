-- ============================================================
-- Migración: Catálogos de Países y Estados
-- ============================================================

-- ── 1. Tabla de Países ───────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='VIDA_CUENTA_PAISES' AND xtype='U')
CREATE TABLE VIDA_CUENTA_PAISES (
  idBranch   BIGINT        NOT NULL,
  idCuenta   BIGINT        NOT NULL,
  idPais     BIGINT        NOT NULL,
  NombrePais VARCHAR(100)  NOT NULL,
  CodigoISO  VARCHAR(3)    NULL,
  Status     VARCHAR(20)   NOT NULL DEFAULT 'ACTIVO',
  FechaAlta  DATETIME      NOT NULL DEFAULT GETDATE(),
  UsuAlta    VARCHAR(20)   NULL,
  FechaMod   DATETIME      NULL,
  UsuMod     VARCHAR(20)   NULL,
  CONSTRAINT PK_VIDA_CUENTA_PAISES PRIMARY KEY (idBranch, idCuenta, idPais)
);

-- ── 2. Tabla de Estados ─────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='VIDA_CUENTA_ESTADOS' AND xtype='U')
CREATE TABLE VIDA_CUENTA_ESTADOS (
  idBranch     BIGINT        NOT NULL,
  idCuenta     BIGINT        NOT NULL,
  idEstado     BIGINT        NOT NULL,
  idPais       BIGINT        NOT NULL,
  NombreEstado VARCHAR(100)  NOT NULL,
  Status       VARCHAR(20)   NOT NULL DEFAULT 'ACTIVO',
  FechaAlta    DATETIME      NOT NULL DEFAULT GETDATE(),
  UsuAlta      VARCHAR(20)   NULL,
  FechaMod     DATETIME      NULL,
  UsuMod       VARCHAR(20)   NULL,
  CONSTRAINT PK_VIDA_CUENTA_ESTADOS PRIMARY KEY (idBranch, idCuenta, idEstado)
);

-- ── 3. Agregar idPais e idEstado a Puntos de Venta ──────────
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('VIDA_CUENTA_PUNTOS_VENTA') AND name = 'idPais'
)
  ALTER TABLE VIDA_CUENTA_PUNTOS_VENTA ADD idPais BIGINT NULL;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('VIDA_CUENTA_PUNTOS_VENTA') AND name = 'idEstado'
)
  ALTER TABLE VIDA_CUENTA_PUNTOS_VENTA ADD idEstado BIGINT NULL;

-- ── 4. Agregar idPais e idEstado a Usuarios ─────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('VIDA_CUENTA_USUARIOS') AND name = 'idPais'
)
  ALTER TABLE VIDA_CUENTA_USUARIOS ADD idPais BIGINT NULL;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('VIDA_CUENTA_USUARIOS') AND name = 'idEstado'
)
  ALTER TABLE VIDA_CUENTA_USUARIOS ADD idEstado BIGINT NULL;
