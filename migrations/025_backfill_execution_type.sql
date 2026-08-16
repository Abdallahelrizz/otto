-- Backfill execution_type for rows written before it was derived from the trigger.
--
-- createExecution() defaulted execution_type to the literal 'production' and no caller
-- ever overrode it, so EVERY historical execution — manual canvas runs, sub-workflows,
-- error handlers, eval cases — was stored as 'production'. That is not cosmetic: the
-- save policy (saveManualExecutions), retention, redaction and production-vs-manual
-- metrics all key off this column, and the UI rendered a "Production" badge on manual runs.
--
-- The fix (engine/logger.js executionTypeFor) only applies to NEW rows, so this migration
-- repairs the history. trigger_type was always recorded correctly, so it is a reliable
-- source. Mapping matches executionTypeFor() and EXEC_TYPE_LABELS in
-- canvas/src/components/panels/ExecutionPanel.tsx.
--
-- Only rows still sitting at the old blanket default are touched, so this is safe to
-- re-run and will not clobber a value that was set deliberately.

UPDATE executions
SET execution_type = CASE trigger_type
  WHEN 'manual'         THEN 'manual'
  WHEN 'api'            THEN 'api'
  WHEN 'schedule'       THEN 'scheduled'
  WHEN 'scheduled'      THEN 'scheduled'
  WHEN 'sub_workflow'   THEN 'sub_workflow'
  WHEN 'error_workflow' THEN 'error_workflow'
  WHEN 'resume'         THEN 'resume'
  ELSE 'production'
END
WHERE execution_type = 'production'
  AND trigger_type IS NOT NULL
  AND trigger_type NOT IN ('webhook');
