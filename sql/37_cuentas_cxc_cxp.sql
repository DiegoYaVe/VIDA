-- ============================================================
-- 37 — CUENTAS POR COBRAR Y POR PAGAR + RECEPCIONES ATOMIZADAS
--
-- Modelo nuevo: la MATRIZ compra a proveedores y dispersa a las
-- sucursales. De cada movimiento de mercancía entre empresas nace
-- ahora un documento de dinero:
--
--   recepción de OC   → CXP  (la Matriz le debe al proveedor)
--   traspaso a tienda → CXC  (la sucursal le debe a la Matriz)
--
-- Las dos son EL MISMO objeto con distinta contraparte, así que
-- comparten tabla y motor de abonos.
--
-- OJO con el nombre: `idCuenta` ya es la columna de tenant en todo
-- el esquema, así que la PK de un documento de cuenta es
-- `idDocumento`, nunca `idCuenta`.
-- ============================================================

-- ── 1. Recepciones de orden de compra ───────────────────────
-- Antes la recepción era un campo (`CantidadRecibida`) que se
-- SOBRESCRIBÍA en cada entrega: dos entregas de 5 y 3 dejaban 3.
-- Ahora cada entrega es una fila con su fecha, y lo recibido se
-- calcula sumando. De cada recepción nace una CXP por lo que
-- realmente llegó.
IF OBJECT_ID('VIDA_OC_RECEPCIONES','U') IS NULL
CREATE TABLE VIDA_OC_RECEPCIONES (
  idBranch       BIGINT        NOT NULL,
  idCuenta       BIGINT        NOT NULL,
  idRecepcion    BIGINT        NOT NULL,
  idOrden        BIGINT        NOT NULL,
  idPuntoVenta   BIGINT        NOT NULL,   -- dónde entró la mercancía (la Matriz)
  Folio          VARCHAR(50)   NULL,       -- remito/factura del proveedor
  FechaRecepcion DATETIME      NOT NULL DEFAULT GETUTCDATE(),
  TotalUSD       DECIMAL(18,4) NOT NULL DEFAULT 0,
  Notas          VARCHAR(500)  NULL,
  FechaAlta      DATETIME      NOT NULL DEFAULT GETUTCDATE(),
  UsuAlta        VARCHAR(30)   NULL,
  CONSTRAINT PK_OC_RECEPCIONES PRIMARY KEY CLUSTERED (idBranch, idCuenta, idRecepcion)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_OC_RECEP_ORDEN' AND object_id=OBJECT_ID('VIDA_OC_RECEPCIONES'))
  CREATE NONCLUSTERED INDEX IX_OC_RECEP_ORDEN
    ON VIDA_OC_RECEPCIONES (idBranch, idCuenta, idOrden);
GO

IF OBJECT_ID('VIDA_OC_RECEPCIONES_DETALLE','U') IS NULL
CREATE TABLE VIDA_OC_RECEPCIONES_DETALLE (
  idBranch        BIGINT        NOT NULL,
  idCuenta        BIGINT        NOT NULL,
  idRecepcion     BIGINT        NOT NULL,
  idDetalleRecep  BIGINT        NOT NULL,
  idDetalleOC     BIGINT        NOT NULL,   -- línea de VIDA_ORDENES_COMPRA_DETALLE
  idProducto      BIGINT        NOT NULL,
  Cantidad        DECIMAL(18,4) NOT NULL,
  PrecioUnitario  DECIMAL(18,4) NOT NULL,   -- congelado de la OC al recibir
  Subtotal        DECIMAL(18,4) NOT NULL,
  CONSTRAINT PK_OC_RECEP_DET PRIMARY KEY CLUSTERED (idBranch, idCuenta, idRecepcion, idDetalleRecep)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_OC_RECEP_DET_OC' AND object_id=OBJECT_ID('VIDA_OC_RECEPCIONES_DETALLE'))
  CREATE NONCLUSTERED INDEX IX_OC_RECEP_DET_OC
    ON VIDA_OC_RECEPCIONES_DETALLE (idBranch, idCuenta, idDetalleOC)
    INCLUDE (Cantidad);
GO

-- ── 2. Documentos de cuenta (CXP y CXC) ─────────────────────
-- NO lleva columna Saldo: el saldo se DERIVA de los abonos
-- (TotalUSD - SUM(abonos)). Guardarlo sería repetir el error de
-- VIDA_REPARTIDORES.SaldoPendiente y VIDA_APP_CLIENTES.PuntosSaldo,
-- que son columnas sumadas a mano y ya se fueron a negativo.
-- `Status` sí se guarda, pero se recalcula desde la suma dentro de
-- la misma transacción del abono, nunca a mano.
IF OBJECT_ID('VIDA_CUENTAS','U') IS NULL
CREATE TABLE VIDA_CUENTAS (
  idBranch           BIGINT        NOT NULL,
  idCuenta           BIGINT        NOT NULL,   -- tenant
  idDocumento        BIGINT        NOT NULL,   -- PK del documento
  Tipo               VARCHAR(3)    NOT NULL,   -- CXP | CXC

  -- Contraparte: exactamente una de las dos según el Tipo
  idProveedor        BIGINT        NULL,       -- CXP: a quién le debemos
  idPuntoVenta       BIGINT        NULL,       -- CXC: qué sucursal nos debe
  idPuntoVentaEmisor BIGINT        NULL,       -- CXC: la Matriz que cobra

  -- De qué operación nació, para volver al origen desde la pantalla
  OrigenTipo         VARCHAR(20)   NOT NULL,   -- RECEPCION_OC | TRASPASO_MATRIZ
  idOrigen           BIGINT        NOT NULL,   -- idRecepcion | idPedidoMatriz

  Folio              VARCHAR(50)   NULL,
  TotalUSD           DECIMAL(18,4) NOT NULL,
  FechaEmision       DATE          NOT NULL,
  DiasPlazo          INT           NOT NULL DEFAULT 0,
  FechaVencimiento   DATE          NULL,       -- se guarda calculada para poder filtrar
  Status             VARCHAR(20)   NOT NULL DEFAULT 'ABIERTA', -- ABIERTA|PARCIAL|LIQUIDADA|CANCELADA
  Notas              VARCHAR(500)  NULL,
  FechaAlta          DATETIME      NOT NULL DEFAULT GETUTCDATE(),
  FechaMod           DATETIME      NULL,
  UsuAlta            VARCHAR(30)   NULL,
  CONSTRAINT PK_VIDA_CUENTAS PRIMARY KEY CLUSTERED (idBranch, idCuenta, idDocumento),
  CONSTRAINT CK_CUENTAS_TIPO   CHECK (Tipo IN ('CXP','CXC')),
  CONSTRAINT CK_CUENTAS_STATUS CHECK (Status IN ('ABIERTA','PARCIAL','LIQUIDADA','CANCELADA')),
  CONSTRAINT CK_CUENTAS_TOTAL  CHECK (TotalUSD >= 0),
  -- La contraparte tiene que corresponder al tipo
  CONSTRAINT CK_CUENTAS_PARTE  CHECK (
    (Tipo = 'CXP' AND idProveedor  IS NOT NULL AND idPuntoVenta IS NULL) OR
    (Tipo = 'CXC' AND idPuntoVenta IS NOT NULL AND idProveedor  IS NULL)
  )
);
GO

-- Idempotencia: un origen genera UNA sola cuenta. Si la recepción se
-- reintenta, el índice frena el duplicado en vez de duplicar la deuda.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_CUENTAS_ORIGEN' AND object_id=OBJECT_ID('VIDA_CUENTAS'))
  CREATE UNIQUE INDEX UX_CUENTAS_ORIGEN
    ON VIDA_CUENTAS (idBranch, idCuenta, Tipo, OrigenTipo, idOrigen);
GO

-- La pantalla filtra por tipo + estado, y ordena por vencimiento
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_CUENTAS_TIPO_STATUS' AND object_id=OBJECT_ID('VIDA_CUENTAS'))
  CREATE NONCLUSTERED INDEX IX_CUENTAS_TIPO_STATUS
    ON VIDA_CUENTAS (idBranch, idCuenta, Tipo, Status, FechaVencimiento);
GO

-- ── 3. Abonos ───────────────────────────────────────────────
-- Cada abono es un hecho INMUTABLE. Cancelar un abono es insertar
-- otro en negativo (nota de crédito), nunca un DELETE ni un UPDATE:
-- así la auditoría queda intacta, igual que en VIDA_CLIENTE_PUNTOS.
IF OBJECT_ID('VIDA_CUENTAS_ABONOS','U') IS NULL
CREATE TABLE VIDA_CUENTAS_ABONOS (
  idBranch     BIGINT        NOT NULL,
  idCuenta     BIGINT        NOT NULL,
  idAbono      BIGINT        NOT NULL,
  idDocumento  BIGINT        NOT NULL,
  MontoUSD     DECIMAL(18,4) NOT NULL,   -- negativo = reverso / nota de crédito
  FechaAbono   DATE          NOT NULL,
  MetodoPago   VARCHAR(20)   NULL,       -- EFECTIVO|TRANSFERENCIA|PAGO_MOVIL|TARJETA|OTRO
  Referencia   VARCHAR(100)  NULL,       -- nº de transferencia, recibo, etc.
  Notas        VARCHAR(300)  NULL,
  FechaAlta    DATETIME      NOT NULL DEFAULT GETUTCDATE(),
  UsuAlta      VARCHAR(30)   NULL,
  CONSTRAINT PK_VIDA_CUENTAS_ABONOS PRIMARY KEY CLUSTERED (idBranch, idCuenta, idAbono)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_ABONOS_DOC' AND object_id=OBJECT_ID('VIDA_CUENTAS_ABONOS'))
  CREATE NONCLUSTERED INDEX IX_ABONOS_DOC
    ON VIDA_CUENTAS_ABONOS (idBranch, idCuenta, idDocumento)
    INCLUDE (MontoUSD);
GO

-- ── 4. Días de crédito por contraparte ──────────────────────
-- El plazo vive en el proveedor y en la sucursal como valor por
-- defecto; cada documento lo hereda y lo puede pisar.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('VIDA_PROVEEDORES') AND name='DiasCredito')
  ALTER TABLE VIDA_PROVEEDORES ADD DiasCredito INT NOT NULL DEFAULT 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('VIDA_CUENTA_PUNTOS_VENTA') AND name='DiasCredito')
  ALTER TABLE VIDA_CUENTA_PUNTOS_VENTA ADD DiasCredito INT NOT NULL DEFAULT 0;
GO

-- ── 5. Margen de la Matriz al dispersar ─────────────────────
-- Arranca en 0: la Matriz le cobra a la sucursal exactamente el
-- costo. Subirlo hace que la Matriz gane por dispersar, sin tocar
-- código.
IF NOT EXISTS (SELECT 1 FROM VIDA_CONFIG_DELIVERY WHERE idBranch=1 AND idCuenta=1 AND Clave='MargenMatrizPct')
  INSERT INTO VIDA_CONFIG_DELIVERY (idBranch, idCuenta, Clave, Valor, Descripcion)
  VALUES (1, 1, 'MargenMatrizPct', '0',
          'Porcentaje que la Matriz suma al costo al facturar un traspaso a la sucursal');
GO

-- ── 6. Pantalla de Cuentas en el panel ──────────────────────
DECLARE @idBranch BIGINT = 1, @idCuenta BIGINT = 1;
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_PANTALLAS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Link='/cuentas')
BEGIN
  DECLARE @idPantalla BIGINT = (SELECT ISNULL(MAX(idPantalla),0)+1 FROM VIDA_CUENTA_PANTALLAS WHERE idBranch=@idBranch AND idCuenta=@idCuenta);
  INSERT INTO VIDA_CUENTA_PANTALLAS (idBranch,idCuenta,idPantalla,Nombre,Modulo,Link,Icono,OrdenPantalla,StatusPantalla,Portal,UsuAlta)
  VALUES (@idBranch,@idCuenta,@idPantalla,'Cuentas','FINANZAS','/cuentas','Wallet',55,'ACTIVO','AMBOS','SISTEMA');

  -- Roles de red + el ADMIN del punto de venta marcado como Matriz
  INSERT INTO VIDA_CUENTA_PANTALLAS_ACCESOS_USUARIO (idBranch,idCuenta,idPantalla,idUsuario,StatusAcceso,UsuAlta,Status)
  SELECT @idBranch,@idCuenta,@idPantalla,u.idUsuario,'ACTIVO','SISTEMA','ACTIVO'
  FROM VIDA_CUENTA_USUARIOS u
  WHERE u.idBranch=@idBranch AND u.idCuenta=@idCuenta AND u.Status='ACTIVO'
    AND (u.TipoUsuario IN ('SUPER_ADMIN','ADMIN_PAIS','ADMIN_ESTADO')
         OR (u.TipoUsuario = 'ADMIN' AND u.idPuntoVenta IN (
               SELECT idPuntoVenta FROM VIDA_CUENTA_PUNTOS_VENTA
               WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND EsMatriz=1)));
END
GO
