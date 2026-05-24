-- Otto — initial schema (Part 6.3 from product spec)
-- Run against your Supabase project or any Postgres instance

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ─────────────────────────────────────────────
-- Core tables
-- ─────────────────────────────────────────────

CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       TEXT NOT NULL UNIQUE,
  name        TEXT,
  password_hash TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE workspaces (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan        TEXT NOT NULL DEFAULT 'free',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE workspace_members (
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  PRIMARY KEY (workspace_id, user_id)
);

-- ─────────────────────────────────────────────
-- Workflows
-- ─────────────────────────────────────────────

CREATE TABLE workflows (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  definition    JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  active        BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE workflow_versions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id     UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  version_number  INTEGER NOT NULL,
  definition      JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES users(id),
  UNIQUE (workflow_id, version_number)
);

-- ─────────────────────────────────────────────
-- Executions
-- ─────────────────────────────────────────────

CREATE TABLE executions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id   UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','success','error','cancelled')),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  trigger_type  TEXT NOT NULL CHECK (trigger_type IN ('webhook','manual','schedule','subworkflow')),
  input         JSONB,
  error         TEXT
);

CREATE TABLE node_executions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_id  UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  node_id       TEXT NOT NULL,
  node_name     TEXT,
  node_type     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','success','error','skipped')),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  duration_ms   INTEGER,
  input         JSONB,
  output        JSONB,
  error         TEXT,
  retry_count   INTEGER NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────────
-- Credentials
-- ─────────────────────────────────────────────

CREATE TABLE credentials (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL,
  data          JSONB NOT NULL,  -- encrypted at application layer (AES-256-GCM)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE credentials_access_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  credential_id   UUID NOT NULL REFERENCES credentials(id) ON DELETE CASCADE,
  workflow_id     UUID REFERENCES workflows(id) ON DELETE SET NULL,
  node_id         TEXT,
  accessed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL
);

-- ─────────────────────────────────────────────
-- Memory layer
-- ─────────────────────────────────────────────

CREATE TABLE memory_patterns (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  category        TEXT,
  confidence      FLOAT,
  hit_count       INTEGER NOT NULL DEFAULT 0,
  embedding       vector(1536),
  last_invoked_at TIMESTAMPTZ
);

CREATE TABLE memory_interactions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id    TEXT NOT NULL,
  input         TEXT,
  output        TEXT,
  confidence    FLOAT,
  embedding     vector(1536),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE session_summaries (
  session_id    TEXT PRIMARY KEY,
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  summary       TEXT,
  turn_count    INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- API keys
-- ─────────────────────────────────────────────

CREATE TABLE api_keys (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  key_hash      TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  last_used_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────

CREATE INDEX idx_workflows_workspace ON workflows(workspace_id);
CREATE INDEX idx_workflows_active ON workflows(active) WHERE active = true;
CREATE INDEX idx_executions_workflow ON executions(workflow_id);
CREATE INDEX idx_executions_status ON executions(status);
CREATE INDEX idx_node_executions_execution ON node_executions(execution_id);
CREATE INDEX idx_credentials_workspace ON credentials(workspace_id);
CREATE INDEX idx_memory_patterns_workspace ON memory_patterns(workspace_id);
CREATE INDEX idx_memory_interactions_session ON memory_interactions(session_id);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- Webhook path lookup index (workflows with webhook triggers)
CREATE INDEX idx_workflows_webhook ON workflows USING GIN (definition jsonb_path_ops);

-- ─────────────────────────────────────────────
-- Migration 002: workspace_id on executions
-- ─────────────────────────────────────────────

ALTER TABLE executions
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_executions_workspace
  ON executions(workspace_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflows_workspace_updated
  ON workflows(workspace_id, updated_at DESC);

-- ─────────────────────────────────────────────
-- Migration 003: LLM token tracking
-- ─────────────────────────────────────────────

ALTER TABLE node_executions
  ADD COLUMN IF NOT EXISTS prompt_tokens     INTEGER,
  ADD COLUMN IF NOT EXISTS completion_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS total_tokens      INTEGER,
  ADD COLUMN IF NOT EXISTS model             TEXT;

-- ─────────────────────────────────────────────
-- Migration 004: Integrations registry
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS integrations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug              TEXT UNIQUE NOT NULL,
  name              TEXT NOT NULL,
  category          TEXT NOT NULL,
  description       TEXT,
  icon_url          TEXT,
  credential_schema JSONB,
  node_types        JSONB,
  version           TEXT NOT NULL DEFAULT '1.0.0',
  official          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_integrations (
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  integration_id  UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  installed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, integration_id)
);

CREATE INDEX IF NOT EXISTS idx_integrations_category ON integrations(category);
CREATE INDEX IF NOT EXISTS idx_workspace_integrations_ws ON workspace_integrations(workspace_id);
