-- Work Package structural breakdown fields
ALTER TABLE work_packages ADD COLUMN IF NOT EXISTS area TEXT;
ALTER TABLE work_packages ADD COLUMN IF NOT EXISTS sequence_number TEXT;
ALTER TABLE work_packages ADD COLUMN IF NOT EXISTS trade_phase TEXT;
ALTER TABLE work_packages ADD COLUMN IF NOT EXISTS shipping_phase TEXT;
ALTER TABLE work_packages ADD COLUMN IF NOT EXISTS install_phase TEXT;

-- Delivery area/sequence (inherited from WP but stored for direct queries)
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS area TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS sequence_number TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivery_number TEXT;

-- Daily log delivery + schedule linkage
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS delivery_ids UUID[] DEFAULT '{}';
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS schedule_task_ids UUID[] DEFAULT '{}';

-- Indexes for structural breakdown queries
CREATE INDEX IF NOT EXISTS idx_work_packages_area ON work_packages(area) WHERE area IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_packages_sequence ON work_packages(sequence_number) WHERE sequence_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deliveries_area ON deliveries(area) WHERE area IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deliveries_delivery_number ON deliveries(delivery_number) WHERE delivery_number IS NOT NULL;
