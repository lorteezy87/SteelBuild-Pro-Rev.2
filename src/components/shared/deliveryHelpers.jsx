/**
 * Get human-readable display name for a delivery
 * Priority: delivery_title > vendor + PO > delivery number > fallback
 * Handles both camelCase and snake_case field names.
 * NOTE: the legacy `description` field is intentionally NOT used —
 * legacy rows contain literal strings like "Material" from old form code.
 */
export const getDeliveryName = (delivery) => {
  if (!delivery) return "Unknown Delivery";

  // Priority 1: delivery title (the new canonical label field)
  if (delivery.delivery_title?.trim()) {
    return delivery.delivery_title.trim();
  }

  // Priority 2: vendor + PO (handle both field name conventions)
  const po = delivery.po_number || delivery.poNumber;
  const vendor = delivery.vendor;
  if (vendor && po) return `${vendor} · ${po}`;
  if (vendor) return vendor;

  // Priority 3: delivery number (handle both field name conventions)
  const num = delivery.delivery_id || delivery.deliveryNumber;
  if (num) return `Delivery ${num}`;

  // Last resort
  return "Unnamed Delivery";
};