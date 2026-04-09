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
