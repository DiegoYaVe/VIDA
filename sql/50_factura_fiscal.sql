-- 50_factura_fiscal.sql
-- Factura fiscal venezolana (SENIAT). Cada tienda es su propio emisor: su
-- RIF, su razón social, su domicilio fiscal y su numeración. Los precios de
-- lista ya incluyen el IVA: la factura desglosa base e IVA hacia atrás.
--
--  - Datos del emisor en VIDA_CUENTA_PUNTOS_VENTA (RIF, domicilio fiscal,
--    modalidad: máquina fiscal o imprenta digital, contribuyente especial).
--  - Alícuota de IVA por producto (GENERAL / REDUCIDA / EXENTO) y tabla de
--    porcentajes vigentes; cada factura guarda el porcentaje que aplicó.
--  - VIDA_FACTURAS / _DETALLE: facturas y notas de crédito con copia de los
--    datos del emisor y del receptor al momento de emitir. Inmutables: solo se
--    puede registrar UNA vez el número de control (máquina fiscal o imprenta
--    digital). Para corregir una factura se emite una nota de crédito.
--  - VIDA_FACTURAS_CONSECUTIVOS: numeración por tienda y tipo de documento.

IF COL_LENGTH('VIDA_CUENTA_PUNTOS_VENTA','RIF') IS NULL
  ALTER TABLE VIDA_CUENTA_PUNTOS_VENTA ADD RIF VARCHAR(12) NULL;
GO
IF COL_LENGTH('VIDA_CUENTA_PUNTOS_VENTA','DomicilioFiscal') IS NULL
  ALTER TABLE VIDA_CUENTA_PUNTOS_VENTA ADD DomicilioFiscal VARCHAR(500) NULL;
GO
IF COL_LENGTH('VIDA_CUENTA_PUNTOS_VENTA','ModalidadFiscal') IS NULL
  ALTER TABLE VIDA_CUENTA_PUNTOS_VENTA ADD ModalidadFiscal VARCHAR(20) NOT NULL
    CONSTRAINT DF_PV_MODALIDAD_FISCAL DEFAULT ('NINGUNA')
    CONSTRAINT CK_PV_MODALIDAD_FISCAL CHECK (ModalidadFiscal IN ('NINGUNA','MAQUINA_FISCAL','IMPRENTA_DIGITAL'));
GO
IF COL_LENGTH('VIDA_CUENTA_PUNTOS_VENTA','ContribuyenteEspecial') IS NULL
  ALTER TABLE VIDA_CUENTA_PUNTOS_VENTA ADD ContribuyenteEspecial BIT NOT NULL
    CONSTRAINT DF_PV_CONTRIB_ESPECIAL DEFAULT (0);
GO

IF COL_LENGTH('VIDA_INVENTARIO_PRODUCTOS','AlicuotaIVA') IS NULL
  ALTER TABLE VIDA_INVENTARIO_PRODUCTOS ADD AlicuotaIVA VARCHAR(10) NOT NULL
    CONSTRAINT DF_PROD_ALICUOTA_IVA DEFAULT ('GENERAL')
    CONSTRAINT CK_PROD_ALICUOTA_IVA CHECK (AlicuotaIVA IN ('GENERAL','REDUCIDA','EXENTO'));
GO

-- Porcentajes vigentes (ley del IVA). Si cambian, se actualiza aquí: las
-- facturas ya emitidas conservan el porcentaje con el que se calcularon.
IF OBJECT_ID('VIDA_FISCAL_ALICUOTAS','U') IS NULL
  CREATE TABLE VIDA_FISCAL_ALICUOTAS (
    Codigo      VARCHAR(10)  NOT NULL CONSTRAINT PK_VIDA_FISCAL_ALICUOTAS PRIMARY KEY,
    Porcentaje  DECIMAL(5,2) NOT NULL CONSTRAINT CK_FISCAL_ALICUOTA_PCT CHECK (Porcentaje >= 0 AND Porcentaje < 100),
    Descripcion VARCHAR(100) NOT NULL
  );
GO
IF NOT EXISTS (SELECT 1 FROM VIDA_FISCAL_ALICUOTAS WHERE Codigo='GENERAL')
  INSERT INTO VIDA_FISCAL_ALICUOTAS VALUES ('GENERAL', 16.00, 'Alícuota general');
IF NOT EXISTS (SELECT 1 FROM VIDA_FISCAL_ALICUOTAS WHERE Codigo='REDUCIDA')
  INSERT INTO VIDA_FISCAL_ALICUOTAS VALUES ('REDUCIDA', 8.00, 'Alícuota reducida');
IF NOT EXISTS (SELECT 1 FROM VIDA_FISCAL_ALICUOTAS WHERE Codigo='EXENTO')
  INSERT INTO VIDA_FISCAL_ALICUOTAS VALUES ('EXENTO', 0.00, 'Exento');
GO

IF OBJECT_ID('VIDA_FACTURAS_CONSECUTIVOS','U') IS NULL
  CREATE TABLE VIDA_FACTURAS_CONSECUTIVOS (
    idBranch      BIGINT      NOT NULL,
    idCuenta      BIGINT      NOT NULL,
    idPuntoVenta  BIGINT      NOT NULL,
    TipoDocumento VARCHAR(12) NOT NULL,
    Ultimo        INT         NOT NULL,
    CONSTRAINT PK_VIDA_FACTURAS_CONSECUTIVOS PRIMARY KEY (idBranch, idCuenta, idPuntoVenta, TipoDocumento)
  );
GO

IF OBJECT_ID('VIDA_FACTURAS','U') IS NULL
  CREATE TABLE VIDA_FACTURAS (
    idBranch       BIGINT       NOT NULL,
    idCuenta       BIGINT       NOT NULL,
    idFactura      BIGINT       NOT NULL,
    idPuntoVenta   BIGINT       NOT NULL,
    idPedido       BIGINT       NOT NULL,
    TipoDocumento  VARCHAR(12)  NOT NULL CONSTRAINT CK_FACT_TIPO CHECK (TipoDocumento IN ('FACTURA','NOTA_CREDITO')),
    Numero         INT          NOT NULL,
    idFacturaAfectada BIGINT    NULL,
    Motivo         VARCHAR(300) NULL,
    Modalidad      VARCHAR(20)  NOT NULL CONSTRAINT CK_FACT_MODALIDAD CHECK (Modalidad IN ('MAQUINA_FISCAL','IMPRENTA_DIGITAL')),
    Status         VARCHAR(20)  NOT NULL CONSTRAINT DF_FACT_STATUS DEFAULT ('PENDIENTE_CONTROL')
                                CONSTRAINT CK_FACT_STATUS CHECK (Status IN ('PENDIENTE_CONTROL','EMITIDA')),
    NumeroControl  VARCHAR(40)  NULL,
    SerialMaquina  VARCHAR(40)  NULL,
    FechaControl   DATETIME     NULL,
    UsuControl     VARCHAR(20)  NULL,
    -- Emisor y receptor tal como estaban al emitir
    EmisorRIF          VARCHAR(12)  NOT NULL,
    EmisorRazonSocial  VARCHAR(200) NOT NULL,
    EmisorDomicilio    VARCHAR(500) NOT NULL,
    EmisorContribuyenteEspecial BIT NOT NULL,
    ReceptorDocumento  VARCHAR(12)  NOT NULL,
    ReceptorNombre     VARCHAR(200) NOT NULL,
    ReceptorDomicilio  VARCHAR(500) NULL,
    -- Fechas: instante en UTC; FechaFiscal = día de Caracas (libro de ventas)
    FechaEmision   DATETIME     NOT NULL CONSTRAINT DF_FACT_FECHA DEFAULT (GETUTCDATE()),
    FechaFiscal    DATE         NOT NULL,
    FechaOperacion DATETIME     NOT NULL,
    -- Tasa BCV de la operación (equivalencia en divisas, art. 13 Prov. 0071)
    TasaVESporUSD  DECIMAL(18,8) NOT NULL,
    FuenteTasa     NVARCHAR(200) NULL,
    FechaTasa      DATE         NULL,
    -- Montos en Bs (positivos también en la nota de crédito: el tipo la resta)
    SubtotalVES    DECIMAL(18,2) NOT NULL,
    DescuentoVES   DECIMAL(18,2) NOT NULL,
    PctGeneral     DECIMAL(5,2)  NOT NULL,
    BaseGeneralVES DECIMAL(18,2) NOT NULL,
    IVAGeneralVES  DECIMAL(18,2) NOT NULL,
    PctReducida    DECIMAL(5,2)  NOT NULL,
    BaseReducidaVES DECIMAL(18,2) NOT NULL,
    IVAReducidaVES DECIMAL(18,2) NOT NULL,
    ExentoVES      DECIMAL(18,2) NOT NULL,
    TotalVES       DECIMAL(18,2) NOT NULL,
    IGTFBaseVES    DECIMAL(18,2) NOT NULL,
    IGTFVES        DECIMAL(18,2) NOT NULL,
    TotalPagarVES  DECIMAL(18,2) NOT NULL,
    TotalUSD       DECIMAL(18,2) NOT NULL,
    UsuAlta        VARCHAR(20)   NULL,
    CONSTRAINT PK_VIDA_FACTURAS PRIMARY KEY (idBranch, idCuenta, idFactura),
    CONSTRAINT UQ_FACT_NUMERO UNIQUE (idBranch, idCuenta, idPuntoVenta, TipoDocumento, Numero),
    CONSTRAINT CK_FACT_NC_AFECTADA CHECK ((TipoDocumento = 'FACTURA' AND idFacturaAfectada IS NULL)
                                       OR (TipoDocumento = 'NOTA_CREDITO' AND idFacturaAfectada IS NOT NULL)),
    CONSTRAINT CK_FACT_CONTROL CHECK ((Status = 'EMITIDA' AND NumeroControl IS NOT NULL) OR (Status = 'PENDIENTE_CONTROL' AND NumeroControl IS NULL))
  );
GO

-- Una sola factura por pedido y una sola nota de crédito (total) por factura
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_FACT_PEDIDO' AND object_id=OBJECT_ID('VIDA_FACTURAS'))
  CREATE UNIQUE INDEX UX_FACT_PEDIDO ON VIDA_FACTURAS (idBranch, idCuenta, idPedido) WHERE TipoDocumento = 'FACTURA';
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_FACT_NC_AFECTADA' AND object_id=OBJECT_ID('VIDA_FACTURAS'))
  CREATE UNIQUE INDEX UX_FACT_NC_AFECTADA ON VIDA_FACTURAS (idBranch, idCuenta, idFacturaAfectada) WHERE TipoDocumento = 'NOTA_CREDITO';
GO
-- Un número de control no se repite en la misma tienda (y máquina fiscal)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_FACT_CONTROL' AND object_id=OBJECT_ID('VIDA_FACTURAS'))
  CREATE UNIQUE INDEX UX_FACT_CONTROL ON VIDA_FACTURAS (idBranch, idCuenta, idPuntoVenta, TipoDocumento, SerialMaquina, NumeroControl)
    WHERE NumeroControl IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_FACT_LIBRO' AND object_id=OBJECT_ID('VIDA_FACTURAS'))
  CREATE INDEX IX_FACT_LIBRO ON VIDA_FACTURAS (idBranch, idCuenta, idPuntoVenta, FechaFiscal);
GO

IF OBJECT_ID('VIDA_FACTURAS_DETALLE','U') IS NULL
  CREATE TABLE VIDA_FACTURAS_DETALLE (
    idBranch          BIGINT        NOT NULL,
    idCuenta          BIGINT        NOT NULL,
    idFactura         BIGINT        NOT NULL,
    Linea             INT           NOT NULL,
    idProducto        BIGINT        NULL,
    Descripcion       VARCHAR(200)  NOT NULL,
    Cantidad          DECIMAL(18,4) NOT NULL,
    PrecioUnitarioVES DECIMAL(18,2) NOT NULL,  -- con IVA
    Alicuota          VARCHAR(10)   NOT NULL,
    PorcentajeIVA     DECIMAL(5,2)  NOT NULL,
    TotalVES          DECIMAL(18,2) NOT NULL,  -- con IVA, antes del descuento global
    CONSTRAINT PK_VIDA_FACTURAS_DETALLE PRIMARY KEY (idBranch, idCuenta, idFactura, Linea),
    CONSTRAINT FK_FACT_DETALLE FOREIGN KEY (idBranch, idCuenta, idFactura) REFERENCES VIDA_FACTURAS (idBranch, idCuenta, idFactura)
  );
GO

-- Inmutabilidad. Lo único que cambia después de emitir es el número de
-- control (una vez): PENDIENTE_CONTROL → EMITIDA. Nada se borra.
IF OBJECT_ID('TR_FACTURAS_INMUTABLE','TR') IS NULL
EXEC('CREATE TRIGGER TR_FACTURAS_INMUTABLE ON VIDA_FACTURAS
AFTER UPDATE, DELETE
AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS (SELECT 1 FROM inserted) AND EXISTS (SELECT 1 FROM deleted)
  BEGIN
    RAISERROR(''VIDA_FACTURAS es inmutable: no se pueden borrar documentos fiscales'', 16, 1);
    ROLLBACK TRANSACTION;
    RETURN;
  END;
  IF EXISTS (
       SELECT d.idBranch, d.idCuenta, d.idFactura, d.idPuntoVenta, d.idPedido, d.TipoDocumento, d.Numero,
              d.idFacturaAfectada, d.Motivo, d.Modalidad, d.EmisorRIF, d.EmisorRazonSocial, d.EmisorDomicilio,
              d.EmisorContribuyenteEspecial, d.ReceptorDocumento, d.ReceptorNombre, d.ReceptorDomicilio,
              d.FechaEmision, d.FechaFiscal, d.FechaOperacion, d.TasaVESporUSD, d.FuenteTasa, d.FechaTasa,
              d.SubtotalVES, d.DescuentoVES, d.PctGeneral, d.BaseGeneralVES, d.IVAGeneralVES, d.PctReducida,
              d.BaseReducidaVES, d.IVAReducidaVES, d.ExentoVES, d.TotalVES, d.IGTFBaseVES, d.IGTFVES,
              d.TotalPagarVES, d.TotalUSD, d.UsuAlta
       FROM deleted d
       EXCEPT
       SELECT i.idBranch, i.idCuenta, i.idFactura, i.idPuntoVenta, i.idPedido, i.TipoDocumento, i.Numero,
              i.idFacturaAfectada, i.Motivo, i.Modalidad, i.EmisorRIF, i.EmisorRazonSocial, i.EmisorDomicilio,
              i.EmisorContribuyenteEspecial, i.ReceptorDocumento, i.ReceptorNombre, i.ReceptorDomicilio,
              i.FechaEmision, i.FechaFiscal, i.FechaOperacion, i.TasaVESporUSD, i.FuenteTasa, i.FechaTasa,
              i.SubtotalVES, i.DescuentoVES, i.PctGeneral, i.BaseGeneralVES, i.IVAGeneralVES, i.PctReducida,
              i.BaseReducidaVES, i.IVAReducidaVES, i.ExentoVES, i.TotalVES, i.IGTFBaseVES, i.IGTFVES,
              i.TotalPagarVES, i.TotalUSD, i.UsuAlta
       FROM inserted i)
     OR EXISTS (SELECT 1 FROM deleted d WHERE d.Status = ''EMITIDA'')
  BEGIN
    RAISERROR(''VIDA_FACTURAS es inmutable: solo se registra una vez el número de control'', 16, 1);
    ROLLBACK TRANSACTION;
    RETURN;
  END;
END');
GO

IF OBJECT_ID('TR_FACTURAS_DETALLE_INMUTABLE','TR') IS NULL
EXEC('CREATE TRIGGER TR_FACTURAS_DETALLE_INMUTABLE ON VIDA_FACTURAS_DETALLE
INSTEAD OF UPDATE, DELETE
AS
BEGIN
  RAISERROR(''VIDA_FACTURAS_DETALLE es inmutable'', 16, 1);
  ROLLBACK TRANSACTION;
END');
GO
