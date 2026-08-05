/**
 * submittalLineage.ts — pure helpers for submittal package-splitting lineage
 * (Phase 3, flag `submittal_splitting`).
 *
 * A submittal can be "split" into child submittals that link back to a parent
 * via `parent_submittal_id`; `split_reason` records why. These helpers turn a
 * FLAT submittal list into a parent-grouped, indent-able render order and expose
 * a submittal's immediate parent/children — with zero React so the logic is unit-
 * tested directly. Mirrors the standalone tracker's Register.tsx tree-walk, but
 * PRESERVES the caller's incoming order (SB Pro sorts by drawing-set/number
 * upstream — see compareSubmittalsByDrawingSet) instead of the tracker's
 * urgency float, since Pro has no per-stage due clock to sort on.
 *
 * Design rules (match the tracker's observable behavior):
 *   • A child whose parent is NOT in the input list (filtered out, deleted, or
 *     from another project) is emitted as a TOP-LEVEL row but still reports its
 *     `parentId` / `parentName` so the UI can show "from <parent>" / "(removed)".
 *   • A group renders parent-first, then its children (depth+1), in the input
 *     order. Grandchildren are supported (arbitrary depth) via a recursive walk.
 *   • A cyclic parent chain (should be impossible — the DB CHECK blocks self-ref,
 *     and a real cycle needs a manual data corruption) is broken defensively so
 *     the walk always terminates: an already-emitted node is never re-emitted.
 */

/** The minimal shape this module reads off a submittal row. */
export interface LineageSubmittal {
  id?: string | null;
  parent_submittal_id?: string | null;
  submittal_number?: string | null;
  title?: string | null;
  [key: string]: unknown;
}

/** One flattened render row: the submittal plus its computed lineage context. */
export interface SubmittalLineageRow<T extends LineageSubmittal = LineageSubmittal> {
  /** The submittal itself (the exact object from the input array). */
  row: T;
  /** Indent depth: 0 = top-level, 1 = direct child, 2 = grandchild, … */
  depth: number;
  /** Number of DIRECT children present in the input list (drives the "N splits" badge). */
  childCount: number;
  /** The parent's id if this row has a parent set, else null (even if the parent is absent). */
  parentId: string | null;
  /**
   * The parent's display label if the parent is present in the input list; the
   * string "(removed)" if this row HAS a parent id but that parent is absent;
   * null if this is a genuine top-level row (no parent id at all).
   */
  parentName: string | null;
}

/** Human label for a submittal, used in "from <parent>" lineage hints. */
export function submittalLineageLabel(s: LineageSubmittal | null | undefined): string {
  if (!s) return "(removed)";
  const number = (s.submittal_number ?? "").trim();
  const title = (s.title ?? "").trim();
  if (number && title) return `${number} — ${title}`;
  return number || title || "(untitled submittal)";
}

/**
 * Flatten a submittal list into parent-grouped render rows.
 *
 * Top-level rows keep the input array's relative order (the caller's sort is
 * authoritative); each top-level row is immediately followed by its children
 * (also in input order), recursively. The result length always equals the input
 * length — every submittal appears exactly once.
 */
export function buildSubmittalLineageGroups<T extends LineageSubmittal>(
  submittals: ReadonlyArray<T>,
): Array<SubmittalLineageRow<T>> {
  const list = Array.isArray(submittals) ? submittals.filter((s): s is T => !!s && !!s.id) : [];
  if (list.length === 0) return [];

  // Index by id (last-wins on a dup id, matching a Map build) and record the
  // input position so children can be emitted in the caller's order.
  const byId = new Map<string, T>();
  for (const s of list) byId.set(s.id as string, s);

  // parentId -> ordered children present in the list.
  const childrenOf = new Map<string, T[]>();
  // Top-level rows, in input order: either no parent id, or a parent id whose
  // target isn't in this list (orphan → surfaced at the top level).
  const tops: T[] = [];
  for (const s of list) {
    const pid = s.parent_submittal_id ?? null;
    if (pid && byId.has(pid) && pid !== s.id) {
      const arr = childrenOf.get(pid);
      if (arr) arr.push(s);
      else childrenOf.set(pid, [s]);
    } else {
      tops.push(s);
    }
  }

  const out: Array<SubmittalLineageRow<T>> = [];
  const emitted = new Set<string>();

  const walk = (node: T, depth: number): void => {
    const id = node.id as string;
    // Defensive cycle break: never emit the same node twice.
    if (emitted.has(id)) return;
    emitted.add(id);

    const kids = childrenOf.get(id) ?? [];
    const pid = node.parent_submittal_id ?? null;
    const parent = pid ? byId.get(pid) ?? null : null;
    out.push({
      row: node,
      depth,
      childCount: kids.length,
      parentId: pid,
      // A present parent → its label; a set-but-absent parent → "(removed)";
      // no parent id → null (genuine top-level, no lineage hint).
      parentName: pid ? submittalLineageLabel(parent) : null,
    });
    for (const kid of kids) walk(kid, depth + 1);
  };

  for (const top of tops) walk(top, 0);

  // Safety net: if a pathological cycle left some nodes unvisited (none of their
  // ancestors was a top), append them flat so no submittal silently vanishes.
  if (out.length !== list.length) {
    for (const s of list) {
      if (!emitted.has(s.id as string)) {
        emitted.add(s.id as string);
        const pid = s.parent_submittal_id ?? null;
        out.push({
          row: s,
          depth: 0,
          childCount: (childrenOf.get(s.id as string) ?? []).length,
          parentId: pid,
          parentName: pid ? submittalLineageLabel(byId.get(pid) ?? null) : null,
        });
      }
    }
  }

  return out;
}

/**
 * The immediate parent + direct children of one submittal, resolved against a
 * pool (typically all project submittals). Pure — drives the detail panel's
 * lineage card. `parent` is null when there's no parent id OR the parent is
 * absent from the pool; `children` preserves the pool's order.
 */
export function getSubmittalLineage<T extends LineageSubmittal>(
  submittal: T | null | undefined,
  pool: ReadonlyArray<T>,
): { parent: T | null; children: T[] } {
  if (!submittal || !submittal.id) return { parent: null, children: [] };
  const all = Array.isArray(pool) ? pool : [];
  const pid = submittal.parent_submittal_id ?? null;
  const parent = pid ? all.find((s) => s && s.id === pid) ?? null : null;
  const children = all.filter((s) => s && s.parent_submittal_id === submittal.id && s.id !== submittal.id);
  return { parent, children };
}
