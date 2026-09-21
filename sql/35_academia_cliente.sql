-- ============================================================
-- Migración 35: Academia para el CONSUMIDOR (app cliente)
-- El progreso, comentarios y diplomas de Academia se compartían entre el panel
-- (VIDA_CUENTA_USUARIOS → idUsuario) y ahora también el cliente
-- (VIDA_APP_CLIENTES → idCliente). Como ambos ids son secuencias distintas que
-- pueden colisionar (usuario 5 ≠ cliente 5), se agrega TipoActor para
-- distinguir el dueño del progreso y evitar choques de PK.
--   TipoActor: 'EMPRESARIO' (panel) | 'CLIENTE' (app).
-- Las filas existentes quedan como 'EMPRESARIO' (default). Idempotente.
-- ============================================================

-- ── VIDA_ACADEMIA_PROGRESO: TipoActor en la PK ──────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name='TipoActor' AND Object_ID=OBJECT_ID('VIDA_ACADEMIA_PROGRESO'))
BEGIN
  ALTER TABLE VIDA_ACADEMIA_PROGRESO ADD TipoActor VARCHAR(20) NOT NULL DEFAULT 'EMPRESARIO';
  ALTER TABLE VIDA_ACADEMIA_PROGRESO DROP CONSTRAINT PK_VIDA_ACADEMIA_PROGRESO;
  ALTER TABLE VIDA_ACADEMIA_PROGRESO ADD CONSTRAINT PK_VIDA_ACADEMIA_PROGRESO
    PRIMARY KEY (idBranch, idCuenta, TipoActor, idUsuario, idCurso);
END
GO

-- ── VIDA_ACADEMIA_LECCION_PROGRESO: TipoActor en la PK ──────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name='TipoActor' AND Object_ID=OBJECT_ID('VIDA_ACADEMIA_LECCION_PROGRESO'))
BEGIN
  ALTER TABLE VIDA_ACADEMIA_LECCION_PROGRESO ADD TipoActor VARCHAR(20) NOT NULL DEFAULT 'EMPRESARIO';
  ALTER TABLE VIDA_ACADEMIA_LECCION_PROGRESO DROP CONSTRAINT PK_VIDA_ACADEMIA_LECCION_PROGRESO;
  ALTER TABLE VIDA_ACADEMIA_LECCION_PROGRESO ADD CONSTRAINT PK_VIDA_ACADEMIA_LECCION_PROGRESO
    PRIMARY KEY (idBranch, idCuenta, TipoActor, idUsuario, idLeccion);
END
GO

-- ── VIDA_ACADEMIA_DIPLOMAS: TipoActor + índice único usuario+curso por actor ─
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name='TipoActor' AND Object_ID=OBJECT_ID('VIDA_ACADEMIA_DIPLOMAS'))
BEGIN
  ALTER TABLE VIDA_ACADEMIA_DIPLOMAS ADD TipoActor VARCHAR(20) NOT NULL DEFAULT 'EMPRESARIO';
END
GO
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_ACAD_DIPLOMA_USR_CURSO' AND object_id=OBJECT_ID('VIDA_ACADEMIA_DIPLOMAS'))
  DROP INDEX UX_ACAD_DIPLOMA_USR_CURSO ON VIDA_ACADEMIA_DIPLOMAS;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_ACAD_DIPLOMA_ACTOR_CURSO' AND object_id=OBJECT_ID('VIDA_ACADEMIA_DIPLOMAS'))
  CREATE UNIQUE INDEX UX_ACAD_DIPLOMA_ACTOR_CURSO
    ON VIDA_ACADEMIA_DIPLOMAS (idBranch, idCuenta, TipoActor, idUsuario, idCurso);
GO

-- ── VIDA_ACADEMIA_COMENTARIOS: TipoActor (columna simple, para autorizar borrado) ─
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name='TipoActor' AND Object_ID=OBJECT_ID('VIDA_ACADEMIA_COMENTARIOS'))
  ALTER TABLE VIDA_ACADEMIA_COMENTARIOS ADD TipoActor VARCHAR(20) NOT NULL DEFAULT 'EMPRESARIO';
GO

-- ── Curso de ejemplo para clientes (audiencia CLIENTE) ──────────────────────
DECLARE @b BIGINT = 1, @c BIGINT = 1;
IF NOT EXISTS (SELECT 1 FROM VIDA_ACADEMIA_CURSOS WHERE idBranch=@b AND idCuenta=@c AND idCurso=7)
BEGIN
  INSERT INTO VIDA_ACADEMIA_CURSOS
    (idBranch,idCuenta,idCurso,Titulo,Descripcion,Categoria,DuracionMin,Puntos,Orden,Status,Tipo,Obligatorio,Visibilidad,Audiencia,UsuAlta)
  VALUES
    (@b,@c,7,'Bienvenido a VIDA','Conoce los beneficios de ser cliente VIDA: puntos, Club, salud y más.','Cliente',8,50,7,'ACTIVO','CAPACITACION',0,'TODOS','CLIENTE','SISTEMA');

  DECLARE @m7 BIGINT = (SELECT ISNULL(MAX(idModulo),0)+1 FROM VIDA_ACADEMIA_MODULOS WHERE idBranch=@b AND idCuenta=@c);
  INSERT INTO VIDA_ACADEMIA_MODULOS (idBranch,idCuenta,idModulo,idCurso,Titulo,Descripcion,Orden,Status)
  VALUES (@b,@c,@m7,7,'Tus beneficios','Todo lo que ganas con VIDA',1,'ACTIVO');

  DECLARE @l7 BIGINT = (SELECT ISNULL(MAX(idLeccion),0)+1 FROM VIDA_ACADEMIA_LECCIONES WHERE idBranch=@b AND idCuenta=@c);
  INSERT INTO VIDA_ACADEMIA_LECCIONES (idBranch,idCuenta,idLeccion,idCurso,idModulo,Titulo,Descripcion,TipoLeccion,VideoUrl,Contenido,DuracionMin,Orden,Status) VALUES
    (@b,@c,@l7+0,7,@m7,'Gana puntos en cada compra','Cómo funcionan los puntos VIDA','TEXTO',NULL,N'Cada compra que haces suma puntos VIDA que luego canjeas por descuentos y premios. Mientras más compras, más ganas.',4,1,'ACTIVO'),
    (@b,@c,@l7+1,7,@m7,'Únete al Club Vida','Beneficios por nivel','VIDEO','https://www.youtube.com/embed/ScMzIvxBSi4',NULL,4,2,'ACTIVO');
END
GO
