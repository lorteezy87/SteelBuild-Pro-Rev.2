/**
 * deliveryTitle — the title a new delivery is created with.
 *
 * Deliveries are created only through create_delivery(), which refuses a blank
 * title before anything else:
 *   if coalesce(btrim(p_payload ->> 'delivery_title'), '') = '' then
 *     raise exception 'delivery_title is required' using errcode = '23514';
 * (supabase/_capture/production-public-functions-2026-09-15.sql). Every create
 * path that has no title field of its own picks one from data it already
 * holds — the first non-blank candidate, trimmed — and falls back to a fixed
 * label, so the result is never blank.
 */
export function deliveryTitle(candidates: readonly unknown[], fallback: string): string {
  for (const candidate of candidates) {
    if (candidate == null) continue;
    const text = String(candidate).trim();
    if (text !== "") return text;
  }
  return fallback;
}
