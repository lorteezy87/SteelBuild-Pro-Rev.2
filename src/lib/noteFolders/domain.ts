/**
 * Pure access + hierarchy rules for Production Notes folders.
 * Authoritative enforcement is RLS + SECURITY DEFINER RPCs; this module is
 * the shared decision table for UI, tests, and preview copy.
 */

import type {
  AccessImpact,
  AppRoleLike,
  NoteFolder,
  NoteFolderJobLink,
  NoteFolderLinkMode,
} from "./types";

const ROLE_RANK: Record<string, number> = {
  owner: 0,
  admin: 0,
  pm: 1,
  user: 1,
  member: 2,
  field: 2,
  viewer: 3,
};

export function resolveLinkSourceFolder(
  folderId: string,
  folders: readonly Pick<NoteFolder, "id" | "parent_folder_id" | "link_mode">[],
): string | null {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const seen = new Set<string>();
  let current = byId.get(folderId) ?? null;
  while (current) {
    if (seen.has(current.id)) return null;
    seen.add(current.id);
    if (current.link_mode === "independent" || !current.parent_folder_id) {
      return current.id;
    }
    current = byId.get(current.parent_folder_id) ?? null;
  }
  return null;
}

export function resolveEffectiveJobIds(
  folderId: string,
  folders: readonly Pick<NoteFolder, "id" | "parent_folder_id" | "link_mode">[],
  links: readonly Pick<NoteFolderJobLink, "folder_id" | "project_id">[],
): string[] {
  const sourceId = resolveLinkSourceFolder(folderId, folders);
  if (!sourceId) return [];
  const ids = links
    .filter((link) => link.folder_id === sourceId)
    .map((link) => link.project_id);
  return Array.from(new Set(ids)).sort();
}

/**
 * Every-job rule: an unlinked (empty) set is a general-notes folder and is
 * visible to org members. A linked folder is visible only when the user has
 * current access to every job in the effective set.
 */
export function userCanAccessEffectiveJobs(
  effectiveJobIds: readonly string[],
  userAccessibleJobIds: readonly string[],
  isOrgMember: boolean,
): boolean {
  if (!isOrgMember) return false;
  if (effectiveJobIds.length === 0) return true;
  const accessible = new Set(userAccessibleJobIds);
  return effectiveJobIds.every((jobId) => accessible.has(jobId));
}

export function isIndependentlyLinked(
  folder: Pick<NoteFolder, "parent_folder_id" | "link_mode">,
): boolean {
  return folder.link_mode === "independent" && folder.parent_folder_id != null;
}

export function canOrganizeFolders(role: AppRoleLike | null | undefined): boolean {
  return (ROLE_RANK[role ?? ""] ?? 99) <= ROLE_RANK.field;
}

export function canManageFolderLinks(role: AppRoleLike | null | undefined): boolean {
  return (ROLE_RANK[role ?? ""] ?? 99) <= ROLE_RANK.pm;
}

export function wouldCreateCycle(
  folderId: string,
  newParentId: string | null,
  folders: readonly Pick<NoteFolder, "id" | "parent_folder_id">[],
): boolean {
  if (!newParentId) return false;
  if (newParentId === folderId) return true;
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const seen = new Set<string>([folderId]);
  let current = byId.get(newParentId) ?? null;
  while (current) {
    if (seen.has(current.id)) return true;
    seen.add(current.id);
    if (!current.parent_folder_id) return false;
    current = byId.get(current.parent_folder_id) ?? null;
  }
  return false;
}

export function siblingNameConflict(
  name: string,
  parentFolderId: string | null,
  folders: readonly Pick<NoteFolder, "id" | "name" | "parent_folder_id" | "archived_at">[],
  ignoreFolderId?: string,
): boolean {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return true;
  return folders.some(
    (folder) =>
      folder.id !== ignoreFolderId &&
      folder.archived_at == null &&
      (folder.parent_folder_id ?? null) === (parentFolderId ?? null) &&
      folder.name.trim().toLowerCase() === normalized,
  );
}

export function computeAccessImpact(
  previousJobIds: readonly string[],
  nextJobIds: readonly string[],
): AccessImpact {
  const prev = new Set(previousJobIds);
  const next = new Set(nextJobIds);
  const addedJobIds = nextJobIds.filter((id) => !prev.has(id)).sort();
  const removedJobIds = previousJobIds.filter((id) => !next.has(id)).sort();
  return {
    addedJobIds,
    removedJobIds,
    accessTightens: addedJobIds.length > 0 || (previousJobIds.length === 0 && nextJobIds.length > 0),
    accessLoosens: removedJobIds.length > 0 || (previousJobIds.length > 0 && nextJobIds.length === 0),
  };
}

export function defaultLinkModeForParent(parentFolderId: string | null): NoteFolderLinkMode {
  return parentFolderId ? "inherited" : "independent";
}

export function buildFolderTree<T extends { id: string; parent_folder_id: string | null; name: string }>(
  folders: readonly T[],
): Array<T & { depth: number; children: T[] }> {
  const children = new Map<string | null, T[]>();
  folders.forEach((folder) => {
    const key = folder.parent_folder_id;
    const list = children.get(key) ?? [];
    list.push(folder);
    children.set(key, list);
  });
  for (const list of children.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  const out: Array<T & { depth: number; children: T[] }> = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const folder of children.get(parentId) ?? []) {
      out.push({ ...folder, depth, children: children.get(folder.id) ?? [] });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
