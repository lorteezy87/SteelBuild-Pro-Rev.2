export interface DueInfo {
  label: string;
  days: number | null;
  overdue: boolean;
  dueSoon: boolean;
  tone: string;
  sort: number;
}

export interface Submittal {
  id?: string;
  status?: string;
  round_number?: number;
  drawing_set_ids?: string[];
  drawing_set_name?: string;
  ball_in_court?: string;
  [key: string]: any;
}

export interface Drawing {
  id?: string;
  stage?: string;
  drawing_set_id?: string;
  drawing_set_name?: string;
  is_deleted?: boolean;
  is_superseded?: boolean;
  [key: string]: any;
}

export interface DrawingSet {
  id?: string;
  set_name?: string;
  discipline?: string;
  is_deleted?: boolean;
  /** Manual drafting/release sub-state (migration 20260526220000). */
  detailing_state?: string | null;
  [key: string]: any;
}

export interface SetPackage {
  key: string;
  setId: string | null;
  name: string;
  parent: DrawingSet | null;
  sheets: Drawing[];
  submittals: Submittal[];
}

export interface TriageItem {
  id: string;
  kind: string;
  title: string;
  group: string;
  status: string;
  owner: string;
  dueDate: string | null;
  due: DueInfo;
  closed: boolean;
  needsAction: boolean;
  routeTab: string;
  _submittalId: string | null;
  _drawingSetId: string | null;
  _firstSheetId: string | null;
  /** Effective operational state (coalesced drafting → submittal → release). */
  detailingState?: string;
  /** True when no submittal governs the package, so a drafting state applies. */
  _canDraft?: boolean;
  /** The raw manual drawing_sets.detailing_state value (null = Not Started). */
  _detailingStateRaw?: string | null;
  /** Per-package readiness read-model (computeDetailingReadiness output). */
  _readiness?: any;
}
