-- Align executions.trigger_type with the trigger types the code actually writes.
--
-- The original CHECK allowed only:
--   webhook, manual, schedule, subworkflow, form, chat, error_workflow
-- but the code writes values added by later features that were never added here:
--
--   'api'    — src/routes/public-api.js, every run started through the public API.
--              CONFIRMED live failure: createExecution raised 23514
--              (executions_trigger_type_check), so POST /api/v1/public/workflows/:id/run
--              could never create an execution. The whole documented public-API run path
--              was broken.
--   'resume' — src/routes/resume.js and src/routes/approvals.js enqueue with this. It does
--              not hit the constraint today because resume reuses an existing execution row
--              rather than creating one, but the value is written into job payloads and
--              would fail the moment a resume creates its own row.
--   'test'   — engine/logger.js maps it to execution_type 'test' and the canvas has a
--              label for it, so the vocabulary already assumes it exists.
--
-- Widening a CHECK is additive and safe on an existing database: every currently stored
-- value remains valid. Nothing is dropped and no row is rewritten.

ALTER TABLE executions DROP CONSTRAINT IF EXISTS executions_trigger_type_check;

ALTER TABLE executions
  ADD CONSTRAINT executions_trigger_type_check
  CHECK (trigger_type = ANY (ARRAY[
    'webhook',
    'manual',
    'schedule',
    'subworkflow',
    'form',
    'chat',
    'error_workflow',
    'api',
    'resume',
    'test'
  ]::text[]));
