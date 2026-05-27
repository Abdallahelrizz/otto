ALTER TABLE executions
  DROP CONSTRAINT IF EXISTS executions_trigger_type_check;

ALTER TABLE executions
  ADD CONSTRAINT executions_trigger_type_check
  CHECK (trigger_type IN ('webhook','manual','schedule','subworkflow','form','chat','error_workflow'));
