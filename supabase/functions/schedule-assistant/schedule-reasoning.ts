// ============================================================================
// SteelBuild Pro — Schedule Reasoning Layer
// ============================================================================
// Transforms raw Supabase rows into normalized ScheduleFacts that Claude
// reasons over. This layer does the construction-domain math so the model
// doesn't have to: float bands, promised-vs-needed gap analysis,
// predecessor/successor chain walks, status freshness, confidence scoring.
//
// Design principle: the LLM should never do arithmetic on dates or infer
// criticality from raw numbers. That logic lives here, deterministic and
// auditable.
// ============================================================================

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------
export type FloatBand = "CRITICAL" | "NEAR_CRITICAL" | "COMFORTABLE" | "UNKNOWN";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Confidence = "LOW" | "MEDIUM" | "HIGH";
export type FreshnessFlag = "FRESH" | "AGING" | "STALE" | "MISSING";

export interface ScheduleActivity {
  id: string;
  activity_name: string;
  wbs_phase: string;
  status: string;
  forecast_start: string | null;
  forecast_finish: string | null;
  baseline_finish: string | null;
  actual_finish: string | null;
  total_float: number | null;
  predecessors: string[];
  successors: string[];
  last_updated: string | null;
}

export interface NormalizedActivity extends ScheduleActivity {
  float_band: FloatBand;
  variance_days: number | null;        // forecast - baseline finish
  is_complete: boolean;
  is_behind: boolean;
  freshness: FreshnessFlag;
  days_since_update: number | null;
}

export interface Blocker {
  type: "RFI" | "SUBMITTAL" | "DELIVERY" | "DRAWING";
  ref: string;                          // RFI-042, PO-2245, etc.
  status: string;
  age_days: number;
  needed_by: string | null;             // when the downstream activity needs it
  promised_by: string | null;           // vendor/reviewer promised date
  gap_days: number | null;              // promised - needed (negative = late)
  impacts_activity_ids: string[];
  detail: string;
}

export interface ActivityRiskAssessment {
  activity_id: string;
  activity_name: string;
  phase: string;
  forecast_start: string | null;
  float_band: FloatBand;
  total_float: number | null;
  risk: RiskLevel;
  direct_blockers: Blocker[];
  upstream_blockers: Blocker[];         // blockers on predecessors
  driving_cause: string | null;         // plain-language summary
  confidence: Confidence;
  evidence_count: number;
}

export interface ScheduleFacts {
  project_id: string;
  as_of: string;                        // ISO timestamp of computation
  confidence: Confidence;
  staleness_warnings: string[];
  data_gaps: string[];
  summary: {
    total_activities: number;
    critical_count: number;
    near_critical_count: number;
    behind_count: number;
    open_rfi_count: number;
    pending_submittal_count: number;
    late_delivery_count: number;
  };
  critical_path: NormalizedActivity[];
  near_critical: NormalizedActivity[];
  at_risk_activities: ActivityRiskAssessment[];
  active_blockers: Blocker[];
}

// ---------------------------------------------------------------------------
// Configuration — tunable thresholds
// ---------------------------------------------------------------------------
export const THRESHOLDS = {
  FLOAT_CRITICAL_MAX: 0,              // <= 0 days = critical
  FLOAT_NEAR_CRITICAL_MAX: 5,         // 1-5 days = near critical
  FRESHNESS_FRESH_MAX_DAYS: 3,
  FRESHNESS_AGING_MAX_DAYS: 10,
  RFI_STALE_DAYS: 14,                 // RFIs open > 14 days are stale
  SUBMITTAL_STALE_DAYS: 21,
  MIN_EVIDENCE_FOR_HIGH_CONFIDENCE: 3,
  DATA_STALENESS_WARN_DAYS: 7,        // warn if schedule not updated in N days
} as const;

// ---------------------------------------------------------------------------
// Normalization — raw row → NormalizedActivity
// ---------------------------------------------------------------------------
export function normalizeActivity(row: ScheduleActivity): NormalizedActivity {
  const float_band = classifyFloat(row.total_float);
  const variance_days = computeVariance(row.forecast_finish, row.baseline_finish);
  const is_complete = row.status === "complete" || !!row.actual_finish;
  const is_behind = variance_days !== null && variance_days > 0 && !is_complete;
  const { freshness, days_since_update } = classifyFreshness(row.last_updated);

  return {
    ...row,
    float_band,
    variance_days,
    is_complete,
    is_behind,
    freshness,
    days_since_update,
  };
}

function classifyFloat(float: number | null): FloatBand {
  if (float === null || float === undefined) return "UNKNOWN";
  if (float <= THRESHOLDS.FLOAT_CRITICAL_MAX) return "CRITICAL";
  if (float <= THRESHOLDS.FLOAT_NEAR_CRITICAL_MAX) return "NEAR_CRITICAL";
  return "COMFORTABLE";
}

function computeVariance(
  forecast: string | null,
  baseline: string | null
): number | null {
  if (!forecast || !baseline) return null;
  const f = new Date(forecast).getTime();
  const b = new Date(baseline).getTime();
  return Math.round((f - b) / (1000 * 60 * 60 * 24));
}

function classifyFreshness(lastUpdated: string | null): {
  freshness: FreshnessFlag;
  days_since_update: number | null;
} {
  if (!lastUpdated) return { freshness: "MISSING", days_since_update: null };
  const days = Math.round(
    (Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days <= THRESHOLDS.FRESHNESS_FRESH_MAX_DAYS)
    return { freshness: "FRESH", days_since_update: days };
  if (days <= THRESHOLDS.FRESHNESS_AGING_MAX_DAYS)
    return { freshness: "AGING", days_since_update: days };
  return { freshness: "STALE", days_since_update: days };
}

// ---------------------------------------------------------------------------
// Blocker normalization — raw RFI/submittal/delivery/drawing row → Blocker
// ---------------------------------------------------------------------------
interface RawRfi {
  rfi_number: string;
  status: string;
  days_open: number;
  submitted_date: string;
  response_required_by: string | null;
  impacts_activity_ids?: string[];
  impacts_activity_id?: string;       // legacy single FK
  subject: string;
}

export function normalizeRfi(
  rfi: RawRfi,
  activityNeedDates: Map<string, string>
): Blocker {
  const impacts = rfi.impacts_activity_ids ??
    (rfi.impacts_activity_id ? [rfi.impacts_activity_id] : []);

  // Needed-by = earliest forecast start of any impacted activity
  const needed_by = earliestNeedDate(impacts, activityNeedDates);
  const promised_by = rfi.response_required_by;
  const gap_days = computeGap(promised_by, needed_by);

  return {
    type: "RFI",
    ref: rfi.rfi_number,
    status: rfi.status,
    age_days: rfi.days_open,
    needed_by,
    promised_by,
    gap_days,
    impacts_activity_ids: impacts,
    detail: rfi.subject,
  };
}

interface RawSubmittal {
  submittal_number: string;
  status: string;
  submitted_date: string | null;
  approved_date: string | null;
  required_by_date: string | null;
  impacts_activity_ids?: string[];
  impacts_activity_id?: string;
  package_name: string;
}

export function normalizeSubmittal(
  sub: RawSubmittal,
  activityNeedDates: Map<string, string>
): Blocker {
  const impacts = sub.impacts_activity_ids ??
    (sub.impacts_activity_id ? [sub.impacts_activity_id] : []);
  const age_days = sub.submitted_date
    ? daysBetween(sub.submitted_date, new Date().toISOString())
    : 0;
  const needed_by = sub.required_by_date ?? earliestNeedDate(impacts, activityNeedDates);
  const promised_by = null; // submittals don't have a vendor-promised date
  const gap_days = null;

  return {
    type: "SUBMITTAL",
    ref: sub.submittal_number,
    status: sub.status,
    age_days,
    needed_by,
    promised_by,
    gap_days,
    impacts_activity_ids: impacts,
    detail: sub.package_name,
  };
}

interface RawDelivery {
  po_number: string;
  status: string;
  promised_eta: string | null;
  needed_by_date: string | null;
  impacts_activity_ids?: string[];
  impacts_activity_id?: string;
  material_type: string;
  ordered_date: string | null;
}

export function normalizeDelivery(
  del: RawDelivery,
  activityNeedDates: Map<string, string>
): Blocker {
  const impacts = del.impacts_activity_ids ??
    (del.impacts_activity_id ? [del.impacts_activity_id] : []);
  const age_days = del.ordered_date
    ? daysBetween(del.ordered_date, new Date().toISOString())
    : 0;
  const needed_by = del.needed_by_date ?? earliestNeedDate(impacts, activityNeedDates);
  const promised_by = del.promised_eta;
  const gap_days = computeGap(promised_by, needed_by);

  return {
    type: "DELIVERY",
    ref: del.po_number,
    status: del.status,
    age_days,
    needed_by,
    promised_by,
    gap_days,
    impacts_activity_ids: impacts,
    detail: del.material_type,
  };
}

function earliestNeedDate(
  activityIds: string[],
  needDates: Map<string, string>
): string | null {
  const dates = activityIds
    .map((id) => needDates.get(id))
    .filter((d): d is string => !!d)
    .sort();
  return dates[0] ?? null;
}

function computeGap(
  promised: string | null,
  needed: string | null
): number | null {
  if (!promised || !needed) return null;
  const p = new Date(promised).getTime();
  const n = new Date(needed).getTime();
  return Math.round((p - n) / (1000 * 60 * 60 * 24));
}

function daysBetween(start: string, end: string): number {
  return Math.round(
    (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)
  );
}

// ---------------------------------------------------------------------------
// Risk assessment — upgraded with predecessor tracing + gap analysis
// ---------------------------------------------------------------------------
export function assessActivityRisk(
  activity: NormalizedActivity,
  directBlockers: Blocker[],
  upstreamBlockers: Blocker[]
): ActivityRiskAssessment {
  const allBlockers = [...directBlockers, ...upstreamBlockers];
  const risk = scoreRisk(activity, directBlockers, upstreamBlockers);
  const driving_cause = composeDrivingCause(activity, directBlockers, upstreamBlockers);
  const confidence = scoreConfidence(activity, allBlockers);

  return {
    activity_id: activity.id,
    activity_name: activity.activity_name,
    phase: activity.wbs_phase,
    forecast_start: activity.forecast_start,
    float_band: activity.float_band,
    total_float: activity.total_float,
    risk,
    direct_blockers: directBlockers,
    upstream_blockers: upstreamBlockers,
    driving_cause,
    confidence,
    evidence_count: allBlockers.length,
  };
}

function scoreRisk(
  activity: NormalizedActivity,
  direct: Blocker[],
  upstream: Blocker[]
): RiskLevel {
  const hasLateMaterial = [...direct, ...upstream].some(
    (b) => b.gap_days !== null && b.gap_days > 0
  );
  const hasStaleRfi = direct.some(
    (b) => b.type === "RFI" && b.age_days >= THRESHOLDS.RFI_STALE_DAYS
  );
  const blockerCount = direct.length + upstream.length;

  // CRITICAL: zero/negative float AND any blocker with negative gap
  if (activity.float_band === "CRITICAL" && hasLateMaterial) return "CRITICAL";

  // HIGH: critical float with any blocker, OR near-critical with late material
  if (activity.float_band === "CRITICAL" && blockerCount > 0) return "HIGH";
  if (activity.float_band === "NEAR_CRITICAL" && hasLateMaterial) return "HIGH";
  if (hasStaleRfi && activity.float_band !== "COMFORTABLE") return "HIGH";

  // MEDIUM: any blockers on near-critical, or multiple blockers on comfortable
  if (activity.float_band === "NEAR_CRITICAL" && blockerCount > 0) return "MEDIUM";
  if (blockerCount >= 2) return "MEDIUM";

  return "LOW";
}

function composeDrivingCause(
  activity: NormalizedActivity,
  direct: Blocker[],
  upstream: Blocker[]
): string | null {
  const parts: string[] = [];

  if (activity.float_band === "CRITICAL") {
    parts.push(`Zero float (critical path)`);
  } else if (activity.float_band === "NEAR_CRITICAL") {
    parts.push(`${activity.total_float}d float (near-critical)`);
  }

  const lateMaterials = [...direct, ...upstream].filter(
    (b) => b.type === "DELIVERY" && b.gap_days !== null && b.gap_days > 0
  );
  if (lateMaterials.length > 0) {
    const worst = lateMaterials.reduce((a, b) =>
      (b.gap_days ?? 0) > (a.gap_days ?? 0) ? b : a
    );
    parts.push(
      `${worst.ref} (${worst.detail}) ETA is ${worst.gap_days}d after need date`
    );
  }

  const staleRfis = direct.filter(
    (b) => b.type === "RFI" && b.age_days >= THRESHOLDS.RFI_STALE_DAYS
  );
  if (staleRfis.length > 0) {
    parts.push(
      `${staleRfis.length} stale RFI${staleRfis.length > 1 ? "s" : ""} (${staleRfis.map((r) => r.ref).join(", ")})`
    );
  }

  const pendingSubmittals = direct.filter((b) => b.type === "SUBMITTAL");
  if (pendingSubmittals.length > 0) {
    parts.push(`${pendingSubmittals.length} pending submittal${pendingSubmittals.length > 1 ? "s" : ""}`);
  }

  if (upstream.length > 0 && direct.length === 0) {
    parts.push(`upstream blocker on predecessor`);
  }

  return parts.length > 0 ? parts.join("; ") : null;
}

function scoreConfidence(
  activity: NormalizedActivity,
  blockers: Blocker[]
): Confidence {
  // Low confidence if schedule data is stale or missing float
  if (activity.freshness === "STALE" || activity.freshness === "MISSING") return "LOW";
  if (activity.float_band === "UNKNOWN") return "LOW";

  // High confidence only with sufficient evidence AND fresh data
  if (
    blockers.length >= THRESHOLDS.MIN_EVIDENCE_FOR_HIGH_CONFIDENCE &&
    activity.freshness === "FRESH"
  ) {
    return "HIGH";
  }

  return "MEDIUM";
}

// ---------------------------------------------------------------------------
// Predecessor chain walk — finds blockers N levels up the dependency tree
// ---------------------------------------------------------------------------
export function findUpstreamBlockers(
  activity: NormalizedActivity,
  allActivities: Map<string, NormalizedActivity>,
  blockersByActivity: Map<string, Blocker[]>,
  maxDepth = 3
): Blocker[] {
  const visited = new Set<string>();
  const upstream: Blocker[] = [];

  function walk(actId: string, depth: number) {
    if (depth > maxDepth || visited.has(actId)) return;
    visited.add(actId);

    const act = allActivities.get(actId);
    if (!act) return;

    for (const predId of act.predecessors) {
      if (predId === activity.id) continue;
      const predBlockers = blockersByActivity.get(predId) ?? [];
      upstream.push(...predBlockers);
      walk(predId, depth + 1);
    }
  }

  walk(activity.id, 0);
  return upstream;
}

// ---------------------------------------------------------------------------
// Top-level assembly — build full ScheduleFacts from raw rows
// ---------------------------------------------------------------------------
export interface RawScheduleData {
  project_id: string;
  activities: ScheduleActivity[];
  rfis: RawRfi[];
  submittals: RawSubmittal[];
  deliveries: RawDelivery[];
  schedule_last_updated: string | null;
}

export function buildScheduleFacts(raw: RawScheduleData): ScheduleFacts {
  const as_of = new Date().toISOString();
  const staleness_warnings: string[] = [];
  const data_gaps: string[] = [];

  // Schedule-level freshness
  if (raw.schedule_last_updated) {
    const daysOld = daysBetween(raw.schedule_last_updated, as_of);
    if (daysOld > THRESHOLDS.DATA_STALENESS_WARN_DAYS) {
      staleness_warnings.push(
        `Schedule last updated ${daysOld}d ago — analysis may not reflect current status`
      );
    }
  } else {
    staleness_warnings.push("Schedule update timestamp missing");
  }

  // Normalize activities
  const normalized = raw.activities.map(normalizeActivity);
  const activityMap = new Map(normalized.map((a) => [a.id, a]));
  const needDates = new Map(
    normalized
      .filter((a) => a.forecast_start)
      .map((a) => [a.id, a.forecast_start!])
  );

  // Count data gaps
  const missingFloat = normalized.filter((a) => a.total_float === null).length;
  if (missingFloat > 0) {
    data_gaps.push(`${missingFloat} activities missing float values`);
  }
  const missingPredecessors = normalized.filter(
    (a) => a.predecessors.length === 0 && !a.is_complete
  ).length;
  if (missingPredecessors > normalized.length * 0.3) {
    data_gaps.push(
      `${missingPredecessors} activities have no predecessor links — upstream blocker detection degraded`
    );
  }

  // Normalize blockers
  const rfiBlockers = raw.rfis.map((r) => normalizeRfi(r, needDates));
  const subBlockers = raw.submittals.map((s) => normalizeSubmittal(s, needDates));
  const delBlockers = raw.deliveries.map((d) => normalizeDelivery(d, needDates));
  const allBlockers = [...rfiBlockers, ...subBlockers, ...delBlockers];

  // Index blockers by activity
  const blockersByActivity = new Map<string, Blocker[]>();
  for (const b of allBlockers) {
    for (const actId of b.impacts_activity_ids) {
      if (!blockersByActivity.has(actId)) blockersByActivity.set(actId, []);
      blockersByActivity.get(actId)!.push(b);
    }
  }

  // Assess risk for every active activity
  const assessments: ActivityRiskAssessment[] = [];
  for (const act of normalized) {
    if (act.is_complete) continue;
    const direct = blockersByActivity.get(act.id) ?? [];
    const upstream = findUpstreamBlockers(act, activityMap, blockersByActivity);
    const assessment = assessActivityRisk(act, direct, upstream);
    assessments.push(assessment);
  }

  // Sort: CRITICAL > HIGH > MEDIUM > LOW, then by forecast_start
  const riskOrder: Record<RiskLevel, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  assessments.sort((a, b) => {
    const r = riskOrder[a.risk] - riskOrder[b.risk];
    if (r !== 0) return r;
    return (a.forecast_start ?? "").localeCompare(b.forecast_start ?? "");
  });

  // Overall confidence
  const overallConfidence: Confidence =
    staleness_warnings.length > 0 || data_gaps.length >= 2
      ? "LOW"
      : data_gaps.length === 1
      ? "MEDIUM"
      : "HIGH";

  return {
    project_id: raw.project_id,
    as_of,
    confidence: overallConfidence,
    staleness_warnings,
    data_gaps,
    summary: {
      total_activities: normalized.length,
      critical_count: normalized.filter((a) => a.float_band === "CRITICAL" && !a.is_complete).length,
      near_critical_count: normalized.filter((a) => a.float_band === "NEAR_CRITICAL" && !a.is_complete).length,
      behind_count: normalized.filter((a) => a.is_behind).length,
      open_rfi_count: rfiBlockers.length,
      pending_submittal_count: subBlockers.length,
      late_delivery_count: delBlockers.filter(
        (d) => d.status === "delayed" || d.status === "backordered"
      ).length,
    },
    critical_path: normalized.filter((a) => a.float_band === "CRITICAL" && !a.is_complete),
    near_critical: normalized.filter((a) => a.float_band === "NEAR_CRITICAL" && !a.is_complete),
    at_risk_activities: assessments.filter((a) => a.risk !== "LOW"),
    active_blockers: allBlockers,
  };
}
