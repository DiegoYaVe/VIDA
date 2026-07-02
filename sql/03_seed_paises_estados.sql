-- ============================================================
-- Seed: Países y Estados — Venezuela + Colombia
-- idBranch = 1 | idCuenta = 1
-- ============================================================

DECLARE @idBranch BIGINT = 1;
DECLARE @idCuenta BIGINT = 1;

-- ──────────────────────────────────────────────────────────────
-- 1. PAÍSES
-- ──────────────────────────────────────────────────────────────
-- Venezuela → idPais = 1
IF NOT EXISTS (
  SELECT 1 FROM VIDA_CUENTA_PAISES
  WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPais=1
)
INSERT INTO VIDA_CUENTA_PAISES (idBranch, idCuenta, idPais, NombrePais, CodigoISO, UsuAlta)
VALUES (@idBranch, @idCuenta, 1, 'Venezuela', 'VEN', 'SISTEMA');

-- Colombia → idPais = 2
IF NOT EXISTS (
  SELECT 1 FROM VIDA_CUENTA_PAISES
  WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPais=2
)
INSERT INTO VIDA_CUENTA_PAISES (idBranch, idCuenta, idPais, NombrePais, CodigoISO, UsuAlta)
VALUES (@idBranch, @idCuenta, 2, 'Colombia', 'COL', 'SISTEMA');

-- ──────────────────────────────────────────────────────────────
-- 2. ESTADOS DE VENEZUELA (24 estados + Dependencias Federales)
-- ──────────────────────────────────────────────────────────────
-- idEstado 1–25 → Venezuela (idPais = 1)

IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=1)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,1,1,'Amazonas','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=2)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,2,1,'Anzoátegui','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=3)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,3,1,'Apure','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=4)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,4,1,'Aragua','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=5)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,5,1,'Barinas','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=6)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,6,1,'Bolívar','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=7)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,7,1,'Carabobo','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=8)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,8,1,'Cojedes','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=9)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,9,1,'Delta Amacuro','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=10)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,10,1,'Distrito Capital','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=11)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,11,1,'Falcón','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=12)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,12,1,'Guárico','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=13)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,13,1,'Lara','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=14)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,14,1,'Mérida','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=15)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,15,1,'Miranda','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=16)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,16,1,'Monagas','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=17)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,17,1,'Nueva Esparta','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=18)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,18,1,'Portuguesa','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=19)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,19,1,'Sucre','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=20)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,20,1,'Táchira','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=21)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,21,1,'Trujillo','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=22)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,22,1,'La Guaira','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=23)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,23,1,'Yaracuy','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=24)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,24,1,'Zulia','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=25)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,25,1,'Dependencias Federales','SISTEMA');

-- ──────────────────────────────────────────────────────────────
-- 3. ESTADOS / DEPARTAMENTOS DE COLOMBIA (32 depts + Bogotá D.C.)
-- ──────────────────────────────────────────────────────────────
-- idEstado 26–58 → Colombia (idPais = 2)

IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=26)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,26,2,'Amazonas','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=27)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,27,2,'Antioquia','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=28)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,28,2,'Arauca','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=29)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,29,2,'Atlántico','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=30)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,30,2,'Bogotá D.C.','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=31)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,31,2,'Bolívar','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=32)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,32,2,'Boyacá','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=33)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,33,2,'Caldas','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=34)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,34,2,'Caquetá','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=35)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,35,2,'Casanare','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=36)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,36,2,'Cauca','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=37)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,37,2,'Cesar','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=38)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,38,2,'Chocó','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=39)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,39,2,'Córdoba','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=40)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,40,2,'Cundinamarca','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=41)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,41,2,'Guainía','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=42)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,42,2,'Guaviare','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=43)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,43,2,'Huila','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=44)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,44,2,'La Guajira','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=45)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,45,2,'Magdalena','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=46)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,46,2,'Meta','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=47)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,47,2,'Nariño','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=48)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,48,2,'Norte de Santander','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=49)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,49,2,'Putumayo','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=50)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,50,2,'Quindío','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=51)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,51,2,'Risaralda','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=52)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,52,2,'San Andrés y Providencia','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=53)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,53,2,'Santander','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=54)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,54,2,'Sucre','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=55)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,55,2,'Tolima','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=56)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,56,2,'Valle del Cauca','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=57)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,57,2,'Vaupés','SISTEMA');
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_ESTADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=58)
  INSERT INTO VIDA_CUENTA_ESTADOS (idBranch,idCuenta,idEstado,idPais,NombreEstado,UsuAlta) VALUES (@idBranch,@idCuenta,58,2,'Vichada','SISTEMA');

-- ──────────────────────────────────────────────────────────────
-- 4. LIGAR TODAS LAS SUCURSALES EXISTENTES A VENEZUELA
--    idPais = 1 (Venezuela)
--    Ajusta idEstado por sucursal si lo necesitas después
-- ──────────────────────────────────────────────────────────────
UPDATE VIDA_CUENTA_PUNTOS_VENTA
SET
  idPais   = 1,   -- Venezuela
  idEstado = 10,  -- Distrito Capital (Caracas) — cambia por el estado correcto si difiere
  FechaMod = GETDATE(),
  UsuMod   = 'SISTEMA'
WHERE idBranch = @idBranch
  AND idCuenta = @idCuenta
  AND (idPais IS NULL OR idPais = 0);

-- ──────────────────────────────────────────────────────────────
-- 5. VERIFICACIÓN — muestra lo insertado
-- ──────────────────────────────────────────────────────────────
SELECT 'PAISES' AS Tabla, idPais, NombrePais, CodigoISO FROM VIDA_CUENTA_PAISES WHERE idBranch=1 AND idCuenta=1 ORDER BY idPais;
SELECT 'ESTADOS VEN' AS Tabla, idEstado, NombreEstado FROM VIDA_CUENTA_ESTADOS WHERE idBranch=1 AND idCuenta=1 AND idPais=1 ORDER BY NombreEstado;
SELECT 'ESTADOS COL' AS Tabla, idEstado, NombreEstado FROM VIDA_CUENTA_ESTADOS WHERE idBranch=1 AND idCuenta=1 AND idPais=2 ORDER BY NombreEstado;
SELECT 'SUCURSALES' AS Tabla, idPuntoVenta, Nombre, idPais, idEstado FROM VIDA_CUENTA_PUNTOS_VENTA WHERE idBranch=1 AND idCuenta=1 ORDER BY idPuntoVenta;
