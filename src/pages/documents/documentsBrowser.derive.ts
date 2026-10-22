/**
 * Pure helpers for the two-pane Documents browser (folder tree + contents
 * table). No React, no network.
 *
 * Folders are whatever the project has created in `document_folders`; nothing
 * here assumes a fixed folder list.
 */
import type { DocumentRecord, FolderRecord } from "./documentsControlCenter.derive";
import { isRecent } from "./documentsControlCenter.derive";

export type QuickView = "folder" | "recent" | "review" | "recycle";
export type SortKey = "name" | "created" | "status" | "size";
export type SortDir = "asc" | "desc";

const REVIEW_STATUSES = new Set(["under review", "revise & resubmit"]);

const byName = (a: { name?: string | null }, b: { name?: string | null }) =>
  String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined, { numeric: true, sensitivity: "base" });

/** parent id ("" = project root) → child folders, name-sorted (natural order: "2" before "10"). */
export function indexFolderChildren(folders: readonly FolderRecord[]): Map<string, FolderRecord[]> {
  const ids = new Set(folders.map((f) => f.id));
  const map = new Map<string, FolderRecord[]>();
  for (const f of folders) {
    // A folder whose parent is missing (deleted or foreign) is shown at the
    // root rather than vanishing from the tree.
    const parent = f.parent_folder_id && ids.has(f.parent_folder_id) && f.parent_folder_id !== f.id ? f.parent_folder_id : "";
    const list = map.get(parent) ?? [];
    list.push(f);
    map.set(parent, list);
  }
  for (const list of map.values()) list.sort(byName);
  return map;
}

export function childFolders(index: Map<string, FolderRecord[]>, parentId: string | null): FolderRecord[] {
  return index.get(parentId ?? "") ?? [];
}

/** Ids of every ancestor of `folderId`, root-first, so the tree can auto-expand to it. */
export function ancestorIds(folders: readonly FolderRecord[], folderId: string | null): string[] {
  if (!folderId) return [];
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out: string[] = [];
  let cursor = byId.get(folderId)?.parent_folder_id ?? null;
  let guard = 0;
  while (cursor && guard++ < 50) {
    out.unshift(cursor);
    cursor = byId.get(cursor)?.parent_folder_id ?? null;
  }
  return out;
}

/** Documents directly inside each folder ("" = root). */
export function directDocCounts(docs: readonly DocumentRecord[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const d of docs) {
    const key = (d.folder_id as string | null | undefined) ?? "";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

export function isNeedsReview(d: DocumentRecord): boolean {
  return REVIEW_STATUSES.has(String(d.status ?? "").trim().toLowerCase());
}

/** Documents for a quick view (ignores folders on purpose: these span the project). */
export function quickViewDocs(docs: readonly DocumentRecord[], view: QuickView): DocumentRecord[] {
  if (view === "recent") return docs.filter((d) => isRecent((d.uploadedDate ?? d.created_at) as string | null));
  if (view === "review") return docs.filter(isNeedsReview);
  return [...docs];
}

function createdAt(d: DocumentRecord): number {
  const raw = (d.uploadedDate ?? d.created_at) as string | null | undefined;
  const t = raw ? new Date(raw).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}

export function sortDocuments(docs: readonly DocumentRecord[], key: SortKey, dir: SortDir): DocumentRecord[] {
  const sign = dir === "asc" ? 1 : -1;
  const name = (d: DocumentRecord) => String(d.displayName ?? d.documentNumber ?? "");
  const cmp = (a: DocumentRecord, b: DocumentRecord): number => {
    switch (key) {
      case "created":
        return createdAt(a) - createdAt(b);
      case "status":
        return String(a.status ?? "").localeCompare(String(b.status ?? ""));
      case "size":
        return (Number(a.fileSizeKb) || 0) - (Number(b.fileSizeKb) || 0);
      default:
        return name(a).localeCompare(name(b), undefined, { numeric: true, sensitivity: "base" });
    }
  };
  // Stable tiebreak on name so equal dates/statuses don't shuffle on re-render.
  return [...docs].sort((a, b) => sign * cmp(a, b) || name(a).localeCompare(name(b)));
}

export function sortFolders(folders: readonly FolderRecord[], key: SortKey, dir: SortDir): FolderRecord[] {
  const sign = dir === "asc" ? 1 : -1;
  const created = (f: FolderRecord) => {
    const raw = (f as FolderRecord & { created_at?: string | null }).created_at;
    const t = raw ? new Date(raw).getTime() : NaN;
    return Number.isNaN(t) ? 0 : t;
  };
  // Folders only sort by name or date; status/size sorts keep them by name.
  if (key === "created") return [...folders].sort((a, b) => sign * (created(a) - created(b)) || byName(a, b));
  if (key === "name") return [...folders].sort((a, b) => sign * byName(a, b));
  return [...folders].sort(byName);
}

/**
 * "03/14/2026 at 05:03 AM" in the viewer's local time. Unknown dates read
 * "—", never a fake epoch date.
 */
export function formatCreatedOn(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${date} at ${time}`;
}

/** Folder ids from `startId` down through every descendant. */
export function descendantIds(index: Map<string, FolderRecord[]>, startId: string): Set<string> {
  const out = new Set<string>([startId]);
  const stack = [startId];
  let guard = 0;
  while (stack.length && guard++ < 10_000) {
    const id = stack.pop()!;
    for (const child of index.get(id) ?? []) {
      if (!out.has(child.id)) {
        out.add(child.id);
        stack.push(child.id);
      }
    }
  }
  return out;
}

/** Folder names matching a search, for showing folder hits alongside documents. */
export function searchFolders(folders: readonly FolderRecord[], query: string): FolderRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return folders.filter((f) => String(f.name ?? "").toLowerCase().includes(q)).sort(byName);
}

/**
 * Patch that restores a soft-deleted document. A document whose folder is no
 * longer live returns to the project root; otherwise it would come back
 * inside a hidden folder and still be invisible.
 */
export function restorePatch(
  doc: { folder_id?: string | null },
  liveFolders: readonly { id: string }[],
): { patch: { is_deleted: false; deleted_at: null; folder_id?: null }; folderGone: boolean } {
  const folderGone = !!doc.folder_id && !liveFolders.some((f) => f.id === doc.folder_id);
  return { patch: { is_deleted: false, deleted_at: null, ...(folderGone ? { folder_id: null } : {}) }, folderGone };
}
