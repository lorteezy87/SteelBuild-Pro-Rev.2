-- ============================================================================
-- 041_delivery_items_and_load_columns.sql
--
-- Supports the shipping-ticket importer. A single uploaded "Shipping Ticket"
-- maps to one deliveries row + N delivery_items rows, so the PM can see
-- truck-level totals on the Deliveries list AND drill into every piece mark
-- on that load.
--
-- Adds on deliveries:
--   - load_number           TEXT — "Load #: 1" from the ticket
--   - load_category         TEXT — "Load Category 1" (shop-specific grouping)
--   - capacity_lbs          INTEGER — trailer capacity, e.g. 48000
--   - shipping_ticket_url   TEXT — signed / public URL to the source PDF
--   - shipping_ticket_path  TEXT — storage path in app-files bucket
--   - shipping_ticket_name  TEXT — original filename for display
--
-- New table delivery_items:
--   One row per assembly-mark line on the ticket. weight_lbs is the
--   line-total (Tekla's "Weight" column is qty × unit weight already, so we
--   store that directly — no per-unit column needed for basic tracking).
-- ============================================================================

ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS load_number          TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS load_category        TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS capacity_lbs         INTEGER;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS shipping_ticket_url  TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS shipping_ticket_path TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS shipping_ticket_name TEXT;

CREATE INDEX IF NOT EXISTS idx_deliveries_load_number
  ON deliveries(project_id, load_number)
  WHERE load_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS delivery_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  delivery_id    UUID REFERENCES deliveries(id) ON DELETE CASCADE,
  line_no        INTEGER,
  qty            INTEGER NOT NULL DEFAULT 1,
  assembly_mark  TEXT,
  sequence       TEXT,
  profile        TEXT,          -- e.g. "HSS 8 x 8 x 1/2"
  length_text    TEXT,          -- raw field from ticket, e.g. "7'-8 3/4"
  length_inches  NUMERIC,       -- parsed length in inches when possible
  grade          TEXT,          -- e.g. "A500-C"
  finish         TEXT,          -- e.g. "P" (primed), "GALV"
  weight_lbs     NUMERIC,       -- LINE TOTAL weight (qty × unit weight)
  notes          TEXT,
  metadata       JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('delivery_items');
CREATE INDEX IF NOT EXISTS idx_delivery_items_delivery ON delivery_items(delivery_id);
CREATE INDEX IF NOT EXISTS idx_delivery_items_mark     ON delivery_items(assembly_mark) WHERE assembly_mark IS NOT NULL;

ALTER TABLE delivery_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON delivery_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
