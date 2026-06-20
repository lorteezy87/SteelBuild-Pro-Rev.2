-- Migration 031: Add columns for the four executive financial KPIs.
--
-- New fields:
--   change_orders.margin_percent         — CO-level margin % entered at creation
--   sov_items.submitted_date             — when the pay app was submitted (DSO start)
--   sov_items.payment_received_date      — when payment landed (DSO end)
--   projects.scope_complete_pct_override  — PM manual override for % scope complete
--   projects.scope_complete_pct_override_date — when the override was last set
--
-- Design decisions:
--   - calculated_margin_dollars is NOT stored; derived in useFinancials as
--     co_amount * margin_percent / 100.
--   - labor_budget / labor_actual are NOT stored on projects; derived from
--     cost code rows where category === 'Labor'.
--   - scope_complete_pct uses a hybrid model: EVM-derived by default,
--     PM override when set (COALESCE(override, evm_derived)).
--   - certified_date and payment_amount on sov_items deferred to a later phase.

-- ── change_orders: CO margin tracking ────────────────────────────────────────
ALTER TABLE public.change_orders
  ADD COLUMN IF NOT EXISTS margin_percent NUMERIC DEFAULT 0;

COMMENT ON COLUMN public.change_orders.margin_percent IS
  'Margin percentage (0-100) entered at CO creation. Margin dollars = co_amount * margin_percent / 100.';

-- ── sov_items: billing date tracking for DSO calculation ─────────────────────
ALTER TABLE public.sov_items
  ADD COLUMN IF NOT EXISTS submitted_date          DATE,
  ADD COLUMN IF NOT EXISTS payment_received_date   DATE;

COMMENT ON COLUMN public.sov_items.submitted_date IS
  'Date the pay application was submitted to GC/owner. DSO start point.';
COMMENT ON COLUMN public.sov_items.payment_received_date IS
  'Date payment was actually received. DSO end point. DSO = payment_received_date - submitted_date.';

-- ── projects: scope complete override (hybrid EVM + manual) ──────────────────
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS scope_complete_pct_override      NUMERIC,
  ADD COLUMN IF NOT EXISTS scope_complete_pct_override_date DATE;

COMMENT ON COLUMN public.projects.scope_complete_pct_override IS
  'PM-entered scope completion override (0-100). When NULL, KPIs fall back to the EVM-derived value from calcEVM().';
COMMENT ON COLUMN public.projects.scope_complete_pct_override_date IS
  'Date when scope_complete_pct_override was last set by the PM.';
