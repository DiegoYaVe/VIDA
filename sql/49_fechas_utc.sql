-- SQL Server 2016+. Requiere 01..48. Todas las fechas del sistema pasan a UTC.
-- Hasta ahora casi todo se guardaba con GETDATE() (hora local del servidor de
-- BD: UTC-7 en QA) y el driver lo leía como UTC, así que las horas salían
-- corridas; caja, cuentas, tasas y ventas del POS ya iban en UTC.
--  1) Los valores por defecto getdate()/sysdatetime() pasan a UTC.
--  2) Convierte UNA sola vez (marca FECHAS_UTC en VIDA_SISTEMA_MARCAS) las
--     columnas que estaban en hora local. Las que ya estaban en UTC no se
--     tocan; las mixtas se deciden fila por fila. VIDA_AUDIT_LOG no se toca:
--     es inmutable (TR_AUDIT_LOG_INMUTABLE) y su hora UTC va firmada en _ts.
-- El desfase se toma del reloj del servidor al migrar. Si el servidor usa
-- horario de verano, las filas guardadas en el otro período quedan corridas
-- una hora (en QA todo se guardó en UTC-7, sin ese problema).
-- APLICAR CON EL BACKEND DETENIDO y desplegar el backend nuevo enseguida: el
-- backend anterior seguiría escribiendo en hora local.
SET XACT_ABORT ON;
SET NOCOUNT ON;
BEGIN TRANSACTION;

IF OBJECT_ID('VIDA_SISTEMA_MARCAS','U') IS NULL
  CREATE TABLE VIDA_SISTEMA_MARCAS (
    Clave     VARCHAR(60)   NOT NULL CONSTRAINT PK_VIDA_SISTEMA_MARCAS PRIMARY KEY,
    Valor     NVARCHAR(400) NULL,
    FechaAlta DATETIME      NOT NULL CONSTRAINT DF_SISTEMA_MARCAS_FECHA DEFAULT (GETUTCDATE())
  );

-- 1) Valores por defecto en UTC (conserva el nombre de cada restricción)
DECLARE @ddl NVARCHAR(MAX) = N'';
SELECT @ddl += N'ALTER TABLE ' + QUOTENAME(SCHEMA_NAME(t.schema_id)) + N'.' + QUOTENAME(t.name)
  + N' DROP CONSTRAINT ' + QUOTENAME(dc.name) + N'; ALTER TABLE ' + QUOTENAME(SCHEMA_NAME(t.schema_id)) + N'.' + QUOTENAME(t.name)
  + N' ADD CONSTRAINT ' + QUOTENAME(dc.name) + N' DEFAULT ('
  + CASE WHEN ty.name = 'datetime2' THEN N'SYSUTCDATETIME()' ELSE N'GETUTCDATE()' END
  + N') FOR ' + QUOTENAME(c.name) + N'; '
FROM sys.default_constraints dc
JOIN sys.tables t   ON t.object_id = dc.parent_object_id
JOIN sys.columns c  ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
JOIN sys.types ty   ON ty.user_type_id = c.user_type_id
WHERE LOWER(REPLACE(dc.definition, ' ', '')) IN ('(getdate())', '((getdate()))', '(sysdatetime())', '(current_timestamp)');
EXEC sp_executesql @ddl;

-- 2) Datos guardados en hora local → UTC (una sola vez)
DECLARE @min INT = DATEDIFF(MINUTE, GETDATE(), GETUTCDATE());   -- minutos a sumar (QA: 420)
IF NOT EXISTS (SELECT 1 FROM VIDA_SISTEMA_MARCAS WHERE Clave = 'FECHAS_UTC')
BEGIN
  IF @min <> 0
  BEGIN
    UPDATE HW_BRANCH SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta), FechaMod=DATEADD(MINUTE,@min,FechaMod);
    UPDATE HW_BRANCH_CUENTA SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta), FechaMod=DATEADD(MINUTE,@min,FechaMod);
    UPDATE VIDA_ACADEMIA_COMENTARIOS SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta);
    UPDATE VIDA_ACADEMIA_CURSOS SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta);
    UPDATE VIDA_ACADEMIA_DIPLOMAS SET FechaEmision=DATEADD(MINUTE,@min,FechaEmision);
    UPDATE VIDA_ACADEMIA_LECCION_PROGRESO SET FechaFin=DATEADD(MINUTE,@min,FechaFin), FechaInicio=DATEADD(MINUTE,@min,FechaInicio);
    UPDATE VIDA_ACADEMIA_PROGRESO SET FechaCompletado=DATEADD(MINUTE,@min,FechaCompletado);
    UPDATE VIDA_APP_CLIENTES SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta);
    UPDATE VIDA_CLIENTES SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta);
    UPDATE VIDA_CLIENTE_HIDRATACION_DIA SET FechaMod=DATEADD(MINUTE,@min,FechaMod);
    UPDATE VIDA_CLIENTE_PUNTOS SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta);
    UPDATE VIDA_CONFIGURACION SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta), FechaMod=DATEADD(MINUTE,@min,FechaMod);
    UPDATE VIDA_CUENTA_CIUDADES SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta), FechaMod=DATEADD(MINUTE,@min,FechaMod);
    UPDATE VIDA_CUENTA_ESTADOS SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta), FechaMod=DATEADD(MINUTE,@min,FechaMod);
    UPDATE VIDA_CUENTA_PAISES SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta), FechaMod=DATEADD(MINUTE,@min,FechaMod);
    UPDATE VIDA_CUENTA_PANTALLAS SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta), FechaMod=DATEADD(MINUTE,@min,FechaMod);
    UPDATE VIDA_CUENTA_PANTALLAS_ACCESOS_USUARIO SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta), FechaMod=DATEADD(MINUTE,@min,FechaMod);
    UPDATE VIDA_CUENTA_PUNTOS_VENTA SET
      -- FechaActivacion: local si la escribió el reloj del servidor (coincide con
      -- el alta o con la última modificación); UTC si vino de la app al crear.
      FechaActivacion=CASE WHEN FechaActivacion BETWEEN DATEADD(SECOND,-2,FechaAlta) AND DATEADD(SECOND,2,FechaAlta)
                             OR FechaActivacion BETWEEN DATEADD(SECOND,-2,FechaMod) AND DATEADD(SECOND,2,FechaMod)
                           THEN DATEADD(MINUTE,@min,FechaActivacion) ELSE FechaActivacion END,
      FechaAlta=DATEADD(MINUTE,@min,FechaAlta),
      FechaMod=DATEADD(MINUTE,@min,FechaMod),
      UltimoHeartbeat=DATEADD(MINUTE,@min,UltimoHeartbeat);
    UPDATE VIDA_CUENTA_USUARIOS SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta), FechaMod=DATEADD(MINUTE,@min,FechaMod);
    UPDATE VIDA_CUPONES SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta);
    UPDATE VIDA_CUPONES_USOS SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta);
    UPDATE VIDA_INVENTARIO_CATEGORIAS SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta), FechaMod=DATEADD(MINUTE,@min,FechaMod);
    UPDATE VIDA_INVENTARIO_MOVIMIENTOS SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta);
    UPDATE VIDA_INVENTARIO_PRODUCTOS SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta), FechaMod=DATEADD(MINUTE,@min,FechaMod);
    UPDATE VIDA_INVENTARIO_STOCK SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta), FechaMod=DATEADD(MINUTE,@min,FechaMod);
    UPDATE VIDA_ORDENES_COMPRA SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta), FechaMod=DATEADD(MINUTE,@min,FechaMod);
    UPDATE VIDA_ORDENES_COMPRA_HISTORIAL SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta);
    UPDATE VIDA_PEDIDOS SET
      -- FechaAlta: delivery (APP) y pedidos del panel (con FechaReserva) iban en
      -- hora local; las ventas del POS ya llegaban en UTC desde el navegador.
      FechaAlta=CASE WHEN Canal<>'POS' OR FechaReserva IS NOT NULL THEN DATEADD(MINUTE,@min,FechaAlta) ELSE FechaAlta END,
      FechaExpiracion=DATEADD(MINUTE,@min,FechaExpiracion),
      FechaInicioBusqueda=DATEADD(MINUTE,@min,FechaInicioBusqueda),
      FechaLimiteBusqueda=DATEADD(MINUTE,@min,FechaLimiteBusqueda),
      FechaMod=DATEADD(MINUTE,@min,FechaMod),
      FechaReserva=DATEADD(MINUTE,@min,FechaReserva);
    UPDATE VIDA_PEDIDOS_COMPROBANTES SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta);
    UPDATE VIDA_PEDIDOS_HISTORIAL SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta);
    UPDATE VIDA_PEDIDOS_LIBERADOS SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta);
    UPDATE VIDA_PEDIDOS_MATRIZ SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta), FechaMod=DATEADD(MINUTE,@min,FechaMod);
    UPDATE VIDA_PEDIDOS_MATRIZ_HISTORIAL SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta);
    UPDATE VIDA_PREMIOS_CANJES SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta), FechaMod=DATEADD(MINUTE,@min,FechaMod);
    UPDATE VIDA_PROMOCIONES SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta);
    UPDATE VIDA_PROVEEDORES SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta), FechaMod=DATEADD(MINUTE,@min,FechaMod);
    UPDATE VIDA_PROVEEDORES_PRODUCTOS SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta);
    UPDATE VIDA_REPARTIDORES SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta), UltimaUbicacion=DATEADD(MINUTE,@min,UltimaUbicacion);
    UPDATE VIDA_REPARTIDORES_CALIFICACIONES SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta);
    UPDATE VIDA_REPARTIDOR_LIQUIDACIONES SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta), FechaLiquidacion=DATEADD(MINUTE,@min,FechaLiquidacion);
    UPDATE VIDA_SCHEMA_MIGRATIONS SET AppliedAt=DATEADD(MINUTE,@min,AppliedAt);
    UPDATE VIDA_SERVICIOS_ORDENES SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta), FechaMod=DATEADD(MINUTE,@min,FechaMod);
    UPDATE VIDA_SESIONES SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta);
    UPDATE VIDA_TIENDA_FINANZAS SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta), FechaMod=DATEADD(MINUTE,@min,FechaMod);
    UPDATE VIDA_TIENDA_METAS SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta), FechaMod=DATEADD(MINUTE,@min,FechaMod);
    UPDATE VIDA_TOKENS_INVITACION SET FechaAlta=DATEADD(MINUTE,@min,FechaAlta), FechaExpira=DATEADD(MINUTE,@min,FechaExpira), FechaMod=DATEADD(MINUTE,@min,FechaMod);

    -- Turnos de caja: en hora local hasta la corrección de caja; desde entonces
    -- en UTC. Se decide comparando la apertura con el sello UTC (_ts) que la
    -- auditoría guardó en el mismo instante. Sin auditoría = turno antiguo, local.
    ;WITH aud AS (
      SELECT a.idBranch, a.idCuenta, TRY_CONVERT(BIGINT, a.EntityId) AS idTurno,
             MIN(TRY_CONVERT(DATETIME2, JSON_VALUE(a.DataJSON, '$._ts'), 127)) AS ts
      FROM VIDA_AUDIT_LOG a
      WHERE a.EntityType = 'CAJA_TURNO' AND a.Accion = 'CAJA_APERTURA'
      GROUP BY a.idBranch, a.idCuenta, TRY_CONVERT(BIGINT, a.EntityId)
    )
    UPDATE t SET
      FechaAlta     = DATEADD(MINUTE, @min, t.FechaAlta),
      FechaApertura = DATEADD(MINUTE, @min, t.FechaApertura),
      FechaCierre   = DATEADD(MINUTE, @min, t.FechaCierre)
    FROM VIDA_CAJA_TURNOS t
    LEFT JOIN aud ON aud.idBranch = t.idBranch AND aud.idCuenta = t.idCuenta AND aud.idTurno = t.idTurno
    WHERE aud.ts IS NULL OR ABS(DATEDIFF(MINUTE, t.FechaApertura, aud.ts)) >= 30;
  END

  INSERT INTO VIDA_SISTEMA_MARCAS (Clave, Valor)
  VALUES ('FECHAS_UTC', CONCAT('Fechas convertidas a UTC sumando ', @min, ' minutos (desfase del servidor al migrar)'));
END

COMMIT;
