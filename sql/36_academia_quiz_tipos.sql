-- ============================================================
-- Migración 36: tipos de pregunta en el quiz de Academia
-- Hasta ahora toda pregunta era de opción única (una correcta). Se agrega
-- TipoPregunta para soportar varios formatos:
--   OPCION_UNICA     -> una sola opción correcta (radio)
--   VERDADERO_FALSO  -> dos opciones (Verdadero/Falso), una correcta
--   OPCION_MULTIPLE  -> varias opciones correctas (checkbox); se acierta solo
--                       si el conjunto elegido coincide exactamente
--   RESPUESTA_CORTA  -> texto libre; las "opciones" con EsCorrecta=1 guardan
--                       las respuestas aceptadas (se compara normalizado)
-- Las filas existentes quedan como OPCION_UNICA. Idempotente.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name='TipoPregunta' AND Object_ID=OBJECT_ID('VIDA_ACADEMIA_QUIZ_PREGUNTAS'))
  ALTER TABLE VIDA_ACADEMIA_QUIZ_PREGUNTAS ADD TipoPregunta VARCHAR(20) NOT NULL DEFAULT 'OPCION_UNICA';
GO
