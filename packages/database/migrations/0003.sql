ALTER TABLE scan_requests ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
