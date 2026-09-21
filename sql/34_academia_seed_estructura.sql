-- ============================================================
-- Migración 34: Seed de estructura demo para Academia LMS
-- Le da módulos + lecciones a un par de cursos seed de la mig 27, para que
-- el LMS tenga contenido navegable de ejemplo. Idempotente por curso.
-- También marca el curso 6 (nuevo) como cumplimiento gubernamental OBLIGATORIO.
-- ============================================================

DECLARE @b BIGINT = 1, @c BIGINT = 1;

-- ── Curso 1 "Capacitación en Ventas": 2 módulos con lecciones ───────────────
IF NOT EXISTS (SELECT 1 FROM VIDA_ACADEMIA_MODULOS WHERE idBranch=@b AND idCuenta=@c AND idCurso=1)
BEGIN
  DECLARE @m1 BIGINT = (SELECT ISNULL(MAX(idModulo),0)+1 FROM VIDA_ACADEMIA_MODULOS WHERE idBranch=@b AND idCuenta=@c);
  INSERT INTO VIDA_ACADEMIA_MODULOS (idBranch,idCuenta,idModulo,idCurso,Titulo,Descripcion,Orden,Status)
  VALUES (@b,@c,@m1,1,'Fundamentos de la venta','Lo esencial para arrancar',1,'ACTIVO');
  DECLARE @m2 BIGINT = @m1 + 1;
  INSERT INTO VIDA_ACADEMIA_MODULOS (idBranch,idCuenta,idModulo,idCurso,Titulo,Descripcion,Orden,Status)
  VALUES (@b,@c,@m2,1,'Cierre y seguimiento','Convierte interesados en clientes',2,'ACTIVO');

  DECLARE @l BIGINT = (SELECT ISNULL(MAX(idLeccion),0)+1 FROM VIDA_ACADEMIA_LECCIONES WHERE idBranch=@b AND idCuenta=@c);
  INSERT INTO VIDA_ACADEMIA_LECCIONES (idBranch,idCuenta,idLeccion,idCurso,idModulo,Titulo,Descripcion,TipoLeccion,VideoUrl,Contenido,DuracionMin,Orden,Status) VALUES
    (@b,@c,@l+0,1,@m1,'Bienvenida al curso','Qué vas a aprender','VIDEO','https://www.youtube.com/embed/ScMzIvxBSi4',NULL,3,1,'ACTIVO'),
    (@b,@c,@l+1,1,@m1,'Conoce a tu cliente','Perfil del comprador VIDA','TEXTO',NULL,N'Antes de vender, entiende a quién le vendes. En tu tienda VIDA el cliente busca cercanía, precio justo y buena atención. Identifica sus necesidades y ofrece el Producto PLUS cuando encaje.',6,2,'ACTIVO'),
    (@b,@c,@l+2,1,@m2,'Técnicas de cierre','Cómo cerrar la venta','VIDEO','https://www.youtube.com/embed/ScMzIvxBSi4',NULL,8,1,'ACTIVO'),
    (@b,@c,@l+3,1,@m2,'Evaluación final','Comprueba lo aprendido','QUIZ',NULL,NULL,4,2,'ACTIVO');

  -- Quiz de la lección @l+3
  DECLARE @qp BIGINT = (SELECT ISNULL(MAX(idPregunta),0)+1 FROM VIDA_ACADEMIA_QUIZ_PREGUNTAS WHERE idBranch=@b AND idCuenta=@c);
  INSERT INTO VIDA_ACADEMIA_QUIZ_PREGUNTAS (idBranch,idCuenta,idPregunta,idLeccion,Texto,Orden) VALUES
    (@b,@c,@qp+0,@l+3,'¿Qué debes hacer antes de ofrecer un producto?',1),
    (@b,@c,@qp+1,@l+3,'¿Qué caracteriza al Producto PLUS?',2);
  DECLARE @qo BIGINT = (SELECT ISNULL(MAX(idOpcion),0)+1 FROM VIDA_ACADEMIA_QUIZ_OPCIONES WHERE idBranch=@b AND idCuenta=@c);
  INSERT INTO VIDA_ACADEMIA_QUIZ_OPCIONES (idBranch,idCuenta,idOpcion,idPregunta,Texto,EsCorrecta,Orden) VALUES
    (@b,@c,@qo+0,@qp+0,'Entender su necesidad',1,1),
    (@b,@c,@qo+1,@qp+0,'Subir el precio',0,2),
    (@b,@c,@qo+2,@qp+0,'Ignorarlo',0,3),
    (@b,@c,@qo+3,@qp+1,'Es el de mayor margen',1,1),
    (@b,@c,@qo+4,@qp+1,'Es el más barato',0,2),
    (@b,@c,@qo+5,@qp+1,'No existe',0,3);
END
GO

-- ── Curso 6: cumplimiento gubernamental OBLIGATORIO (ejemplo) ───────────────
DECLARE @b2 BIGINT = 1, @c2 BIGINT = 1;
IF NOT EXISTS (SELECT 1 FROM VIDA_ACADEMIA_CURSOS WHERE idBranch=@b2 AND idCuenta=@c2 AND idCurso=6)
BEGIN
  INSERT INTO VIDA_ACADEMIA_CURSOS
    (idBranch,idCuenta,idCurso,Titulo,Descripcion,Categoria,DuracionMin,Puntos,Orden,Status,Tipo,Obligatorio,FechaLimite,Visibilidad,Audiencia,UsuAlta)
  VALUES
    (@b2,@c2,6,'Cumplimiento SENIAT y facturación','Normativa fiscal obligatoria para toda tienda VIDA. Debes completarlo antes de la fecha límite.','Cumplimiento',25,200,6,'ACTIVO','GUBERNAMENTAL',1,DATEADD(DAY,30,CAST(GETDATE() AS DATE)),'TODOS','EMPRESARIO','SISTEMA');

  DECLARE @m6 BIGINT = (SELECT ISNULL(MAX(idModulo),0)+1 FROM VIDA_ACADEMIA_MODULOS WHERE idBranch=@b2 AND idCuenta=@c2);
  INSERT INTO VIDA_ACADEMIA_MODULOS (idBranch,idCuenta,idModulo,idCurso,Titulo,Descripcion,Orden,Status)
  VALUES (@b2,@c2,@m6,6,'Normativa fiscal','Tus obligaciones como comercio',1,'ACTIVO');

  DECLARE @l6 BIGINT = (SELECT ISNULL(MAX(idLeccion),0)+1 FROM VIDA_ACADEMIA_LECCIONES WHERE idBranch=@b2 AND idCuenta=@c2);
  INSERT INTO VIDA_ACADEMIA_LECCIONES (idBranch,idCuenta,idLeccion,idCurso,idModulo,Titulo,Descripcion,TipoLeccion,Contenido,DuracionMin,Orden,Status) VALUES
    (@b2,@c2,@l6+0,6,@m6,'Obligaciones fiscales básicas','Qué exige el SENIAT','TEXTO',N'Toda tienda debe emitir factura, declarar el IVA y mantener sus libros al día. Este curso es de cumplimiento obligatorio: complétalo antes de la fecha límite para evitar sanciones.',12,1,'ACTIVO'),
    (@b2,@c2,@l6+1,6,@m6,'Emisión de facturas','Cómo facturar correctamente','TEXTO',N'Cada venta debe generar un comprobante válido con los datos fiscales del negocio. Registra tus ventas en el POS VIDA para mantener el control.',13,2,'ACTIVO');
END
GO
