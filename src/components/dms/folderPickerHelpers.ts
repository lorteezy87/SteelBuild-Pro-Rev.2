/** Pure folder tree index for FolderPicker. */

export function buildTree(folders) {
  const byParent = new Map();
  for (const f of folders) {
    const key = f.parent_folder_id ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(f);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }
  return byParent;
}

/**
 * Collect a folder and ALL its descendants. Used to compute the
 * "disabled" set when reparenting: a folder can never move under
 * itself or any of its children. Bounded depth defends against
 * any cycle that might somehow appear in the data.
 */
export function collectFolderAndDescendants(folders, rootId) {
  const ids = new Set();
  if (!rootId) return ids;
  const childrenByParent = new Map();
  for (const f of folders) {
    const k = f.parent_folder_id ?? null;
    if (!childrenByParent.has(k)) childrenByParent.set(k, []);
    childrenByParent.get(k).push(f);
  }
  const stack = [rootId];
  let safety = 0;
  while (stack.length && safety++ < 1000) {
    const cur = stack.pop();
    if (ids.has(cur)) continue;
    ids.add(cur);
    const kids = childrenByParent.get(cur) || [];
    for (const k of kids) stack.push(k.id);
  }
  return ids;
}


/** Pure chrome styles for FolderPicker modal. */

export const FOLDER_PICKER_OVERLAY_STYLE: Record<string, string | number> = {
  position: "fixed",
  inset: 0,
  background: "color-mix(in srgb, var(--bg-page) 70%, transparent)",
  zIndex: 2000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export const FOLDER_PICKER_DIALOG_STYLE: Record<string, string | number> = {
  background: "var(--bg-surface-secondary)",
  border: "1px solid var(--border-default)",
  borderRadius: 10,
  width: "min(540px, 92vw)",
  maxHeight: "min(720px, 90vh)",
  display: "flex",
  flexDirection: "column",
};

export const FOLDER_PICKER_HEADER_STYLE: Record<string, string | number> = {
  padding: "14px 18px",
  borderBottom: "1px solid var(--border-default)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexShrink: 0,
};

export const FOLDER_PICKER_FOOTER_STYLE: Record<string, string | number> = {
  padding: "12px 16px",
  borderTop: "1px solid var(--border-default)",
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  flexShrink: 0,
};

export function folderPickerBtnStyle(
  variant: "primary" | "secondary" = "secondary",
): Record<string, string | number> {
  return {
    padding: "8px 14px",
    borderRadius: 6,
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    cursor: "pointer",
    border: variant === "primary" ? "1px solid var(--accent)" : "1px solid var(--border-default)",
    background: variant === "primary" ? "var(--accent)" : "transparent",
    color: variant === "primary" ? "var(--bg-base)" : "var(--text-primary)",
  };
}
