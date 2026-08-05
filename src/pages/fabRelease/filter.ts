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
      if (riskFilter !== "all" && signals.risk !== riskFilter) return false;
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
      ].join(" ").toLowerCase();

      return haystack.includes(q);
    })
    .sort(sortFabPackagesForRelease);
}
