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
    [key: string]: any;
  };
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
  due_date?: string | null;
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
  phaseRollup: PhaseRollupRow[];
  [key: string]: any;
}
