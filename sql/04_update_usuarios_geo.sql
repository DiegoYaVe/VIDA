-- ============================================================
-- Actualizar campos geográficos de usuarios existentes
-- idBranch = 1 | idCuenta = 1
-- Venezuela = idPais 1 | Distrito Capital = idEstado 10
-- ============================================================

-- ── Todos los usuarios → Venezuela por defecto ───────────────
UPDATE VIDA_CUENTA_USUARIOS
SET idPais = 1
WHERE idBranch = 1 AND idCuenta = 1 AND idPais IS NULL;

-- ── Usuarios con sucursal asignada → Distrito Capital ────────
-- (Sucursales 1, 2, 3 fueron ligadas a idEstado=10 en el script anterior)
UPDATE VIDA_CUENTA_USUARIOS
SET idEstado = 10
WHERE idBranch = 1 AND idCuenta = 1
  AND idPuntoVenta IN (1, 2, 3)
  AND idEstado IS NULL;

-- ── Usuarios sin sucursal (admins de nivel alto) → Distrito Capital ──
UPDATE VIDA_CUENTA_USUARIOS
SET idEstado = 10
WHERE idBranch = 1 AND idCuenta = 1
  AND idEstado IS NULL;

-- ── Ajustes individuales por rol ─────────────────────────────
-- SUPER_ADMIN y ADMIN_PAIS no necesitan idEstado ni idPuntoVenta
-- (opcional: limpiarlos para que vean todo)
UPDATE VIDA_CUENTA_USUARIOS
SET idEstado = NULL, idPuntoVenta = NULL
WHERE idBranch = 1 AND idCuenta = 1
  AND TipoUsuario IN ('SUPER_ADMIN', 'ADMIN_PAIS');

-- ── El usuario idUsuario=14 (TEST ADMIN_ESTADO) → asignarle estado
UPDATE VIDA_CUENTA_USUARIOS
SET idEstado = 10  -- Distrito Capital; cambia al estado real que corresponda
WHERE idBranch = 1 AND idCuenta = 1 AND idUsuario = 14;

-- ── Verificación final ────────────────────────────────────────
SELECT idUsuario, Nombre, TipoUsuario, idPais, idEstado, idPuntoVenta
FROM VIDA_CUENTA_USUARIOS
WHERE idBranch = 1 AND idCuenta = 1
ORDER BY idUsuario;
