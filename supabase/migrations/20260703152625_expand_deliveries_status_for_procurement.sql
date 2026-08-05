-- The `deliveries` table is shared by two features via the delivery_type discriminator:
--   * Logistics deliveries (delivery_type null/'Freight'/...): Scheduled -> Delivered dispatch flow
--   * Procurement pipeline (delivery_type = 'PROCUREMENT'): Identified -> Received pipeline flow
-- chk_deliveries_status only permitted the logistics vocabulary, so any Procurement
-- status change (e.g. -> 'PO Issued', 'Received') failed the CHECK. Expand the
-- constraint to the union of both vocabularies. The UI already offers only the
-- correct option set per page, so this constraint remains a garbage backstop.
-- NULL status stays implicitly allowed (status = ANY(...) is NULL for NULL status).

alter table deliveries drop constraint if exists chk_deliveries_status;

alter table deliveries add constraint chk_deliveries_status check (
  status = any (array[
    -- logistics / dispatch
    'Scheduled', 'In Transit', 'Delivered', 'Partial', 'Rejected', 'Delayed',
    -- procurement pipeline (delivery_type = 'PROCUREMENT')
    'Identified', 'Quoted', 'PO Issued', 'Confirmed', 'In Production', 'Shipped', 'Received', 'Cancelled'
  ]::text[])
);
