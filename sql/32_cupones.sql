-- ============================================================
-- 32 — CUPONES: códigos de descuento canjeables en checkout
-- Diferencia con PROMOCIONES (sql/13): la promoción se aplica sola a un
-- producto/categoría; el CUPÓN requiere que el cliente ingrese un CÓDIGO y
-- tiene límites de uso (global y por cliente) y un ledger de usos.
--
-- Tipos:
--   DESCUENTO_PCT -> Valor = % sobre el subtotal (topado por MaxDescuento)
--   DESCUENTO_USD -> Valor = $ fijo de descuento
-- Alcance: TODO | CATEGORIA | PRODUCTO   (limita a qué items cuenta el subtotal)
-- Canal:   TODO | POS | DELIVERY
-- ============================================================

-- ── Catálogo de cupones ──────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='VIDA_CUPONES' AND type='U')
CREATE TABLE VIDA_CUPONES (
  idBranch        BIGINT        NOT NULL,
  idCuenta        BIGINT        NOT NULL,
  idCupon         BIGINT        NOT NULL,
  Codigo          VARCHAR(40)   NOT NULL,   -- se guarda en MAYÚSCULAS
  Nombre          VARCHAR(150)  NOT NULL,
  Tipo            VARCHAR(20)   NOT NULL,   -- DESCUENTO_PCT | DESCUENTO_USD
  Valor           DECIMAL(18,4) NOT NULL,   -- % o $ según Tipo
  MinCompra       DECIMAL(18,4) NULL,       -- subtotal mínimo para aplicar
  MaxDescuento    DECIMAL(18,4) NULL,       -- tope de descuento (útil en PCT)
  Alcance         VARCHAR(20)   NOT NULL DEFAULT 'TODO',  -- TODO|CATEGORIA|PRODUCTO
  idCategoria     BIGINT        NULL,
  idProducto      BIGINT        NULL,
  Canal           VARCHAR(20)   NOT NULL DEFAULT 'TODO',  -- TODO|POS|DELIVERY
  FechaInicio     DATE          NULL,
  FechaFin        DATE          NULL,
  UsosMax         INT           NULL,       -- máximo global (NULL = ilimitado)
  UsosPorCliente  INT           NULL DEFAULT 1,  -- máximo por cliente (NULL = ilimitado)
  UsosActuales    INT           NOT NULL DEFAULT 0,
  Descripcion     VARCHAR(300)  NULL,
  Status          VARCHAR(20)   NOT NULL DEFAULT 'ACTIVO',  -- ACTIVO|INACTIVO
  FechaAlta       DATETIME      NOT NULL DEFAULT GETDATE(),
  UsuAlta         VARCHAR(30)   NULL,
  CONSTRAINT PK_VIDA_CUPONES PRIMARY KEY (idBranch, idCuenta, idCupon)
);

-- Código único por cuenta (case-insensitive porque se guarda en mayúsculas)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_CUPONES_CODIGO' AND object_id=OBJECT_ID('VIDA_CUPONES'))
  CREATE UNIQUE INDEX UX_CUPONES_CODIGO
    ON VIDA_CUPONES (idBranch, idCuenta, Codigo);

-- ── Ledger de usos (idempotente por pedido) ─────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='VIDA_CUPONES_USOS' AND type='U')
CREATE TABLE VIDA_CUPONES_USOS (
  idBranch      BIGINT        NOT NULL,
  idCuenta      BIGINT        NOT NULL,
  idUso         BIGINT        NOT NULL,
  idCupon       BIGINT        NOT NULL,
  Codigo        VARCHAR(40)   NOT NULL,
  idCliente     BIGINT        NULL,        -- NULL en ventas POS anónimas
  idPedido      BIGINT        NULL,
  Canal         VARCHAR(20)   NULL,
  DescuentoUSD  DECIMAL(18,4) NOT NULL,
  FechaAlta     DATETIME      NOT NULL DEFAULT GETDATE(),
  UsuAlta       VARCHAR(30)   NULL,
  CONSTRAINT PK_VIDA_CUPONES_USOS PRIMARY KEY (idBranch, idCuenta, idUso)
);

-- Un cupón se aplica a lo sumo una vez por pedido (idempotencia del /aplicar)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_CUPONES_USOS_PEDIDO' AND object_id=OBJECT_ID('VIDA_CUPONES_USOS'))
  CREATE UNIQUE INDEX UX_CUPONES_USOS_PEDIDO
    ON VIDA_CUPONES_USOS (idBranch, idCuenta, idCupon, idPedido)
    WHERE idPedido IS NOT NULL;

-- Para contar usos por cliente rápido
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_CUPONES_USOS_CLIENTE' AND object_id=OBJECT_ID('VIDA_CUPONES_USOS'))
  CREATE INDEX IX_CUPONES_USOS_CLIENTE
    ON VIDA_CUPONES_USOS (idBranch, idCuenta, idCupon, idCliente);

-- ── Columnas en el pedido para reflejar el cupón aplicado ───────────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name='CuponCodigo' AND Object_ID=OBJECT_ID('VIDA_PEDIDOS'))
  ALTER TABLE VIDA_PEDIDOS ADD CuponCodigo VARCHAR(40) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name='CuponDescuentoUSD' AND Object_ID=OBJECT_ID('VIDA_PEDIDOS'))
  ALTER TABLE VIDA_PEDIDOS ADD CuponDescuentoUSD DECIMAL(18,4) NULL;
GO

-- ── Cupón de bienvenida de ejemplo (idempotente) ────────────────────────────
DECLARE @idBranch BIGINT = 1, @idCuenta BIGINT = 1;
IF NOT EXISTS (SELECT 1 FROM VIDA_CUPONES WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Codigo='BIENVENIDO10')
BEGIN
  DECLARE @idCupon BIGINT = (SELECT ISNULL(MAX(idCupon),0)+1 FROM VIDA_CUPONES WHERE idBranch=@idBranch AND idCuenta=@idCuenta);
  INSERT INTO VIDA_CUPONES
    (idBranch,idCuenta,idCupon,Codigo,Nombre,Tipo,Valor,MinCompra,MaxDescuento,Alcance,Canal,UsosPorCliente,Descripcion,Status,UsuAlta)
  VALUES
    (@idBranch,@idCuenta,@idCupon,'BIENVENIDO10','10% de bienvenida','DESCUENTO_PCT',10,5,3,'TODO','TODO',1,'10% en tu primera compra (máx $3, mínimo $5)','ACTIVO','SISTEMA');
END
GO

-- ── Pantalla del panel: /cupones (roles de red + admin) ─────────────────────
DECLARE @b BIGINT = 1, @c BIGINT = 1;
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_PANTALLAS WHERE idBranch=@b AND idCuenta=@c AND Link='/cupones')
BEGIN
  DECLARE @idPantalla BIGINT = (SELECT ISNULL(MAX(idPantalla),0)+1 FROM VIDA_CUENTA_PANTALLAS WHERE idBranch=@b AND idCuenta=@c);
  INSERT INTO VIDA_CUENTA_PANTALLAS (idBranch,idCuenta,idPantalla,Nombre,Modulo,Link,Icono,OrdenPantalla,StatusPantalla,UsuAlta)
  VALUES (@b,@c,@idPantalla,'Cupones','MARKETING','/cupones','Ticket',55,'ACTIVO','SISTEMA');

  INSERT INTO VIDA_CUENTA_PANTALLAS_ACCESOS_USUARIO (idBranch,idCuenta,idPantalla,idUsuario,StatusAcceso,UsuAlta,Status)
  SELECT @b,@c,@idPantalla,u.idUsuario,'ACTIVO','SISTEMA','ACTIVO'
  FROM VIDA_CUENTA_USUARIOS u
  WHERE u.idBranch=@b AND u.idCuenta=@c AND u.Status='ACTIVO'
    AND u.TipoUsuario IN ('SUPER_ADMIN','ADMIN_PAIS','ADMIN_ESTADO','ADMIN');
END
GO
