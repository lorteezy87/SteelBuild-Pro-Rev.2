/**
 * A fake Supabase client that holds deliveries to the rules production
 * enforces, so importer tests assert what production would actually store.
 *
 * Source of every rule below (read, not guessed):
 *   supabase/_capture/production-public-functions-2026-09-15.sql
 *     - create_delivery(p_project_id, p_payload)      the only INSERT path
 *     - enforce_delivery_guards()                      BEFORE INSERT/UPDATE/DELETE
 *   supabase/migrations/20260912045532_delivery_item_guard_honours_erasure_flag.sql
 *     - enforce_delivery_item_guards()                 frozen items, qty >= 1
 *   supabase/migrations/20260101000010_baseline_schema.sql
 *   supabase/migrations/20260703152625_expand_deliveries_status_for_procurement.sql
 *     - chk_deliveries_status, chk_deliveries_priority
 *
 * Only the surface the delivery importers touch is modelled. Anything else a
 * test reaches returns an empty result, never a silent success for a write.
 */
import { vi } from "vitest";

type Row = Record<string, unknown>;
type PgError = { message: string; code: string };
type PgResult = { data: unknown; error: PgError | null };

/** Payload keys create_delivery() copies into its INSERT. Nothing else lands. */
export const CREATE_DELIVERY_COLUMNS = [
  "delivery_title", "description", "vendor", "po_number", "carrier", "tracking_number",
  "scheduled_date", "required_date", "expected_ship_date", "work_package_id", "priority",
  "status", "delivery_type", "load_number", "load_category", "area", "sequence_number",
  "notes", "special_instructions", "inspection_required", "receiving_location",
  "contact_name", "contact_phone", "metadata",
] as const;

/** Item keys create_delivery() copies into delivery_items. */
export const CREATE_DELIVERY_ITEM_COLUMNS = [
  "qty", "assembly_mark", "sequence", "profile", "length_inches", "grade", "weight_lbs", "notes", "piece_id",
] as const;

const STATUSES = new Set([
  "Scheduled", "In Transit", "Delivered", "Partial", "Rejected", "Delayed",
  "Identified", "Quoted", "PO Issued", "Confirmed", "In Production", "Shipped", "Received", "Cancelled",
]);
const PRIORITIES = new Set(["Critical", "High", "Normal", "Low"]);
const RECEIVED = new Set(["Delivered", "Received"]);

const err = (code: string, message: string): PgResult => ({ data: null, error: { code, message } });

/** `(jsonb ->> key)::int` — PostgreSQL rejects "2.5", "abc", "" is nullif'd first only for dates. */
function castInt(value: unknown): number | null | PgError {
  if (value === null || value === undefined) return null;
  const text = String(value);
  if (!/^\s*[+-]?\d+\s*$/.test(text)) return { code: "22P02", message: `invalid input syntax for type integer: "${text}"` };
  return Number(text);
}

/** `nullif(jsonb ->> key, '')::numeric` */
function castNumeric(value: unknown): number | null | PgError {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return { code: "22P02", message: `invalid input syntax for type numeric: "${String(value)}"` };
  return n;
}

/** `nullif(jsonb ->> key, '')::date` */
function castDate(value: unknown): string | null | PgError {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    return { code: "22007", message: `invalid input syntax for type date: "${text}"` };
  }
  return text;
}

const isPgError = (v: unknown): v is PgError =>
  typeof v === "object" && v !== null && "code" in v && "message" in v;

const textOrNull = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));

export interface ProductionDeliveryDb {
  client: {
    rpc: (name: string, args: Row) => Promise<PgResult>;
    from: (table: string) => unknown;
  };
  deliveries: Map<string, Row>;
  items: Row[];
  /** Every write the client attempted, in order, including refused ones. */
  writes: Array<{ table: string; op: "insert" | "update" | "delete" | "rpc"; value?: unknown; error?: PgError | null }>;
  rpc: ReturnType<typeof vi.fn>;
  projectMode: { piece_control_mode: string };
  /** Make the next create_delivery() call fail with this error. */
  failNextCreate: (error: PgError) => void;
  reset: () => void;
}

function createDb(): ProductionDeliveryDb {
  const deliveries = new Map<string, Row>();
  const items: Row[] = [];
  const writes: ProductionDeliveryDb["writes"] = [];
  const projectMode = { piece_control_mode: "off" };
  let seq = 0;
  let nextCreateError: PgError | null = null;

  function createDelivery(args: Row): PgResult {
    if (nextCreateError) {
      const e = nextCreateError;
      nextCreateError = null;
      return { data: null, error: e };
    }
    const projectId = args.p_project_id;
    const payload = (args.p_payload ?? {}) as Row;
    if (typeof projectId !== "string" || !projectId) return err("22P02", "invalid input syntax for type uuid");
    if (String(payload.delivery_title ?? "").trim() === "") return err("23514", "delivery_title is required");

    const row: Row = { id: `del-${seq + 1}`, project_id: projectId };
    for (const column of CREATE_DELIVERY_COLUMNS) {
      if (column === "metadata") row.metadata = payload.metadata ?? {};
      else if (column.endsWith("_date")) {
        const d = castDate(payload[column]);
        if (isPgError(d)) return { data: null, error: d };
        row[column] = d;
      } else row[column] = textOrNull(payload[column]);
    }
    row.delivery_title = String(payload.delivery_title).trim();
    row.status = textOrNull(payload.status) ?? "Scheduled";
    row.priority = textOrNull(payload.priority) ?? "Normal";
    if (!STATUSES.has(String(row.status))) return err("23514", 'new row for relation "deliveries" violates check constraint "chk_deliveries_status"');
    if (!PRIORITIES.has(String(row.priority))) return err("23514", 'new row for relation "deliveries" violates check constraint "chk_deliveries_priority"');

    const lines = Array.isArray(payload.items) ? (payload.items as Row[]) : [];
    const newItems: Row[] = [];
    let pieces = 0;
    let lbs = 0;
    for (const [index, line] of lines.entries()) {
      const qty = castInt(line.qty);
      if (isPgError(qty)) return { data: null, error: qty };
      const length = castNumeric(line.length_inches);
      if (isPgError(length)) return { data: null, error: length };
      const weight = castNumeric(line.weight_lbs);
      if (isPgError(weight)) return { data: null, error: weight };
      const storedQty = Math.max(1, qty ?? 1);
      newItems.push({
        delivery_id: row.id,
        line_no: index + 1,
        qty: storedQty,
        assembly_mark: textOrNull(line.assembly_mark),
        sequence: textOrNull(line.sequence),
        profile: textOrNull(line.profile),
        length_inches: length,
        grade: textOrNull(line.grade),
        weight_lbs: weight,
        notes: textOrNull(line.notes),
        piece_id: textOrNull(line.piece_id),
        // Real columns create_delivery() never writes.
        length_text: null,
        finish: null,
      });
      pieces += storedQty;
      lbs += weight ?? 0;
    }
    // pieces / weight_tons start NULL; the RPC derives them only when items exist.
    row.pieces = newItems.length > 0 ? pieces : null;
    row.weight_tons = newItems.length > 0 ? Math.round((lbs / 2000) * 100) / 100 : null;
    row.actual_date = null;
    row.capacity_lbs = null;
    row.shipping_ticket_url = null;
    row.shipping_ticket_path = null;
    row.shipping_ticket_name = null;

    seq += 1;
    row.delivery_number = `DEL-${String(seq).padStart(3, "0")}`;
    deliveries.set(String(row.id), row);
    items.push(...newItems);
    return { data: { ...row }, error: null };
  }

  const rpc = vi.fn(async (name: string, args: Row): Promise<PgResult> => {
    const result = name === "create_delivery"
      ? createDelivery(args)
      : err("PGRST202", `fake: rpc ${name} is not modelled`);
    writes.push({ table: "deliveries", op: "rpc", value: { name, args }, error: result.error });
    return result;
  });

  /** A thenable PostgREST-ish chain; unknown filter methods just chain. */
  function builder(table: string) {
    let op: "select" | "insert" | "update" | "delete" = "select";
    let value: unknown;
    const filters: Array<[string, unknown]> = [];

    const run = (): PgResult => {
      if (op === "insert") {
        // enforce_delivery_guards: INSERT only via create_delivery().
        const result = table === "deliveries"
          ? err("42501", "Deliveries are created through create_delivery(); numbers are minted there")
          : insertItems(table, value);
        writes.push({ table, op, value, error: result.error });
        return result;
      }
      if (op === "delete") {
        const result = table === "deliveries"
          ? err("42501", "deliveries are never hard-deleted; set is_deleted instead")
          : err("42501", `fake: delete on ${table} is not modelled`);
        writes.push({ table, op, value: filters, error: result.error });
        return result;
      }
      if (op === "update") {
        const result = table === "deliveries" ? updateDelivery(filters, value as Row) : err("42501", `fake: update on ${table} is not modelled`);
        writes.push({ table, op, value, error: result.error });
        return result;
      }
      if (table === "projects") return { data: { ...projectMode }, error: null };
      return { data: [], error: null };
    };

    const chain: Record<string, unknown> = {};
    const proxy: Record<string, unknown> = new Proxy(chain, {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (v: PgResult) => unknown, reject?: (e: unknown) => unknown) => {
            try { return Promise.resolve(resolve(run())); } catch (e) { return reject ? reject(e) : Promise.reject(e); }
          };
        }
        if (prop === "insert") return (v: unknown) => { op = "insert"; value = v; return proxy; };
        if (prop === "update") return (v: unknown) => { op = "update"; value = v; return proxy; };
        if (prop === "delete") return () => { op = "delete"; return proxy; };
        if (prop === "eq") return (c: string, v: unknown) => { filters.push([c, v]); return proxy; };
        if (prop === "single" || prop === "maybeSingle") {
          return async () => {
            const result = run();
            if (result.error) return result;
            const data = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
            return { data, error: null };
          };
        }
        return () => proxy;
      },
    });
    return proxy;
  }

  function updateDelivery(filters: Array<[string, unknown]>, patch: Row): PgResult {
    const id = filters.find(([c]) => c === "id")?.[1];
    const old = deliveries.get(String(id));
    if (!old) return err("PGRST116", "JSON object requested, multiple (or no) rows returned");
    if ("project_id" in patch && patch.project_id !== old.project_id) return err("42501", "project_id is immutable");
    if ("delivery_number" in patch && patch.delivery_number !== old.delivery_number) return err("42501", "delivery_number is immutable");
    const next = { ...old, ...patch };
    if (RECEIVED.has(String(next.status)) && !RECEIVED.has(String(old.status))) {
      return err("P0001", "RECEIVE_VIA_RPC: mark a delivery received through receive_delivery() so linked piece lots advance with it");
    }
    if (next.status != null && !STATUSES.has(String(next.status))) return err("23514", "chk_deliveries_status");
    for (const column of ["pieces", "capacity_lbs"]) {
      const v = next[column];
      if (v != null && !Number.isInteger(v)) return err("22P02", `invalid input syntax for type integer: "${String(v)}"`);
    }
    deliveries.set(String(id), next);
    return { data: { ...next }, error: null };
  }

  function insertItems(table: string, value: unknown): PgResult {
    if (table !== "delivery_items") return err("42501", `fake: insert on ${table} is not modelled`);
    const rows = (Array.isArray(value) ? value : [value]) as Row[];
    for (const r of rows) {
      const parent = deliveries.get(String(r.delivery_id));
      if (!parent) return err("23503", "delivery not found");
      if (["Delivered", "Received", "Cancelled"].includes(String(parent.status))) {
        return err("42501", "Items are frozen once the delivery is received or cancelled");
      }
      if (Number(r.qty ?? 0) < 1) return err("23514", "qty must be at least 1");
    }
    items.push(...rows);
    return { data: rows, error: null };
  }

  const db: ProductionDeliveryDb = {
    client: { rpc, from: builder },
    deliveries,
    items,
    writes,
    rpc,
    projectMode,
    failNextCreate: (e) => { nextCreateError = e; },
    reset: () => {
      deliveries.clear();
      items.length = 0;
      writes.length = 0;
      rpc.mockClear();
      projectMode.piece_control_mode = "off";
      seq = 0;
      nextCreateError = null;
    },
  };
  return db;
}

/** One instance per test file (the module registry is per file). */
export const productionDeliveryDb = createDb();
