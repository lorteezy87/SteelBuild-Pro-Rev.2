/**
 * Project Health Score Calculation
 * Weighted KPI-based scoring (0-100)
 *
 * ⚠️ UNREFERENCED AS OF THIS REVIEW — nothing in src/ imports this module.
 *
 * The LIVE project-health path is:
 *   - src/lib/projectHealth.ts        (buildOperationalHealthIndex / deriveOperationalHealth)
 *   - src/services/portfolioHealthScoring.ts
 *
 * That implementation is better in the ways that matter here: it carries an
 * explicit `partial` flag and an "Unknown" label so missing evidence reports as
 * unknown rather than healthy, and it matches RFI status against a lowercase
 * ALLOWLIST of genuinely-open states instead of `!== "Closed"`.
 *
 * This file is kept and REPAIRED rather than deleted so that wiring it up
 * cannot reintroduce the four defects it shipped with:
 *
 *   1. `Void` RFIs and `Cancelled` action items counted as OPEN, so dead
 *      records with a past due date dragged the score down forever.
 *   2. A failed fetch became `[]`, which scored that factor 100 — the score got
 *      BETTER as data went missing, and a project with a broken RFI read
 *      displayed HEALTHY.
 *   3. A total failure returned 0 = CRITICAL, the opposite of (2). Partial
 *      failure hid the problem; total failure cried wolf.
 *   4. `new Date(due_date + "T00:00:00")` produced Invalid Date whenever the
 *      column held a full timestamp rather than a bare date, and an Invalid
 *      Date comparison is always false — so those rows were never overdue.
 *
 * RECOMMENDATION: delete this module and use projectHealth.ts. It is kept only
 * because deleting a file is the caller's decision, not the reviewer's.
 *
 * Missing data now yields `null` (unknown), never a number. Callers MUST handle
 * null rather than rendering it as 0.
 */

import { entities } from "@/api/supabaseClient";
import { parseLocalDate } from "@/lib/workingDays";
import { RFI_STATUS, ACTION_ITEM_STATUS } from "@/lib/enums";

/**
 * RFI states that still represent work in flight. An ALLOWLIST, not
 * `status !== "Closed"` — that treated `Void` as open, so a cancelled RFI with
 * a past due date counted as permanently overdue. Mirrors OPEN_RFI_STATUSES in
 * src/lib/projectHealth.ts. Compared case-insensitively.
 */
const OPEN_RFI_STATUSES = new Set([
  RFI_STATUS.OPEN,
  RFI_STATUS.UNDER_REVIEW,
  RFI_STATUS.INCOMPLETE_RESPONSE,
  RFI_STATUS.ANSWERED,
].map((s) => s.toLowerCase()));

/** Action-item states still requiring work. `Cancelled` is NOT one. */
const OPEN_ACTION_ITEM_STATUSES = new Set([
  ACTION_ITEM_STATUS.OPEN,
  ACTION_ITEM_STATUS.IN_PROGRESS,
].map((s) => s.toLowerCase()));

const statusIn = (set, value) => set.has(String(value ?? "").trim().toLowerCase());

/**
 * Is `dateValue` strictly before `today`?
 *
 * Uses the shared parseLocalDate, which handles both a bare 'YYYY-MM-DD' and a
 * full ISO timestamp, and anchors at LOCAL noon so Arizona's UTC-7 offset can't
 * shift a date across midnight. The previous `new Date(v + "T00:00:00")`
 * produced Invalid Date for any timestamp-valued column, and an Invalid Date
 * comparison is always false — those rows silently never counted as overdue.
 */
function isOverdue(dateValue, today) {
  const d = parseLocalDate(dateValue);
  return d != null && d.getTime() < today.getTime();
}

/**
 * Weighted 0-100 health score, or `null` when the inputs can't support one.
 *
 * Returns null — never a number — when no projectId is given, when any data
 * source fails to load, or when the calculation throws. A score assembled from
 * partial data is worse than no score: the missing factors used to default to
 * 100, so the number went UP as evidence disappeared.
 */
export async function calculateProjectHealthScore(projectId) {
  if (!projectId) return null;
  try {
    // Load all data in parallel
    let fetchFailures = 0;
    const safeFetch = (promise, label) =>
      promise.catch((err) => {
        fetchFailures++;
        console.warn(`[HealthScore] Failed to fetch ${label}:`, err.message);
        return [];
      });
    const [rfis, changeOrders, deliveries, actionItems, costCodes, tasks, dailyLogs] =
      await Promise.all([
        safeFetch(entities.RFI.filter({ project_id: projectId }), "RFIs"),
        safeFetch(entities.ChangeOrder.filter({ project_id: projectId }), "Change Orders"),
        safeFetch(entities.Delivery.filter({ project_id: projectId }), "Deliveries"),
        safeFetch(entities.ActionItem.filter({ project_id: projectId }), "Action Items"),
        safeFetch(entities.CostCode.filter({ project_id: projectId }), "Cost Codes"),
        safeFetch(entities.ScheduleTask.filter({ project_id: projectId }), "Schedule Tasks"),
        safeFetch(entities.DailyLog.filter({ project_id: projectId }), "Daily Logs"),
      ]);
    if (fetchFailures > 0) {
      // Refuse to score. Each failed source resolves to [], and an empty set
      // scores its factor 100, so a partial load reported a project as HEALTHY
      // precisely because its data was missing.
      console.warn(`[HealthScore] ${fetchFailures}/7 data sources failed — refusing to score`);
      return null;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ── Factor 1: RFI health (30 points) ──
    const openRFIs = rfis.filter(r => statusIn(OPEN_RFI_STATUSES, r.status));
    const overdueRFIs = openRFIs.filter(r => isOverdue(r.due_date, today));
    const criticalOverdue = overdueRFIs.filter(
      r => String(r.priority ?? "").trim().toLowerCase() === "critical",
    );
    let rfiScore = 100;
    if (criticalOverdue.length > 0) rfiScore = 0;
    else if (openRFIs.length > 0)
      rfiScore = Math.max(0, 100 - (overdueRFIs.length / openRFIs.length) * 100);

    // ── Factor 2: Budget health (25 points) ──
    const totalBudget = costCodes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0);
    // committed_cost already includes paid (actual) amounts — use whichever
    // is larger to avoid double-counting while still capturing unpaid commitments.
    const totalSpend = costCodes.reduce((s, c) => {
      const committed = Number(c.committed_cost) || 0;
      const actual = Number(c.actual_cost) || 0;
      return s + Math.max(committed, actual);
    }, 0);
    let budgetScore = 100;
    if (totalBudget > 0) {
      const variance = (totalSpend - totalBudget) / totalBudget;
      if (variance < 0.02) budgetScore = 100;
      else if (variance < 0.05) budgetScore = 80;
      else if (variance < 0.10) budgetScore = 60;
      else if (variance < 0.20) budgetScore = 30;
      else budgetScore = 0;
    }

    // ── Factor 3: Action items (20 points) ──
    const openAI = (actionItems || []).filter(a => statusIn(OPEN_ACTION_ITEM_STATUSES, a.status));
    const overdueAI = openAI.filter(a => isOverdue(a.due_date, today));
    let aiScore = 100;
    if (openAI.length > 0)
      aiScore = Math.max(0, 100 - (overdueAI.length / openAI.length) * 80);

    // ── Factor 4: Delivery performance (15 points) ──
    const scheduledDel = deliveries.filter(d => d.scheduled_date);
    // "Partial" and "Rejected" deliveries past their date are counted late,
    // which is intentional — both mean material the shop was promised is not
    // fully on site. Only "Delivered" clears.
    const lateDel = scheduledDel.filter(
      d => String(d.status ?? "").trim().toLowerCase() !== "delivered" && isOverdue(d.scheduled_date, today),
    );
    let delScore = 100;
    if (scheduledDel.length > 0)
      delScore = Math.max(0, 100 - (lateDel.length / scheduledDel.length) * 100);

    // ── Factor 5: Safety (10 points) ──
    const totalIncidents = dailyLogs.reduce((s, l) => s + (Number(l.safety_incidents) || 0), 0);
    const safetyScore = Math.max(0, 100 - (totalIncidents * 20));

    // Weighted average
    const score = Math.round(
      rfiScore    * 0.30 +
      budgetScore * 0.25 +
      aiScore     * 0.20 +
      delScore    * 0.15 +
      safetyScore * 0.10
    );

    return Math.min(100, Math.max(0, score));
  } catch (error) {
    // null, not 0. Returning 0 rendered as CRITICAL, so a transient failure
    // looked identical to a genuinely failing project — the exact inverse of
    // the partial-failure bug above. Unknown is unknown in both directions.
    console.error("Error calculating health score:", error);
    return null;
  }
}

export function getHealthLabel(score) {
  // calculateProjectHealthScore returns null when it cannot score. Without this
  // guard `null >= 80` is false and `null >= 40` is false, so "unknown" fell
  // through to CRITICAL.
  if (score == null || !Number.isFinite(Number(score))) return "UNKNOWN";
  if (score >= 80) return "HEALTHY";
  if (score >= 60) return "WATCH";
  if (score >= 40) return "AT RISK";
  return "CRITICAL";
}

export function getHealthColor(score) {
  if (score == null || !Number.isFinite(Number(score))) return "var(--text-muted)";
  if (score >= 80) return "var(--status-success)";
  if (score >= 60) return "var(--status-warning)";
  if (score >= 40) return "var(--status-warning)";
  return "var(--status-error)";
}