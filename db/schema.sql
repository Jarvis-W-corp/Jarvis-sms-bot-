-- ============================================================
-- Jarvis — Full Supabase Schema
-- Run this in Supabase SQL editor to initialize all tables
-- ============================================================

-- Enable pgvector extension
create extension if not exists vector;

-- ============================================================
-- TENANTS (already exists — this is a safe idempotent add of new columns)
-- ============================================================

-- Add new columns if they don't exist yet
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'tenants' and column_name = 'api_key_budget') then
    alter table tenants add column api_key_budget numeric(10,2) default 100.00;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'tenants' and column_name = 'allowed_tools') then
    alter table tenants add column allowed_tools text[] default array['discord','web_search','gmail'];
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'tenants' and column_name = 'locked_domains') then
    alter table tenants add column locked_domains text[] default array[]::text[];
  end if;
end $$;

-- ============================================================
-- IDEAS — idea bank with priority scoring
-- ============================================================

create table if not exists ideas (
  idea_id           uuid primary key default gen_random_uuid(),
  tenant_id         uuid references tenants(id) on delete cascade,
  title             text not null,
  description       text,
  source            text check (source in ('reflection', 'mid_task', 'research', 'user', 'fulfillment')),
  status            text default 'queued'
                    check (status in ('queued', 'backlog', 'parked', 'done', 'failed')),

  -- scoring axes (0.0 to 1.0)
  score_impact      numeric(3,2),
  score_feasibility numeric(3,2),
  score_alignment   numeric(3,2),
  score_urgency     numeric(3,2),

  -- computed priority score
  priority_score    numeric(3,2) generated always as (
    (coalesce(score_impact, 0) * 0.4) +
    (coalesce(score_feasibility, 0) * 0.3) +
    (coalesce(score_alignment, 0) * 0.2) +
    (coalesce(score_urgency, 0) * 0.1)
  ) stored,

  -- semantic deduplication
  embedding         vector(1536),

  -- lifecycle
  expires_at        timestamptz,
  executed_at       timestamptz,
  outcome           text,
  impact_actual     numeric(3,2),

  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists ideas_embedding_idx on ideas using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index if not exists ideas_tenant_priority_idx on ideas (tenant_id, status, priority_score desc);

-- Semantic idea dedup function
create or replace function match_ideas(
  query_embedding  vector(1536),
  match_threshold  float,
  match_count      int,
  p_tenant_id      uuid
)
returns table (
  idea_id    uuid,
  title      text,
  similarity float
)
language sql stable
as $$
  select
    idea_id,
    title,
    1 - (embedding <=> query_embedding) as similarity
  from ideas
  where tenant_id = p_tenant_id
    and status not in ('done', 'failed')
    and 1 - (embedding <=> query_embedding) > match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Weekly backlog decay (run via cron or scheduler)
create or replace function decay_backlog_urgency()
returns void
language sql
as $$
  update ideas
  set score_urgency = least(1.0, score_urgency + 0.01),
      updated_at    = now()
  where status = 'backlog';
$$;

-- ============================================================
-- OUTCOMES — task execution log
-- ============================================================

create table if not exists outcomes (
  outcome_id      uuid primary key default gen_random_uuid(),
  tenant_id       uuid references tenants(id) on delete cascade,
  idea_id         uuid references ideas(idea_id),
  job_id          text,  -- links to agent_jobs.id
  task_type       text,  -- 'idea_execution' | 'discord_command' | 'scheduled' | 'self_improve' | 'crew_job'
  worker          text,  -- 'hawk' | 'ghost' | 'pulse'
  success         boolean,
  impact_actual   numeric(3,2),
  duration_ms     integer,
  token_usage     integer,
  cost_usd        numeric(10,6),
  error_message   text,
  notes           text,
  created_at      timestamptz default now()
);

create index if not exists outcomes_tenant_idx on outcomes (tenant_id, created_at desc);
create index if not exists outcomes_idea_idx on outcomes (idea_id);
create index if not exists outcomes_job_idx on outcomes (job_id);

-- ============================================================
-- SELF_IMPROVE_LOG — every self-coding cycle
-- ============================================================

create table if not exists self_improve_log (
  log_id                uuid primary key default gen_random_uuid(),
  tenant_id             uuid references tenants(id) on delete cascade,
  trigger_type          text,   -- 'cron' | 'failure_signal' | 'capability_gap' | 'user_request'
  trigger_description   text,
  idea_id               uuid references ideas(idea_id),
  proposal_rationale    text,
  files_changed         text[],
  diff_size_lines       integer,
  scope_gate_passed     boolean,
  validation_passed     boolean,
  deployed              boolean default false,
  rollback_triggered    boolean default false,
  pr_url                text,
  error_message         text,
  created_at            timestamptz default now()
);

create index if not exists self_improve_tenant_idx on self_improve_log (tenant_id, created_at desc);

-- ============================================================
-- SCORING_WEIGHTS — per-tenant scoring calibration
-- ============================================================

create table if not exists scoring_weights (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references tenants(id) on delete cascade unique,
  w_impact        numeric(4,3) default 0.400,
  w_feasibility   numeric(4,3) default 0.300,
  w_alignment     numeric(4,3) default 0.200,
  w_urgency       numeric(4,3) default 0.100,
  updated_at      timestamptz default now()
);

-- Seed default weights for a tenant
create or replace function seed_scoring_weights(p_tenant_id uuid)
returns void
language sql
as $$
  insert into scoring_weights (tenant_id)
  values (p_tenant_id)
  on conflict (tenant_id) do nothing;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table ideas            enable row level security;
alter table outcomes         enable row level security;
alter table self_improve_log enable row level security;
alter table scoring_weights  enable row level security;

-- Service role bypasses RLS (used by Render server)
-- Anon key has no access to any table

-- ============================================================
-- USEFUL VIEWS
-- ============================================================

-- Top ideas ready to execute
create or replace view ready_ideas as
  select
    i.idea_id,
    i.tenant_id,
    i.title,
    i.description,
    i.priority_score,
    i.source,
    i.expires_at,
    t.name as tenant_name
  from ideas i
  join tenants t on t.id = i.tenant_id
  where i.status = 'queued'
    and i.priority_score > 0.6
    and (i.expires_at is null or i.expires_at > now())
  order by i.priority_score desc;

-- Self-improvement success rate by module
create or replace view self_improve_stats as
  select
    unnest(files_changed) as module,
    count(*) as total_attempts,
    sum(case when deployed then 1 else 0 end) as successful_deploys,
    sum(case when rollback_triggered then 1 else 0 end) as rollbacks,
    round(
      sum(case when deployed then 1 else 0 end)::numeric / nullif(count(*), 0) * 100, 1
    ) as success_rate_pct
  from self_improve_log
  group by 1
  order by total_attempts desc;

-- Recent outcomes with idea titles
create or replace view recent_outcomes as
  select
    o.outcome_id,
    o.tenant_id,
    o.task_type,
    o.worker,
    o.success,
    o.duration_ms,
    o.cost_usd,
    o.error_message,
    o.notes,
    o.created_at,
    i.title as idea_title
  from outcomes o
  left join ideas i on i.idea_id = o.idea_id
  order by o.created_at desc;
