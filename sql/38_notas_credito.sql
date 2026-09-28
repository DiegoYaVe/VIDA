-- ============================================================
-- 38 — NOTAS DE CRÉDITO SOBRE CUENTAS
--
-- Para cancelar un traspaso (o una recepción) que YA tenía abonos.
-- No se borra ni se edita nada: se emite un documento que perdona
-- la deuda pendiente, igual que un abono no se borra sino que se
-- compensa con otro en negativo.
--
-- El saldo pasa a ser:
--     TotalUSD − SUM(abonos) − SUM(notas de crédito)
--
-- La diferencia con un abono es semántica y hay que conservarla:
--   · abono          = dinero que efectivamente se movió
--   · nota de crédito = deuda que se deja de cobrar
-- Mezclarlas haría que el reporte de cobranza mienta sobre cuánto
-- dinero entró de verdad.
-- ============================================================

IF OBJECT_ID('VIDA_CUENTAS_NOTAS_CREDITO','U') IS NULL
CREATE TABLE VIDA_CUENTAS_NOTAS_CREDITO (
  idBranch     BIGINT        NOT NULL,
  idCuenta     BIGINT        NOT NULL,
  idNota       BIGINT        NOT NULL,
  idDocumento  BIGINT        NOT NULL,   -- la cuenta que se acredita
  MontoUSD     DECIMAL(18,4) NOT NULL,   -- siempre positivo: lo que se perdona
  Motivo       VARCHAR(300)  NOT NULL,   -- obligatorio: queda en la auditoría
  CancelaCuenta BIT          NOT NULL DEFAULT 0,  -- 1 si la NC cerró el documento
  FechaNota    DATE          NOT NULL,
  FechaAlta    DATETIME      NOT NULL DEFAULT GETUTCDATE(),
  UsuAlta      VARCHAR(30)   NULL,
  CONSTRAINT PK_CUENTAS_NC PRIMARY KEY CLUSTERED (idBranch, idCuenta, idNota),
  CONSTRAINT CK_CUENTAS_NC_MONTO CHECK (MontoUSD > 0)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_CUENTAS_NC_DOC' AND object_id=OBJECT_ID('VIDA_CUENTAS_NOTAS_CREDITO'))
  CREATE NONCLUSTERED INDEX IX_CUENTAS_NC_DOC
    ON VIDA_CUENTAS_NOTAS_CREDITO (idBranch, idCuenta, idDocumento)
    INCLUDE (MontoUSD);
GO
