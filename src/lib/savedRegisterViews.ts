/**
 * savedRegisterViews.ts — named filter sets for the drawing and submittal
 * registers, saved on this device per signed-in user.
 *
 * Why device storage and not user preferences: preferences live in auth
 * user_metadata, which rides in every access token. Filter presets are a
 * per-viewer convenience; they must not grow every request's JWT. A view is
 * only ever a filter, never data, so losing it (private window, cleared
 * storage) costs a click, not a record.
 *
 * Every read is sanitised: unknown registers, non-string/boolean values,
 * over-long text and excess views are dropped. Storage access is wrapped so a
 * throwing or absent Storage behaves as "no saved views".
 */

export const REGISTER_KEYS = ["drawing_register", "submittal_register"] as const;
export type RegisterKey = (typeof REGISTER_KEYS)[number];

export const MAX_VIEWS = 12;
export const MAX_NAME = 40;
const MAX_VALUE = 200;
const MAX_FILTER_KEYS = 12;
const VERSION = "v1";

export type FilterValue = string | boolean;

export interface SavedRegisterView {
  id: string;
  name: string;
  filters: Record<string, FilterValue>;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function storageKey(register: RegisterKey, userId: string | null | undefined): string {
  return `sbp-register-views:${VERSION}:${register}:${userId || "anonymous"}`;
}

function sanitizeFilters(input: unknown): Record<string, FilterValue> {
  const out: Record<string, FilterValue> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_FILTER_KEYS) break;
    if (!/^[a-z][a-zA-Z0-9_]{0,40}$/.test(k)) continue;
    if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "string" && v.length <= MAX_VALUE) out[k] = v;
  }
  return out;
}

export function sanitizeViews(input: unknown): SavedRegisterView[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: SavedRegisterView[] = [];
  for (const raw of input) {
    if (out.length >= MAX_VIEWS) break;
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(r.id) ? r.id : null;
    const name = typeof r.name === "string" ? r.name.trim().slice(0, MAX_NAME) : "";
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name, filters: sanitizeFilters(r.filters) });
  }
  return out;
}

function defaultStorage(): StorageLike | null {
  try {
    const ls = (globalThis as { localStorage?: StorageLike }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

export function loadViews(register: RegisterKey, userId: string | null | undefined, storage: StorageLike | null = defaultStorage()): SavedRegisterView[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(storageKey(register, userId));
    return raw ? sanitizeViews(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

/** Returns true when the write landed. */
export function storeViews(
  register: RegisterKey,
  userId: string | null | undefined,
  views: readonly SavedRegisterView[],
  storage: StorageLike | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(storageKey(register, userId), JSON.stringify(sanitizeViews(views)));
    return true;
  } catch {
    return false;
  }
}

function newId(): string {
  return `v${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export type UpsertResult =
  | { ok: true; views: SavedRegisterView[]; view: SavedRegisterView }
  | { ok: false; reason: "blank-name" | "limit" };

/** Add a view, or replace the one with the same name (case-insensitive). */
export function upsertView(
  views: readonly SavedRegisterView[],
  name: string,
  filters: Record<string, FilterValue>,
  makeId: () => string = newId,
): UpsertResult {
  const clean = name.trim().slice(0, MAX_NAME);
  if (!clean) return { ok: false, reason: "blank-name" };
  const existing = views.find((v) => v.name.toLowerCase() === clean.toLowerCase());
  if (existing) {
    const view = { ...existing, name: clean, filters: sanitizeFilters(filters) };
    return { ok: true, view, views: views.map((v) => (v.id === existing.id ? view : v)) };
  }
  if (views.length >= MAX_VIEWS) return { ok: false, reason: "limit" };
  const view = { id: makeId(), name: clean, filters: sanitizeFilters(filters) };
  return { ok: true, view, views: [...views, view] };
}

export function removeView(views: readonly SavedRegisterView[], id: string): SavedRegisterView[] {
  return views.filter((v) => v.id !== id);
}

/**
 * Read one saved filter back, falling back when the saved value is not valid
 * on this project (e.g. a set name that does not exist here).
 */
export function viewValue(
  view: SavedRegisterView,
  key: string,
  fallback: string,
  allowed?: ReadonlySet<string> | readonly string[],
): string {
  const v = view.filters[key];
  if (typeof v !== "string") return fallback;
  if (!allowed) return v;
  const ok = Array.isArray(allowed) ? (allowed as readonly string[]).includes(v) : (allowed as ReadonlySet<string>).has(v);
  return ok ? v : fallback;
}
