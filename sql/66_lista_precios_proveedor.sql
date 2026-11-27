-- ============================================================
-- 66 — LISTA DE PRECIOS DEL PROVEEDOR POR LAYOUT DE EXCEL (tarea 26)
-- La mayoría de los proveedores no tiene API: nos manda su lista en un Excel
-- y VIDA la carga. Así el catálogo de cada proveedor (qué tiene y cuánto
-- cuesta) está al día para pedirle.
--   · VIDA_PROVEEDORES_PRODUCTOS guarda ahora los datos de la lista
--     (PrecioCosto sigue siendo el precio de lista por unidad).
--   · Historial de cada cambio de precio.
--   · Productos que el proveedor trae y VIDA no tiene: quedan POR APROBAR;
--     VIDA decide si los crea en su catálogo o si ya existen.
-- ============================================================

-- ── Datos de la lista en el producto del proveedor ──
IF COL_LENGTH('VIDA_PROVEEDORES_PRODUCTOS','UnidadCompra') IS NULL
  ALTER TABLE VIDA_PROVEEDORES_PRODUCTOS ADD
    UnidadCompra      VARCHAR(20)   NULL,     -- Pieza, Caja, Bulto, Kg, Litro
    UnidadesEmpaque   INT           NULL,     -- piezas por caja o bulto
    PrecioSugeridoUSD DECIMAL(18,4) NULL,     -- precio sugerido al público
    PedidoMinimo      DECIMAL(18,4) NULL,     -- en unidades
    DiasEntrega       INT           NULL,
    FechaMod          DATETIME      NULL,
    UsuMod            VARCHAR(20)   NULL;
GO
-- Lo que el proveedor no tiene hoy no se le pide (ni lo ve la tienda)
IF COL_LENGTH('VIDA_PROVEEDORES_PRODUCTOS','Disponible') IS NULL
  ALTER TABLE VIDA_PROVEEDORES_PRODUCTOS ADD Disponible BIT NOT NULL
    CONSTRAINT DF_PROVPROD_DISPONIBLE DEFAULT 1;
GO

-- ── Cuándo se cargó la lista y hasta cuándo vale ──
IF COL_LENGTH('VIDA_PROVEEDORES','ListaFechaCarga') IS NULL
  ALTER TABLE VIDA_PROVEEDORES ADD ListaFechaCarga DATETIME NULL, ListaVigenteHasta DATE NULL;
GO

-- ── Historial de precios de lista ──
IF OBJECT_ID('VIDA_PROVEEDORES_PRECIOS_HIST','U') IS NULL
CREATE TABLE VIDA_PROVEEDORES_PRECIOS_HIST (
  idHist          BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PROV_PRECIOS_HIST PRIMARY KEY,
  idBranch        BIGINT        NOT NULL,
  idCuenta        BIGINT        NOT NULL,
  idProveedor     BIGINT        NOT NULL,
  idProducto      BIGINT        NOT NULL,
  PrecioAnterior  DECIMAL(18,4) NULL,       -- NULL = primera vez
  PrecioNuevo     DECIMAL(18,4) NOT NULL,
  Origen          VARCHAR(10)   NOT NULL CONSTRAINT CK_PROV_HIST_ORIGEN CHECK (Origen IN ('LAYOUT','MANUAL','APROBADO')),
  Fecha           DATETIME      NOT NULL CONSTRAINT DF_PROV_HIST_FECHA DEFAULT GETUTCDATE(),
  UsuAlta         VARCHAR(20)   NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_PROV_HIST_PRODUCTO' AND object_id=OBJECT_ID('VIDA_PROVEEDORES_PRECIOS_HIST'))
  CREATE NONCLUSTERED INDEX IX_PROV_HIST_PRODUCTO ON VIDA_PROVEEDORES_PRECIOS_HIST (idBranch, idCuenta, idProducto, Fecha);
GO

-- ── Productos nuevos del proveedor, por aprobar ──
IF OBJECT_ID('VIDA_PROVEEDORES_PRODUCTOS_NUEVOS','U') IS NULL
CREATE TABLE VIDA_PROVEEDORES_PRODUCTOS_NUEVOS (
  idNuevo           BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PROV_PROD_NUEVOS PRIMARY KEY,
  idBranch          BIGINT        NOT NULL,
  idCuenta          BIGINT        NOT NULL,
  idProveedor       BIGINT        NOT NULL,
  CodigoProveedor   VARCHAR(100)  NOT NULL,
  CodigoBarras      VARCHAR(100)  NULL,
  Nombre            VARCHAR(200)  NOT NULL,
  Marca             VARCHAR(100)  NULL,
  Categoria         VARCHAR(100)  NULL,     -- la que propone el proveedor (texto)
  UnidadCompra      VARCHAR(20)   NULL,
  UnidadesEmpaque   INT           NULL,
  PrecioListaUSD    DECIMAL(18,4) NOT NULL,
  PrecioSugeridoUSD DECIMAL(18,4) NULL,
  AlicuotaIVA       VARCHAR(10)   NULL,
  PedidoMinimo      DECIMAL(18,4) NULL,
  PesoKg            DECIMAL(10,3) NULL,
  DiasEntrega       INT           NULL,
  Disponible        BIT           NOT NULL CONSTRAINT DF_PROV_NUEVO_DISP DEFAULT 1,
  Status            VARCHAR(10)   NOT NULL CONSTRAINT DF_PROV_NUEVO_STATUS DEFAULT 'PENDIENTE'
                      CONSTRAINT CK_PROV_NUEVO_STATUS CHECK (Status IN ('PENDIENTE','APROBADO','RECHAZADO')),
  idProducto        BIGINT        NULL,     -- el producto VIDA creado o al que se ligó
  Motivo            VARCHAR(300)  NULL,     -- por qué se rechazó
  FechaAlta         DATETIME      NOT NULL CONSTRAINT DF_PROV_NUEVO_FECHA DEFAULT GETUTCDATE(),
  UsuAlta           VARCHAR(20)   NULL,
  FechaResuelto     DATETIME      NULL,
  UsuResuelto       VARCHAR(20)   NULL
);
GO
-- Un mismo código del proveedor no puede estar dos veces pendiente
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_PROV_NUEVO_PENDIENTE' AND object_id=OBJECT_ID('VIDA_PROVEEDORES_PRODUCTOS_NUEVOS'))
  CREATE UNIQUE NONCLUSTERED INDEX UX_PROV_NUEVO_PENDIENTE
    ON VIDA_PROVEEDORES_PRODUCTOS_NUEVOS (idBranch, idCuenta, idProveedor, CodigoProveedor)
    WHERE Status = 'PENDIENTE';
GO
