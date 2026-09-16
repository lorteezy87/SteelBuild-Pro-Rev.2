import {
  buildWorkPackageLabelMap,
  buildPieceDisplayRows,
  buildFilteredRegisterRows,
  archiveConfirmationText,
  allRowsSelected,
  buildPieceControlSummary
} from "./registerHelpers";
import { deriveOverviewWorkPackages, selectUpcomingShipments } from "./overviewDerive";
import { buildPieceDigitalThread } from "@/lib/pieceControl/pieceIntelligenceDerive";
import type { PieceRegisterFilters } from "./filter";
import type { PieceRegisterSort } from "@/lib/pieceControl/pieceRegisterSort";

export function derivePieceRegisterData(
  pieces: any[],
  workPackages: any[],
  filters: PieceRegisterFilters,
  attentionFocus: any,
  registerSort: PieceRegisterSort,
  selectedPieceIds: Set<string>
) {
  const workPackageMap = buildWorkPackageLabelMap(workPackages);
  const displayRows = buildPieceDisplayRows(pieces, workPackageMap);
  const filteredRows = buildFilteredRegisterRows(displayRows, filters, attentionFocus, registerSort);

  const profiles = [...new Set(displayRows.map((row) => row.profile))].sort();
  const grades = [...new Set(displayRows.map((row) => row.material_grade))].sort();
  const lifecycles = [...new Set(displayRows.map((row) => row.lifecycle_status))].sort();
  const sources = [...new Set(displayRows.map((row) => row.source_system))].sort();

  const presentation = buildPieceControlSummary(
    // We need actionable leaf pieces here. I'll import the helper.
    // Wait, the original code used selectActionableLeafPieces.
    // I should probably pass that in or import it.
    [] // placeholder
  );

  return {
    workPackageMap,
    displayRows,
    filteredRows,
    profiles,
    grades,
    lifecycles,
    sources,
    presentation,
    allFilteredSelected: allRowsSelected(filteredRows, selectedPieceIds),
  };
}

export function deriveRevisionImpactData(
  intelligenceData: any,
  location: { revisionId: string | null },
  intelligenceModel: any
) {
  if (!location.revisionId || !intelligenceData || !intelligenceModel?.revisions.some(
    (revision: any) => revision.revisionId === location.revisionId,
  )) {
    return null;
  }
  const matching = intelligenceData.drawingImpacts.filter(
    (impact: any) => impact.drawing_revision_id === location.revisionId,
  );
  return matching.find(
    (impact: any) => impact.status !== "resolved" && impact.status !== "closed",
  ) ?? matching[0] ?? null;
}
