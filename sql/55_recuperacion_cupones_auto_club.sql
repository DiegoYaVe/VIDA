-- 55_recuperacion_cupones_auto_club.sql
-- 1) Recuperar contraseña del cliente con un código por correo.
-- 2) Cupones personales automáticos: a quien lleva días sin comprar se le
--    emite un cupón de un solo uso que solo vale en su cuenta.
-- 3) Club VIDA fase 2: eventos con confirmación de asistencia (cupo y nivel
--    mínimo) y premios exclusivos por nivel.

-- ── 1. Código de recuperación (uno vigente por cliente) ─────────────────────
IF OBJECT_ID('VIDA_CLIENTE_RECUPERACION','U') IS NULL
  CREATE TABLE VIDA_CLIENTE_RECUPERACION (
    idBranch    BIGINT       NOT NULL,
    idCuenta    BIGINT       NOT NULL,
    idCliente   BIGINT       NOT NULL,
    CodigoHash  VARCHAR(100) NOT NULL,          -- bcrypt del código de 6 dígitos
    Expira      DATETIME2    NOT NULL,          -- UTC
    Intentos    INT          NOT NULL CONSTRAINT DF_RECUP_INTENTOS DEFAULT (0),
    Usado       BIT          NOT NULL CONSTRAINT DF_RECUP_USADO DEFAULT (0),
    FechaAlta   DATETIME2    NOT NULL CONSTRAINT DF_RECUP_ALTA DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_VIDA_CLIENTE_RECUPERACION PRIMARY KEY (idBranch, idCuenta, idCliente)
  );
GO

-- ── 2. Cupones personales ──────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name='idClienteExclusivo' AND Object_ID=OBJECT_ID('VIDA_CUPONES'))
  ALTER TABLE VIDA_CUPONES ADD idClienteExclusivo BIGINT NULL;   -- solo vale en esta cuenta
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name='Origen' AND Object_ID=OBJECT_ID('VIDA_CUPONES'))
  ALTER TABLE VIDA_CUPONES ADD Origen VARCHAR(20) NOT NULL CONSTRAINT DF_CUPONES_ORIGEN DEFAULT ('MANUAL'); -- MANUAL | INACTIVIDAD
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_CUPONES_CLIENTE_EXCL' AND object_id=OBJECT_ID('VIDA_CUPONES'))
  CREATE INDEX IX_CUPONES_CLIENTE_EXCL ON VIDA_CUPONES (idBranch, idCuenta, idClienteExclusivo, Origen)
    WHERE idClienteExclusivo IS NOT NULL;
GO

-- Configuración (Logística → Configuración). Apagado hasta que el negocio lo active.
DECLARE @cfg TABLE (Clave VARCHAR(100), Valor VARCHAR(100), Descripcion VARCHAR(300));
INSERT INTO @cfg VALUES
  ('CuponInactivoActivo',       '0',  'Cupón por inactividad: 1 = enviar, 0 = apagado'),
  ('CuponInactivoDias',         '30', 'Días sin comprar para recibir el cupón'),
  ('CuponInactivoPct',          '10', 'Descuento del cupón (%)'),
  ('CuponInactivoMaxUSD',       '5',  'Tope del descuento (USD, 0 = sin tope)'),
  ('CuponInactivoMinCompraUSD', '0',  'Compra mínima para usarlo (USD, 0 = sin mínimo)'),
  ('CuponInactivoVigenciaDias', '7',  'Días de vigencia del cupón'),
  ('CuponInactivoRepetirDias',  '60', 'Días mínimos entre dos cupones al mismo cliente');
INSERT INTO VIDA_CONFIG_DELIVERY (idBranch, idCuenta, Clave, Valor, Descripcion)
SELECT 1, 1, c.Clave, c.Valor, c.Descripcion FROM @cfg c
WHERE NOT EXISTS (SELECT 1 FROM VIDA_CONFIG_DELIVERY d WHERE d.idBranch=1 AND d.idCuenta=1 AND d.Clave=c.Clave);
GO

-- ── 3. Club VIDA: eventos y asistencia ─────────────────────────────────────
IF OBJECT_ID('VIDA_CLUB_EVENTOS','U') IS NULL
  CREATE TABLE VIDA_CLUB_EVENTOS (
    idBranch     BIGINT        NOT NULL,
    idCuenta     BIGINT        NOT NULL,
    idEvento     BIGINT        NOT NULL,
    Titulo       VARCHAR(150)  NOT NULL,
    Descripcion  VARCHAR(1000) NULL,
    Lugar        VARCHAR(250)  NULL,
    FechaInicio  DATETIME2     NOT NULL,        -- UTC
    Cupo         INT           NULL,            -- NULL = sin límite
    NivelMinimo  INT           NOT NULL CONSTRAINT DF_CLUBEV_NIVEL DEFAULT (1),
    ImagenUrl    VARCHAR(400)  NULL,
    Status       VARCHAR(20)   NOT NULL CONSTRAINT DF_CLUBEV_STATUS DEFAULT ('ACTIVO'), -- ACTIVO | INACTIVO
    FechaAlta    DATETIME2     NOT NULL CONSTRAINT DF_CLUBEV_ALTA DEFAULT (SYSUTCDATETIME()),
    UsuAlta      VARCHAR(30)   NULL,
    CONSTRAINT PK_VIDA_CLUB_EVENTOS PRIMARY KEY (idBranch, idCuenta, idEvento)
  );
GO
IF OBJECT_ID('VIDA_CLUB_EVENTOS_RSVP','U') IS NULL
  CREATE TABLE VIDA_CLUB_EVENTOS_RSVP (
    idBranch   BIGINT      NOT NULL,
    idCuenta   BIGINT      NOT NULL,
    idEvento   BIGINT      NOT NULL,
    idCliente  BIGINT      NOT NULL,
    Status     VARCHAR(12) NOT NULL CONSTRAINT DF_RSVP_STATUS DEFAULT ('CONFIRMADO')
               CONSTRAINT CK_RSVP_STATUS CHECK (Status IN ('CONFIRMADO','CANCELADO')),
    FechaAlta  DATETIME2   NOT NULL CONSTRAINT DF_RSVP_ALTA DEFAULT (SYSUTCDATETIME()),
    FechaMod   DATETIME2   NULL,
    CONSTRAINT PK_VIDA_CLUB_EVENTOS_RSVP PRIMARY KEY (idBranch, idCuenta, idEvento, idCliente)
  );
GO

-- Premios exclusivos: solo los canjea quien llegó a ese nivel del Club
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name='NivelMinimo' AND Object_ID=OBJECT_ID('VIDA_PREMIOS'))
  ALTER TABLE VIDA_PREMIOS ADD NivelMinimo INT NULL;
GO
