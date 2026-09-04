-- ============================================================
-- Migración 19: Finanzas por tienda (Calculadora de Rentabilidad)
-- El empresario carga sus costos UNA vez y el sistema calcula
-- punto de equilibrio, rentabilidad en 3 modos y meta diaria.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='VIDA_TIENDA_FINANZAS' AND xtype='U')
CREATE TABLE VIDA_TIENDA_FINANZAS (
  idBranch                BIGINT        NOT NULL,
  idCuenta                BIGINT        NOT NULL,
  idPuntoVenta            BIGINT        NOT NULL,
  CostosFijosMensualUSD   DECIMAL(18,2) NOT NULL DEFAULT 0,  -- alquiler + sueldos + servicios
  PctComisionDelivery     DECIMAL(5,2)  NOT NULL DEFAULT 0,  -- % sobre la venta
  PctImpuestos            DECIMAL(5,2)  NOT NULL DEFAULT 0,  -- % sobre la venta
  PctPasarela             DECIMAL(5,2)  NOT NULL DEFAULT 0,  -- % sobre la venta
  InversionInicialUSD     DECIMAL(18,2) NOT NULL DEFAULT 0,  -- para el ROI
  MetaGananciaMensualUSD  DECIMAL(18,2) NOT NULL DEFAULT 0,  -- objetivo de ganancia
  FechaAlta               DATETIME      NOT NULL DEFAULT GETDATE(),
  UsuAlta                 VARCHAR(20)   NULL,
  FechaMod                DATETIME      NULL,
  UsuMod                  VARCHAR(20)   NULL,
  CONSTRAINT PK_VIDA_TIENDA_FINANZAS PRIMARY KEY (idBranch, idCuenta, idPuntoVenta)
);
