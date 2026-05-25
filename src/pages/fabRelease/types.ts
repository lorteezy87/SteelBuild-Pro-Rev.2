import type { ComponentType } from "react";

export type RiskLevel = "high" | "medium" | "clear";
export type ViewId = "flow" | "board" | "register" | "hours";

export interface FabStage {
  id: string;
  label: string;
  short: string;
  color: string;
  description: string;
}

export interface FabFlag {
  key: string;
  label: string;
  severity: RiskLevel;
}

export interface ReadinessGate {
  key: string;
  label: string;
  weight: number;
  pass: boolean;
  earned: number;
}

export interface DrawingPackage {
  id: string;
  set_name?: string;
  name?: string;
  metadata?: unknown;
  drawing_set_number?: number | string;
  set_number?: number | string;
  package_number?: number | string;
  isUngrouped?: boolean;
  sheetCount: number;
  releasedCount: number;
}

export interface DrawingContext {
  linkedIds: string[];
  linkedDrawings: Array<Record<string, unknown>>;
  linkedCount: number;
  knownCount: number;
  missingLinks: number;
  releasedCount: number;
  hasAny: boolean;
  hasReleased: boolean;
  allKnownReleased: boolean;
  packages: DrawingPackage[];
  packageNames: string[];
}

export interface FabSignals {
  stage: string;
  status: string;
  progress: number;
  complete: boolean;
  releasedDate: Date | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  overduePlan: boolean;
  daysSinceRelease: number | null;
  needsRelease: boolean;
  inShop: boolean;
  readyForRelease: boolean;
  drawing: DrawingContext;
  flags: FabFlag[];
  risk: RiskLevel;
  readinessScore: number;
  readinessBreakdown: ReadinessGate[];
  totalBudgetHours: number;
  totalActualHours: number;
  hourBurn: number;
}

export interface WorkPackage {
  id: string;
  wp_number?: string;
  name?: string;
  description?: string;
  project_name?: string;
  crew?: string;
  status?: string;
  phase?: string;
  notes?: string;
  tonnage?: number | string;
  released_date?: string | null;
  percent_complete?: number;
  vif_confirmed?: boolean;
  load_list_complete?: boolean;
  [key: string]: unknown;
}

export type EnrichedWorkPackage = WorkPackage & { _signals: FabSignals };

export interface StageRollup extends FabStage {
  count: number;
  tons: number;
  cumulativeTons: number;
  highRisk: number;
  mediumRisk: number;
  progress: number;
}

export interface FabMetrics {
  enriched: EnrichedWorkPackage[];
  totalCount: number;
  totalTons: number;
  releasedTons: number;
  weightedProgress: number;
  activeShop: EnrichedWorkPackage[];
  readyToShip: EnrichedWorkPackage[];
  readyForRelease: EnrichedWorkPackage[];
  exceptions: EnrichedWorkPackage[];
  warnings: EnrichedWorkPackage[];
  onHold: EnrichedWorkPackage[];
  drawingGaps: EnrichedWorkPackage[];
  releaseBlocked: EnrichedWorkPackage[];
  totalBudgetHours: number;
  totalActualHours: number;
  laborBurn: number;
  stageRollup: StageRollup[];
}

export interface FilterOption {
  id: string;
  label: string;
  icon?: ComponentType<{ size?: number | string }>;
}
