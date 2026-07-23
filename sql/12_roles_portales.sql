-- ============================================================
-- 12 — ROLES Y PORTALES DE LA RED VIDA (T-0030)
-- Formaliza los 4 portales (Corporativo/Empresario/Repartidor/Cliente)
-- y a qué portal pertenece cada rol y cada pantalla del panel web.
-- El runtime del backend usa src/config/portales.js como fuente de verdad;
-- estas tablas persisten el catálogo para administración y reportes.
-- ============================================================

-- ── Catálogo de roles por portal ──────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='VIDA_ROLES' AND type='U')
CREATE TABLE VIDA_ROLES (
  idBranch         BIGINT       NOT NULL,
  idCuenta         BIGINT       NOT NULL,
  RolCodigo        VARCHAR(30)  NOT NULL,   -- = TipoUsuario
  Nombre           VARCHAR(100) NOT NULL,
  Portal           VARCHAR(20)  NOT NULL,   -- CORPORATIVO|EMPRESARIO|REPARTIDOR|CLIENTE
  EsAdministrativo BIT          NOT NULL DEFAULT 0,  -- puede crear/editar
  Descripcion      VARCHAR(300) NULL,
  Status           VARCHAR(20)  NOT NULL DEFAULT 'ACTIVO',
  CONSTRAINT PK_VIDA_ROLES PRIMARY KEY (idBranch, idCuenta, RolCodigo)
);

-- Seed de roles (idBranch/idCuenta = 1,1 — ajusta a tu entorno)
MERGE VIDA_ROLES AS t
USING (VALUES
  ('SUPER_ADMIN',  'Super Administrador',   'CORPORATIVO', 1, 'Control total de la red VIDA'),
  ('ADMIN_PAIS',   'Administrador de País',  'CORPORATIVO', 1, 'Administra la red en un país'),
  ('ADMIN',        'Administrador de Tienda','EMPRESARIO',  1, 'Dueño/gerente de una tienda de la red'),
  ('ADMIN_ESTADO', 'Administrador de Estado','EMPRESARIO',  1, 'Administra tiendas de un estado'),
  ('SUPERVISOR',   'Supervisor',             'EMPRESARIO',  0, 'Supervisa la operación de la tienda'),
  ('CAJERO',       'Cajero',                 'EMPRESARIO',  0, 'Opera el punto de venta'),
  ('REPARTIDOR',   'Repartidor',             'REPARTIDOR',  0, 'Reparte pedidos de delivery'),
  ('CLIENTE',      'Consumidor Final',       'CLIENTE',     0, 'Compra desde la app cliente')
) AS s (RolCodigo, Nombre, Portal, EsAdministrativo, Descripcion)
ON t.idBranch=1 AND t.idCuenta=1 AND t.RolCodigo=s.RolCodigo
WHEN NOT MATCHED THEN
  INSERT (idBranch, idCuenta, RolCodigo, Nombre, Portal, EsAdministrativo, Descripcion)
  VALUES (1, 1, s.RolCodigo, s.Nombre, s.Portal, s.EsAdministrativo, s.Descripcion)
WHEN MATCHED THEN
  UPDATE SET Nombre=s.Nombre, Portal=s.Portal, EsAdministrativo=s.EsAdministrativo, Descripcion=s.Descripcion;

-- ── Portal por pantalla del panel web ─────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('VIDA_CUENTA_PANTALLAS') AND name='Portal')
  ALTER TABLE VIDA_CUENTA_PANTALLAS ADD Portal VARCHAR(20) NULL;
GO

-- Casi todas las pantallas actuales son del portal EMPRESARIO (operación de una
-- tienda). Reportes y Seguridad las comparte el Corporativo; se marcan AMBOS.
UPDATE VIDA_CUENTA_PANTALLAS SET Portal='EMPRESARIO'
  WHERE idBranch=1 AND idCuenta=1 AND Portal IS NULL;

UPDATE VIDA_CUENTA_PANTALLAS SET Portal='AMBOS'
  WHERE idBranch=1 AND idCuenta=1 AND Link IN ('/dashboard','/reportes','/admin','/logistica','/clientes');
