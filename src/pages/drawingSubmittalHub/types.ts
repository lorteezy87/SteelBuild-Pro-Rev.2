import type { HubTabKey } from "./hubLinks";

export interface DueInfo {
  label: string;
  days: number | null;
  overdue: boolean;
  dueSoon: boolean;
  tone: string;
  sort: number;
}

export interface Submittal {
  id: string;
  status?: string | null;
  round_number?: number | null;
  drawing_set_ids?: string[] | null;
  drawing_set_name?: string | null;
  ball_in_court?: string | null;
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
  id: string;
  set_name?: string | null;
  discipline?: string | null;
  is_deleted?: boolean;
  /** Manual drafting/release sub-state (migration 20260526220000). */
  detailing_state?: string | null;
  [key: string]: any;
}

/** A row from the `drawing_revisions` table — the AUTHORITATIVE revision source
 *  (§20-21). `is_current=true` marks the current revision for a given drawing. */
export interface DrawingRevision {
  id?: string;
  drawing_id?: string;
  revision_code?: string | null;
  version_number?: number | null;
  is_current?: boolean;
  [key: string]: any;
}

/** The authoritative current revision for one drawing, as displayed (the code)
 *  plus its version number (used only to pick the package-level max). */
export interface CurrentRevisionInfo {
  code: string;
  version: number;
}

export interface SetPackage {
  key: string;
  setId: string | null;
  name: string;
  parent: DrawingSet | null;
  sheets: Drawing[];
  /**
   * Superseded sheets, kept OUT of `sheets` so counts, due dates and the
   * due-date write targets are unchanged — but carried so readiness can tell
   * "a revision is working through this package" from "nothing to report".
   */
  supersededSheets: Drawing[];
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
  routeTab: HubTabKey;
  _submittalId: string | null;
  _drawingSetId: string | null;
  _firstSheetId: string | null;
  /** All sheet ids in the package — used by the due-date edit to write ALL sheets
   *  (not just sheets[0]) so the displayed earliestDate always reflects the write. */
  _sheetIds: string[];
  /** Effective operational state (coalesced drafting → submittal → release). */
  detailingState?: string;
  /** True when no submittal governs the package, so a drafting state applies. */
  _canDraft?: boolean;
  /** True when the package's governing workflow is Revise & Resubmit. */
  isRR?: boolean;
  /** Event glue: in-flight package with zero open linked submittals. */
  _needsUnlinkedHint?: boolean;
  /** The raw manual drawing_sets.detailing_state value (null = Not Started). */
  _detailingStateRaw?: string | null;
  /** Per-package readiness read-model (computeDetailingReadiness output). */
  _readiness?: DetailingReadiness | null;
  /** Which persisted field receives an owner edit. */
  _ownerScope?: "Submittal BIC" | "First sheet owner" | "No owner target";
}

export interface DetailingScheduleRisk {
  atRisk?: boolean;
  severity?: "critical" | "at_risk" | "on_track" | string;
  daysLate?: number;
  reasons?: string[];
}

export interface DetailingReadiness {
  backwardDates?: Record<string, string | null | undefined>;
  scheduleRisk?: DetailingScheduleRisk;
  fabricationReady?: boolean;
  erectionReady?: boolean;
  rfiBlocked?: boolean;
  revisionImpacted?: boolean;
  materialImpacted?: boolean;
  longLeadImpact?: boolean;
  prioritySequence?: boolean;
}

export interface TriageModel {
  setItems: TriageItem[];
  unlinkedSubmittalItems: TriageItem[];
  openItems: TriageItem[];
  overdue: TriageItem[];
  dueSoon: TriageItem[];
  needsAction: TriageItem[];
  noDate: TriageItem[];
  pipelineCounts: Record<string, number>;
  overdueDrawingSets: number;
  overdueUnlinkedSubmittals: number;
  dueSoonDrawingSets: number;
  noDateDrawingSets: number;
  atRiskCount: number;
}

export interface SubmittalKpis {
  pending: number;
  total: number;
}

export interface DrawingKpis {
  totalSets: number;
  totalSheets: number;
  released: number;
  inReview: number;
  overdue: number;
}

export interface SequenceReadinessRow {
  sequence: string;
  packageCount: number;
  detailingPct: number;
  fabReadyCount: number;
  erectionReadyCount: number;
  atRiskCount: number;
}

export interface RevisionImpactViewRow {
  revisionId: string;
  drawingId?: string | null;
  sheetNumber?: string | null;
  revisionCode?: string | null;
  issuedAt?: string | null;
  drawingSetName?: string | null;
  fabricated?: boolean;
  delivered?: boolean;
  inField?: boolean;
  downstreamKnown?: boolean;
  severity: "critical" | "high" | "medium" | "low" | "unknown" | string;
}

export interface ModelElementViewRow {
  id?: string | null;
  piece_mark?: string | null;
  assembly_mark?: string | null;
  profile?: string | null;
  quantity?: number | null;
  sequence_number?: string | null;
  erection_area?: string | null;
  drawing_id?: string | null;
  drawing_no?: string | null;
  fab_status?: string | null;
  is_deleted?: boolean | null;
}

export interface SubmittalRound {
  id: string;
  round_number?: number | null;
  status?: string | null;
  submitted_date?: string | null;
  returned_date?: string | null;
}

export interface ApprovalMatrixRow extends DrawingSet {
  id: string;
  submittals: Submittal[];
  latestSubmittal: Submittal | null;
  due: DueInfo;
  pendingEorResponse: boolean;
}
