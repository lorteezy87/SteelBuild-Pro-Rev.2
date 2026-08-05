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

