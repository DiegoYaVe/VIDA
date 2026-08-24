-- ============================================================
-- Migración 16: Catálogo de Ciudades (por Estado)
-- Reunión VIDA 21-ago-2026, punto #6:
--   "Al crear una tienda, la ciudad en un select por estado."
--
-- Datos 100% reales: ciudades y localidades de Venezuela
-- (capitales de estado + principales municipios/poblaciones).
-- idBranch = 1 | idCuenta = 1 | idPais = 1 (Venezuela)
-- Los idEstado corresponden a sql/03_seed_paises_estados.sql (1..25).
-- ============================================================

DECLARE @idBranch BIGINT = 1;
DECLARE @idCuenta BIGINT = 1;

-- ── 1. Tabla de Ciudades ────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='VIDA_CUENTA_CIUDADES' AND xtype='U')
CREATE TABLE VIDA_CUENTA_CIUDADES (
  idBranch     BIGINT        NOT NULL,
  idCuenta     BIGINT        NOT NULL,
  idCiudad     BIGINT        NOT NULL,
  idEstado     BIGINT        NOT NULL,
  idPais       BIGINT        NOT NULL,
  NombreCiudad VARCHAR(120)  NOT NULL,
  Status       VARCHAR(20)   NOT NULL DEFAULT 'ACTIVO',
  FechaAlta    DATETIME      NOT NULL DEFAULT GETDATE(),
  UsuAlta      VARCHAR(20)   NULL,
  FechaMod     DATETIME      NULL,
  UsuMod       VARCHAR(20)   NULL,
  CONSTRAINT PK_VIDA_CUENTA_CIUDADES PRIMARY KEY (idBranch, idCuenta, idCiudad)
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_CIUDADES_ESTADO' AND object_id=OBJECT_ID('VIDA_CUENTA_CIUDADES'))
  CREATE INDEX IX_CIUDADES_ESTADO ON VIDA_CUENTA_CIUDADES (idBranch, idCuenta, idEstado);

-- ── 2. Columna idCiudad en Puntos de Venta (tienda) ─────────
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('VIDA_CUENTA_PUNTOS_VENTA') AND name = 'idCiudad'
)
  ALTER TABLE VIDA_CUENTA_PUNTOS_VENTA ADD idCiudad BIGINT NULL;

-- ── 3. Seed de ciudades reales de Venezuela ─────────────────
-- Solo se inserta si aún no hay ciudades cargadas para esta cuenta.
IF NOT EXISTS (SELECT 1 FROM VIDA_CUENTA_CIUDADES WHERE idBranch=@idBranch AND idCuenta=@idCuenta)
BEGIN
  ;WITH Ciudades(idEstado, Nombre) AS (
    SELECT * FROM (VALUES
      -- 1. Amazonas (cap. Puerto Ayacucho)
      (1,'Puerto Ayacucho'),(1,'Maroa'),(1,'San Fernando de Atabapo'),
      (1,'San Juan de Manapiare'),(1,'La Esmeralda'),(1,'Isla Ratón'),
      -- 2. Anzoátegui (cap. Barcelona)
      (2,'Barcelona'),(2,'Puerto La Cruz'),(2,'Lechería'),(2,'Guanta'),
      (2,'El Tigre'),(2,'Anaco'),(2,'Cantaura'),(2,'Pariaguán'),
      (2,'Aragua de Barcelona'),(2,'San José de Guanipa'),(2,'Puerto Píritu'),
      (2,'Clarines'),(2,'Onoto'),(2,'Soledad'),
      -- 3. Apure (cap. San Fernando de Apure)
      (3,'San Fernando de Apure'),(3,'Achaguas'),(3,'Biruaca'),
      (3,'Guasdualito'),(3,'Elorza'),(3,'Bruzual'),
      -- 4. Aragua (cap. Maracay)
      (4,'Maracay'),(4,'Turmero'),(4,'La Victoria'),(4,'El Limón'),
      (4,'Cagua'),(4,'Palo Negro'),(4,'Villa de Cura'),(4,'San Mateo'),
      (4,'Santa Rita'),(4,'Las Tejerías'),(4,'La Colonia Tovar'),
      (4,'El Consejo'),(4,'Magdaleno'),(4,'Santa Cruz de Aragua'),
      -- 5. Barinas (cap. Barinas)
      (5,'Barinas'),(5,'Barinitas'),(5,'Socopó'),(5,'Sabaneta'),
      (5,'Santa Bárbara de Barinas'),(5,'Ciudad Bolivia'),(5,'Libertad'),(5,'Arismendi'),
      -- 6. Bolívar (cap. Ciudad Bolívar)
      (6,'Ciudad Bolívar'),(6,'Ciudad Guayana'),(6,'Puerto Ordaz'),(6,'San Félix'),
      (6,'Upata'),(6,'El Callao'),(6,'Tumeremo'),(6,'Guasipati'),
      (6,'Caicara del Orinoco'),(6,'Santa Elena de Uairén'),(6,'El Palmar'),(6,'Ciudad Piar'),
      -- 7. Carabobo (cap. Valencia)
      (7,'Valencia'),(7,'Puerto Cabello'),(7,'Guacara'),(7,'Los Guayos'),
      (7,'Naguanagua'),(7,'San Diego'),(7,'Tocuyito'),(7,'Bejuma'),
      (7,'Morón'),(7,'Mariara'),(7,'Güigüe'),(7,'Montalbán'),
      -- 8. Cojedes (cap. San Carlos)
      (8,'San Carlos'),(8,'Tinaquillo'),(8,'El Baúl'),(8,'Tinaco'),
      (8,'Las Vegas'),(8,'El Pao'),
      -- 9. Delta Amacuro (cap. Tucupita)
      (9,'Tucupita'),(9,'Pedernales'),(9,'Curiapo'),(9,'Sierra Imataca'),
      -- 10. Distrito Capital
      (10,'Caracas'),(10,'El Junquito'),
      -- 11. Falcón (cap. Coro)
      (11,'Santa Ana de Coro'),(11,'Punto Fijo'),(11,'La Vela de Coro'),(11,'Dabajuro'),
      (11,'Churuguara'),(11,'Tucacas'),(11,'Chichiriviche'),(11,'Pueblo Nuevo'),
      (11,'Judibana'),(11,'Puerto Cumarebo'),(11,'Yaracal'),(11,'Mene de Mauroa'),
      -- 12. Guárico (cap. San Juan de los Morros)
      (12,'San Juan de los Morros'),(12,'Calabozo'),(12,'Valle de la Pascua'),
      (12,'Zaraza'),(12,'Altagracia de Orituco'),(12,'El Sombrero'),
      (12,'Las Mercedes'),(12,'Tucupido'),(12,'Camaguán'),(12,'Chaguaramas'),(12,'Ortiz'),
      -- 13. Lara (cap. Barquisimeto)
      (13,'Barquisimeto'),(13,'Carora'),(13,'El Tocuyo'),(13,'Quíbor'),
      (13,'Cabudare'),(13,'Sanare'),(13,'Duaca'),(13,'Sarare'),(13,'Siquisique'),
      -- 14. Mérida (cap. Mérida)
      (14,'Mérida'),(14,'El Vigía'),(14,'Ejido'),(14,'Tovar'),
      (14,'Bailadores'),(14,'Lagunillas'),(14,'Santa Cruz de Mora'),(14,'Timotes'),
      (14,'Mucuchíes'),(14,'Tabay'),(14,'Zea'),(14,'Nueva Bolivia'),
      -- 15. Miranda (cap. Los Teques)
      (15,'Los Teques'),(15,'Guarenas'),(15,'Guatire'),(15,'Petare'),
      (15,'Charallave'),(15,'Cúa'),(15,'Ocumare del Tuy'),(15,'Santa Teresa del Tuy'),
      (15,'San Antonio de los Altos'),(15,'Carrizal'),(15,'Baruta'),(15,'El Hatillo'),
      (15,'Chacao'),(15,'Higuerote'),(15,'Río Chico'),(15,'Santa Lucía'),
      (15,'Caucagua'),(15,'San Francisco de Yare'),(15,'Tácata'),
      -- 16. Monagas (cap. Maturín)
      (16,'Maturín'),(16,'Punta de Mata'),(16,'Caripito'),(16,'Caripe'),
      (16,'Temblador'),(16,'Aragua de Maturín'),(16,'Barrancas del Orinoco'),
      (16,'Santa Bárbara'),(16,'Quiriquire'),(16,'San Antonio de Maturín'),(16,'Aguasay'),
      -- 17. Nueva Esparta (cap. La Asunción)
      (17,'La Asunción'),(17,'Porlamar'),(17,'Pampatar'),(17,'Juan Griego'),
      (17,'Punta de Piedras'),(17,'San Juan Bautista'),(17,'Villa Rosa'),
      (17,'El Valle del Espíritu Santo'),(17,'Santa Ana'),(17,'Boca del Río'),
      -- 18. Portuguesa (cap. Guanare)
      (18,'Guanare'),(18,'Acarigua'),(18,'Araure'),(18,'Villa Bruzual'),
      (18,'Turén'),(18,'Píritu'),(18,'Ospino'),(18,'Biscucuy'),
      (18,'Guanarito'),(18,'Agua Blanca'),(18,'Papelón'),
      -- 19. Sucre (cap. Cumaná)
      (19,'Cumaná'),(19,'Carúpano'),(19,'Güiria'),(19,'Cariaco'),
      (19,'Río Caribe'),(19,'Casanay'),(19,'Marigüitar'),(19,'San Antonio del Golfo'),
      (19,'Yaguaraparo'),(19,'Araya'),(19,'Cumanacoa'),(19,'Irapa'),
      -- 20. Táchira (cap. San Cristóbal)
      (20,'San Cristóbal'),(20,'Táriba'),(20,'La Fría'),(20,'Rubio'),
      (20,'San Juan de Colón'),(20,'La Grita'),(20,'Michelena'),(20,'Palmira'),
      (20,'San Antonio del Táchira'),(20,'Ureña'),(20,'Santa Ana del Táchira'),
      (20,'Pregonero'),(20,'Cordero'),(20,'Capacho'),
      -- 21. Trujillo (cap. Trujillo)
      (21,'Trujillo'),(21,'Valera'),(21,'Boconó'),(21,'Carvajal'),
      (21,'La Puerta'),(21,'Sabana de Mendoza'),(21,'Motatán'),(21,'Pampán'),
      (21,'Escuque'),(21,'Betijoque'),(21,'Isnotú'),(21,'Monay'),
      -- 22. La Guaira (antes Vargas; cap. La Guaira)
      (22,'La Guaira'),(22,'Maiquetía'),(22,'Catia La Mar'),(22,'Macuto'),
      (22,'Caraballeda'),(22,'Naiguatá'),(22,'Carayaca'),(22,'Camurí Grande'),
      -- 23. Yaracuy (cap. San Felipe)
      (23,'San Felipe'),(23,'Yaritagua'),(23,'Chivacoa'),(23,'Nirgua'),
      (23,'Cocorote'),(23,'Independencia'),(23,'Aroa'),(23,'Urachiche'),
      (23,'Sabana de Parra'),(23,'Guama'),(23,'Farriar'),
      -- 24. Zulia (cap. Maracaibo)
      (24,'Maracaibo'),(24,'San Francisco'),(24,'Cabimas'),(24,'Ciudad Ojeda'),
      (24,'Santa Bárbara del Zulia'),(24,'Machiques'),(24,'La Concepción'),
      (24,'Villa del Rosario'),(24,'Santa Rita'),(24,'Lagunillas'),(24,'Bachaquero'),
      (24,'Mene Grande'),(24,'San Rafael de El Moján'),(24,'Encontrados'),
      (24,'Sinamaica'),(24,'Bobures'),(24,'Casigua El Cubo'),
      -- 25. Dependencias Federales
      (25,'Los Roques'),(25,'La Tortuga'),(25,'La Blanquilla')
    ) v(idEstado, Nombre)
  )
  INSERT INTO VIDA_CUENTA_CIUDADES (idBranch, idCuenta, idCiudad, idEstado, idPais, NombreCiudad, UsuAlta)
  SELECT
    @idBranch, @idCuenta,
    ROW_NUMBER() OVER (ORDER BY c.idEstado, c.Nombre),  -- idCiudad secuencial
    c.idEstado, e.idPais, c.Nombre, 'SISTEMA'
  FROM Ciudades c
  JOIN VIDA_CUENTA_ESTADOS e
    ON e.idBranch=@idBranch AND e.idCuenta=@idCuenta AND e.idEstado=c.idEstado;
END

-- ── 4. Verificación ─────────────────────────────────────────
SELECT 'CIUDADES/ESTADO' AS Tabla, e.NombreEstado, COUNT(*) AS TotalCiudades
FROM VIDA_CUENTA_CIUDADES c
JOIN VIDA_CUENTA_ESTADOS e ON e.idBranch=c.idBranch AND e.idCuenta=c.idCuenta AND e.idEstado=c.idEstado
WHERE c.idBranch=1 AND c.idCuenta=1
GROUP BY e.NombreEstado
ORDER BY e.NombreEstado;

SELECT 'TOTAL' AS Tabla, COUNT(*) AS Ciudades FROM VIDA_CUENTA_CIUDADES WHERE idBranch=1 AND idCuenta=1;
