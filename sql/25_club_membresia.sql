-- ============================================================
-- Migración 25: Club Digital VIDA — niveles de membresía
-- El nivel del cliente sube según los puntos GANADOS de por vida
-- (compras + racha de hidratación). Nivel 1 automático al registrarse.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='VIDA_CLUB_NIVELES' AND xtype='U')
CREATE TABLE VIDA_CLUB_NIVELES (
  idBranch    BIGINT       NOT NULL,
  idCuenta    BIGINT       NOT NULL,
  Nivel       INT          NOT NULL,
  Nombre      VARCHAR(60)  NOT NULL,
  MinPuntos   INT          NOT NULL DEFAULT 0,   -- puntos ganados de por vida para alcanzarlo
  Beneficios  VARCHAR(500) NULL,
  Color       VARCHAR(20)  NULL,                 -- color de la tarjeta
  Status      VARCHAR(20)  NOT NULL DEFAULT 'ACTIVO',
  CONSTRAINT PK_VIDA_CLUB_NIVELES PRIMARY KEY (idBranch, idCuenta, Nivel)
);
GO

-- Seed de niveles por defecto (editable por corporativo)
IF NOT EXISTS (SELECT 1 FROM VIDA_CLUB_NIVELES WHERE idBranch=1 AND idCuenta=1)
INSERT INTO VIDA_CLUB_NIVELES (idBranch,idCuenta,Nivel,Nombre,MinPuntos,Beneficios,Color) VALUES
  (1,1,1,'Club Vida Digital',0,     'Tarjeta digital, acumulación de puntos y ofertas del club.', '#54C4E0'),
  (1,1,2,'Plata',            500,   'Todo lo anterior + acceso a Eventos Club Vida y promos del club.', '#94A3B8'),
  (1,1,3,'Oro',              1500,  'Todo lo anterior + talleres de salud, sorteos y envíos preferentes.', '#E0A400'),
  (1,1,4,'Platino',          4000,  'Todo lo anterior + productos exclusivos e invitaciones VIP.', '#475569'),
  (1,1,5,'Diamante',         10000, 'Todo lo anterior + conciertos privados y atención dedicada.', '#0A1E3F');
