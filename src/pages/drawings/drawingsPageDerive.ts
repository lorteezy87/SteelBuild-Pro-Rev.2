import type { RowWithAliases } from "@/api/supabaseClient";
import type { Drawing } from "@/hooks/useDrawings";
import type { DrawingSetRow } from "@/components/drawings/drawingsTableDerive";
import type { SubmittalsBySetId } from "./drawingActionHelpers";
import {
  buildDrawingSetMap,
  buildRevisionAlerts,
  buildRfiMap,
  buildSubmittalsBySetId,
  computeDisciplineCounts,
  computeExistingSetNames,
  computeSelectedSetName,
  computeStagePipeline,
  computeStatsFromSubmittals,
  filterDrawings,
  filterDrawingsBySet,
  groupByDrawingSetName,
} from "@/components/drawings/drawingsUtils";

export type Rfi = RowWithAliases<"rfis">;
export type Submittal = RowWithAliases<"submittals">;

export interface DrawingsPageFilters {
  search: string;
  discipline: string;
  stageFilter: string;
  setFilterId: string | null;
}

export interface DrawingsPageStats {
  total: number;
  released: number;
  inReview: number;
  overdue: number;
  priority: number;
  sheetCount: number;
}

export interface DrawingRevisionAlert {
  type: string;
  icon: string;
  title: string;
  detail: string;
  sheets: Drawing[];
  color: string;
  bg: string;
  border: string;
}

export interface StagePipelineItem {
  id: string;
  label: string;
  color: string;
  count: number;
}

export interface DrawingsPageModel {
  rfiMap: Record<string, Rfi>;
  submittalsBySetId: SubmittalsBySetId;
  drawingSetMap: Record<string, DrawingSetRow>;
  filtered: Drawing[];
  visibleSetMap: Record<string, DrawingSetRow>;
  setFilterLabel: string | null;
  stats: DrawingsPageStats;
  disciplineCounts: Record<string, number>;
  revisionAlerts: DrawingRevisionAlert[];
  existingSetNames: string[];
  selectedSetName: string | null;
  stagePipeline: {
    pipeStages: StagePipelineItem[];
    activeIdx: number;
  };
}

export function deriveDrawingsPageModel({
  drawings,
  rfis,
  submittals,
  drawingSetRecords,
  filters,
  selected,
  disciplines,
  terminalApprovedStatuses,
  workdayDues,
}: {
  drawings: Drawing[];
  rfis: Rfi[];
  submittals: Submittal[];
  drawingSetRecords: DrawingSetRow[];
  filters: DrawingsPageFilters;
  selected: ReadonlySet<string>;
  disciplines: readonly string[];
  terminalApprovedStatuses: ReadonlySet<string> | readonly string[];
  workdayDues: boolean;
}): DrawingsPageModel {
  const rfiMap = buildRfiMap(rfis) as Record<string, Rfi>;
  const submittalsBySetId = buildSubmittalsBySetId(
    submittals,
    terminalApprovedStatuses,
  ) as SubmittalsBySetId;
  const drawingSetMap = buildDrawingSetMap(
    drawingSetRecords,
  ) as Record<string, DrawingSetRow>;
  const filtered = filterDrawingsBySet(
    filterDrawings(drawings, filters),
    filters.setFilterId,
    drawingSetMap,
  ) as Drawing[];
  const visibleSetMap = filters.setFilterId
    ? drawingSetMap[filters.setFilterId]
      ? { [filters.setFilterId]: drawingSetMap[filters.setFilterId] }
      : {}
    : drawingSetMap;
  const drawingSets = groupByDrawingSetName(
    drawings,
  ) as Record<string, Drawing[]>;

  return {
    rfiMap,
    submittalsBySetId,
    drawingSetMap,
    filtered,
    visibleSetMap,
    setFilterLabel: filters.setFilterId
      ? drawingSetMap[filters.setFilterId]?.set_name || "Selected set"
      : null,
    stats: computeStatsFromSubmittals(
      drawings,
      drawingSetRecords,
      submittals,
      workdayDues,
    ) as DrawingsPageStats,
    disciplineCounts: computeDisciplineCounts(
      drawings,
      [...disciplines],
    ) as Record<string, number>,
    revisionAlerts: buildRevisionAlerts(
      drawings,
      rfiMap,
    ) as DrawingRevisionAlert[],
    existingSetNames: computeExistingSetNames(
      drawingSets,
      drawingSetRecords,
    ) as string[],
    selectedSetName: computeSelectedSetName(
      selected,
      drawings,
    ) as string | null,
    stagePipeline: computeStagePipeline({
      submittals,
      drawingSetRecords,
      drawings,
      stageFilter: filters.stageFilter,
    }) as DrawingsPageModel["stagePipeline"],
  };
}
