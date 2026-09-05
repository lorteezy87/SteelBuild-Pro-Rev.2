/**
 * Central React Query keys + invalidation for Piece Control / Piece Register.
 *
 * Why this exists:
 *   Piece Register, Production board, Logistics, Relationships, and the 3D
 *   viewer all read overlapping data. Each write path used to list its own
 *   invalidateQueries set — easy to miss model-elements / canonical-pieces-3d
 *   and leave Fab colors stale. One helper keeps the surface consistent.
 *
 * Naming:
 *   - "piece-production" = legacy piece_production table (Production Status / EPM)
 *   - "piece-control-production" = canonical pieces + stations board inside Piece Register
 */

import type { QueryClient } from "@tanstack/react-query";

export const pieceControlKeys = {
  register: (projectId: string) => ["piece-register", projectId] as const,
  importBatches: (projectId: string) => ["piece-import-batches", projectId] as const,
  importRows: (projectId: string, batchId?: string) =>
    batchId
      ? (["piece-import-rows", projectId, batchId] as const)
      : (["piece-import-rows", projectId] as const),
  relationships: (projectId: string) => ["piece-relationships", projectId] as const,
  intelligence: (projectId: string) => ["piece-intelligence", projectId] as const,
  workPackages: (projectId: string) =>
    ["piece-register-work-packages", projectId] as const,
  /** Canonical station board (pieces + completions). Not the legacy EPM table. */
  productionBoard: (projectId: string, scopeKey?: string) =>
    scopeKey != null
      ? (["piece-control-production", projectId, scopeKey] as const)
      : (["piece-control-production", projectId] as const),
  productionWorkPackages: (projectId: string) =>
    ["piece-production-work-packages", projectId] as const,
  logistics: (projectId: string) => ["piece-logistics", projectId] as const,
  /** Legacy piece_production rows (Production Status page / shipping import). */
  legacyProduction: (projectId: string) => ["piece-production", projectId] as const,
  modelElements: (projectId: string) => ["model-elements", projectId] as const,
  canonicalPieces3d: (projectId: string) => ["canonical-pieces-3d", projectId] as const,
  canonicalReporting: (projectId: string) => ["canonical-reporting", projectId] as const,
  workPackagesLegacy: (projectId: string) => ["work-packages", projectId] as const,
  workPackagesAlt: (projectId: string) => ["workPackages", projectId] as const,
  canonicalReleaseGate: () => ["canonical-release-gate"] as const,
};

export type PieceControlInvalidateScope =
  | "register"
  | "production"
  | "logistics"
  | "relationships"
  | "import"
  | "all";

/**
 * Invalidate the query surfaces touched by a Piece Control write.
 * Always includes 3D keys when production/register lifecycle may have changed.
 */
export async function invalidatePieceControlQueries(
  queryClient: QueryClient,
  projectId: string | null | undefined,
  scope: PieceControlInvalidateScope = "all",
): Promise<void> {
  if (!projectId) return;

  const keys: ReadonlyArray<readonly unknown[]> = [];
  const push = (key: readonly unknown[]) => {
    (keys as Array<readonly unknown[]>).push(key);
  };

  push(pieceControlKeys.intelligence(projectId));

  if (scope === "all" || scope === "register" || scope === "import") {
    push(pieceControlKeys.register(projectId));
    push(pieceControlKeys.importBatches(projectId));
    push(pieceControlKeys.importRows(projectId));
    push(pieceControlKeys.workPackages(projectId));
    push(pieceControlKeys.workPackagesLegacy(projectId));
    push(pieceControlKeys.workPackagesAlt(projectId));
  }

  // Logistics transitions advance lifecycle — register list must refresh too.
  if (scope === "logistics") {
    push(pieceControlKeys.register(projectId));
  }

  // Station advances and ship/deliver/erect both run refresh_work_package_progress,
  // which rewrites work_packages.percent_complete + status — so the WP lists
  // (Package Board, dashboards) must refetch on production/logistics writes too.
  if (scope === "production" || scope === "logistics") {
    push(pieceControlKeys.workPackages(projectId));
    push(pieceControlKeys.workPackagesLegacy(projectId));
    push(pieceControlKeys.workPackagesAlt(projectId));
    push(pieceControlKeys.productionWorkPackages(projectId));
  }

  if (scope === "all" || scope === "relationships" || scope === "register") {
    push(pieceControlKeys.relationships(projectId));
  }

  // Production board + release gate: production writes and logistics lifecycle moves.
  if (
    scope === "all" ||
    scope === "production" ||
    scope === "register" ||
    scope === "logistics"
  ) {
    push(pieceControlKeys.productionBoard(projectId));
    push(pieceControlKeys.canonicalReleaseGate());
  }

  if (scope === "all" || scope === "logistics" || scope === "production") {
    push(pieceControlKeys.logistics(projectId));
  }

  // Legacy EPM table (Production Status) when lifecycle or station data moves.
  if (scope === "all" || scope === "logistics" || scope === "production") {
    push(pieceControlKeys.legacyProduction(projectId));
  }

  // Lifecycle / mark / WP changes must refresh Fab-mode coloring.
  if (
    scope === "all" ||
    scope === "register" ||
    scope === "production" ||
    scope === "logistics" ||
    scope === "relationships" ||
    scope === "import"
  ) {
    push(pieceControlKeys.modelElements(projectId));
    push(pieceControlKeys.canonicalPieces3d(projectId));
    push(pieceControlKeys.canonicalReporting(projectId));
  }

  await Promise.all(
    keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}
