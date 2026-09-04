-- ============================================================
-- Migración 24: el bono de racha de hidratación se paga UNA sola vez
-- Antes el bono se acreditaba cada vez que vasosHoy llegaba a la meta,
-- así que alternando "quitar vaso" / "tomar vaso" se podía cobrar sin
-- límite (y los puntos se canjean por dinero en el checkout).
-- Se agregan dos candados:
--   1) BonusPuntos en el día  -> un solo pago por fecha (reclamo atómico)
--   2) HidratacionRachaPremiada -> un solo pago por hito (7, 14, 21, ...)
-- De paso, la descripción del ledger de puntos pasa a NVARCHAR: era VARCHAR y
-- se comía los emojis y el signo menos "−" de los textos que ya escribe el
-- backend ("Racha de 7 días de hidratación 💧" quedaba con "??" en la app).
-- ============================================================

-- 1) Marca del bono ya pagado en el día
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('VIDA_CLIENTE_HIDRATACION_DIA') AND name='BonusPuntos')
  ALTER TABLE VIDA_CLIENTE_HIDRATACION_DIA ADD BonusPuntos INT NOT NULL DEFAULT 0;
GO

-- 2) Último múltiplo de 7 de racha ya premiado (0 = ninguno).
--    Si la racha se rompe y vuelve a arrancar más corta, el backend lo reinicia.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('VIDA_APP_CLIENTES') AND name='HidratacionRachaPremiada')
  ALTER TABLE VIDA_APP_CLIENTES ADD HidratacionRachaPremiada INT NOT NULL DEFAULT 0;
GO

-- 3) Backfill: los días en los que YA se acreditó un bono quedan marcados,
--    para que la primera llamada tras el deploy no los vuelva a pagar.
--    (HidratacionRachaPremiada se deja en 0: el hito histórico no se puede
--     reconstruir, y el candado por día ya cubre el riesgo.)
UPDATE d
   SET d.BonusPuntos = p.Puntos
  FROM VIDA_CLIENTE_HIDRATACION_DIA d
  JOIN (
        SELECT idBranch, idCuenta, idCliente,
               CAST(FechaAlta AS DATE) AS Fecha,
               MAX(Puntos)             AS Puntos
          FROM VIDA_CLIENTE_PUNTOS
         WHERE Tipo = 'GANADO'
           AND idPedido IS NULL
           AND Descripcion LIKE 'Racha de%'
         GROUP BY idBranch, idCuenta, idCliente, CAST(FechaAlta AS DATE)
       ) p
    ON p.idBranch  = d.idBranch
   AND p.idCuenta  = d.idCuenta
   AND p.idCliente = d.idCliente
   AND p.Fecha     = d.Fecha
 WHERE ISNULL(d.BonusPuntos, 0) = 0;
GO

-- 4) Descripción del ledger de puntos en Unicode.
--    Era VARCHAR(200): todo lo que está fuera de la codepage (emojis, el signo
--    menos "−" del texto de canje) se guardaba como "?". No hay índice sobre
--    esta columna, así que el ALTER es directo.
--    Ojo: las filas ya guardadas con "?" no se pueden recuperar — se pierde
--    solo el adorno, el monto y el tipo del movimiento están intactos.
IF EXISTS (
  SELECT 1 FROM sys.columns c
   JOIN sys.types t ON t.user_type_id = c.user_type_id
  WHERE c.object_id = OBJECT_ID('VIDA_CLIENTE_PUNTOS')
    AND c.name = 'Descripcion'
    AND t.name = 'varchar'
)
  ALTER TABLE VIDA_CLIENTE_PUNTOS ALTER COLUMN Descripcion NVARCHAR(200) NULL;
GO
