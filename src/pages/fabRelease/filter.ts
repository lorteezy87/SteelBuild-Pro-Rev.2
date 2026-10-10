import { matchesSequenceFilter } from "@/components/shared/SequenceFilter";
import { sortFabPackagesForRelease } from "./analytics";
import { stageMeta } from "./format";
import type { EnrichedWorkPackage } from "./types";

type FilterOptions = {
  stageFilter?: string;
  riskFilter?: string;
  seqFilter?: unknown;
  search?: string;
};

export function filterFabReleasePackages(
  enriched: EnrichedWorkPackage[],
  { stageFilter = "all", riskFilter = "all", seqFilter = null, search = "" }: FilterOptions = {},
) {
  const q = search.trim().toLowerCase();

  return enriched
    .filter((wp) => {
      const signals = wp._signals;
      if (stageFilter !== "all" && signals.stage !== stageFilter) return false;
      if (riskFilter === "release-ready" && signals.releaseGateState !== "ready") return false;
      if (riskFilter === "release-blocked" && signals.releaseGateState !== "blocked") return false;
      if (riskFilter === "release-released" && signals.releaseGateState !== "released") return false;
      if (riskFilter === "release-unverified" && signals.releaseGateState !== "unverified") return false;
      if (!["all", "release-ready", "release-blocked", "release-released", "release-unverified"].includes(riskFilter) && signals.risk !== riskFilter) return false;
      if (!matchesSequenceFilter(wp, seqFilter)) return false;
      if (!q) return true;

      const haystack = [
        wp.wp_number,
        wp.name,
        wp.project_name,
        wp.crew,
        wp.status,
        wp.phase,
        wp.notes,
        stageMeta(signals.stage).label,
        ...signals.drawing.packageNames,
        ...signals.flags.map((flag) => flag.label),
        ...((signals.releaseGate?.blockers ?? [])),
      ].join(" ").toLowerCase();

      return haystack.includes(q);
    })
    .sort(sortFabPackagesForRelease);
}
