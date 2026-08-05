/**
 * Pure filter/selection mutators for Documents page shell.
 */
import { selectionFromIds } from "@/pages/shared/selectionHelpers";

export function nextActiveFilters(
  prev: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> {
  return { ...(prev || {}), [key]: value };
}

export function nextCategoryFilters(
  prev: Record<string, unknown>,
  value: string,
): Record<string, unknown> {
  return {
    ...(prev || {}),
    category: value === "All" ? [] : [value],
  };
}

export function categoryFilterFromActive(
  activeFilters: { category?: string[] | null } | null | undefined,
): string {
  return activeFilters?.category?.[0] || "All";
}

/** @deprecated Prefer `@/pages/shared/selectionHelpers`. */
export {
  pruneSelectionToAllowed,
  toggleSelectionId,
  removeIdFromSelection,
} from "@/pages/shared/selectionHelpers";

/** @deprecated Prefer selectionFromIds from shared selectionHelpers. */
export function selectionFromDocs(docs: Array<{ id?: string }>): Set<string> {
  return selectionFromIds(docs);
}

/** Selected document rows from full list (order preserved). */
export function selectDocsByIds<T extends { id?: string | null }>(
  docs: T[],
  selectedIds: Set<string>,
): T[] {
  return (docs || []).filter((d) => d?.id && selectedIds.has(d.id as string));
}

/** Count live documents for a status tab key ("all" or concrete status). */
export function countDocsForStatusTab<T extends { status?: string | null }>(
  docs: T[],
  tabKey: string,
): number {
  if (tabKey === "all") return (docs || []).length;
  return (docs || []).filter((d) => d.status === tabKey).length;
}

export type FolderLike = {
  id?: string | null;
  parent_folder_id?: string | null;
  [k: string]: unknown;
};

/**
 * Walk up parent_folder_id chain from currentFolderId to build the
 * breadcrumb path. Bounded depth = 50 to defensively prevent
 * runaway loops if a cycle ever appeared in the data.
 */
export function buildFolderBreadcrumbPath<T extends FolderLike>(
  folders: T[],
  currentFolderId: string | null | undefined,
): T[] {
  if (!currentFolderId) return [];
  const byId = new Map((folders || []).map((f) => [f.id, f]));
  const path: T[] = [];
  let cursor = byId.get(currentFolderId);
  let safety = 0;
  while (cursor && safety++ < 50) {
    path.unshift(cursor);
    cursor = cursor.parent_folder_id ? byId.get(cursor.parent_folder_id as string) : undefined;
  }
  return path;
}

