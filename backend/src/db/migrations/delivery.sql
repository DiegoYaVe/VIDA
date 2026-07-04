-- ============================================================
-- DELIVERY MIGRATION — VenezPOS
-- Ejecutar con los valores correctos de idBranch / idCuenta
-- ============================================================

-- ── Clientes de la app móvil ──────────────────────────────
CREATE TABLE VIDA_APP_CLIENTES (
  idBranch   BIGINT       NOT NULL,
  idCuenta   BIGINT       NOT NULL,
  idCliente  BIGINT       NOT NULL,
  Nombre     VARCHAR(200) NOT NULL,
  Apellidos  VARCHAR(200) NULL,
  Telefono   VARCHAR(30)  NOT NULL,
  Email      VARCHAR(100) NULL,
  FcmToken   VARCHAR(500) NULL,          -- push notifications
  Status     VARCHAR(20)  NOT NULL DEFAULT 'ACTIVO',
  FechaAlta  DATETIME     NOT NULL DEFAULT GETDATE(),
  CONSTRAINT PK_APP_CLIENTES PRIMARY KEY (idBranch, idCuenta, idCliente)
);

-- ── Direcciones guardadas del cliente ────────────────────
CREATE TABLE VIDA_APP_CLIENTES_DIRECCIONES (
  idBranch    BIGINT        NOT NULL,
  idCuenta    BIGINT        NOT NULL,
  idCliente   BIGINT        NOT NULL,
  idDireccion BIGINT        NOT NULL,
  Alias       VARCHAR(100)  NULL,        -- "Casa", "Trabajo"
  Direccion   VARCHAR(500)  NOT NULL,
  Latitud     DECIMAL(10,7) NULL,
  Longitud    DECIMAL(10,7) NULL,
  EsPrincipal BIT           NOT NULL DEFAULT 0,
  Status      VARCHAR(20)   NOT NULL DEFAULT 'ACTIVO',
  CONSTRAINT PK_APP_DIRECCIONES PRIMARY KEY (idBranch, idCuenta, idCliente, idDireccion)
);

-- ── Repartidores ──────────────────────────────────────────
CREATE TABLE VIDA_REPARTIDORES (
  idBranch           BIGINT        NOT NULL,
  idCuenta           BIGINT        NOT NULL,
  idRepartidor       BIGINT        NOT NULL,
  Nombre             VARCHAR(200)  NOT NULL,
  Telefono           VARCHAR(30)   NULL,
  Vehiculo           VARCHAR(100)  NULL,   -- "Moto", "Bicicleta", "Carro"
  PlacaVehiculo      VARCHAR(20)   NULL,
  ComisionPct        DECIMAL(5,2)  NULL,   -- NULL = usa la config global
  SaldoPendiente     DECIMAL(18,4) NOT NULL DEFAULT 0,  -- efectivo que debe entregar
  FcmToken           VARCHAR(500)  NULL,
  StatusRepartidor   VARCHAR(20)   NOT NULL DEFAULT 'INACTIVO', -- DISPONIBLE|OCUPADO|INACTIVO
  UltimaLatitud      DECIMAL(10,7) NULL,
  UltimaLongitud     DECIMAL(10,7) NULL,
  UltimaUbicacion    DATETIME      NULL,
  Status             VARCHAR(20)   NOT NULL DEFAULT 'ACTIVO',
  FechaAlta          DATETIME      NOT NULL DEFAULT GETDATE(),
  CONSTRAINT PK_REPARTIDORES PRIMARY KEY (idBranch, idCuenta, idRepartidor)
);

-- ── Configuración del sistema de delivery ────────────────
CREATE TABLE VIDA_CONFIG_DELIVERY (
  idBranch    BIGINT        NOT NULL,
  idCuenta    BIGINT        NOT NULL,
  Clave       VARCHAR(100)  NOT NULL,
  Valor       VARCHAR(500)  NOT NULL,
  Descripcion VARCHAR(300)  NULL,
  CONSTRAINT PK_CONFIG_DELIVERY PRIMARY KEY (idBranch, idCuenta, Clave)
);

-- Defaults — ajusta idBranch e idCuenta según tu entorno
-- INSERT INTO VIDA_CONFIG_DELIVERY VALUES (1,1,'ComisionRepartidorPct','15.00','% de comisión para repartidores');
-- INSERT INTO VIDA_CONFIG_DELIVERY VALUES (1,1,'RadioBusquedaKm','5.00','Radio en km para notificar repartidores');
-- INSERT INTO VIDA_CONFIG_DELIVERY VALUES (1,1,'TiempoEsperaRepartidorMin','5','Minutos que tienen los repartidores para aceptar antes de re-notificar');

-- ── Liquidaciones de efectivo de repartidores ─────────────
CREATE TABLE VIDA_REPARTIDOR_LIQUIDACIONES (
  idBranch          BIGINT        NOT NULL,
  idCuenta          BIGINT        NOT NULL,
  idLiquidacion     BIGINT        NOT NULL,
  idRepartidor      BIGINT        NOT NULL,
  FechaLiquidacion  DATETIME      NOT NULL DEFAULT GETDATE(),
  MontoEfectivo     DECIMAL(18,4) NOT NULL DEFAULT 0,
  Comision          DECIMAL(18,4) NOT NULL DEFAULT 0,
  MontoALiquidar    DECIMAL(18,4) NOT NULL DEFAULT 0,
  NumPedidos        INT           NOT NULL DEFAULT 0,
  Observaciones     VARCHAR(500)  NULL,
  idUsuarioLiquida  BIGINT        NULL,
  Status            VARCHAR(20)   NOT NULL DEFAULT 'PENDIENTE', -- PENDIENTE|LIQUIDADO
  FechaAlta         DATETIME      NOT NULL DEFAULT GETDATE(),
  CONSTRAINT PK_LIQUIDACIONES PRIMARY KEY (idBranch, idCuenta, idLiquidacion)
);

-- ── Campos adicionales en VIDA_PEDIDOS ───────────────────
-- (Ejecutar solo si la tabla ya existe y no tiene estas columnas)
ALTER TABLE VIDA_PEDIDOS ADD
  idCliente               BIGINT        NULL,
  idRepartidor            BIGINT        NULL,
  UbicacionEntregaLat     DECIMAL(10,7) NULL,
  UbicacionEntregaLon     DECIMAL(10,7) NULL,
  DireccionEntrega        VARCHAR(500)  NULL,
  NotasCliente            VARCHAR(500)  NULL,
  ComisionRepartidor      DECIMAL(18,4) NULL,
  MontoEfectivoRepartidor DECIMAL(18,4) NULL;
-- VIDA_PEDIDOS.Canal ya soportaba 'POS'; ahora también acepta 'APP'
-- VIDA_PEDIDOS.Status nuevos valores: BUSCANDO_REPARTIDOR | REPARTIDOR_ASIGNADO | IR_A_SUCURSAL | EN_SUCURSAL | EN_CAMINO

-- ── Columnas adicionales para perfil de cliente ──────────
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('VIDA_APP_CLIENTES') AND name='FotoURL')
  ALTER TABLE VIDA_APP_CLIENTES ADD FotoURL VARCHAR(500) NULL;

-- ── Columnas adicionales para perfil de repartidor ────────
-- (Ejecutar con IF NOT EXISTS para no fallar si ya existen)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('VIDA_REPARTIDORES') AND name='Email')
  ALTER TABLE VIDA_REPARTIDORES ADD Email VARCHAR(100) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('VIDA_REPARTIDORES') AND name='FotoURL')
  ALTER TABLE VIDA_REPARTIDORES ADD FotoURL VARCHAR(500) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('VIDA_REPARTIDORES') AND name='Calificacion')
  ALTER TABLE VIDA_REPARTIDORES ADD Calificacion DECIMAL(3,2) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('VIDA_REPARTIDORES') AND name='TotalCalificaciones')
  ALTER TABLE VIDA_REPARTIDORES ADD TotalCalificaciones INT NOT NULL DEFAULT 0;

-- ── Calificaciones de repartidores ────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='VIDA_REPARTIDORES_CALIFICACIONES' AND type='U')
CREATE TABLE VIDA_REPARTIDORES_CALIFICACIONES (
  idBranch     BIGINT       NOT NULL,
  idCuenta     BIGINT       NOT NULL,
  idRepartidor BIGINT       NOT NULL,
  idPedido     BIGINT       NOT NULL,
  idCliente    BIGINT       NOT NULL,
  Estrellas    TINYINT      NOT NULL,
  Comentario   VARCHAR(500) NULL,
  FechaAlta    DATETIME     NOT NULL DEFAULT GETDATE(),
  CONSTRAINT PK_REP_CALIFICACIONES PRIMARY KEY (idBranch, idCuenta, idPedido)
);
