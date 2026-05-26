/**
 * scheduleGatekeeper.ts — "Blocking Fabrication Shield"
 *
 * Deterministic, pure-function gate that decides whether a schedule activity
 * may proceed given the operational constraints active on its work package.
 * No React, no DB, no AI, no clock side-effects (the "today" reference is an
 * explicit option) — same inputs always produce the same decision, so it is
 * trivially testable and reusable from any schedule consumer.
 *
 * The upstream half already exists: `constraintEngine.deriveOperationalConstraints`
 * turns an unresolved High/Critical RFI into a work-package-scoped "Engineering
 * Hold" constraint carrying the RFI's reference, ball-in-court, due date and
 * priority. This module is the downstream half: it matches those constraints to
 * the tasks that depend on the same work package and reports a gate.
 *
 * Gate semantics (intentionally conservative, matching the spec):
 *   - A *Critical* unresolved blocking constraint on a task's work package
 *     BLOCKS the task (canSchedule = false). You do not fabricate/ship/erect on
 *     unapproved information.
 *   - A *High* unresolved blocking constraint WARNS (canSchedule = true, but the
 *     UI should require an explicit acknowledgement).
 *   - Anything else is CLEAR.
 *
 * "Blocking constraint" = unresolved (status not closed) AND priority in
 * {Critical, High} AND sourced from an RFI. Non-RFI constraint sources are
 * ignored here so this stays the *RFI* fabrication shield; the matching is keyed
 * off the work package the RFI is linked to (with an area fallback).
 */

type Row = Record<string, any>;

export type GateState = "clear" | "warning" | "blocked";

export interface GateBlocker {
  constraintId: string | null;
  constraintType: string | null;
  sourceType: string | null;
  sourceRef: string | null;
  rfiId: string | null;
  rfiNumber: string | null;
  title: string;
  ballInCourt: string | null;
  dueDate: string | null;
  overdue: boolean;
  priority: string;
  workPackageId: string | null;
}

export interface TaskGate {
  state: GateState;
  canSchedule: boolean;
  blockers: GateBlocker[];
  warnings: GateBlocker[];
}

export interface GateOptions {
  /** Reference "today" for overdue calculation. Defaults to now. */
  today?: any;
  /** Pre-indexed RFIs by id, used to enrich blocker display (number/BIC/title). */
  rfisById?: Record<string, Row> | null;
  /**
   * When true (default), only production-phase tasks (fabrication, delivery,
   * erection, installation) are gated; planning/detailing tasks pass. A task
   * with no phase is gated conservatively. Set false to gate every linked task.
   */
  productionPhasesOnly?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const CLOSED_STATUSES = new Set([
  "closed", "close", "complete", "completed", "cancelled", "canceled", "resolved", "void",
]);

const PRODUCTION_PHASES = new Set([
  "fabrication", "fab", "delivery", "shipping", "erection", "installation", "install", "closeout",
]);

function normalize(value: any): string {
  return String(value ?? "").trim().toLowerCase();
}

function asDate(value: any): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? new Date(value) : new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function todayStart(value: any): Date {
  const parsed = value ? asDate(value) : new Date();
  const safe = parsed || new Date();
  safe.setHours(0, 0, 0, 0);
  return safe;
}

function isOverdue(due: any, today: Date): boolean {
  const parsed = asDate(due);
  return Boolean(parsed && parsed.getTime() < today.getTime());
}

function isClosedStatus(status: any): boolean {
  return CLOSED_STATUSES.has(normalize(status));
}

/** Is this constraint sourced from an RFI? */
function isRfiSourced(constraint: Row): boolean {
  const engine = constraint?.metadata?.constraint_engine || {};
  return (
    normalize(constraint?._source_type) === "rfi" ||
    normalize(engine.source_type) === "rfi" ||
    normalize(constraint?.metadata?.source_type) === "rfi" ||
    normalize(constraint?.constraint_type) === "engineering hold"
  );
}

/** Constraint priority is at the High/Critical blocking threshold. */
function blockingPriority(constraint: Row): "Critical" | "High" | null {
  const p = normalize(constraint?.priority);
  if (p === "critical") return "Critical";
  if (p === "high") return "High";
  return null;
}

/**
 * A constraint blocks if it is unresolved, RFI-sourced, and High/Critical.
 * Returns the normalized priority when blocking, else null.
 */
export function blockingConstraintPriority(constraint: Row): "Critical" | "High" | null {
  if (!constraint || constraint.is_deleted) return null;
  if (isClosedStatus(constraint.status)) return null;
  if (!isRfiSourced(constraint)) return null;
  return blockingPriority(constraint);
}

function constraintWorkPackageId(constraint: Row): string | null {
  const wp = constraint?.work_package_id ?? constraint?.metadata?.constraint_engine?.work_package_id;
  return wp ? String(wp) : null;
}

function constraintArea(constraint: Row): string {
  return normalize(constraint?.project_area || constraint?.area || constraint?.area_sequence);
}

function taskWorkPackageId(task: Row): string | null {
  const wp = task?.work_package_id;
  return wp ? String(wp) : null;
}

function taskArea(task: Row): string {
  return normalize(task?.area || task?.zone || task?.area_sequence || task?.phase);
}

/**
 * Does the constraint apply to this task? Primary link is an exact
 * work_package_id match. When the constraint has no work package we fall back
 * to an area match so area-scoped holds still surface — but only when both
 * sides actually carry an area, to avoid blanket project-wide false positives.
 */
function constraintAppliesToTask(constraint: Row, task: Row): boolean {
  const cWp = constraintWorkPackageId(constraint);
  const tWp = taskWorkPackageId(task);
  if (cWp && tWp) return cWp === tWp;
  if (!cWp) {
    const cArea = constraintArea(constraint);
    const tArea = taskArea(task);
    return Boolean(cArea && tArea && cArea === tArea);
  }
  return false;
}

function isGateableTask(task: Row, productionPhasesOnly: boolean): boolean {
  if (!productionPhasesOnly) return true;
  const phase = normalize(task?.phase);
  if (!phase) return true; // unknown phase → gate conservatively
  return PRODUCTION_PHASES.has(phase);
}

function parseRfiNumber(constraint: Row, rfi: Row | null): string | null {
  if (rfi?.rfi_number) return String(rfi.rfi_number);
  const ref = constraint?._source_ref || constraint?.metadata?.constraint_engine?.source_ref;
  if (!ref) return null;
  const match = String(ref).match(/RFI[\s#-]*([A-Za-z0-9.-]+)/i);
  return match ? match[1] : null;
}

function cleanTitle(constraint: Row, rfi: Row | null): string {
  if (rfi?.title) return String(rfi.title);
  if (rfi?.question) return String(rfi.question);
  const title = String(constraint?.title || "");
  // strip a leading "<Hold Type>: " prefix the constraint engine adds
  const stripped = title.replace(/^[^:]+:\s*/, "").trim();
  return stripped || title || "Untitled RFI";
}

function toBlocker(constraint: Row, priority: "Critical" | "High", rfisById: Record<string, Row> | null, today: Date): GateBlocker {
  const sourceId = constraint?._source_id || constraint?.metadata?.constraint_engine?.source_id || null;
  const rfi = sourceId && rfisById ? rfisById[String(sourceId)] || null : null;
  const due = rfi?.due_date || rfi?.date_required || constraint?.due_date || null;
  return {
    constraintId: constraint?.id ? String(constraint.id) : null,
    constraintType: constraint?.constraint_type || null,
    sourceType: constraint?._source_type || "RFI",
    sourceRef: constraint?._source_ref || constraint?.metadata?.constraint_engine?.source_ref || null,
    rfiId: sourceId ? String(sourceId) : null,
    rfiNumber: parseRfiNumber(constraint, rfi),
    title: cleanTitle(constraint, rfi),
    ballInCourt: rfi?.ball_in_court || constraint?.assigned_to || null,
    dueDate: due ? String(due).slice(0, 10) : null,
    overdue: isOverdue(due, today),
    priority,
    workPackageId: constraintWorkPackageId(constraint),
  };
}

function rankBlocker(a: GateBlocker, b: GateBlocker): number {
  // Critical before High; overdue before on-time; earliest due first.
  if (a.priority !== b.priority) return a.priority === "Critical" ? -1 : 1;
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  const da = a.dueDate || "9999-12-31";
  const db = b.dueDate || "9999-12-31";
  if (da !== db) return da.localeCompare(db);
  return (a.sourceRef || "").localeCompare(b.sourceRef || "");
}

function gateFrom(blockers: GateBlocker[], warnings: GateBlocker[]): TaskGate {
  blockers.sort(rankBlocker);
  warnings.sort(rankBlocker);
  const state: GateState = blockers.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "clear";
  return { state, canSchedule: state !== "blocked", blockers, warnings };
}

const CLEAR_GATE: TaskGate = { state: "clear", canSchedule: true, blockers: [], warnings: [] };

/**
 * Evaluate the gate for a single task against the active constraint set.
 */
export function evaluateTaskGate(task: Row, constraints: Row[] = [], options: GateOptions = {}): TaskGate {
  const productionPhasesOnly = options.productionPhasesOnly !== false;
  if (!task || !isGateableTask(task, productionPhasesOnly)) return CLEAR_GATE;

  const today = todayStart(options.today);
  const rfisById = options.rfisById || null;
  const blockers: GateBlocker[] = [];
  const warnings: GateBlocker[] = [];

  for (const constraint of constraints || []) {
    const priority = blockingConstraintPriority(constraint);
    if (!priority) continue;
    if (!constraintAppliesToTask(constraint, task)) continue;
    const blocker = toBlocker(constraint, priority, rfisById, today);
    if (priority === "Critical") blockers.push(blocker);
    else warnings.push(blocker);
  }

  return gateFrom(blockers, warnings);
}

/**
 * Evaluate gates for many tasks at once. Returns a map keyed by task id.
 */
export function buildGateMap(tasks: Row[] = [], constraints: Row[] = [], options: GateOptions = {}): Record<string, TaskGate> {
  const out: Record<string, TaskGate> = {};
  for (const task of tasks || []) {
    if (task && task.id) out[String(task.id)] = evaluateTaskGate(task, constraints, options);
  }
  return out;
}

/**
 * Project-level rollup of the blocking constraint set, independent of any
 * specific task. Used by surfaces that don't (yet) carry a per-row work-package
 * link — e.g. the 2-week look-ahead — to warn a planner that the project has
 * active fabrication-blocking RFIs before they schedule new work.
 */
export function summarizeBlockingConstraints(constraints: Row[] = [], options: GateOptions = {}): TaskGate {
  const today = todayStart(options.today);
  const rfisById = options.rfisById || null;
  const blockers: GateBlocker[] = [];
  const warnings: GateBlocker[] = [];

  for (const constraint of constraints || []) {
    const priority = blockingConstraintPriority(constraint);
    if (!priority) continue;
    const blocker = toBlocker(constraint, priority, rfisById, today);
    if (priority === "Critical") blockers.push(blocker);
    else warnings.push(blocker);
  }

  return gateFrom(blockers, warnings);
}
