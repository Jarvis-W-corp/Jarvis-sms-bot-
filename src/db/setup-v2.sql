-- Jarvis v2 Schema: Cost tracking + Processed files
-- Run this in Supabase SQL Editor (Dashboard → SQL → New Query)

-- API cost tracking per agent/model/tool
CREATE TABLE IF NOT EXISTS api_costs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id),
  agent text DEFAULT 'jarvis',
  model text,
  input_tokens int DEFAULT 0,
  output_tokens int DEFAULT 0,
  cost_usd numeric(10,6) DEFAULT 0,
  tool text,
  job_id text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_costs_agent ON api_costs(agent);
CREATE INDEX IF NOT EXISTS idx_api_costs_created ON api_costs(created_at);
CREATE INDEX IF NOT EXISTS idx_api_costs_tenant ON api_costs(tenant_id);

-- Workflow columns on agent_jobs (for agent chaining)
ALTER TABLE agent_jobs ADD COLUMN IF NOT EXISTS workflow_id text;
ALTER TABLE agent_jobs ADD COLUMN IF NOT EXISTS step_index int;
CREATE INDEX IF NOT EXISTS idx_agent_jobs_workflow ON agent_jobs(workflow_id);

-- Workflow tracking table (pipelines that chain agents together)
CREATE TABLE IF NOT EXISTS workflows (
  id text PRIMARY KEY,
  template_id text NOT NULL,
  name text NOT NULL,
  params jsonb DEFAULT '{}',
  total_steps int DEFAULT 0,
  current_step int DEFAULT 0,
  status text DEFAULT 'pending', -- pending, running, completed, failed
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_created ON workflows(created_at);

-- Auto-update updated_at on workflows
CREATE OR REPLACE FUNCTION update_workflows_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS workflows_updated_at ON workflows;
CREATE TRIGGER workflows_updated_at
  BEFORE UPDATE ON workflows
  FOR EACH ROW EXECUTE FUNCTION update_workflows_updated_at();

-- Processed file tracking (idempotency — never re-process same file)
CREATE TABLE IF NOT EXISTS processed_files (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id),
  file_id text NOT NULL,
  file_name text,
  source text DEFAULT 'drive',
  result_summary text,
  processed_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, file_id)
);
CREATE INDEX IF NOT EXISTS idx_processed_files_tenant ON processed_files(tenant_id);
CREATE INDEX IF NOT EXISTS idx_processed_files_source ON processed_files(source);
