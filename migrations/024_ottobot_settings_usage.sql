-- Migration 024: OttoBot workspace settings and usage tracking

-- Add workspace-level settings for OttoBot
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS ottobot_settings JSONB NOT NULL DEFAULT '{"enabled": true, "credentialId": null}'::jsonb;

-- Create table to track OttoBot LLM token usage securely
CREATE TABLE IF NOT EXISTS ottobot_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index to optimize the Usage dashboard queries
CREATE INDEX IF NOT EXISTS idx_ottobot_usage_workspace ON ottobot_usage(workspace_id, created_at);
