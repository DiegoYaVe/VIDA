-- ============================================================
-- 59 — REABASTO POR PROVEEDOR CON VIDA COMO INTERMEDIARIO (tarea 24)
-- Decisiones del 28 oct 2026:
--   · La Matriz no guarda mercancía: la tienda le pide a VIDA y VIDA le
--     compra al proveedor, que entrega directo (o la tienda recoge).
--   · La tienda le paga a VIDA y VIDA al proveedor (precio de lista menos
--     la comisión de VIDA).
--   · La tienda nunca sabe quién es el proveedor, y el proveedor no sabe a
--     qué tienda va el pedido.
-- El pedido de la tienda sigue siendo un VIDA_PEDIDOS_MATRIZ (Modalidad
-- PROVEEDOR); VIDA lo parte en un VIDA_PEDIDOS_PROVEEDOR por proveedor.
-- ============================================================

-- ── Proveedor: comisión de VIDA, canal de pedidos y portal ──
IF COL_LENGTH('VIDA_PROVEEDORES','ComisionVidaPct') IS NULL
  ALTER TABLE VIDA_PROVEEDORES ADD ComisionVidaPct DECIMAL(9,4) NULL;   -- NULL = la general (ComisionVidaPct en VIDA_CONFIG_DELIVERY)
GO
IF COL_LENGTH('VIDA_PROVEEDORES','CanalPedido') IS NULL
  ALTER TABLE VIDA_PROVEEDORES ADD CanalPedido VARCHAR(10) NOT NULL
    CONSTRAINT DF_PROV_CANAL DEFAULT 'PORTAL'
    CONSTRAINT CK_PROV_CANAL CHECK (CanalPedido IN ('PORTAL','API'));
GO
IF COL_LENGTH('VIDA_PROVEEDORES','ApiUrl') IS NULL
  ALTER TABLE VIDA_PROVEEDORES ADD ApiUrl VARCHAR(500) NULL;
GO
-- Enlace secreto del Portal de proveedores (sin usuario ni contraseña)
IF COL_LENGTH('VIDA_PROVEEDORES','PortalToken') IS NULL
  ALTER TABLE VIDA_PROVEEDORES ADD PortalToken VARCHAR(64) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_PROV_PORTAL_TOKEN' AND object_id=OBJECT_ID('VIDA_PROVEEDORES'))
  CREATE UNIQUE NONCLUSTERED INDEX UX_PROV_PORTAL_TOKEN ON VIDA_PROVEEDORES (PortalToken) WHERE PortalToken IS NOT NULL;
GO

-- ── Sucursales del proveedor (puntos de retiro) ──
IF OBJECT_ID('VIDA_PROVEEDORES_SUCURSALES','U') IS NULL
CREATE TABLE VIDA_PROVEEDORES_SUCURSALES (
  idBranch    BIGINT        NOT NULL,
  idCuenta    BIGINT        NOT NULL,
  idProveedor BIGINT        NOT NULL,
  idSucursal  BIGINT        NOT NULL,
  Nombre      VARCHAR(150)  NOT NULL,
  Direccion   VARCHAR(500)  NOT NULL,
  Horario     VARCHAR(200)  NULL,
  Latitud     DECIMAL(10,7) NULL,
  Longitud    DECIMAL(10,7) NULL,
  Status      VARCHAR(20)   NOT NULL CONSTRAINT DF_PROVSUC_STATUS DEFAULT 'ACTIVO',
  FechaAlta   DATETIME      NOT NULL CONSTRAINT DF_PROVSUC_FECHA DEFAULT GETUTCDATE(),
  UsuAlta     VARCHAR(30)   NULL,
  CONSTRAINT PK_PROV_SUCURSALES PRIMARY KEY (idBranch, idCuenta, idProveedor, idSucursal)
);
GO

-- ── Pedido de la tienda a VIDA ──
IF COL_LENGTH('VIDA_PEDIDOS_MATRIZ','Modalidad') IS NULL
  ALTER TABLE VIDA_PEDIDOS_MATRIZ ADD Modalidad VARCHAR(12) NOT NULL
    CONSTRAINT DF_PM_MODALIDAD DEFAULT 'MATRIZ'
    CONSTRAINT CK_PM_MODALIDAD CHECK (Modalidad IN ('MATRIZ','PROVEEDOR'));
GO
IF COL_LENGTH('VIDA_PEDIDOS_MATRIZ','ModoRecepcion') IS NULL
  ALTER TABLE VIDA_PEDIDOS_MATRIZ ADD ModoRecepcion VARCHAR(12) NULL
    CONSTRAINT CK_PM_MODO CHECK (ModoRecepcion IS NULL OR ModoRecepcion IN ('ENVIO_VIDA','RECOJO'));
GO
IF COL_LENGTH('VIDA_PEDIDOS_MATRIZ','PagoMetodo') IS NULL
  ALTER TABLE VIDA_PEDIDOS_MATRIZ ADD
    PagoMetodo        VARCHAR(20) NULL,
    PagoReferencia    VARCHAR(60) NULL,
    PagoFecha         DATETIME    NULL,
    PagoValidadoPor   VARCHAR(30) NULL,
    PagoValidadoFecha DATETIME    NULL;
GO

IF COL_LENGTH('VIDA_PEDIDOS_MATRIZ_DETALLE','idPedidoProveedor') IS NULL
  ALTER TABLE VIDA_PEDIDOS_MATRIZ_DETALLE ADD
    idPedidoProveedor   BIGINT        NULL,
    PrecioListaUnitario DECIMAL(18,4) NULL;   -- lo que cobra el proveedor; la tienda paga lo mismo a VIDA
GO

-- ── Pedido de VIDA a cada proveedor ──
IF OBJECT_ID('VIDA_PEDIDOS_PROVEEDOR','U') IS NULL
CREATE TABLE VIDA_PEDIDOS_PROVEEDOR (
  idBranch          BIGINT        NOT NULL,
  idCuenta          BIGINT        NOT NULL,
  idPedidoProveedor BIGINT        NOT NULL,
  idPedidoMatriz    BIGINT        NOT NULL,
  idProveedor       BIGINT        NOT NULL,
  idSucursal        BIGINT        NULL,          -- punto de retiro asignado
  Folio             VARCHAR(30)   NOT NULL,      -- folio de VIDA: lo único que ve el proveedor del pedido
  Status            VARCHAR(20)   NOT NULL CONSTRAINT DF_PP_STATUS DEFAULT 'POR_PAGAR',   -- el proveedor no lo ve hasta que VIDA valida el pago
  CodigoRetiro      VARCHAR(12)   NOT NULL,      -- va en el QR; el proveedor lo valida al entregar
  TotalListaUSD     DECIMAL(18,4) NOT NULL,
  ComisionPct       DECIMAL(9,4)  NOT NULL,
  TotalPagarUSD     DECIMAL(18,4) NOT NULL,      -- lo que VIDA le paga al proveedor
  CanalEnvio        VARCHAR(10)   NOT NULL,
  EnvioApiResultado VARCHAR(300)  NULL,
  NotasProveedor    VARCHAR(500)  NULL,
  idRepartidor      BIGINT        NULL,
  RetiradoPor       VARCHAR(12)   NULL,
  FechaRetiro       DATETIME      NULL,
  FechaAlta         DATETIME      NOT NULL CONSTRAINT DF_PP_FECHA DEFAULT GETUTCDATE(),
  FechaMod          DATETIME      NULL,
  CONSTRAINT PK_PEDIDOS_PROVEEDOR PRIMARY KEY (idBranch, idCuenta, idPedidoProveedor),
  CONSTRAINT CK_PP_STATUS CHECK (Status IN ('POR_PAGAR','ENVIADO','CONFIRMADO','LISTO','RETIRADO','RECIBIDO','CANCELADO')),
  CONSTRAINT CK_PP_RETIRO CHECK (RetiradoPor IS NULL OR RetiradoPor IN ('REPARTIDOR','TIENDA'))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_PP_FOLIO' AND object_id=OBJECT_ID('VIDA_PEDIDOS_PROVEEDOR'))
  CREATE UNIQUE NONCLUSTERED INDEX UX_PP_FOLIO ON VIDA_PEDIDOS_PROVEEDOR (idBranch, idCuenta, Folio);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_PP_PEDIDO' AND object_id=OBJECT_ID('VIDA_PEDIDOS_PROVEEDOR'))
  CREATE NONCLUSTERED INDEX IX_PP_PEDIDO ON VIDA_PEDIDOS_PROVEEDOR (idBranch, idCuenta, idPedidoMatriz);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_PP_PROVEEDOR' AND object_id=OBJECT_ID('VIDA_PEDIDOS_PROVEEDOR'))
  CREATE NONCLUSTERED INDEX IX_PP_PROVEEDOR ON VIDA_PEDIDOS_PROVEEDOR (idBranch, idCuenta, idProveedor, Status);
GO

-- ── Preparación del repartidor de proveedores (app, fase 2) ──
IF COL_LENGTH('VIDA_INVENTARIO_PRODUCTOS','PesoKg') IS NULL
  ALTER TABLE VIDA_INVENTARIO_PRODUCTOS ADD PesoKg DECIMAL(10,3) NULL;   -- por unidad; sirve para saber en qué vehículo cabe un pedido
GO
IF COL_LENGTH('VIDA_REPARTIDORES','TipoReparto') IS NULL
  ALTER TABLE VIDA_REPARTIDORES ADD TipoReparto VARCHAR(12) NOT NULL
    CONSTRAINT DF_REP_TIPO DEFAULT 'CLIENTES'
    CONSTRAINT CK_REP_TIPO CHECK (TipoReparto IN ('CLIENTES','PROVEEDORES','AMBOS'));
GO
IF COL_LENGTH('VIDA_REPARTIDORES','CapacidadKg') IS NULL
  ALTER TABLE VIDA_REPARTIDORES ADD CapacidadKg DECIMAL(10,2) NULL;
GO
