/**
 * Collect piece ids created/updated by an applied import batch.
 * Import apply never writes work_package_id (Slice 1); callers assign via RPC.
 */

export type ImportRowPieceRef = {
  matched_piece_id?: string | null;
  resolution?: string | null;
  original_payload?: Record<string, unknown> | null;
  normalized_payload?: Record<string, unknown> | null;
};

export function collectAppliedPieceIds(rows: ImportRowPieceRef[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const pieceId = row.matched_piece_id ? String(row.matched_piece_id) : "";
    if (!pieceId || seen.has(pieceId)) continue;
    const resolution = String(row.resolution ?? "");
    if (resolution !== "applied_create" && resolution !== "applied_update") {
      continue;
    }
    seen.add(pieceId);
    ids.push(pieceId);
  }
  return ids;
}

function wpNumberFromPayload(
  payload: Record<string, unknown> | null | undefined,
): string {
  if (!payload || typeof payload !== "object") return "";
  for (const key of ["wp_number", "work_package", "work_package_number", "wp"]) {
    const raw = payload[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return "";
}

/**
 * Group applied piece ids by CSV wp_number hint for post-apply assign.
 */
export function collectAppliedPiecesByWpNumber(
  rows: ImportRowPieceRef[],
): Record<string, string[]> {
  const byWp: Record<string, string[]> = {};
  const seen = new Set<string>();
  for (const row of rows) {
    const pieceId = row.matched_piece_id ? String(row.matched_piece_id) : "";
    const resolution = String(row.resolution ?? "");
    if (
      !pieceId ||
      (resolution !== "applied_create" && resolution !== "applied_update")
    ) {
      continue;
    }
    const wpNumber =
      wpNumberFromPayload(row.original_payload) ||
      wpNumberFromPayload(row.normalized_payload);
    if (!wpNumber) continue;
    const key = `${pieceId}::${wpNumber.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!byWp[wpNumber]) byWp[wpNumber] = [];
    byWp[wpNumber].push(pieceId);
  }
  return byWp;
}

/** Number of applied pieces that carry a wp_number hint. */
export function countWpHints(rows: ImportRowPieceRef[]): number {
  return Object.values(collectAppliedPiecesByWpNumber(rows)).reduce(
    (sum, ids) => sum + ids.length,
    0,
  );
}

export type AppliedAssignmentBucket = {
  workPackageId: string | null;
  label: string;
  count: number;
};

export type AppliedAssignmentSummary = {
  /** Applied pieces from the batch that are still live in the register. */
  pieceCount: number;
  /** Largest bucket first; the unassigned bucket (workPackageId null) last. */
  buckets: AppliedAssignmentBucket[];
  unassigned: number;
};

/**
 * Where the batch's applied pieces sit right now — read from the live
 * register rows, not from the import — so the Imports tab can say
 * "204 of 204 already in WP-014" instead of pretending nothing happened.
 */
export function summarizeAppliedAssignment(
  rows: ImportRowPieceRef[],
  pieces: Array<{ id: string; work_package_id?: string | null }>,
  labelFor: (workPackageId: string) => string,
): AppliedAssignmentSummary {
  const wpByPiece = new Map<string, string | null>();
  for (const piece of pieces) wpByPiece.set(String(piece.id), piece.work_package_id ?? null);

  const counts = new Map<string | null, number>();
  let pieceCount = 0;
  for (const pieceId of collectAppliedPieceIds(rows)) {
    if (!wpByPiece.has(pieceId)) continue; // archived / not in the loaded register
    pieceCount += 1;
    const wp = wpByPiece.get(pieceId) ?? null;
    counts.set(wp, (counts.get(wp) ?? 0) + 1);
  }

  const unassigned = counts.get(null) ?? 0;
  const buckets: AppliedAssignmentBucket[] = [...counts.entries()]
    .filter(([wp]) => wp !== null)
    .map(([wp, count]) => ({ workPackageId: wp, label: labelFor(wp as string), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  if (unassigned > 0) buckets.push({ workPackageId: null, label: "unassigned", count: unassigned });

  return { pieceCount, buckets, unassigned };
}

/** One-line caption for the applied-batch panel. */
export function describeAppliedAssignment(summary: AppliedAssignmentSummary): string {
  if (summary.pieceCount === 0) return "No applied pieces from this batch are in the register.";
  const n = summary.pieceCount.toLocaleString();
  if (summary.buckets.length === 1) {
    const [only] = summary.buckets;
    return only.workPackageId
      ? `${n} of ${n} imported pieces are in ${only.label}.`
      : `${n} imported pieces are not assigned to a work package yet.`;
  }
  const parts = summary.buckets.map((b) =>
    b.workPackageId ? `${b.count.toLocaleString()} in ${b.label}` : `${b.count.toLocaleString()} unassigned`,
  );
  return `${n} imported pieces: ${parts.join(", ")}.`;
}

export type ImportAssignOutcome = {
  assigned: number;
  unchanged: number;
  linked: number;
  pieceCount: number;
  sheetHintCount: number;
  wpHintCount: number;
  /** Label of the package picked in the dropdown; null = "use CSV wp_number hints". */
  targetLabel: string | null;
};

/**
 * Turn the post-apply assign/link result into an honest toast. "assigned 0"
 * with "unchanged 204" means the pieces were already in that package (usually
 * because apply already assigned them), which is not "no hints found".
 */
export function describeImportAssignResult(
  r: ImportAssignOutcome,
): { tone: "success" | "info" | "warning"; message: string } {
  if (r.pieceCount === 0) {
    return { tone: "warning", message: "This batch has no applied pieces to assign or link." };
  }
  const parts: string[] = [];
  if (r.targetLabel) {
    if (r.assigned > 0) parts.push(`${r.assigned.toLocaleString()} piece${r.assigned === 1 ? "" : "s"} assigned to ${r.targetLabel}`);
    if (r.unchanged > 0) parts.push(`${r.unchanged.toLocaleString()} already in ${r.targetLabel}`);
  } else if (r.assigned > 0) {
    parts.push(`${r.assigned.toLocaleString()} piece${r.assigned === 1 ? "" : "s"} assigned from wp_number hints`);
  } else if (r.wpHintCount === 0) {
    parts.push("no work package hints in this import (pick a package above, or add a wp_number column)");
  } else if (r.unchanged > 0) {
    parts.push(`${r.unchanged.toLocaleString()} already in their hinted package`);
  } else {
    parts.push("wp_number hints did not match any active package");
  }

  if (r.linked > 0) parts.push(`${r.linked.toLocaleString()} drawing link${r.linked === 1 ? "" : "s"}`);
  else if (r.sheetHintCount === 0) parts.push("no drawing sheet hints in this import");
  else parts.push("no new drawing links (sheets already linked or not found)");

  const message = parts.join(" · ");
  return {
    tone: r.assigned > 0 || r.linked > 0 ? "success" : "info",
    message: message.charAt(0).toUpperCase() + message.slice(1) + ".",
  };
}
