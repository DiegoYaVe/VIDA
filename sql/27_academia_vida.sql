-- ============================================================
-- Migración 27: Academia VIDA (capacitación del empresario)
-- Cursos/videos + progreso por usuario. Al completar un curso el
-- empresario suma "puntos de academia" (separados de los puntos del
-- cliente). Agrega la pantalla al sidebar y la asigna a roles admin.
-- ============================================================

-- Catálogo de cursos
IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='VIDA_ACADEMIA_CURSOS' AND xtype='U')
CREATE TABLE VIDA_ACADEMIA_CURSOS (
  idBranch    BIGINT       NOT NULL,
  idCuenta    BIGINT       NOT NULL,
  idCurso     BIGINT       NOT NULL,
  Titulo      VARCHAR(150) NOT NULL,
  Descripcion VARCHAR(600) NULL,
  Categoria   VARCHAR(60)  NULL,
  VideoUrl    VARCHAR(400) NULL,
  DuracionMin INT          NOT NULL DEFAULT 0,
  Puntos      INT          NOT NULL DEFAULT 0,
  Orden       INT          NOT NULL DEFAULT 0,
  Status      VARCHAR(20)  NOT NULL DEFAULT 'ACTIVO',
  CONSTRAINT PK_VIDA_ACADEMIA_CURSOS PRIMARY KEY (idBranch, idCuenta, idCurso)
);
GO

-- Progreso por usuario (empresario)
IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='VIDA_ACADEMIA_PROGRESO' AND xtype='U')
CREATE TABLE VIDA_ACADEMIA_PROGRESO (
  idBranch        BIGINT   NOT NULL,
  idCuenta        BIGINT   NOT NULL,
  idUsuario       BIGINT   NOT NULL,
  idCurso         BIGINT   NOT NULL,
  Completado      BIT      NOT NULL DEFAULT 0,
  FechaCompletado DATETIME NULL,
  CONSTRAINT PK_VIDA_ACADEMIA_PROGRESO PRIMARY KEY (idBranch, idCuenta, idUsuario, idCurso)
);
GO

-- Seed de cursos base (VideoUrl se completa luego desde corporativo)
IF NOT EXISTS (SELECT 1 FROM VIDA_ACADEMIA_CURSOS WHERE idBranch=1 AND idCuenta=1)
INSERT INTO VIDA_ACADEMIA_CURSOS (idBranch,idCuenta,idCurso,Titulo,Descripcion,Categoria,DuracionMin,Puntos,Orden) VALUES
  (1,1,1,'Capacitación en Ventas','Técnicas para vender más y cerrar mejor en tu tienda VIDA.','Ventas',15,100,1),
  (1,1,2,'Atención al Cliente','Cómo dar una experiencia que hace que el cliente regrese.','Servicio',12,100,2),
  (1,1,3,'Marketing para tu tienda','Promociona tu tienda en redes y con los flyers de VIDA.','Marketing',18,100,3),
  (1,1,4,'Finanzas y Rentabilidad','Usa la calculadora de rentabilidad y entiende tu punto de equilibrio.','Finanzas',20,150,4),
  (1,1,5,'Producto PLUS: vende lo que más deja','Por qué el Producto PLUS es tu mayor margen y cómo impulsarlo.','Ventas',10,100,5);
GO

-- Pantalla en el sidebar (idPantalla dinámico) + asignación a roles admin
DECLARE @idBranch BIGINT = 1, @idCuenta BIGINT = 1;
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_PANTALLAS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Link='/academia')
BEGIN
  DECLARE @idPantalla BIGINT = (SELECT ISNULL(MAX(idPantalla),0)+1 FROM VIDA_CUENTA_PANTALLAS WHERE idBranch=@idBranch AND idCuenta=@idCuenta);
  INSERT INTO VIDA_CUENTA_PANTALLAS (idBranch,idCuenta,idPantalla,Nombre,Modulo,Link,Icono,OrdenPantalla,StatusPantalla,UsuAlta)
  VALUES (@idBranch,@idCuenta,@idPantalla,'Academia VIDA','ACADEMIA','/academia','GraduationCap',53,'ACTIVO','SISTEMA');

  -- Dar acceso a los dueños/gerentes (no cajeros)
  INSERT INTO VIDA_CUENTA_PANTALLAS_ACCESOS_USUARIO (idBranch,idCuenta,idPantalla,idUsuario,StatusAcceso,UsuAlta,Status)
  SELECT @idBranch,@idCuenta,@idPantalla,u.idUsuario,'ACTIVO','SISTEMA','ACTIVO'
  FROM VIDA_CUENTA_USUARIOS u
  WHERE u.idBranch=@idBranch AND u.idCuenta=@idCuenta AND u.Status='ACTIVO'
    AND u.TipoUsuario IN ('SUPER_ADMIN','ADMIN_PAIS','ADMIN_ESTADO','ADMIN');
END
