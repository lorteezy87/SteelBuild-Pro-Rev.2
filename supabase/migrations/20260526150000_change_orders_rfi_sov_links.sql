-- Link change orders to their originating cost-impact RFI and to the SOV line
-- item they adjust. Additive + nullable: existing COs unaffected, RLS on
-- change_orders is row-level (project_member_access) so the new columns are
-- already covered. No hard FKs (the app soft-deletes and uses loose id links,
-- matching e.g. rfis.cost_code_id); partial indexes keep lookups cheap.

ALTER TABLE public.change_orders
  ADD COLUMN IF NOT EXISTS source_rfi_id uuid,
  ADD COLUMN IF NOT EXISTS sov_line_item_id uuid,
  ADD COLUMN IF NOT EXISTS sov_line_number integer;

CREATE INDEX IF NOT EXISTS idx_change_orders_source_rfi
  ON public.change_orders(source_rfi_id) WHERE source_rfi_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_change_orders_sov_line
  ON public.change_orders(sov_line_item_id) WHERE sov_line_item_id IS NOT NULL;

COMMENT ON COLUMN public.change_orders.source_rfi_id IS 'RFI this CO was converted from (rfis.id); set when a cost-impact RFI is turned into a change order.';
COMMENT ON COLUMN public.change_orders.sov_line_item_id IS 'SOV line item (sov_items.id) this CO adjusts.';
COMMENT ON COLUMN public.change_orders.sov_line_number IS 'Denormalized SOV line_item_number for display.';

NOTIFY pgrst, 'reload schema';
