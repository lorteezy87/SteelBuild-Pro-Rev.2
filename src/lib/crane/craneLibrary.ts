/**
 * craneLibrary.ts — the company's crane fleet and each crane's load charts.
 *
 * Persisted in localStorage, like the calculator's Pick History, so it works
 * with no backend change. That also means it lives on ONE device: a crane
 * company shares its fleet by exporting the library to a JSON file and
 * importing it on each device. Every read validates, so a hand-edited or
 * truncated file is refused with a reason rather than loaded half-broken.
 *
 * Stored PER ORGANIZATION. A fleet is one company's, and a browser can hold
 * several workspaces (org switcher, shared shop PC): an unscoped key would put
 * company A's charts in front of company B and the calculator would select one.
 * No active org means no library — nothing is read or written.
 *
 * Storage-touching functions take an optional `storage` so tests inject a fake
 * (same convention as components/calculators/tapeStore).
 */
import { validateLoadChart, type BoomType, type LoadChart } from "./loadChart";

export const CRANE_LIBRARY_KEY = "crane-library-v1";

/** The storage key for one organization's fleet. */
export function libraryKey(orgId: string): string {
  return `${CRANE_LIBRARY_KEY}:${orgId}`;
}
export const EXPORT_FORMAT = "steelbuild-crane-library";
export const EXPORT_VERSION = 1;

export type OutriggerSetup = "full" | "intermediate" | "retracted" | "on-rubber" | "crawler";
export type AreaOfOperation = "360" | "over-rear" | "over-front" | "over-side";

export const OUTRIGGER_LABELS: Record<OutriggerSetup, string> = {
  full: "Outriggers fully extended",
  intermediate: "Outriggers intermediate",
  retracted: "Outriggers retracted",
  "on-rubber": "On rubber",
  crawler: "Crawler (tracks)",
};

export const AREA_LABELS: Record<AreaOfOperation, string> = {
  "360": "360°",
  "over-rear": "Over rear",
  "over-front": "Over front",
  "over-side": "Over side",
};

/** One chart in the chart book: everything that must match for it to apply. */
export interface CraneConfiguration {
  id: string;
  /** Short name the operator picks from, e.g. "Main boom · 58k CWT · full OR". */
  label: string;
  boomType: BoomType;
  /** As written in the chart book, e.g. "58,000 lb". Identifies the chart; not used in math. */
  counterweight: string;
  outriggers: OutriggerSetup;
  areaOfOperation: AreaOfOperation;
  /** Where the numbers came from — chart book, page, revision. Printed on every pick. */
  chartSource: string;
  chart: LoadChart;
}

export interface CraneRecord {
  id: string;
  /** Fleet unit number or name, e.g. "Crane 14". */
  unit: string;
  makeModel: string;
  serial: string;
  configurations: CraneConfiguration[];
  updatedAt: string;
}

const OUTRIGGERS = Object.keys(OUTRIGGER_LABELS) as OutriggerSetup[];
const AREAS = Object.keys(AREA_LABELS) as AreaOfOperation[];

export function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getStorage(storage?: Storage | null): Storage | null {
  if (storage !== undefined) return storage;
  return typeof globalThis !== "undefined" && (globalThis as { localStorage?: Storage }).localStorage
    ? (globalThis as { localStorage: Storage }).localStorage
    : null;
}

const isStr = (v: unknown): v is string => typeof v === "string";

/**
 * Check a configuration's shape and its chart. Returns problems as sentences;
 * an empty list means it is safe to read capacities from.
 */
export function validateConfiguration(cfg: unknown): string[] {
  const c = cfg as Partial<CraneConfiguration> | null;
  if (!c || typeof c !== "object") return ["Configuration is not an object."];
  const name = isStr(c.label) && c.label.trim() ? `"${c.label}"` : "A configuration";
  const problems: string[] = [];
  if (!isStr(c.id) || !c.id) problems.push(`${name} has no id.`);
  if (!isStr(c.label) || !c.label.trim()) problems.push(`${name} needs a name.`);
  if (c.boomType !== "telescopic" && c.boomType !== "lattice") problems.push(`${name}: boom type must be telescopic or lattice.`);
  if (!OUTRIGGERS.includes(c.outriggers as OutriggerSetup)) problems.push(`${name}: unknown outrigger setup.`);
  if (!AREAS.includes(c.areaOfOperation as AreaOfOperation)) problems.push(`${name}: unknown area of operation.`);
  if (!isStr(c.counterweight)) problems.push(`${name}: counterweight must be text.`);
  // Printed on every pick summary as the chart reference — blank is not provenance.
  if (!isStr(c.chartSource) || !c.chartSource.trim()) problems.push(`${name} needs a chart source (chart book, page, revision).`);
  const v = validateLoadChart(c.chart as LoadChart);
  v.errors.forEach((e) => problems.push(`${name}: ${e.message}`));
  return problems;
}

export function validateCrane(crane: unknown): string[] {
  const c = crane as Partial<CraneRecord> | null;
  if (!c || typeof c !== "object") return ["Crane is not an object."];
  const name = isStr(c.unit) && c.unit.trim() ? `Crane "${c.unit}"` : "A crane";
  const problems: string[] = [];
  if (!isStr(c.id) || !c.id) problems.push(`${name} has no id.`);
  if (!isStr(c.unit) || !c.unit.trim()) problems.push(`${name} needs a unit name or number.`);
  if (!isStr(c.makeModel)) problems.push(`${name}: make/model must be text.`);
  if (!isStr(c.serial)) problems.push(`${name}: serial must be text.`);
  if (!Array.isArray(c.configurations)) {
    problems.push(`${name} has no configuration list.`);
    return problems;
  }
  const ids = new Set<string>();
  c.configurations.forEach((cfg) => {
    validateConfiguration(cfg).forEach((p) => problems.push(`${name} — ${p}`));
    const id = (cfg as CraneConfiguration)?.id;
    if (isStr(id)) {
      if (ids.has(id)) problems.push(`${name} has two configurations with the same id.`);
      ids.add(id);
    }
  });
  return problems;
}

/**
 * Load the fleet. Never throws. A record that fails validation is DROPPED,
 * not repaired — a chart that cannot be trusted must not be selectable.
 */
export function loadLibrary(orgId: string | null, storage?: Storage | null): CraneRecord[] {
  const store = getStorage(storage);
  if (!store || !orgId) return [];
  try {
    const raw = store.getItem(libraryKey(orgId));
    if (raw == null) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c) => validateCrane(c).length === 0) as CraneRecord[];
  } catch {
    return [];
  }
}

/** Persist the fleet. Returns false if the browser refused (quota, private mode) or there is no org. */
export function saveLibrary(cranes: CraneRecord[], orgId: string | null, storage?: Storage | null): boolean {
  const store = getStorage(storage);
  if (!store || !orgId) return false;
  try {
    store.setItem(libraryKey(orgId), JSON.stringify(cranes));
    return true;
  } catch {
    return false;
  }
}

/** Insert or replace a crane by id. Pure. */
export function upsertCrane(cranes: CraneRecord[], crane: CraneRecord): CraneRecord[] {
  const stamped = { ...crane, updatedAt: new Date().toISOString() };
  const i = cranes.findIndex((c) => c.id === crane.id);
  if (i === -1) return [...cranes, stamped];
  const next = cranes.slice();
  next[i] = stamped;
  return next;
}

export function removeCrane(cranes: CraneRecord[], id: string): CraneRecord[] {
  return cranes.filter((c) => c.id !== id);
}

export interface LibraryExport {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  cranes: CraneRecord[];
}

export function exportLibrary(cranes: CraneRecord[]): string {
  const body: LibraryExport = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    cranes,
  };
  return JSON.stringify(body, null, 2);
}

export interface ImportResult {
  cranes: CraneRecord[];
  added: number;
  updated: number;
  /** Cranes refused, each with the reason. Valid cranes in the same file still import. */
  rejected: string[];
  /** A problem with the file itself — nothing was imported. */
  fatal: string | null;
}

/**
 * Merge an exported library into the current one. A crane with an id already
 * present REPLACES it (re-importing the office's master file updates every
 * device); new ids are added. Each crane is validated on its own, so one bad
 * chart does not block the rest — but it is named, never silently skipped.
 */
export function importLibrary(text: string, existing: CraneRecord[]): ImportResult {
  const none = (fatal: string): ImportResult => ({ cranes: existing, added: 0, updated: 0, rejected: [], fatal });
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return none("That file is not valid JSON.");
  }
  const body = parsed as Partial<LibraryExport> | null;
  if (!body || body.format !== EXPORT_FORMAT) return none("That is not a SteelBuild crane library export.");
  if (body.version !== EXPORT_VERSION) return none(`Crane library version ${String(body.version)} is not supported by this version of the app.`);
  if (!Array.isArray(body.cranes)) return none("The file contains no crane list.");

  let cranes = existing.slice();
  let added = 0;
  let updated = 0;
  const rejected: string[] = [];
  body.cranes.forEach((c) => {
    const problems = validateCrane(c);
    if (problems.length) {
      rejected.push(problems[0] + (problems.length > 1 ? ` (+${problems.length - 1} more)` : ""));
      return;
    }
    const rec = c as CraneRecord;
    if (cranes.some((x) => x.id === rec.id)) updated++;
    else added++;
    cranes = upsertCrane(cranes, rec);
  });
  return { cranes, added, updated, rejected, fatal: null };
}

/** "Crane 14 — Grove GMK5150L" */
export function craneDisplayName(c: CraneRecord): string {
  return c.makeModel.trim() ? `${c.unit} — ${c.makeModel}` : c.unit;
}

/** "Full OR · 360° · 58,000 lb CWT · telescopic" — what makes this chart this chart. */
export function configurationSummary(cfg: CraneConfiguration): string {
  return [
    OUTRIGGER_LABELS[cfg.outriggers],
    AREA_LABELS[cfg.areaOfOperation],
    cfg.counterweight.trim() ? `${cfg.counterweight.trim()} CWT` : null,
    cfg.boomType === "lattice" ? "lattice boom" : "telescopic boom",
  ].filter(Boolean).join(" · ");
}
