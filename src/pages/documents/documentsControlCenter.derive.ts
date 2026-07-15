/**
 * Pure derivations for the canonical Documents Control Center.
 * No React, no network. All inputs come from the normalized document shape
 * produced by `./utils.normalizeDocument`.
 *
 * Real column provenance (documents table → normalized via normalizeDocument):
 *   displayName    ← display_name / file_name / title
 *   category       ← category          (nullable string)
 *   discipline     ← discipline        (nullable string)
 *   status         ← status            (nullable string)
 *   fileSizeKb     ← file_size_kb / file_size (number|null)
 *   fileType       ← file_type         (nullable string)
 *   uploadedBy     ← uploaded_by       (nullable string)
 *   uploadedDate   ← uploaded_date / created_at
 *   folder_id      ← folder_id         (nullable uuid)
 *   due_date       ← due_date          (nullable ISO date)
 *   documentNumber ← document_number   (nullable string)
 *
 * Fields with NO real DB column (MISSING from schema — do not surface):
 *   "needs_review" as a distinct boolean flag — status "Under Review" /
 *   "Revise & Resubmit" serves this purpose; we derive it.
 */

export interface DocumentRecord {
  id?: string;
  displayName?: string | null;
  documentNumber?: string | null;
  category?: string | null;
  discipline?: string | null;
  status?: string | null;
  fileType?: string | null;
  fileSizeKb?: number | null;
  uploadedBy?: string | null;
  uploadedDate?: string | null;
  created_at?: string | null;
  due_date?: string | null;
  folder_id?: string | null;
  [key: string]: unknown;
}

export interface CategoryRow {
  category: string;
  count: number;
  totalSizeKb: number;
}

/** A `document_folders` row, as fetched by the Documents shell. */
export interface FolderRecord {
  id: string;
  name: string;
  parent_folder_id?: string | null;
}

export interface DocumentFilterInput {
  docs: DocumentRecord[];
  search: string;
  /** "All" = no category restriction. */
  category: string;
  /** "all" = no status restriction. */
  statusTab: string;
  /** null = project root. */
  currentFolderId: string | null;
  activeFilters?: {
    category?: string[];
    discipline?: string[];
    status?: string[];
  };
}

export interface DocumentsSummary {
  /** Raw KPI fields */
  total: number;
  categories: number;
  recentCount: number;       // uploaded in the last 7 days
  totalSizeKb: number;
  needsReviewCount: number;  // status is "Under Review" or "Revise & Resubmit"

  /** Decision panels */
  recentUploads: DocumentRecord[];  // newest 6 by uploadedDate
  byCategory: CategoryRow[];        // all categories sorted by count desc
  reviewQueue: DocumentRecord[];    // status Under Review / Revise & Resubmit, newest 6

  /** Tone hints for KPI cells */
  reviewTone: "danger" | "warn" | "neutral";
}

const REVIEW_STATUSES = new Set(["Under Review", "Revise & Resubmit"]);

/** Parse an ISO date string to a Date, returning null if absent/invalid. */
function parseDate(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** True if `dateStr` was within the last `days` calendar days (UTC midnight). */
export function isRecent(dateStr?: string | null, days = 7): boolean {
  const d = parseDate(dateStr);
  if (!d) return false;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days);
  return d >= cutoff;
}

/** Format bytes (from KB) into a human-readable string: "1.2 MB", "340 KB", etc. */
export function fmtSizeKb(kb: number): string {
  if (kb >= 1024 * 1024) return `${(kb / (1024 * 1024)).toFixed(1)} GB`;
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${Math.round(kb)} KB`;
}

/**
 * Walk up the parent_folder_id chain to build a breadcrumb path, root-first.
 * Bounded at depth 50 so a cycle in the data can never hang the render.
 */
export function buildFolderPath(folders: FolderRecord[], currentFolderId: string | null): FolderRecord[] {
  if (!currentFolderId) return [];
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: FolderRecord[] = [];
  let cursor = byId.get(currentFolderId);
  let safety = 0;
  while (cursor && safety++ < 50) {
    path.unshift(cursor);
    cursor = cursor.parent_folder_id ? byId.get(cursor.parent_folder_id) : undefined;
  }
  return path;
}

export interface FolderDeletionPlan {
  /** Folder ids to soft-delete. */
  deleteIds: string[];
  /** Surviving child folders promoted to their nearest surviving ancestor. */
  folderReparents: Array<{ id: string; parent_folder_id: string | null }>;
  /** Documents inside a deleted folder, promoted to the nearest surviving ancestor. */
  docReparents: Array<{ id: string; folder_id: string | null }>;
}

/**
 * Plan the reparenting that must accompany a folder delete.
 *
 * `document_folders` is a soft-delete table, so the `ON DELETE CASCADE` on
 * `parent_folder_id` never fires. Without this, a deleted folder's documents
 * and sub-folders keep pointing at a now-hidden row: they match neither the
 * root view (`folder_id IS NULL`) nor any visible folder, and disappear from
 * the UI entirely. So we promote every survivor to the nearest ancestor that
 * is not itself being deleted (root when all ancestors are going away).
 *
 * Handles bulk deletes: an ancestor and its child can both be in `folderIds`.
 */
export function planFolderDeletion(
  folders: FolderRecord[],
  docs: DocumentRecord[],
  folderIds: string[],
): FolderDeletionPlan {
  const doomed = new Set(folderIds);
  const byId = new Map(folders.map((f) => [f.id, f]));

  /** Walk up from `startId` to the first ancestor not being deleted. */
  const survivingAncestor = (startId: string | null | undefined): string | null => {
    let cursor = startId ?? null;
    let safety = 0;
    while (cursor && doomed.has(cursor) && safety++ < 50) {
      cursor = byId.get(cursor)?.parent_folder_id ?? null;
    }
    return cursor ?? null;
  };

  const folderReparents = folders
    .filter((f) => !doomed.has(f.id) && f.parent_folder_id && doomed.has(f.parent_folder_id))
    .map((f) => ({ id: f.id, parent_folder_id: survivingAncestor(f.parent_folder_id) }));

  const docReparents = docs
    .filter((d) => d.folder_id && doomed.has(d.folder_id))
    .map((d) => ({ id: d.id as string, folder_id: survivingAncestor(d.folder_id) }));

  return { deleteIds: [...doomed], folderReparents, docReparents };
}

/** Documents sitting directly inside `currentFolderId` (null = project root). */
export function scopeDocsToFolder(docs: DocumentRecord[], currentFolderId: string | null): DocumentRecord[] {
  return docs.filter((d) => (d.folder_id ?? null) === (currentFolderId ?? null));
}

const SEARCH_FIELDS = ["displayName", "documentNumber", "fileName", "description", "drawingNumber"] as const;

function matchesSearch(d: DocumentRecord, q: string): boolean {
  for (const f of SEARCH_FIELDS) {
    const v = d[f];
    if (typeof v === "string" && v.toLowerCase().includes(q)) return true;
  }
  const tags = d.tags;
  if (Array.isArray(tags) && tags.some((t) => String(t).toLowerCase().includes(q))) return true;
  return false;
}

/**
 * Filter the canonical Documents workspace.
 *
 * Folder scoping is skipped while a search is active so a global search finds
 * documents regardless of which folder the user happens to be standing in —
 * Search deliberately spans every folder, while the folder browser scopes
 * the list when the user is not searching.
 */
export function filterDocuments(input: DocumentFilterInput): DocumentRecord[] {
  const { docs, search, category, statusTab, currentFolderId, activeFilters = {} } = input;
  const q = search.trim().toLowerCase();
  const categoryFilters = activeFilters.category ?? [];
  const disciplineFilters = activeFilters.discipline ?? [];
  const statusFilters = activeFilters.status ?? [];

  let result = q ? docs.filter((d) => matchesSearch(d, q)) : scopeDocsToFolder(docs, currentFolderId);

  if (category !== "All" || categoryFilters.length > 0) {
    result = result.filter((d) => {
      const value = d.category || "Uncategorized";
      return (category === "All" || value === category)
        && (categoryFilters.length === 0 || categoryFilters.includes(value));
    });
  }
  if (disciplineFilters.length > 0) {
    result = result.filter((d) => disciplineFilters.includes(d.discipline || ""));
  }
  if (statusTab !== "all") {
    result = result.filter((d) => d.status === statusTab);
  } else if (statusFilters.length > 0) {
    result = result.filter((d) => statusFilters.includes(d.status || ""));
  }

  return [...result].sort((a, b) => {
    const da = parseDate(a.uploadedDate ?? a.created_at)?.getTime() ?? 0;
    const db = parseDate(b.uploadedDate ?? b.created_at)?.getTime() ?? 0;
    return db - da;
  });
}

/** Group documents by category, returning sorted rows (count desc). */
export function categoryBreakdown(docs: DocumentRecord[]): CategoryRow[] {
  const map = new Map<string, { count: number; totalSizeKb: number }>();
  for (const d of docs) {
    const key = d.category || "Uncategorized";
    const entry = map.get(key) ?? { count: 0, totalSizeKb: 0 };
    entry.count += 1;
    entry.totalSizeKb += Number(d.fileSizeKb) || 0;
    map.set(key, entry);
  }
  return [...map.entries()]
    .map(([category, { count, totalSizeKb }]) => ({ category, count, totalSizeKb }))
    .sort((a, b) => b.count - a.count);
}

/** Build the full Documents Control Center summary from a normalized list. */
export function buildDocumentsSummary(docs: DocumentRecord[]): DocumentsSummary {
  const totalSizeKb = docs.reduce((sum, d) => sum + (Number(d.fileSizeKb) || 0), 0);

  const recentDocs = docs.filter((d) => isRecent(d.uploadedDate ?? d.created_at));

  const reviewQueue = docs
    .filter((d) => REVIEW_STATUSES.has(d.status || ""))
    .sort((a, b) => {
      const da = parseDate(a.uploadedDate ?? a.created_at)?.getTime() ?? 0;
      const db = parseDate(b.uploadedDate ?? b.created_at)?.getTime() ?? 0;
      return db - da;
    });

  const recentUploads = [...docs]
    .sort((a, b) => {
      const da = parseDate(a.uploadedDate ?? a.created_at)?.getTime() ?? 0;
      const db = parseDate(b.uploadedDate ?? b.created_at)?.getTime() ?? 0;
      return db - da;
    })
    .slice(0, 6);

  const catRows = categoryBreakdown(docs);
  const categoryCount = new Set(docs.map((d) => d.category || "Uncategorized")).size;

  const needsReviewCount = reviewQueue.length;

  return {
    total: docs.length,
    categories: categoryCount,
    recentCount: recentDocs.length,
    totalSizeKb,
    needsReviewCount,

    recentUploads,
    byCategory: catRows,
    reviewQueue: reviewQueue.slice(0, 6),

    reviewTone: needsReviewCount > 10 ? "danger" : needsReviewCount > 0 ? "warn" : "neutral",
  };
}
