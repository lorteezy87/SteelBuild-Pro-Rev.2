/**
 * Pure derivations for the Documents Control Center (command_ui redesign).
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
