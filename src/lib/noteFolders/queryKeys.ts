export const noteFolderQueryKeys = {
  workspace: (orgId: string | null | undefined, includeArchived = false) =>
    ["note-folders", orgId ?? "none", includeArchived ? "archived" : "live"] as const,
};
