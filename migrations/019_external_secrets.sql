CREATE TABLE IF NOT EXISTS external_secret_providers (
  id SERIAL PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL,  -- aws_secrets_manager | azure_key_vault | hashicorp_vault | gcp_secret_manager
  config JSONB NOT NULL DEFAULT '{}',  -- provider-specific config (region, vault_url, etc.)
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, name)
);

ALTER TABLE credentials ADD COLUMN IF NOT EXISTS external_secret_ref TEXT;
-- When set, this is a JSON string like {"provider":"my-aws","secretName":"prod/api-key"}
-- The credentials.data field is empty when this is set; value resolved at runtime

CREATE INDEX IF NOT EXISTS ext_secret_providers_workspace_idx ON external_secret_providers(workspace_id);
