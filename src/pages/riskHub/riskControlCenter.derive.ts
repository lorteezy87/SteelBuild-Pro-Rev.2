/**
 * Pure derivations for the Risk Control Center (command_ui redesign).
 * No React, no network. All inputs come from real DB records pulled by RiskHub.
 *
 * The data sources for this page are NOT a dedicated `project_risks` table —
 * none exists. Instead, risk in SteelBuild Pro is cross-entity and computed
 * from the `marginRiskEngine` (which derives `RiskItem[]` from RFIs,
 * submittals, deliveries, schedule tasks, inspections, and change orders) and
 * from user-entered Constraints (`action_items` with category="CONSTRAINT").
 *
 * This module owns:
 *   - `buildRiskSummary(items, constraints)` → KPIs + 3 panel queues + tones
 *
 * RiskItem (from marginRiskEngine) has:
 *   signal, label, severity ("critical"|"high"|"medium"), exposure (number),
 *   detail, entityType, entityId, area?, workPackageId?
 *
 * Constraint (action_items) has:
 *   id, title, description, priority, status, due_date, assigned_to,
 *   constraint_type, project_area, created_at
 */

import type { RiskItem, RiskSignal } from "@/services/marginRiskEngine";

export type { RiskItem, RiskSignal };

/** Flattened risk record as displayed in the table + panels. */
export interface FlatRisk {
  id: string;
  /** Human-readable label (RFI title, "Late delivery", etc.) */
  label: string;
  /** Which signal category produced this item. */
  category: string;
  /**
   * Severity level derived from marginRiskEngine ("critical"|"high"|"medium").
   * MISSING for user-entered Constraints — they have `priority` but not a typed
   * severity. We map priority → severity for display.
   */
  severity: "critical" | "high" | "medium";
  /**
   * Dollar exposure — numeric, 0 when no dollar figure is calculable (e.g.,
   * a user Constraint without a cost figure).
   */
  exposure: number;
  /** One-liner detail shown in the table sub-line. */
  detail: string;
  /**
   * Entity type string (from marginRiskEngine) or "Constraint" for manual
   * action_items. Used to build navigate-links.
   */
  entityType: string;
  entityId: string | null;
  /**
   * owner/assigned_to — MISSING for marginRiskEngine items; present for
   * Constraints via action_items.assigned_to.
   */
  owner: string | null;
  /**
   * `mitigation` / status — MISSING for marginRiskEngine items; for
   * Constraints this is action_items.status ("Open", "In Progress",
   * "Resolved", "Closed").
   */
  mitigationStatus: string | null;
  area: string | null;
}

export interface CategorySummaryRow {
  category: string;
  count: number;
  totalExposure: number;
  criticalCount: number;
}

export interface RiskSummary {
  /** Total flat-risk items (engine + constraints). */
  total: number;
  /** Items with severity === "high" | "critical". */
  highCount: number;
  /** Items with severity === "medium". */
  mediumCount: number;
  /** Items with severity === "critical". */
  criticalCount: number;
  /**
   * "Open" = not resolved/closed. For engine items, all items are open by
   * definition (the engine filters out resolved entities). For Constraints,
   * open = status not in RESOLVED_STATUSES.
   */
  openCount: number;
  /**
   * Items that have a mitigationStatus of "In Progress". Only Constraint
   * rows carry this; engine items are always null.
   */
  mitigatingCount: number;
  /** Sum of all exposure values. */
  totalExposure: number;
  /** Top 6 by exposure score — the "Top Risks by Score" panel queue. */
  topByScore: FlatRisk[];
  /** Per-category summary rows — the "By Category" panel. */
  byCategory: CategorySummaryRow[];
  /** Items needing action: no mitigation owner or high/critical with no status. */
  needsMitigation: FlatRisk[];
}

// Constraint statuses considered "resolved" (mirrors the constraints module).
const RESOLVED_STATUSES = new Set(["Resolved", "Closed"]);

/** Map a Constraint priority string to a severity level. */
function priorityToSeverity(priority: string | null): FlatRisk["severity"] {
  const p = (priority || "").toLowerCase();
  if (p === "critical") return "critical";
  if (p === "high") return "high";
  return "medium";
}

/** Normalise a marginRiskEngine signal key to a human label. */
function signalToCategory(signal: string): string {
  const MAP: Record<string, string> = {
    open_rfis: "Open RFIs",
    rejected_submittals: "Rejected Submittals",
    labor_burn: "Labor Burn",
    late_procurement: "Late Procurement",
    failed_inspections: "Failed Inspections",
    schedule_slips: "Schedule Slips",
    unsigned_cos: "Unsigned Change Orders",
  };
  return MAP[signal] || signal;
}

/** Flatten all engine RiskItems into FlatRisk records. */
function flattenEngineItems(signals: RiskSignal[]): FlatRisk[] {
  const out: FlatRisk[] = [];
  for (const sig of signals) {
    const category = signalToCategory(sig.signal);
    for (const item of sig.items) {
      out.push({
        id: `${sig.signal}:${String(item.entityId)}`,
        label: item.label,
        category,
        severity: item.severity,
        exposure: item.exposure,
        detail: item.detail,
        entityType: item.entityType,
        entityId: String(item.entityId ?? ""),
        owner: null,           // MISSING: engine items have no assigned owner
        mitigationStatus: null, // MISSING: engine items are always "active"
        area: item.area ?? null,
      });
    }
  }
  return out;
}

/** Flatten user-entered Constraints (action_items) into FlatRisk records. */
function flattenConstraints(constraints: ConstraintRecord[]): FlatRisk[] {
  return constraints
    .filter((c) => !RESOLVED_STATUSES.has(c.status ?? ""))
    .map((c) => ({
      id: c.id,
      label: c.title ?? "Untitled Constraint",
      category: c.constraint_type ?? "Constraint",
      severity: priorityToSeverity(c.priority),
      exposure: 0,             // MISSING: Constraints have no dollar exposure field
      detail: c.description ?? c.project_area ?? "",
      entityType: "Constraint",
      entityId: c.id,
      owner: c.assigned_to ?? null,
      mitigationStatus: c.status ?? null,
      area: c.project_area ?? null,
    }));
}

/** Group flat items by category, counting and summing exposure. */
function buildCategorySummary(items: FlatRisk[]): CategorySummaryRow[] {
  const map = new Map<string, CategorySummaryRow>();
  for (const item of items) {
    const row = map.get(item.category);
    if (row) {
      row.count++;
      row.totalExposure += item.exposure;
      if (item.severity === "critical") row.criticalCount++;
    } else {
      map.set(item.category, {
        category: item.category,
        count: 1,
        totalExposure: item.exposure,
        criticalCount: item.severity === "critical" ? 1 : 0,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.totalExposure - a.totalExposure || b.count - a.count);
}

/** Numeric urgency score for sorting (higher = worse). */
function urgencyScore(item: FlatRisk): number {
  let score = item.exposure;
  if (item.severity === "critical") score += 100_000;
  else if (item.severity === "high") score += 30_000;
  return score;
}

/**
 * Build the full Risk Control Center summary from engine signals and
 * user-entered Constraints.
 *
 * @param signals - Output of `calculateMarginRisk(sources).signals`
 * @param constraints - Raw action_items with category="CONSTRAINT"
 */
export function buildRiskSummary(
  signals: RiskSignal[],
  constraints: ConstraintRecord[],
): RiskSummary {
  const engineItems = flattenEngineItems(signals);
  const constraintItems = flattenConstraints(constraints);
  const all = [...engineItems, ...constraintItems];

  const criticalCount = all.filter((i) => i.severity === "critical").length;
  const highCount = all.filter((i) => i.severity === "high" || i.severity === "critical").length;
  const mediumCount = all.filter((i) => i.severity === "medium").length;
  // Engine items are always "open"; constraint items are open when !resolved
  // (flattenConstraints already filters resolved ones out).
  const openCount = all.length;
  const mitigatingCount = all.filter((i) => i.mitigationStatus === "In Progress").length;
  const totalExposure = all.reduce((sum, i) => sum + i.exposure, 0);

  const sorted = [...all].sort((a, b) => urgencyScore(b) - urgencyScore(a));
  const topByScore = sorted.slice(0, 6);

  const byCategory = buildCategorySummary(all);

  // "Needs Mitigation": high/critical with no owner assigned AND no mitigation underway.
  const needsMitigation = sorted
    .filter((i) => (i.severity === "critical" || i.severity === "high") && !i.owner && !i.mitigationStatus)
    .slice(0, 6);

  return {
    total: all.length,
    highCount,
    mediumCount,
    criticalCount,
    openCount,
    mitigatingCount,
    totalExposure,
    topByScore,
    byCategory,
    needsMitigation,
  };
}

/**
 * Shape of a Constraint record (action_items with category=CONSTRAINT).
 * Mirrors the Supabase row but typed here to avoid a direct DB import
 * in a pure derivation module.
 */
export interface ConstraintRecord {
  id: string;
  title: string | null;
  description: string | null;
  priority: string | null;
  status: string | null;
  due_date: string | null;
  assigned_to: string | null;
  constraint_type: string | null;
  project_area: string | null;
  created_at: string | null;
}
