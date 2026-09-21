-- ============================================================
-- Migración 33: Academia VIDA → LMS completo (estilo Udemy/Platzi)
-- Amplía el módulo v1 (cursos planos) a una estructura real:
--   Curso → Módulos → Lecciones (VIDEO/TEXTO/PDF/QUIZ)
--   + targeting por ROL y por USUARIO
--   + tipos de curso (capacitación / normas / gubernamental OBLIGATORIO)
--   + progreso GRANULAR por lección (con tiempos)
--   + comentarios por curso/lección
--   + diplomas/constancias con folio único
-- Reutiliza VIDA_ACADEMIA_CURSOS y VIDA_ACADEMIA_PROGRESO (compat v1).
-- Idempotente. No agrega pantalla nueva (/academia ya existe).
-- ============================================================

-- ── Ampliar el catálogo de cursos ───────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name='Tipo' AND Object_ID=OBJECT_ID('VIDA_ACADEMIA_CURSOS'))
  ALTER TABLE VIDA_ACADEMIA_CURSOS ADD Tipo VARCHAR(30) NOT NULL DEFAULT 'CAPACITACION';  -- CAPACITACION|NORMAS|GUBERNAMENTAL
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name='Obligatorio' AND Object_ID=OBJECT_ID('VIDA_ACADEMIA_CURSOS'))
  ALTER TABLE VIDA_ACADEMIA_CURSOS ADD Obligatorio BIT NOT NULL DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name='FechaLimite' AND Object_ID=OBJECT_ID('VIDA_ACADEMIA_CURSOS'))
  ALTER TABLE VIDA_ACADEMIA_CURSOS ADD FechaLimite DATE NULL;  -- para "fuera de tiempo" en obligatorios
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name='Portada' AND Object_ID=OBJECT_ID('VIDA_ACADEMIA_CURSOS'))
  ALTER TABLE VIDA_ACADEMIA_CURSOS ADD Portada VARCHAR(400) NULL;
GO
-- Visibilidad: TODOS | ROLES | USUARIOS | MIXTO  (cómo se resuelve el targeting)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name='Visibilidad' AND Object_ID=OBJECT_ID('VIDA_ACADEMIA_CURSOS'))
  ALTER TABLE VIDA_ACADEMIA_CURSOS ADD Visibilidad VARCHAR(20) NOT NULL DEFAULT 'TODOS';
GO
-- Audiencia: EMPRESARIO (usuarios del panel) | CLIENTE (app) | AMBOS
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name='Audiencia' AND Object_ID=OBJECT_ID('VIDA_ACADEMIA_CURSOS'))
  ALTER TABLE VIDA_ACADEMIA_CURSOS ADD Audiencia VARCHAR(20) NOT NULL DEFAULT 'EMPRESARIO';
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name='FechaAlta' AND Object_ID=OBJECT_ID('VIDA_ACADEMIA_CURSOS'))
  ALTER TABLE VIDA_ACADEMIA_CURSOS ADD FechaAlta DATETIME NOT NULL DEFAULT GETDATE();
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name='UsuAlta' AND Object_ID=OBJECT_ID('VIDA_ACADEMIA_CURSOS'))
  ALTER TABLE VIDA_ACADEMIA_CURSOS ADD UsuAlta VARCHAR(30) NULL;
GO

-- ── Módulos / Secciones ─────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='VIDA_ACADEMIA_MODULOS' AND type='U')
CREATE TABLE VIDA_ACADEMIA_MODULOS (
  idBranch    BIGINT       NOT NULL,
  idCuenta    BIGINT       NOT NULL,
  idModulo    BIGINT       NOT NULL,
  idCurso     BIGINT       NOT NULL,
  Titulo      VARCHAR(150) NOT NULL,
  Descripcion VARCHAR(600) NULL,
  Orden       INT          NOT NULL DEFAULT 0,
  Status      VARCHAR(20)  NOT NULL DEFAULT 'ACTIVO',
  CONSTRAINT PK_VIDA_ACADEMIA_MODULOS PRIMARY KEY (idBranch, idCuenta, idModulo)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_ACAD_MODULOS_CURSO' AND object_id=OBJECT_ID('VIDA_ACADEMIA_MODULOS'))
  CREATE INDEX IX_ACAD_MODULOS_CURSO ON VIDA_ACADEMIA_MODULOS (idBranch, idCuenta, idCurso);
GO

-- ── Lecciones ───────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='VIDA_ACADEMIA_LECCIONES' AND type='U')
CREATE TABLE VIDA_ACADEMIA_LECCIONES (
  idBranch    BIGINT        NOT NULL,
  idCuenta    BIGINT        NOT NULL,
  idLeccion   BIGINT        NOT NULL,
  idCurso     BIGINT        NOT NULL,
  idModulo    BIGINT        NOT NULL,
  Titulo      VARCHAR(200)  NOT NULL,
  Descripcion VARCHAR(600)  NULL,
  TipoLeccion VARCHAR(20)   NOT NULL DEFAULT 'VIDEO',  -- VIDEO|TEXTO|PDF|QUIZ
  VideoUrl    VARCHAR(500)  NULL,      -- enlace externo embebible (YouTube/Vimeo)
  ArchivoUrl  VARCHAR(500)  NULL,      -- archivo subido (video mp4 o PDF) servido por /uploads
  Contenido   NVARCHAR(MAX) NULL,      -- cuerpo del artículo cuando TipoLeccion=TEXTO
  DuracionMin INT           NOT NULL DEFAULT 0,
  QuizAprob   INT           NOT NULL DEFAULT 70,  -- % mínimo para aprobar un QUIZ
  Orden       INT           NOT NULL DEFAULT 0,
  Status      VARCHAR(20)   NOT NULL DEFAULT 'ACTIVO',
  CONSTRAINT PK_VIDA_ACADEMIA_LECCIONES PRIMARY KEY (idBranch, idCuenta, idLeccion)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_ACAD_LEC_CURSO' AND object_id=OBJECT_ID('VIDA_ACADEMIA_LECCIONES'))
  CREATE INDEX IX_ACAD_LEC_CURSO ON VIDA_ACADEMIA_LECCIONES (idBranch, idCuenta, idCurso);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_ACAD_LEC_MODULO' AND object_id=OBJECT_ID('VIDA_ACADEMIA_LECCIONES'))
  CREATE INDEX IX_ACAD_LEC_MODULO ON VIDA_ACADEMIA_LECCIONES (idBranch, idCuenta, idModulo);
GO

-- ── Quiz: preguntas y opciones ──────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='VIDA_ACADEMIA_QUIZ_PREGUNTAS' AND type='U')
CREATE TABLE VIDA_ACADEMIA_QUIZ_PREGUNTAS (
  idBranch   BIGINT       NOT NULL,
  idCuenta   BIGINT       NOT NULL,
  idPregunta BIGINT       NOT NULL,
  idLeccion  BIGINT       NOT NULL,
  Texto      VARCHAR(500) NOT NULL,
  Orden      INT          NOT NULL DEFAULT 0,
  CONSTRAINT PK_VIDA_ACADEMIA_QUIZ_PREGUNTAS PRIMARY KEY (idBranch, idCuenta, idPregunta)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_ACAD_QP_LEC' AND object_id=OBJECT_ID('VIDA_ACADEMIA_QUIZ_PREGUNTAS'))
  CREATE INDEX IX_ACAD_QP_LEC ON VIDA_ACADEMIA_QUIZ_PREGUNTAS (idBranch, idCuenta, idLeccion);
GO
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='VIDA_ACADEMIA_QUIZ_OPCIONES' AND type='U')
CREATE TABLE VIDA_ACADEMIA_QUIZ_OPCIONES (
  idBranch   BIGINT       NOT NULL,
  idCuenta   BIGINT       NOT NULL,
  idOpcion   BIGINT       NOT NULL,
  idPregunta BIGINT       NOT NULL,
  Texto      VARCHAR(500) NOT NULL,
  EsCorrecta BIT          NOT NULL DEFAULT 0,
  Orden      INT          NOT NULL DEFAULT 0,
  CONSTRAINT PK_VIDA_ACADEMIA_QUIZ_OPCIONES PRIMARY KEY (idBranch, idCuenta, idOpcion)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_ACAD_QO_PREG' AND object_id=OBJECT_ID('VIDA_ACADEMIA_QUIZ_OPCIONES'))
  CREATE INDEX IX_ACAD_QO_PREG ON VIDA_ACADEMIA_QUIZ_OPCIONES (idBranch, idCuenta, idPregunta);
GO

-- ── Targeting por ROL ───────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='VIDA_ACADEMIA_CURSO_ROLES' AND type='U')
CREATE TABLE VIDA_ACADEMIA_CURSO_ROLES (
  idBranch BIGINT      NOT NULL,
  idCuenta BIGINT      NOT NULL,
  idCurso  BIGINT      NOT NULL,
  Rol      VARCHAR(30) NOT NULL,
  CONSTRAINT PK_VIDA_ACADEMIA_CURSO_ROLES PRIMARY KEY (idBranch, idCuenta, idCurso, Rol)
);
GO

-- ── Targeting por USUARIO específico ────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='VIDA_ACADEMIA_CURSO_USUARIOS' AND type='U')
CREATE TABLE VIDA_ACADEMIA_CURSO_USUARIOS (
  idBranch  BIGINT NOT NULL,
  idCuenta  BIGINT NOT NULL,
  idCurso   BIGINT NOT NULL,
  idUsuario BIGINT NOT NULL,
  CONSTRAINT PK_VIDA_ACADEMIA_CURSO_USUARIOS PRIMARY KEY (idBranch, idCuenta, idCurso, idUsuario)
);
GO

-- ── Progreso GRANULAR por lección ───────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='VIDA_ACADEMIA_LECCION_PROGRESO' AND type='U')
CREATE TABLE VIDA_ACADEMIA_LECCION_PROGRESO (
  idBranch        BIGINT   NOT NULL,
  idCuenta        BIGINT   NOT NULL,
  idUsuario       BIGINT   NOT NULL,
  idLeccion       BIGINT   NOT NULL,
  idCurso         BIGINT   NOT NULL,
  Completado      BIT      NOT NULL DEFAULT 0,
  FechaInicio     DATETIME NULL,
  FechaFin        DATETIME NULL,
  SegundosTomados INT      NOT NULL DEFAULT 0,
  QuizPuntaje     INT      NULL,   -- % obtenido en el quiz (si aplica)
  CONSTRAINT PK_VIDA_ACADEMIA_LECCION_PROGRESO PRIMARY KEY (idBranch, idCuenta, idUsuario, idLeccion)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_ACAD_LECPROG_CURSO' AND object_id=OBJECT_ID('VIDA_ACADEMIA_LECCION_PROGRESO'))
  CREATE INDEX IX_ACAD_LECPROG_CURSO ON VIDA_ACADEMIA_LECCION_PROGRESO (idBranch, idCuenta, idUsuario, idCurso);
GO

-- ── Comentarios (por curso, opcionalmente por lección) ──────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='VIDA_ACADEMIA_COMENTARIOS' AND type='U')
CREATE TABLE VIDA_ACADEMIA_COMENTARIOS (
  idBranch     BIGINT        NOT NULL,
  idCuenta     BIGINT        NOT NULL,
  idComentario BIGINT        NOT NULL,
  idCurso      BIGINT        NOT NULL,
  idLeccion    BIGINT        NULL,
  idUsuario    BIGINT        NOT NULL,
  Autor        VARCHAR(150)  NULL,   -- nombre denormalizado para listar rápido
  Texto        NVARCHAR(1000) NOT NULL,
  FechaAlta    DATETIME      NOT NULL DEFAULT GETDATE(),
  Status       VARCHAR(20)   NOT NULL DEFAULT 'ACTIVO',  -- ACTIVO|ELIMINADO
  CONSTRAINT PK_VIDA_ACADEMIA_COMENTARIOS PRIMARY KEY (idBranch, idCuenta, idComentario)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_ACAD_COM_CURSO' AND object_id=OBJECT_ID('VIDA_ACADEMIA_COMENTARIOS'))
  CREATE INDEX IX_ACAD_COM_CURSO ON VIDA_ACADEMIA_COMENTARIOS (idBranch, idCuenta, idCurso);
GO

-- ── Diplomas / Constancias ──────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='VIDA_ACADEMIA_DIPLOMAS' AND type='U')
CREATE TABLE VIDA_ACADEMIA_DIPLOMAS (
  idBranch     BIGINT       NOT NULL,
  idCuenta     BIGINT       NOT NULL,
  idDiploma    BIGINT       NOT NULL,
  Folio        VARCHAR(40)  NOT NULL,   -- único por cuenta (verificable por QR)
  idCurso      BIGINT       NOT NULL,
  idUsuario    BIGINT       NOT NULL,
  NombreUsuario VARCHAR(200) NOT NULL,
  TituloCurso  VARCHAR(200) NOT NULL,
  FechaEmision DATETIME     NOT NULL DEFAULT GETDATE(),
  Status       VARCHAR(20)  NOT NULL DEFAULT 'ACTIVO',
  CONSTRAINT PK_VIDA_ACADEMIA_DIPLOMAS PRIMARY KEY (idBranch, idCuenta, idDiploma)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_ACAD_DIPLOMA_FOLIO' AND object_id=OBJECT_ID('VIDA_ACADEMIA_DIPLOMAS'))
  CREATE UNIQUE INDEX UX_ACAD_DIPLOMA_FOLIO ON VIDA_ACADEMIA_DIPLOMAS (idBranch, idCuenta, Folio);
GO
-- Un diploma por usuario+curso
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_ACAD_DIPLOMA_USR_CURSO' AND object_id=OBJECT_ID('VIDA_ACADEMIA_DIPLOMAS'))
  CREATE UNIQUE INDEX UX_ACAD_DIPLOMA_USR_CURSO ON VIDA_ACADEMIA_DIPLOMAS (idBranch, idCuenta, idUsuario, idCurso);
GO
