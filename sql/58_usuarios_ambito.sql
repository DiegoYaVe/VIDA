-- 58_usuarios_ambito.sql
-- Completa el ámbito de los usuarios del panel creados antes de la jerarquía
-- (2026-10-09): la tienda define el estado y el país de los roles de tienda,
-- y el estado define el país. Así los Admin País / Admin Estado ven y
-- gestionan a todos los usuarios de su zona. Idempotente.

-- Roles de tienda: estado y país de su tienda
UPDATE u SET u.idEstado = pv.idEstado, u.idPais = pv.idPais
FROM VIDA_CUENTA_USUARIOS u
JOIN VIDA_CUENTA_PUNTOS_VENTA pv
  ON pv.idBranch=u.idBranch AND pv.idCuenta=u.idCuenta AND pv.idPuntoVenta=u.idPuntoVenta
WHERE u.TipoUsuario IN ('ADMIN','SUPERVISOR','CAJERO','CASHIER')
  AND pv.idEstado IS NOT NULL AND pv.idPais IS NOT NULL
  AND (u.idEstado IS NULL OR u.idEstado<>pv.idEstado OR u.idPais IS NULL OR u.idPais<>pv.idPais);
GO

-- Con estado y sin país: el país de su estado
UPDATE u SET u.idPais = e.idPais
FROM VIDA_CUENTA_USUARIOS u
JOIN VIDA_CUENTA_ESTADOS e ON e.idBranch=u.idBranch AND e.idCuenta=u.idCuenta AND e.idEstado=u.idEstado
WHERE u.idEstado IS NOT NULL AND u.idPais IS NULL;
GO
