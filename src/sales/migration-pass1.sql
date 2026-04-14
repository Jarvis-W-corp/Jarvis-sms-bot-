-- Pass 1 migration: unify auth + add premium flag + Job Nimbus-style schema
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- Existing hc_* tables preserved; new tables are additive.

-- === USERS: add premium flag + email (shared auth between /sales and /roofing) ===
ALTER TABLE hc_users ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
ALTER TABLE hc_users ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
ALTER TABLE hc_users ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT FALSE;
ALTER TABLE hc_users ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '';
ALTER TABLE hc_users ADD COLUMN IF NOT EXISTS session_token TEXT DEFAULT '';

-- Admin gets premium by default
UPDATE hc_users SET is_premium = TRUE WHERE role = 'Admin';

-- === CONTACTS (JN-style, unified — replaces the old hc_roofing leads table going forward) ===
CREATE TABLE IF NOT EXISTS hc_contacts (
  id TEXT PRIMARY KEY,
  number TEXT,                     -- display ID, e.g. C-0142
  display_name TEXT NOT NULL,
  first_name TEXT DEFAULT '',
  last_name TEXT DEFAULT '',
  company TEXT DEFAULT '',
  email TEXT DEFAULT '',
  home_phone TEXT DEFAULT '',
  mobile_phone TEXT DEFAULT '',
  work_phone TEXT DEFAULT '',
  website TEXT DEFAULT '',
  address_line1 TEXT DEFAULT '',
  address_line2 TEXT DEFAULT '',
  city TEXT DEFAULT '',
  state_text TEXT DEFAULT '',
  zip TEXT DEFAULT '',
  country_name TEXT DEFAULT 'USA',
  geo_lat DOUBLE PRECISION,
  geo_lon DOUBLE PRECISION,
  description TEXT DEFAULT '',
  record_type TEXT DEFAULT 'Customer',     -- Customer | Sub-Contractor | Insurance Carrier | ...
  status TEXT DEFAULT 'Lead',              -- tenant-defined status name
  stage TEXT DEFAULT 'Lead',               -- Lead | Estimating | Sold | In Production | AR | Completed | Lost
  source TEXT DEFAULT '',
  sales_rep_id TEXT REFERENCES hc_users(id),
  owner_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_archived BOOLEAN DEFAULT FALSE,
  created_by TEXT REFERENCES hc_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hc_contacts_stage ON hc_contacts(stage);
CREATE INDEX IF NOT EXISTS idx_hc_contacts_sales_rep ON hc_contacts(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_hc_contacts_zip ON hc_contacts(zip);

-- === JOBS (per-project record with insurance fields) ===
CREATE TABLE IF NOT EXISTS hc_jobs (
  id TEXT PRIMARY KEY,
  number TEXT,
  name TEXT NOT NULL,
  contact_id TEXT REFERENCES hc_contacts(id) ON DELETE CASCADE,
  record_type TEXT DEFAULT 'Retail',       -- Retail | Insurance | Service
  status TEXT DEFAULT 'New',
  stage TEXT DEFAULT 'Lead',
  description TEXT DEFAULT '',
  address_line1 TEXT DEFAULT '',
  address_line2 TEXT DEFAULT '',
  city TEXT DEFAULT '',
  state_text TEXT DEFAULT '',
  zip TEXT DEFAULT '',
  geo_lat DOUBLE PRECISION,
  geo_lon DOUBLE PRECISION,
  sales_rep_id TEXT REFERENCES hc_users(id),
  owner_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  source TEXT DEFAULT '',
  date_start DATE,
  date_end DATE,
  approved_estimate_total NUMERIC DEFAULT 0,
  cost NUMERIC DEFAULT 0,
  cover_photo_url TEXT DEFAULT '',
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Insurance / claim fields (the standard roofing set)
  insurance_company TEXT DEFAULT '',
  policy_number TEXT DEFAULT '',
  claim_number TEXT DEFAULT '',
  date_of_loss DATE,
  type_of_loss TEXT DEFAULT '',
  date_reported DATE,
  date_inspected DATE,
  adjuster_name TEXT DEFAULT '',
  adjuster_phone TEXT DEFAULT '',
  adjuster_email TEXT DEFAULT '',
  adjuster_company TEXT DEFAULT '',
  deductible NUMERIC DEFAULT 0,
  deductible_paid BOOLEAN DEFAULT FALSE,
  acv_amount NUMERIC DEFAULT 0,
  rcv_amount NUMERIC DEFAULT 0,
  recoverable_depreciation NUMERIC DEFAULT 0,
  depreciation_deadline DATE,
  non_recoverable_depreciation NUMERIC DEFAULT 0,
  overhead_and_profit NUMERIC DEFAULT 0,
  supplement_amount NUMERIC DEFAULT 0,
  supplement_status TEXT DEFAULT '',
  supplement_notes TEXT DEFAULT '',
  mortgage_company TEXT DEFAULT '',
  mortgage_loan_number TEXT DEFAULT '',
  scope_approved BOOLEAN DEFAULT FALSE,
  scope_notes TEXT DEFAULT '',
  first_check_received BOOLEAN DEFAULT FALSE,
  first_check_amount NUMERIC DEFAULT 0,
  first_check_date DATE,
  final_check_received BOOLEAN DEFAULT FALSE,
  final_check_amount NUMERIC DEFAULT 0,
  final_check_date DATE,
  coc_signed BOOLEAN DEFAULT FALSE,

  created_by TEXT REFERENCES hc_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hc_jobs_contact ON hc_jobs(contact_id);
CREATE INDEX IF NOT EXISTS idx_hc_jobs_stage ON hc_jobs(stage);
CREATE INDEX IF NOT EXISTS idx_hc_jobs_policy ON hc_jobs(policy_number);
CREATE INDEX IF NOT EXISTS idx_hc_jobs_claim ON hc_jobs(claim_number);

-- === APPOINTMENTS / TASKS (calendar) ===
CREATE TABLE IF NOT EXISTS hc_appointments (
  id TEXT PRIMARY KEY,
  type TEXT DEFAULT 'Appointment',         -- Appointment | Task | Phone Call | Meeting
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_all_day BOOLEAN DEFAULT FALSE,
  date_start TIMESTAMPTZ NOT NULL,
  date_end TIMESTAMPTZ,
  duration_min INTEGER DEFAULT 60,
  priority TEXT DEFAULT 'Medium',
  assigned_to TEXT[] DEFAULT ARRAY[]::TEXT[],
  contact_id TEXT REFERENCES hc_contacts(id) ON DELETE SET NULL,
  job_id TEXT REFERENCES hc_jobs(id) ON DELETE SET NULL,
  location_address TEXT DEFAULT '',
  is_completed BOOLEAN DEFAULT FALSE,
  date_completed TIMESTAMPTZ,
  reminder_min INTEGER,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_by TEXT REFERENCES hc_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hc_appts_start ON hc_appointments(date_start);
CREATE INDEX IF NOT EXISTS idx_hc_appts_contact ON hc_appointments(contact_id);
CREATE INDEX IF NOT EXISTS idx_hc_appts_job ON hc_appointments(job_id);

-- === ACTIVITY FEED (polymorphic: contact or job) ===
CREATE TABLE IF NOT EXISTS hc_activities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                      -- Note | Email | SMS | Call | File | StatusChange | TaskCompleted | Estimate | Invoice
  note TEXT DEFAULT '',
  contact_id TEXT REFERENCES hc_contacts(id) ON DELETE CASCADE,
  job_id TEXT REFERENCES hc_jobs(id) ON DELETE CASCADE,
  from_status TEXT DEFAULT '',
  to_status TEXT DEFAULT '',
  created_by TEXT REFERENCES hc_users(id),
  created_by_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hc_activities_contact ON hc_activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_hc_activities_job ON hc_activities(job_id);
CREATE INDEX IF NOT EXISTS idx_hc_activities_created ON hc_activities(created_at DESC);

-- === FILES (photos + documents, split by mime on read) ===
CREATE TABLE IF NOT EXISTS hc_files (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  content_type TEXT DEFAULT '',
  size_bytes BIGINT DEFAULT 0,
  url TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_photo BOOLEAN DEFAULT FALSE,
  contact_id TEXT REFERENCES hc_contacts(id) ON DELETE CASCADE,
  job_id TEXT REFERENCES hc_jobs(id) ON DELETE CASCADE,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_by TEXT REFERENCES hc_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hc_files_job ON hc_files(job_id);
CREATE INDEX IF NOT EXISTS idx_hc_files_contact ON hc_files(contact_id);

-- === ESTIMATES / WORK ORDERS / INVOICES ===
CREATE TABLE IF NOT EXISTS hc_estimates (
  id TEXT PRIMARY KEY,
  number TEXT,
  doc_type TEXT DEFAULT 'Estimate',        -- Estimate | WorkOrder | Invoice | CreditMemo
  status TEXT DEFAULT 'Draft',
  contact_id TEXT REFERENCES hc_contacts(id) ON DELETE CASCADE,
  job_id TEXT REFERENCES hc_jobs(id) ON DELETE CASCADE,
  sales_rep_id TEXT REFERENCES hc_users(id),
  subject TEXT DEFAULT '',
  description TEXT DEFAULT '',
  items JSONB DEFAULT '[]'::JSONB,         -- [{name, description, sku, quantity, uom, cost, price, amount, taxable}]
  subtotal NUMERIC DEFAULT 0,
  tax_rate NUMERIC DEFAULT 0,
  tax NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  amount_paid NUMERIC DEFAULT 0,
  balance NUMERIC DEFAULT 0,
  due_date DATE,
  signed_at TIMESTAMPTZ,
  signature_image TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  payment_terms TEXT DEFAULT '',
  created_by TEXT REFERENCES hc_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hc_estimates_job ON hc_estimates(job_id);
CREATE INDEX IF NOT EXISTS idx_hc_estimates_type ON hc_estimates(doc_type);

-- === PAYMENTS ===
CREATE TABLE IF NOT EXISTS hc_payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT REFERENCES hc_estimates(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  method TEXT DEFAULT '',
  reference TEXT DEFAULT '',
  note TEXT DEFAULT '',
  paid_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT REFERENCES hc_users(id)
);

-- === SESSIONS (simple token-based auth shared across /sales and /roofing) ===
CREATE TABLE IF NOT EXISTS hc_sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT REFERENCES hc_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days'
);
CREATE INDEX IF NOT EXISTS idx_hc_sessions_user ON hc_sessions(user_id);

-- === BACKFILL: migrate old hc_roofing rows into hc_contacts on first run ===
-- (Run manually once you're ready; kept separate from schema-creation.)
-- INSERT INTO hc_contacts (id, display_name, mobile_phone, email, address_line1, status, stage, sales_rep_id, created_by, created_at)
-- SELECT id, name, phone, email, address, status, 'Lead', assigned_to, created_by, created_at::TIMESTAMPTZ
-- FROM hc_roofing
-- ON CONFLICT (id) DO NOTHING;
