/**
 * createDeliveryWithItems — the write path for a delivery that arrives with its
 * line items (shipping-ticket import, shipping-list import).
 *
 * Production admits a delivery ONLY through create_delivery(p_project_id,
 * p_payload): enforce_delivery_guards() refuses a direct INSERT ("Deliveries
 * are created through create_delivery(); numbers are minted there") and every
 * hard DELETE. The RPC mints DEL-NNN and inserts the delivery and its
 * p_payload.items in one transaction, so a failure leaves nothing behind and
 * there is no rollback to hand-roll. entities.Delivery.create is the client for
 * it; this module shapes an importer's data to the RPC's contract and persists
 * the few columns the RPC does not write.
 *
 * Contract, read from create_delivery() in
 * supabase/_capture/production-public-functions-2026-09-15.sql (the function
 * is production-owned; no migration in this repo defines it):
 *   - `delivery_title` must be non-blank (23514 otherwise).
 *   - Delivery columns it writes: description, vendor, po_number, carrier,
 *     tracking_number, scheduled/required/expected_ship date, work_package_id,
 *     priority, status, delivery_type, load_number, load_category, area,
 *     sequence_number, notes, special_instructions, inspection_required,
 *     receiving_location, contact_name/phone, metadata. Nothing else.
 *   - Item keys it reads: qty (cast ::int, stored as greatest(1, qty)),
 *     assembly_mark, sequence, profile, length_inches (::numeric), grade,
 *     weight_lbs (::numeric), notes, piece_id. `length_text` and `finish` are
 *     real delivery_items columns it never writes.
 *   - With items it sets pieces = Σ qty and weight_tons = Σ weight_lbs / 2000,
 *     so a load whose lines carry no weight reads 0 tons, not "unknown".
 *
 * Status goes in the payload as the importers always sent it (chk_deliveries_status
 * allows both "Scheduled" and "Delivered"; the guard does not police status on
 * INSERT). Items carry no piece_id, so receive_delivery() would have no lots to
 * advance for them.
 */
import { entities } from "@/api/supabaseClient";

/** One line as create_delivery() reads it from `p_payload.items`. */
export interface DeliveryItemPayload {
  qty: number;
  assembly_mark: string | null;
  sequence: string | null;
  profile: string | null;
  length_inches: number | null;
  grade: string | null;
  weight_lbs: number | null;
  notes: string | null;
}

/** A line as an importer reads it off a ticket or shipping list — loosely typed. */
export interface ImportedDeliveryLine {
  qty?: unknown;
  assembly_mark?: unknown;
  sequence?: unknown;
  profile?: unknown;
  length_text?: unknown;
  length_inches?: unknown;
  grade?: unknown;
  finish?: unknown;
  weight_lbs?: unknown;
  notes?: unknown;
}

/**
 * Columns the RPC's INSERT does not cover. Written in ONE follow-up update.
 * `pieces` / `weight_tons` are the source document's printed load totals.
 */
export interface DeliveryFollowUp {
  actual_date?: string | null;
  capacity_lbs?: number | null;
  shipping_ticket_url?: string | null;
  shipping_ticket_path?: string | null;
  shipping_ticket_name?: string | null;
  pieces?: number | null;
  weight_tons?: number | null;
}

export interface CreateDeliveryWithItemsArgs {
  projectId: string;
  /** Fields create_delivery() writes. Must carry a non-blank delivery_title. */
  delivery: Record<string, unknown> & { delivery_title: string };
  items: DeliveryItemPayload[];
  followUp?: DeliveryFollowUp;
}

export interface CreatedDelivery {
  id: string;
  delivery_number?: string | null;
  [column: string]: unknown;
}

export function textOrNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

/** "48,000#" / "12 600 lbs" / 8400 → number; anything unparseable → null. */
export function parseLbs(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^\d.-]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function finiteOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** An integer count, or null. Postgres integer columns reject "2.5". */
export function wholeOrNull(value: unknown): number | null {
  const n = typeof value === "number" ? value : finiteOrNull(String(value ?? "").replace(/[,\s]/g, ""));
  return n == null || !Number.isFinite(n) ? null : Math.round(n);
}

/**
 * Map an imported line to the RPC's item contract. qty is sent as the integer
 * the database will store (it applies greatest(1, qty) and its guard rejects
 * qty < 1). The printed length and finish have no column the RPC writes, so
 * they are kept in the line's notes rather than dropped.
 */
export function toDeliveryItemPayload(line: ImportedDeliveryLine): DeliveryItemPayload {
  const parsedQty = Number.parseInt(String(line.qty ?? ""), 10);
  const lengthText = textOrNull(line.length_text);
  const finish = textOrNull(line.finish);
  const notes = [
    textOrNull(line.notes),
    lengthText ? `Length ${lengthText}` : null,
    finish ? `Finish ${finish}` : null,
  ].filter(Boolean).join(" · ");
  return {
    qty: Number.isFinite(parsedQty) ? Math.max(1, parsedQty) : 1,
    assembly_mark: textOrNull(line.assembly_mark),
    sequence: textOrNull(line.sequence),
    profile: textOrNull(line.profile),
    length_inches: finiteOrNull(line.length_inches),
    grade: textOrNull(line.grade),
    weight_lbs: parseLbs(line.weight_lbs),
    notes: notes === "" ? null : notes,
  };
}

/** First non-blank candidate. create_delivery() refuses a blank delivery_title. */
export function importedDeliveryTitle(loadNumber: unknown, ...fallbacks: unknown[]): string {
  const load = textOrNull(loadNumber);
  if (load) return `Load ${load}`;
  for (const candidate of fallbacks) {
    const text = textOrNull(candidate);
    if (text) return text;
  }
  return "Imported load";
}

/**
 * The source document's load totals, for the follow-up write.
 *
 * A printed total is what the ticket / list states, so it stands. Without one,
 * keep what create_delivery() derived from the lines — except weight when no
 * line carried a weight: the RPC sums those as 0, and 0 tons is a claim the
 * document never made. Unknown stays NULL.
 */
export function loadTotalsFollowUp(
  printedPieces: unknown,
  printedWeightLbs: unknown,
  items: DeliveryItemPayload[],
): Pick<DeliveryFollowUp, "pieces" | "weight_tons"> {
  const out: Pick<DeliveryFollowUp, "pieces" | "weight_tons"> = {};
  const pieces = wholeOrNull(printedPieces);
  if (pieces != null) out.pieces = pieces;
  const lbs = parseLbs(printedWeightLbs);
  if (lbs != null) out.weight_tons = Number((lbs / 2000).toFixed(3));
  else if (items.length > 0 && items.every((item) => item.weight_lbs == null)) out.weight_tons = null;
  return out;
}

/**
 * Create the delivery and its items atomically through create_delivery(), then
 * write the columns it does not cover.
 *
 * The follow-up is a second round trip, not part of the transaction (the same
 * trade-off entities.Delivery makes for its `carried` columns). If it fails the
 * delivery and its items still exist, so the error says which delivery it was
 * and what was not saved, instead of implying nothing was created.
 */
export async function createDeliveryWithItems({
  projectId,
  delivery,
  items,
  followUp = {},
}: CreateDeliveryWithItemsArgs): Promise<CreatedDelivery> {
  if (!projectId) throw new Error("Select a project before importing.");
  if (!textOrNull(delivery.delivery_title)) throw new Error("A delivery needs a title.");

  const created = (await entities.Delivery.create({
    ...delivery,
    project_id: projectId,
    items,
  } as never)) as unknown as CreatedDelivery;

  const patch = Object.fromEntries(
    Object.entries(followUp).filter(([, value]) => value !== undefined),
  ) as DeliveryFollowUp;
  if (Object.keys(patch).length === 0) return created;

  try {
    return (await entities.Delivery.update(created.id, patch as never)) as unknown as CreatedDelivery;
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `${created.delivery_number || "The delivery"} was created with ${items.length} line item(s), ` +
        `but saving ${Object.keys(patch).join(", ")} failed: ${reason}. ` +
        "Fix it on the delivery rather than importing it again.",
      { cause },
    );
  }
}
