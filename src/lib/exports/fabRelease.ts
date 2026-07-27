/**
 * fabRelease.ts — Pure helpers for the "Export Fab Release" package.
 *
 * Pulls every drawing with a stamp/stage indicating it's released for
 * fabrication, groups by drawing-set, and produces the tabular manifest
 * + README that ship inside the export.
 *
 * Slice 8: `isApprovedForFab` reuses piece-control IFC/Released readiness
 * (`isGoverningDrawingReleaseReady`) so package export and piece release agree.
 *
 * Note on packaging: jszip is NOT in package.json (verified 2026-05-03),
 * so the modal falls back to delivering a manifest CSV + a README text
 * file + a list of signed file URLs the user downloads manually. This
 * is documented in the modal UI and the README header.
 */
import { isGoverningDrawingReleaseReady } from "@/lib/pieceControl/drawingReleaseReady";

/** Minimal drawing shape used by fab-release / turnover / claims helpers. */
export interface DrawingLike {
  id?: string | null;
  sheet_number?: string | null;
  title?: string | null;
  drawing_set_id?: string | null;
  drawing_set_name?: string | null;
  project_id?: string | null;
  discipline?: string | null;
  revision_number?: string | number | null;
  stage?: string | null;
  set_approval_status?: string | null;
  ifc_status?: string | null;
  is_deleted?: boolean | null;
  is_superseded?: boolean | null;
  current_release_status?: string | null;
  current_revision_status?: string | null;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
  reviewer?: string | null;
  notes?: string | null;
}

/** Optional evidence so package export can use submittal-derived IFC/Released. */
export interface FabApprovalEvidence {
  submittals?: Array<{
    id: string;
    status: string;
    ball_in_court?: string | null;
    drawing_set_ids?: string[] | null;
    submitted_date?: string | null;
    updated_at?: string | null;
    round_number?: number | null;
    is_deleted?: boolean | null;
    deleted_at?: string | null;
  }> | null;
  drawingSignoffs?: Array<{
    drawing_id: string;
    drawing_revision_id?: string | null;
    stamp_type: string;
    is_voided?: boolean | null;
  }> | null;
  drawingRevisions?: Array<{
    id: string;
    drawing_id: string;
    is_current: boolean;
    archived_at?: string | null;
  }> | null;
}

/** Sign-off row merged into the fab manifest. */
export interface SignoffLike {
  drawing_id?: string | null;
  signed_by?: string | null;
  signed_at?: string | null;
  status?: string | null;
}

export interface DrawingSetGroup {
  setName: string;
  sheets: DrawingLike[];
}

export interface DateGroup<T> {
  date: string;
  items: T[];
}

export interface ProjectLike {
  id?: string | null;
  name?: string | null;
}

export interface ReadmeOptions {
  kind?: string;
  project?: ProjectLike;
  groups?: DrawingSetGroup[];
  totalCount?: number | null;
  zipped?: boolean;
  now?: Date;
}

export interface PackageNameOptions {
  kind?: string;
  project?: ProjectLike;
  now?: Date;
}

export interface RfiLike {
  id?: string | null;
  rfi_number?: string | null;
  title?: string | null;
  status?: string | null;
  author?: string | null;
  created_by?: string | null;
  question?: string | null;
  submitted_date?: string | Date | null;
  created_at?: string | Date | null;
}

export interface ChangeOrderLike {
  id?: string | null;
  co_number?: string | null;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  issued_by?: string | null;
  created_by?: string | null;
  issued_date?: string | Date | null;
  created_at?: string | Date | null;
}

export interface PhotoLike {
  id?: string | null;
  caption?: string | null;
  file_name?: string | null;
  uploaded_by?: string | null;
  linked_drawing_id?: string | null;
  taken_at?: string | Date | null;
  created_at?: string | Date | null;
}

export interface ClaimsManifestOptions {
  drawings?: DrawingLike[];
  rfis?: RfiLike[];
  changeOrders?: ChangeOrderLike[];
  photos?: PhotoLike[];
}

export type CsvCell = string | number | null | undefined;

// ── Pure filtering helpers ───────────────────────────────────────────────

/**
 * A drawing is "approved for fabrication" if any of these is true:
 *  - stage === "Released" (canonical IFC/released for construction)
 *  - set_approval_status === "approved" or "approved_as_noted"
 *  - ifc_status === "Approved" or "Approved as Noted"
 *
 * (set_approval_status check values come from migration 074 — see the
 * supabase_drawings_constraints memory.)
 */
/**
 * Package export membership predicate (Slice 8).
 * Aligns with piece-control Slice 6: IFC / Released via submittal+BIC,
 * drawings.stage IFC/Released, or fab signoff — never bare Approved/AAN /
 * deprecated ifc_status alone.
 */
export function isApprovedForFab(
  d: DrawingLike | null | undefined,
  evidence: FabApprovalEvidence = {},
): boolean {
  if (!d || d.is_deleted) return false;
  if (d.is_superseded) return false;
  // Never treat a non-current / unresolved revision as fabrication-ready.
  const releaseStatus = String(d.current_release_status || d.current_revision_status || "").toLowerCase();
  if (releaseStatus === "superseded" || releaseStatus === "void" || releaseStatus === "on_hold") {
    return false;
  }

  return isGoverningDrawingReleaseReady(
    {
      id: String(d.id || ""),
      project_id: String(d.project_id || ""),
      drawing_set_id: d.drawing_set_id ?? null,
      sheet_number: d.sheet_number ?? null,
      stage: d.stage ?? null,
      set_approval_status: d.set_approval_status ?? null,
      is_deleted: d.is_deleted ?? false,
      deleted_at: null,
      is_superseded: d.is_superseded ?? false,
    },
    {
      submittals: evidence.submittals ?? undefined,
      drawingSignoffs: evidence.drawingSignoffs ?? undefined,
      drawingRevisions: evidence.drawingRevisions ?? undefined,
    },
  ).ready;
}

/**
 * Turnover scope: same IFC/Released readiness as fab release (Slice 8).
 */
export function isApprovedForTurnover(
  d: DrawingLike | null | undefined,
  evidence: FabApprovalEvidence = {},
): boolean {
  return isApprovedForFab(d, evidence);
}

/**
 * Claims scope: include EVERYTHING that isn't soft-deleted. Even
 * superseded revisions get pulled in for legal/insurance.
 */
export function isClaimable(d: DrawingLike | null | undefined): boolean {
  return !!d && d.is_deleted !== true;
}

/**
 * Group a list of drawings by `drawing_set_name`. Sheets with no
 * set name fall into an "(Ungrouped)" bucket so the manifest never
 * silently drops them.
 *
 * Returns `[{ setName, sheets }]` sorted alphabetically by setName,
 * with the ungrouped bucket pinned to the end.
 */
export function groupBySet(drawings: readonly DrawingLike[] | null | undefined): DrawingSetGroup[] {
  const map = new Map<string, DrawingLike[]>();
  for (const d of drawings || []) {
    const name = (d.drawing_set_name && d.drawing_set_name.trim()) || "(Ungrouped)";
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push(d);
  }
  const out: DrawingSetGroup[] = [];
  for (const [setName, sheets] of map.entries()) {
    sheets.sort((a, b) => String(a.sheet_number || "").localeCompare(String(b.sheet_number || "")));
    out.push({ setName, sheets });
  }
  out.sort((a, b) => {
    if (a.setName === "(Ungrouped)") return 1;
    if (b.setName === "(Ungrouped)") return -1;
    return a.setName.localeCompare(b.setName);
  });
  return out;
}

/**
 * Group items by ISO date (YYYY-MM-DD) of `dateField`. Used by claims
 * exports which group everything chronologically.
 */
export function groupByDate<T extends object>(
  items: readonly T[] | null | undefined,
  dateField: keyof T | string = "created_at",
): DateGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const it of items || []) {
    const raw = it ? (it as Record<string, unknown>)[dateField as string] : undefined;
    let key = "Undated";
    if (raw) {
      const d = raw instanceof Date ? raw : new Date(raw as string | number);
      if (!Number.isNaN(d.getTime())) key = d.toISOString().slice(0, 10);
    }
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(it);
  }
  const out: DateGroup<T>[] = [];
  for (const [date, list] of map.entries()) out.push({ date, items: list });
  // Newest first; "Undated" pinned to end
  out.sort((a, b) => {
    if (a.date === "Undated") return 1;
    if (b.date === "Undated") return -1;
    return b.date.localeCompare(a.date);
  });
  return out;
}

// ── CSV manifest ─────────────────────────────────────────────────────────

const CSV_QUOTE = (v: CsvCell): string => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;

/**
 * Build the fab-release manifest CSV. One row per drawing.
 */
export function buildFabManifestCsv(
  drawings: readonly DrawingLike[] | null | undefined,
  signoffs: readonly SignoffLike[] = [],
): string {
  const signMap = new Map<string, SignoffLike>();
  for (const s of signoffs || []) {
    if (!s?.drawing_id) continue;
    const prev = signMap.get(s.drawing_id);
    // Keep the most recent (latest signed_at) signoff per drawing.
    if (!prev || (s.signed_at && (!prev.signed_at || s.signed_at > prev.signed_at))) {
      signMap.set(s.drawing_id, s);
    }
  }
  const headers = [
    "set_name",
    "sheet_number",
    "title",
    "discipline",
    "revision",
    "stage",
    "set_approval_status",
    "last_signed_off",
    "signed_by",
    "status",
  ];
  const rows = (drawings || []).map((d) => {
    const sign = signMap.get(d.id || "") || {};
    return [
      d.drawing_set_name || "",
      d.sheet_number || "",
      d.title || "",
      d.discipline || "",
      d.revision_number ?? "",
      d.stage || "",
      d.set_approval_status || "",
      sign.signed_at || "",
      sign.signed_by || "",
      sign.status || d.stage || "",
    ];
  });
  const lines = [headers.map(CSV_QUOTE).join(","), ...rows.map((r) => r.map(CSV_QUOTE).join(","))];
  return lines.join("\n");
}

/**
 * Generic helpers for the claims / turnover packages so each can have
 * its own row shape without duplicating CSV plumbing.
 */
export function buildCsv(headers: readonly CsvCell[], rows: readonly (readonly CsvCell[])[]): string {
  const lines = [headers.map(CSV_QUOTE).join(","), ...rows.map((r) => r.map(CSV_QUOTE).join(","))];
  return lines.join("\n");
}

// ── README content ───────────────────────────────────────────────────────

/**
 * Format a Date (or anything Date can parse) as ISO yyyy-mm-dd.
 */
export function formatIsoDate(value?: Date | string | number | null): string {
  const d = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/**
 * Build the README markdown shipped at the root of the export package.
 */
export function buildReadme({
  kind = "Fab Release",
  project = {},
  groups = [],
  totalCount = null,
  zipped = false,
  now = new Date(),
}: ReadmeOptions = {}): string {
  const total = totalCount != null ? totalCount : groups.reduce((acc, g) => acc + (g.sheets?.length || 0), 0);
  const lines: string[] = [];
  lines.push(`# ${kind} Package`);
  lines.push("");
  lines.push(`- **Project:** ${project.name || "(unnamed)"}`);
  if (project.id) lines.push(`- **Project ID:** ${project.id}`);
  lines.push(`- **Generated:** ${formatIsoDate(now)}`);
  lines.push(`- **Items:** ${total}`);
  lines.push("");
  if (!zipped) {
    lines.push("> **Note:** This export was generated in fallback mode (no zip support detected).");
    lines.push("> The manifest CSV is downloaded directly and lists the signed download URLs you can fetch manually.");
    lines.push("");
  }
  lines.push("## Contents");
  lines.push("");
  if (groups.length === 0) {
    lines.push("_No items match the export criteria._");
  } else {
    for (const g of groups) {
      lines.push(`### ${g.setName} (${(g.sheets || []).length})`);
      for (const s of g.sheets || []) {
        const label = [s.sheet_number, s.title].filter(Boolean).join(" — ");
        const meta = [
          s.revision_number ? `R${s.revision_number}` : null,
          s.stage || null,
        ].filter(Boolean).join(" · ");
        lines.push(`- ${label}${meta ? `  _(${meta})_` : ""}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

/**
 * Suggest a folder / filename stem for the package.
 */
export function suggestPackageName({
  kind = "fab_release",
  project = {},
  now = new Date(),
}: PackageNameOptions = {}): string {
  const safeProj =
    String(project.name || "project")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "project";
  const stamp = formatIsoDate(now);
  const safeKind = String(kind).replace(/[^A-Za-z0-9._-]+/g, "_").toLowerCase();
  return `${safeProj}_${safeKind}_${stamp}`;
}

// ── Claims helpers ──────────────────────────────────────────────────────

/**
 * Build the claims manifest CSV — multi-entity rows so legal/insurance
 * gets every artifact in one chronological table.
 */
export function buildClaimsManifestCsv({
  drawings = [],
  rfis = [],
  changeOrders = [],
  photos = [],
}: ClaimsManifestOptions = {}): string {
  const headers = ["date", "kind", "id", "label", "status", "author", "notes"];
  const rows: CsvCell[][] = [];
  for (const d of drawings) {
    rows.push([
      formatIsoDate(d.created_at || d.updated_at || Date.now()),
      "drawing",
      d.id || "",
      [d.sheet_number, d.title].filter(Boolean).join(" — "),
      d.stage || "",
      d.reviewer || "",
      d.notes || "",
    ]);
  }
  for (const r of rfis) {
    rows.push([
      formatIsoDate(r.submitted_date || r.created_at || Date.now()),
      "rfi",
      r.id || "",
      `${r.rfi_number || ""} ${r.title || ""}`.trim(),
      r.status || "",
      r.author || r.created_by || "",
      r.question || "",
    ]);
  }
  for (const c of changeOrders) {
    rows.push([
      formatIsoDate(c.issued_date || c.created_at || Date.now()),
      "change_order",
      c.id || "",
      `${c.co_number || ""} ${c.title || c.description || ""}`.trim(),
      c.status || "",
      c.issued_by || c.created_by || "",
      c.description || "",
    ]);
  }
  for (const p of photos) {
    rows.push([
      formatIsoDate(p.taken_at || p.created_at || Date.now()),
      "photo",
      p.id || "",
      p.caption || p.file_name || "",
      "",
      p.uploaded_by || "",
      p.linked_drawing_id ? `drawing:${p.linked_drawing_id}` : "",
    ]);
  }
  rows.sort((a, b) => String(b[0]).localeCompare(String(a[0])));
  return buildCsv(headers, rows);
}

/**
 * Trigger a browser download of a Blob. Pure-ish helper — uses DOM but
 * isolated so the export module can stub it out in tests.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Trigger download of a UTF-8 text Blob (CSV / md / txt).
 */
export function downloadTextFile(
  content: string,
  filename: string,
  mime = "text/plain;charset=utf-8",
): void {
  const blob = new Blob([content], { type: mime });
  downloadBlob(blob, filename);
}
