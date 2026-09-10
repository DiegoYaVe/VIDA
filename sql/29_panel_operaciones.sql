-- ============================================================
-- Migración 29: Pantalla "Operaciones" (panel admin unificado)
-- Gestiona recargas de servicios, canjes de premios y vencimiento
-- de puntos. Se asigna a roles de red / ops (corporativo/regional).
-- ============================================================

DECLARE @idBranch BIGINT = 1, @idCuenta BIGINT = 1;
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_PANTALLAS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Link='/operaciones')
BEGIN
  DECLARE @idPantalla BIGINT = (SELECT ISNULL(MAX(idPantalla),0)+1 FROM VIDA_CUENTA_PANTALLAS WHERE idBranch=@idBranch AND idCuenta=@idCuenta);
  INSERT INTO VIDA_CUENTA_PANTALLAS (idBranch,idCuenta,idPantalla,Nombre,Modulo,Link,Icono,OrdenPantalla,StatusPantalla,UsuAlta)
  VALUES (@idBranch,@idCuenta,@idPantalla,'Operaciones','OPERACIONES','/operaciones','ClipboardList',54,'ACTIVO','SISTEMA');

  INSERT INTO VIDA_CUENTA_PANTALLAS_ACCESOS_USUARIO (idBranch,idCuenta,idPantalla,idUsuario,StatusAcceso,UsuAlta,Status)
  SELECT @idBranch,@idCuenta,@idPantalla,u.idUsuario,'ACTIVO','SISTEMA','ACTIVO'
  FROM VIDA_CUENTA_USUARIOS u
  WHERE u.idBranch=@idBranch AND u.idCuenta=@idCuenta AND u.Status='ACTIVO'
    AND u.TipoUsuario IN ('SUPER_ADMIN','ADMIN_PAIS','ADMIN_ESTADO');
END
