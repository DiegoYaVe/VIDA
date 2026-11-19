-- ============================================================
-- 63 — AFILIACIÓN CON KIT Y MENSUALIDAD POR NIVEL (tareas 14, 15 y 16)
-- Audios de Lila (oct 2026): la tienda se afilia con un kit que tiene costo
-- (inscripción) y que se entrega completo o en parte según el nivel; cada mes
-- paga un mantenimiento de 25, 30 o 75 según su nivel (que va por número de
-- productos). Si no paga, se le corta el sistema y al reactivar paga multa.
-- Los cargos son cuentas por cobrar (VIDA_CUENTAS) con origen INSCRIPCION,
-- MENSUALIDAD o MULTA_RECONEXION: no hace falta una tabla de cargos aparte.
-- ============================================================

-- ── Niveles (paquetes de oportunidad) ──
IF OBJECT_ID('VIDA_NIVELES_TIENDA','U') IS NULL
CREATE TABLE VIDA_NIVELES_TIENDA (
  idBranch            BIGINT        NOT NULL,
  idCuenta            BIGINT        NOT NULL,
  idNivel             BIGINT        NOT NULL,
  Nombre              VARCHAR(80)   NOT NULL,
  MaxProductos        INT           NULL,          -- NULL = sin límite
  InscripcionUSD      DECIMAL(18,2) NOT NULL CONSTRAINT DF_NIVEL_INSC DEFAULT 0,
  MensualidadUSD      DECIMAL(18,2) NOT NULL CONSTRAINT DF_NIVEL_MENS DEFAULT 0,
  KitDescripcion      VARCHAR(1000) NULL,          -- qué trae el kit de este nivel
  Orden               INT           NOT NULL CONSTRAINT DF_NIVEL_ORDEN DEFAULT 0,
  Status              VARCHAR(20)   NOT NULL CONSTRAINT DF_NIVEL_STATUS DEFAULT 'ACTIVO',
  FechaAlta           DATETIME      NOT NULL CONSTRAINT DF_NIVEL_FECHA DEFAULT GETUTCDATE(),
  UsuAlta             VARCHAR(30)   NULL,
  CONSTRAINT PK_NIVELES_TIENDA PRIMARY KEY (idBranch, idCuenta, idNivel)
);
GO

-- Los tres niveles del audio, con su mensualidad. El resto (rango de
-- productos, inscripción y kit) lo completa VIDA en Portal Corporativo.
INSERT INTO VIDA_NIVELES_TIENDA (idBranch, idCuenta, idNivel, Nombre, MensualidadUSD, Orden, UsuAlta)
SELECT c.idBranch, c.idCuenta, n.idNivel, n.Nombre, n.Mensualidad, n.idNivel, 'MIGRACION_63'
FROM (SELECT DISTINCT idBranch, idCuenta FROM VIDA_CUENTA_PUNTOS_VENTA) c
CROSS JOIN (VALUES (1, 'Nivel 1', 25.00), (2, 'Nivel 2', 30.00), (3, 'Nivel 3', 75.00)) n(idNivel, Nombre, Mensualidad)
WHERE NOT EXISTS (SELECT 1 FROM VIDA_NIVELES_TIENDA x WHERE x.idBranch=c.idBranch AND x.idCuenta=c.idCuenta);
GO

-- ── Afiliación de cada tienda ──
-- Sin nivel (NULL) la tienda no tiene cobros ni se le corta: así quedan todas
-- las tiendas actuales hasta que VIDA les asigne su nivel.
IF COL_LENGTH('VIDA_CUENTA_PUNTOS_VENTA','idNivel') IS NULL
  ALTER TABLE VIDA_CUENTA_PUNTOS_VENTA ADD
    idNivel           BIGINT        NULL,
    FechaAfiliacion   DATE          NULL,            -- desde cuándo se le cobra (la 1.ª mensualidad es el mes siguiente)
    KitEntrega        VARCHAR(12)   NULL
      CONSTRAINT CK_PV_KIT CHECK (KitEntrega IS NULL OR KitEntrega IN ('PENDIENTE','PARCIAL','COMPLETO')),
    KitNotas          VARCHAR(500)  NULL;
GO
