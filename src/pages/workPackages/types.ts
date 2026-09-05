export interface WorkPackageReleaseSummary {
  id: string;
  releaseNumber: string | null;
  released: boolean;
  isException: boolean;
  canonical?: boolean;
  weightTons: number | null;
  releaseDate: string | null;
  count: number;
}

export interface WorkPackagePieceCounts {
  leafCount: number;
  onHold: number;
  notStarted: number;
  released: number;
  inFabrication: number;
  fabricated: number;
  shipped: number;
  delivered: number;
  erected: number;
}

export interface WorkPackageSignals {
  phase: string;
  status: string;
  risk: "high" | "medium" | "clear";
  progress: number;
  readinessScore: number;
  hourBurn: number;
  totalBudgetHours: number;
  flags: Array<{ key?: string; label: string; severity: string }>;
  drawing: {
    linkedCount: number;
    approvedCount: number;
    fabReadyCount?: number;
    blockedCount?: number;
    [key: string]: any;
  };
  /** Present once the page joins Fab Release + piece rollups. */
  storedPhase?: string;
  derivedPhase?: string;
  phaseMismatch?: boolean;
  pieceDriven?: boolean;
  released?: boolean;
  release?: WorkPackageReleaseSummary | null;
  pieces?: WorkPackagePieceCounts | null;
  [key: string]: any;
}

export interface WorkPackage {
  id?: string;
  wp_number?: string;
  name?: string;
  project_id?: string;
  project_name?: string;
  crew?: string;
  phase?: string;
  status?: string;
  notes?: string;
  tonnage?: number | string;
  scheduled_end_date?: string | null;
  _signals?: WorkPackageSignals;
  [key: string]: any;
}

export interface PhaseRollupRow {
  phase: string;
  count: number;
  tons: number;
  progress: number;
  [key: string]: any;
}

export interface WorkPackageMetrics {
  enriched: WorkPackage[];
  totalCount: number;
  totalTons: number;
  progress: number;
  laborBurn: number;
  totalActualHours: number;
  totalBudgetHours: number;
  highRisk: WorkPackage[];
  mediumRisk: WorkPackage[];
  readyForShip: WorkPackage[];
  fieldReady: WorkPackage[];
  onHold: WorkPackage[];
  drawingGaps: WorkPackage[];
  readyForFab: WorkPackage[];
  overdue?: WorkPackage[];
  released?: WorkPackage[];
  exceptionReleases?: WorkPackage[];
  phaseMismatches?: WorkPackage[];
  pieceDrivenCount?: number;
  tonnageMissingCount?: number;
  progressMethod?: "tonnage" | "partial-tonnage" | "count";
  phaseRollup: PhaseRollupRow[];
  [key: string]: any;
}
