-- HC Daily Tracker tables for Supabase
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS hc_users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'Sales Rep',
  team_id TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hc_teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  manager_id TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hc_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES hc_users(id),
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  doors_knocked INTEGER DEFAULT 0,
  door_convos INTEGER DEFAULT 0,
  door_appts INTEGER DEFAULT 0,
  calls_made INTEGER DEFAULT 0,
  call_convos INTEGER DEFAULT 0,
  call_appts INTEGER DEFAULT 0,
  recruit_attempts INTEGER DEFAULT 0,
  interviews INTEGER DEFAULT 0,
  onboarded INTEGER DEFAULT 0,
  revenue INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hc_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES hc_users(id) UNIQUE,
  weekly_doors INTEGER DEFAULT 100,
  weekly_calls INTEGER DEFAULT 150,
  weekly_appts INTEGER DEFAULT 20,
  weekly_revenue INTEGER DEFAULT 5000,
  monthly_doors INTEGER DEFAULT 400,
  monthly_calls INTEGER DEFAULT 600,
  monthly_appts INTEGER DEFAULT 80,
  monthly_revenue INTEGER DEFAULT 20000,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hc_chat (
  id TEXT PRIMARY KEY,
  user_name TEXT NOT NULL,
  text TEXT NOT NULL,
  time TEXT NOT NULL,
  team_id TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hc_roofing (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT NOT NULL,
  type TEXT DEFAULT 'retail',
  status TEXT DEFAULT 'new',
  assigned_to TEXT DEFAULT '',
  assigned_name TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  last_contact TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed admin user (password: admin123)
INSERT INTO hc_users (id, username, password, name, role, status)
VALUES ('1', 'admin', 'admin123', 'Admin', 'Admin', 'active')
ON CONFLICT (id) DO NOTHING;
