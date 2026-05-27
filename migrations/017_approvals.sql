CREATE TABLE IF NOT EXISTS approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token TEXT NOT NULL UNIQUE,
  execution_id UUID REFERENCES executions(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  node_id TEXT,
  subject TEXT,
  message TEXT,
  approvers TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending / approved / rejected / expired
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  approver TEXT,
  comment TEXT,
  reason TEXT,
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS approvals_token_idx ON approvals(token);
CREATE INDEX IF NOT EXISTS approvals_execution_id_idx ON approvals(execution_id);
