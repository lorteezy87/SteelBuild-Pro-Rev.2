import {
  evaluateCanonicalReleaseGate,
  type CanonicalReleaseGate,
} from "@/lib/pieceControl/releaseRepository";

const MAX_CONCURRENT_GATE_CHECKS = 6;
export const MAX_VERIFIED_PACKAGES = 100;

interface QueryReadiness {
  isSuccess: boolean;
  isFetching: boolean;
  isStale: boolean;
  isError: boolean;
  fetchStatus: string;
  dataUpdatedAt: number;
}

interface GatePackageCandidate {
  id: string;
  wp_number?: string | null;
  released_date?: string | null;
  is_deleted?: boolean | null;
}

export function isFabReleaseSnapshotCurrent(
  workPackages: QueryReadiness,
  gates: QueryReadiness,
  hasPackagesToCheck: boolean,
  pieceControlMode: string | null,
): boolean {
  if (!workPackages.isSuccess || workPackages.isError || workPackages.isFetching || workPackages.isStale ||
    workPackages.fetchStatus === "paused" || !pieceControlMode || pieceControlMode === "off") return false;
  return !hasPackagesToCheck || (gates.isSuccess && !gates.isFetching && !gates.isStale &&
    !gates.isError && gates.fetchStatus !== "paused" &&
    gates.dataUpdatedAt >= workPackages.dataUpdatedAt);
}

/** Keep each screen refresh bounded, prioritizing packages without a WP release stamp. */
export function selectFabReleaseGatePackageIds(packages: GatePackageCandidate[]): string[] {
  return packages
    .filter((wp) => !wp.is_deleted && wp.id)
    .sort((a, b) => Number(Boolean(a.released_date)) - Number(Boolean(b.released_date)) ||
      String(b.wp_number || b.id).localeCompare(String(a.wp_number || a.id), undefined, { numeric: true }))
    .slice(0, MAX_VERIFIED_PACKAGES)
    .map((wp) => String(wp.id));
}

/** A failed per-package check stays unavailable; it can never become Ready. */
export async function loadCanonicalFabReleaseGates(
  packageIds: string[],
  evaluate: (packageId: string) => Promise<CanonicalReleaseGate> = evaluateCanonicalReleaseGate,
): Promise<Record<string, CanonicalReleaseGate | null>> {
  const results: Record<string, CanonicalReleaseGate | null> = {};
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_GATE_CHECKS, packageIds.length) }, async () => {
    while (cursor < packageIds.length) {
      const packageId = packageIds[cursor++];
      try {
        results[packageId] = await evaluate(packageId);
      } catch {
        results[packageId] = null;
      }
    }
  }));
  return results;
}
