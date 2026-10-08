/** Project-scoped, selected-set evidence for the sheet context panel. */
import { supabase } from "@/lib/supabase";
import { fetchAllRows, type PageResult } from "@/lib/pagedQuery";
import { selectActionableLeafPieces } from "@/lib/pieceControl/canonicalRollups";

const IN_BATCH_SIZE = 100;
const PARALLEL_BATCHES = 4;
const DRAWING_SET_RULE_VERSION = "drawing-shop-v2";

interface SetSheet { id: string }
interface PieceLink { id: string; piece_id: string }
interface LinkedPiece {
  id: string;
  project_id: string;
  parent_piece_id: string | null;
  work_package_id: string | null;
  is_container: boolean;
  is_deleted: boolean;
  deleted_at: string | null;
}
interface ChildPiece {
  id: string;
  parent_piece_id: string | null;
  is_container: boolean;
  is_deleted: boolean;
  deleted_at: string | null;
}
interface ScopedWorkPackage {
  id: string;
  wp_number: string | null;
  name: string | null;
}

export interface DrawingSetGate {
  ok: boolean;
  blockers: Array<{ kind: string; title: string }>;
  blockingRfiNumbers: string[];
  evaluatedAt: string | null;
  /** These are selected by the server release rule, not a client-side sort. */
  submittalId: string | null;
  submittalNumber: string | null;
  governingStage: string;
}

export interface SetWorkPackageScope extends ScopedWorkPackage {
  leafLotCount: number;
}

export interface SelectedSetScope {
  linkedLeafLotCount: number;
  unassignedLeafLotCount: number;
  /** Direct set links stranded on split parents; the release gate ignores them. */
  splitParentSetLinks: number;
  workPackages: SetWorkPackageScope[];
  unresolvedWorkPackageCount: number;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function evaluateDrawingSetGate(projectId: string, setId: string): Promise<DrawingSetGate> {
  const { data, error } = await supabase.rpc("evaluate_fab_release_set", {
    p_project_id: projectId,
    p_drawing_set_id: setId,
  });
  if (error) throw error;
  const result = asObject(data);
  // The older hosted SQL can return a plausible clear result while applying
  // different governing-submittal rules. Fail closed until v2 is deployed.
  if (!result || result.rule_version !== DRAWING_SET_RULE_VERSION) {
    throw new Error("Drawing-set gate returned an unsupported rule version.");
  }
  if (result.drawing_set_id !== setId || typeof result.ok !== "boolean"
    || !Array.isArray(result.blockers) || !Array.isArray(result.blocking_rfi_numbers)
    || !(result.submittal_id === null || typeof result.submittal_id === "string")
    || !(result.submittal_number === null || typeof result.submittal_number === "string")
    || typeof result.governing_stage !== "string"
    || result.blocking_rfi_numbers.some((value) => typeof value !== "string")) {
    throw new Error("Drawing-set gate returned incomplete evidence.");
  }
  const blockers = result.blockers.map((value) => asObject(value));
  if (blockers.some((value) => !value || typeof value.kind !== "string" || typeof value.title !== "string")) {
    throw new Error("Drawing-set gate returned invalid blocker evidence.");
  }
  return {
    ok: result.ok,
    blockers: blockers.map((value) => ({ kind: String(value!.kind), title: String(value!.title) })),
    blockingRfiNumbers: result.blocking_rfi_numbers.filter((value): value is string => typeof value === "string"),
    evaluatedAt: typeof result.evaluated_at === "string" ? result.evaluated_at : null,
    submittalId: result.submittal_id as string | null,
    submittalNumber: result.submittal_number as string | null,
    governingStage: result.governing_stage,
  };
}

function batches(ids: string[]): string[][] {
  const unique = [...new Set(ids.filter(Boolean))];
  const out: string[][] = [];
  for (let start = 0; start < unique.length; start += IN_BATCH_SIZE) {
    out.push(unique.slice(start, start + IN_BATCH_SIZE));
  }
  return out;
}

async function readBatches<T>(
  ids: string[],
  label: string,
  page: (batch: string[], start: number, end: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const chunks = batches(ids);
  const rows: T[] = [];
  for (let start = 0; start < chunks.length; start += PARALLEL_BATCHES) {
    const group = await Promise.all(chunks.slice(start, start + PARALLEL_BATCHES).map((chunk) =>
      fetchAllRows<T>((from, to) => page(chunk, from, to), label)));
    for (const result of group) rows.push(...result);
  }
  return rows;
}

/**
 * Read both canonical link paths used by work_package_drawing_set_reports:
 * direct piece→set and piece→sheet→set. Every call is bounded and paged to
 * completion; no per-piece fetches or sheet-number joins.
 */
export async function fetchSelectedSetScope(projectId: string, setId: string): Promise<SelectedSetScope> {
  const [setResult, sheets, directLinks] = await Promise.all([
    // Unique ID plus range(0,0) is a bounded existence check.
    // eslint-disable-next-line no-restricted-syntax
    supabase.from("drawing_sets")
      .select("id")
      .eq("id", setId)
      .eq("project_id", projectId)
      .eq("is_deleted", false)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(0, 0),
    fetchAllRows<SetSheet>(async (start, end) => {
      // Paged to completion by fetchAllRows; the rule also flags its callback.
      // eslint-disable-next-line no-restricted-syntax
      const { data, error } = await supabase.from("drawings")
        .select("id")
        .eq("project_id", projectId)
        .eq("drawing_set_id", setId)
        .eq("is_deleted", false)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(start, end);
      return { data, error };
    }, "selected set sheets"),
    fetchAllRows<PieceLink>(async (start, end) => {
      // Paged to completion by fetchAllRows.
      // eslint-disable-next-line no-restricted-syntax
      const { data, error } = await supabase.from("piece_drawing_sets")
        .select("id, piece_id")
        .eq("project_id", projectId)
        .eq("drawing_set_id", setId)
        .order("id", { ascending: true })
        .range(start, end);
      return { data, error };
    }, "selected set piece links"),
  ]);
  if (setResult.error) throw setResult.error;
  if (!setResult.data?.length) throw new Error("Drawing set not found in this project.");

  const sheetLinks = await readBatches<PieceLink>(
    sheets.map((sheet) => sheet.id),
    "selected set sheet-piece links",
    async (drawingIds, start, end) => {
      // Each ID batch is bounded and fetchAllRows pages every match.
      // eslint-disable-next-line no-restricted-syntax
      const { data, error } = await supabase.from("piece_drawings")
        .select("id, piece_id")
        .eq("project_id", projectId)
        .in("drawing_id", drawingIds)
        .order("id", { ascending: true })
        .range(start, end);
      return { data, error };
    },
  );
  const linkedPieceIds = [...new Set([...directLinks, ...sheetLinks].map((link) => link.piece_id))];
  const linkedPieces = await readBatches<LinkedPiece>(
    linkedPieceIds,
    "selected set linked pieces",
    async (pieceIds, start, end) => {
      // Each ID batch is bounded and fetchAllRows pages every match.
      // eslint-disable-next-line no-restricted-syntax
      const { data, error } = await supabase.from("pieces")
        .select("id, project_id, parent_piece_id, work_package_id, is_container, is_deleted, deleted_at")
        .eq("project_id", projectId)
        .in("id", pieceIds)
        .order("id", { ascending: true })
        .range(start, end);
      return { data, error };
    },
  );
  // Deleted linked pieces are excluded below. A missing row, however, could
  // also mean access or data-integrity drift, so a numeric zero is not safe.
  if (new Set(linkedPieces.map((piece) => piece.id)).size !== linkedPieceIds.length) {
    throw new Error("Linked piece scope is incomplete for this drawing set.");
  }
  const activeLinkedPieces = linkedPieces.filter((piece) => !piece.is_deleted && !piece.deleted_at);
  const activeChildren = await readBatches<ChildPiece>(
    activeLinkedPieces.map((piece) => piece.id),
    "selected set active child pieces",
    async (parentIds, start, end) => {
      // Each ID batch is bounded and fetchAllRows pages every match.
      // eslint-disable-next-line no-restricted-syntax
      const { data, error } = await supabase.from("pieces")
        .select("id, parent_piece_id, is_container, is_deleted, deleted_at")
        .eq("project_id", projectId)
        .eq("is_deleted", false)
        .is("deleted_at", null)
        .in("parent_piece_id", parentIds)
        .order("id", { ascending: true })
        .range(start, end);
      return { data, error };
    },
  );

  const linkedIds = new Set(linkedPieceIds);
  const directLinkedIds = new Set(directLinks.map((link) => link.piece_id));
  const activeParentIds = new Set(activeChildren.map((piece) => piece.parent_piece_id).filter((id): id is string => Boolean(id)));
  const splitParentSetLinks = activeLinkedPieces.filter((piece) => directLinkedIds.has(piece.id) && activeParentIds.has(piece.id)).length;
  const activePieceMap = new Map<string, LinkedPiece | ChildPiece>();
  for (const piece of [...activeLinkedPieces, ...activeChildren]) activePieceMap.set(piece.id, piece);
  const actionableIds = new Set(selectActionableLeafPieces([...activePieceMap.values()])
    .filter((piece) => linkedIds.has(piece.id))
    .map((piece) => piece.id));
  const leafPieces = activeLinkedPieces.filter((piece) => actionableIds.has(piece.id));
  const packageIds = [...new Set(leafPieces.map((piece) => piece.work_package_id).filter((id): id is string => Boolean(id)))];
  const workPackages = await readBatches<ScopedWorkPackage>(
    packageIds,
    "selected set work packages",
    async (ids, start, end) => {
      // Each ID batch is bounded and fetchAllRows pages every match.
      // eslint-disable-next-line no-restricted-syntax
      const { data, error } = await supabase.from("work_packages")
        .select("id, wp_number, name")
        .eq("project_id", projectId)
        .eq("is_deleted", false)
        .is("deleted_at", null)
        .in("id", ids)
        .order("id", { ascending: true })
        .range(start, end);
      return { data, error };
    },
  );
  const lotCountByPackage = new Map<string, number>();
  for (const piece of leafPieces) {
    if (!piece.work_package_id) continue;
    lotCountByPackage.set(piece.work_package_id, (lotCountByPackage.get(piece.work_package_id) ?? 0) + 1);
  }
  const resolvedIds = new Set(workPackages.map((wp) => wp.id));
  return {
    linkedLeafLotCount: leafPieces.length,
    unassignedLeafLotCount: leafPieces.filter((piece) => !piece.work_package_id).length,
    splitParentSetLinks,
    workPackages: workPackages.map((wp) => ({ ...wp, leafLotCount: lotCountByPackage.get(wp.id) ?? 0 }))
      .sort((a, b) => String(a.wp_number || a.name || a.id).localeCompare(String(b.wp_number || b.name || b.id), undefined, { numeric: true })),
    unresolvedWorkPackageCount: packageIds.filter((id) => !resolvedIds.has(id)).length,
  };
}
