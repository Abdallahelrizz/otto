CREATE TABLE IF NOT EXISTS eval_datasets (
  id SERIAL PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eval_cases (
  id SERIAL PRIMARY KEY,
  dataset_id INTEGER NOT NULL REFERENCES eval_datasets(id) ON DELETE CASCADE,
  input JSONB NOT NULL DEFAULT '{}',
  expected_output JSONB,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eval_runs (
  id SERIAL PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  dataset_id INTEGER NOT NULL REFERENCES eval_datasets(id),
  status TEXT NOT NULL DEFAULT 'running',  -- running / completed / failed
  total_cases INTEGER NOT NULL DEFAULT 0,
  passed_cases INTEGER NOT NULL DEFAULT 0,
  failed_cases INTEGER NOT NULL DEFAULT 0,
  score NUMERIC(5,2),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS eval_results (
  id SERIAL PRIMARY KEY,
  eval_run_id INTEGER NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
  eval_case_id INTEGER NOT NULL REFERENCES eval_cases(id),
  execution_id UUID REFERENCES executions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending / pass / fail / error
  actual_output JSONB,
  score NUMERIC(5,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eval_datasets_workspace_idx ON eval_datasets(workspace_id);
CREATE INDEX IF NOT EXISTS eval_cases_dataset_idx ON eval_cases(dataset_id);
CREATE INDEX IF NOT EXISTS eval_runs_workspace_idx ON eval_runs(workspace_id);
CREATE INDEX IF NOT EXISTS eval_results_run_idx ON eval_results(eval_run_id);
