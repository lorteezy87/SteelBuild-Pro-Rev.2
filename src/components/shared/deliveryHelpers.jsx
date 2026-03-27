/**
 * Get human-readable display name for a delivery
 * Priority: description > vendor + PO > delivery number > fallback
 * Handles both camelCase and snake_case field names
 */
export const getDeliveryName = (delivery) => {
  if (!delivery) return "Unknown Delivery";

  // Priority 1: description field
  if (delivery.description?.trim()) {
    return delivery.description.trim();
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