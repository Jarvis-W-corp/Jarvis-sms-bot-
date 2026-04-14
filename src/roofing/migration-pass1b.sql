-- Pass 1b: JN parity toggles + commissions on hc_jobs
-- Idempotent. Run after migration-pass1.sql.

ALTER TABLE hc_jobs ADD COLUMN IF NOT EXISTS inspection_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE hc_jobs ADD COLUMN IF NOT EXISTS inspection_date DATE;
ALTER TABLE hc_jobs ADD COLUMN IF NOT EXISTS inspection_notes TEXT DEFAULT '';
ALTER TABLE hc_jobs ADD COLUMN IF NOT EXISTS claim_filed BOOLEAN DEFAULT FALSE;
ALTER TABLE hc_jobs ADD COLUMN IF NOT EXISTS claim_filed_date DATE;
ALTER TABLE hc_jobs ADD COLUMN IF NOT EXISTS claim_approved BOOLEAN DEFAULT FALSE;
ALTER TABLE hc_jobs ADD COLUMN IF NOT EXISTS claim_denied BOOLEAN DEFAULT FALSE;

-- Commissions
ALTER TABLE hc_jobs ADD COLUMN IF NOT EXISTS commission_rate NUMERIC DEFAULT 0;    -- percent
ALTER TABLE hc_jobs ADD COLUMN IF NOT EXISTS commission_amount NUMERIC DEFAULT 0;  -- dollars
ALTER TABLE hc_jobs ADD COLUMN IF NOT EXISTS commission_paid BOOLEAN DEFAULT FALSE;
ALTER TABLE hc_jobs ADD COLUMN IF NOT EXISTS commission_paid_date DATE;
