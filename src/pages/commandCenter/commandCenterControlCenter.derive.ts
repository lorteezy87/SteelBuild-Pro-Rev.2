/**
 * Pure derivations for CommandCenterControlCenter (command_ui redesign).
 *
 * No React, no network. All inputs come from the same TanStack Query caches
 * CommandCenter.jsx already uses — we just reshape them into KPI + panel
 * structures that map 1:1 to the command kit layout.
 *
 * Re-uses urgencyEngine scorings where possible so numbers are identical
 * to what the classic Command Center shows.
 */

import { riskScore } from "@/pages/rfis/rfiControlCenter.derive";

// ── Source record shapes (subset of entity fields we actually read) ────────

export interface RfiSource {
  id?: string;
  rfi_number?: string | null;
  title?: string | null;
  subject?: string | null;
  status?: string | null;
  priority?: string | null;
  ball_in_court?: string | null;
  submitted_date?: string | null;
  date_required?: string | null;
  cost_impact?: boolean | null;
  cost_impact_amount?: number | string | null;
  schedule_impact?: boolean | null;
  schedule_impact_days?: number | string | null;
  project_id?: string | null;
  [key: string]: unknown;
}

export interface SubmittalSource {
  id?: string;
  submittal_number?: string | null;
  title?: string | null;
  status?: string | null;
  ball_in_court?: string | null;
  due_date?: string | null;
  project_id?: string | null;
  [key: string]: unknown;
}

export interface ChangeOrderSource {
  id?: string;
  co_number?: string | null;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  submitted_date?: string | null;
  created_date?: string | null;
  project_id?: string | null;
  [key: string]: unknown;
}

export interface DeliverySource {
  id?: string;
  delivery_title?: string | null;
  description?: string | null;
  status?: string | null;
  scheduled_date?: string | null;
  project_id?: string | null;
  [key: string]: unknown;
}

export interface WorkPackageSource {
  id?: string;
  wp_number?: string | null;
  name?: string | null;
  status?: string | null;
  phase?: string | null;
  percent_complete?: number | null;
  project_id?: string | null;
  [key: string]: unknown;
}

export interface ProjectSource {
  id?: string;
  name?: string | null;
  project_number?: string | null;
  [key: string]: unknown;
}

export interface ScheduleTaskSource {
  id?: string;
  task_name?: string | null;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  project_id?: string | null;
  [key: string]: unknown;
}

// ── Input bundle ──────────────────────────────────────────────────────────

export interface CommandCenterSources {
  rfis: RfiSource[];
  submittals: SubmittalSource[];
  changeOrders: ChangeOrderSource[];
  deliveries: DeliverySource[];
  workPackages: WorkPackageSource[];
  projects: ProjectSource[];
  scheduleTasks: ScheduleTaskSource[];
}

// ── Output shapes ─────────────────────────────────────────────────────────

export type PanelTone = "neutral" | "good" | "warn" | "danger";

export interface ActionItem {
  id: string;
  itemType: string; // RFI | SUB | CO | DEL | WP | TASK
  title: string;
  status: string | null;
  priority: string | null;
  owner: string | null;
  dueDate: string | null;
  linkedTo: string | null;
  projectId: string | null;
  urgency: "overdue" | "due-soon" | "blocking" | "awaiting" | "normal";
  raw: Record<string, unknown>;
}

export interface PanelRow {
  id: string;
  label: string;
  sub: string;
  tone: PanelTone;
  itemType: string;
}

export interface CommandCenterSummary {
  kpis: {
    openActionItems: number;
    approvalsPending: number;
    overdueRfis: number;
    fieldIssues: number; // WPs on hold + deliveries delayed/late
    budgetVariance: number | null; // number of COs pending — MISSING: no $ variance without SOV
    scheduleHealth: string; // "On Track" | "At Risk" | "Behind" — derived from schedule tasks
  };
  panels: {
    todayPriorities: PanelRow[];
    waitingOn: PanelRow[];
    riskWatchlist: PanelRow[];
  };
  tones: {
    openActionItems: PanelTone;
    approvalsPending: PanelTone;
    overdueRfis: PanelTone;
    fieldIssues: PanelTone;
    budgetVariance: PanelTone;
    scheduleHealth: PanelTone;
  };
  actionItems: ActionItem[];
}

// ── Date helpers (local-midnight, same convention as urgencyEngine) ────────

function todayLocalMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysUntilDate(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const due = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = todayLocalMidnight();
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
}

function daysSinceDate(dateStr?: string | null): number {
  if (!dateStr) return 0;
  const from = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(from.getTime())) return 0;
  const today = todayLocalMidnight();
  return Math.floor((today.getTime() - from.getTime()) / 86400000);
}

function isOverdueRfi(rfi: RfiSource): boolean {
  if (!rfi.date_required) return false;
  const d = daysUntilDate(rfi.date_required);
  return d !== null && d < 0;
}

// ── Tone helpers ──────────────────────────────────────────────────────────

function toneFromCount(count: number, warnAt: number, dangerAt: number): PanelTone {
  if (count === 0) return "good";
  if (count >= dangerAt) return "danger";
  if (count >= warnAt) return "warn";
  return "neutral";
}

// ── Panel row builders ────────────────────────────────────────────────────

const OPEN_RFI_STATUSES = new Set(["Open", "Under Review", "Incomplete Response"]);
const PENDING_SUB_STATUSES = new Set(["IFA", "OFA", "BFA", "OFS", "IFC", "R&R", "Pending", "Under Review", "Resubmit"]);
const PENDING_CO_STATUSES = new Set(["Draft", "Submitted", "Under Review", "Pending"]);

function rfiTodayPriority(rfi: RfiSource): PanelRow | null {
  if (!OPEN_RFI_STATUSES.has(rfi.status || "Open")) return null;
  const dueDays = daysUntilDate(rfi.date_required);
  const isDueToday = dueDays !== null && dueDays === 0;
  const isDueSoon = dueDays !== null && dueDays >= 0 && dueDays <= 3;
  const overdue = isOverdueRfi(rfi);
  if (!isDueToday && !isDueSoon && !overdue) return null;
  const subParts: string[] = [];
  if (overdue && rfi.date_required) subParts.push(`${Math.abs(dueDays ?? 0)}d past due`);
  else if (isDueToday) subParts.push("Due today");
  else if (isDueSoon && dueDays !== null) subParts.push(`Due in ${dueDays}d`);
  if (rfi.ball_in_court) subParts.push(`BIC: ${rfi.ball_in_court}`);
  return {
    id: rfi.id || String(Math.random()),
    label: `${rfi.rfi_number || "RFI"} — ${rfi.title || rfi.subject || "Untitled RFI"}`,
    sub: subParts.join(" · "),
    tone: overdue ? "danger" : isDueToday ? "warn" : "neutral",
    itemType: "RFI",
  };
}

function submittialWaitingRow(sub: SubmittalSource): PanelRow | null {
  if (!PENDING_SUB_STATUSES.has(sub.status || "")) return null;
  // "Waiting on" = ball is NOT in contractor's court
  const bic = sub.ball_in_court || "";
  const waitingStatuses = new Set(["OFA", "IFA"]); // sent out, waiting for GC/EOR review
  if (!waitingStatuses.has(sub.status || "") && bic.toLowerCase() === "contractor") return null;
  const dueDays = daysUntilDate(sub.due_date);
  const subParts: string[] = [sub.status || "Pending"];
  if (sub.ball_in_court) subParts.push(sub.ball_in_court);
  if (dueDays !== null && dueDays < 0) subParts.push(`${Math.abs(dueDays)}d overdue`);
  return {
    id: sub.id || String(Math.random()),
    label: `${sub.submittal_number || "SUB"} — ${sub.title || "Untitled Submittal"}`,
    sub: subParts.join(" · "),
    tone: dueDays !== null && dueDays < 0 ? "danger" : "neutral",
    itemType: "SUB",
  };
}

function coRiskRow(co: ChangeOrderSource): PanelRow | null {
  if (!PENDING_CO_STATUSES.has(co.status || "")) return null;
  const age = daysSinceDate(co.submitted_date || co.created_date);
  if (age < 7) return null; // Fresh draft — not a risk yet
  return {
    id: co.id || String(Math.random()),
    label: `${co.co_number || "CO"} — ${co.title || co.description || "Change Order"}`,
    sub: `${co.status} · ${age}d pending`,
    tone: age > 21 ? "danger" : "warn",
    itemType: "CO",
  };
}

function deliveryTodayRow(del: DeliverySource): PanelRow | null {
  if (del.status === "Delivered") return null;
  const dueDays = daysUntilDate(del.scheduled_date);
  const isToday = dueDays === 0;
  const isLate = del.status === "Delayed" || (dueDays !== null && dueDays < 0);
  if (!isToday && !isLate) return null;
  return {
    id: del.id || String(Math.random()),
    label: del.delivery_title || del.description || "Delivery",
    sub: isLate ? `Delayed — ${Math.abs(dueDays ?? 0)}d` : "Arriving today",
    tone: isLate ? "danger" : "neutral",
    itemType: "DEL",
  };
}

function workPackageBlockedRow(wp: WorkPackageSource): PanelRow | null {
  if (wp.status !== "On Hold" && wp.status !== "Blocked") return null;
  return {
    id: wp.id || String(Math.random()),
    label: `${wp.wp_number || "WP"} — ${wp.name || "Work Package"}`,
    sub: `${wp.phase || "—"} · On Hold`,
    tone: "danger",
    itemType: "WP",
  };
}

// ── Action-items table builder ────────────────────────────────────────────

function rfisToActionItems(rfis: RfiSource[]): ActionItem[] {
  return rfis
    .filter((r) => OPEN_RFI_STATUSES.has(r.status || "Open"))
    .map((r): ActionItem => {
      const overdue = isOverdueRfi(r);
      const dueDays = daysUntilDate(r.date_required);
      let urgency: ActionItem["urgency"] = "normal";
      if (overdue) urgency = "overdue";
      else if (r.cost_impact || r.schedule_impact) urgency = "blocking";
      else if (dueDays !== null && dueDays <= 3) urgency = "due-soon";
      else if (r.ball_in_court && r.ball_in_court !== "Contractor") urgency = "awaiting";
      return {
        id: r.id || String(Math.random()),
        itemType: "RFI",
        title: `${r.rfi_number || "RFI"} — ${r.title || r.subject || "Untitled RFI"}`,
        status: r.status || "Open",
        priority: r.priority || null,
        owner: r.ball_in_court || "Contractor",
        dueDate: r.date_required || null,
        linkedTo: null,
        projectId: r.project_id || null,
        urgency,
        raw: r as Record<string, unknown>,
      };
    });
}

function submittalToActionItems(subs: SubmittalSource[]): ActionItem[] {
  return subs
    .filter((s) => PENDING_SUB_STATUSES.has(s.status || ""))
    .map((s): ActionItem => {
      const dueDays = daysUntilDate(s.due_date);
      const overdue = dueDays !== null && dueDays < 0;
      return {
        id: s.id || String(Math.random()),
        itemType: "SUB",
        title: `${s.submittal_number || "SUB"} — ${s.title || "Untitled Submittal"}`,
        status: s.status || null,
        priority: null,
        owner: s.ball_in_court || null,
        dueDate: s.due_date || null,
        linkedTo: null,
        projectId: s.project_id || null,
        urgency: overdue ? "overdue" : "awaiting",
        raw: s as Record<string, unknown>,
      };
    });
}

function changeOrderToActionItems(cos: ChangeOrderSource[]): ActionItem[] {
  return cos
    .filter((c) => PENDING_CO_STATUSES.has(c.status || ""))
    .map((c): ActionItem => {
      const age = daysSinceDate(c.submitted_date || c.created_date);
      return {
        id: c.id || String(Math.random()),
        itemType: "CO",
        title: `${c.co_number || "CO"} — ${c.title || c.description || "Change Order"}`,
        status: c.status || null,
        priority: null,
        owner: null,
        dueDate: null,
        linkedTo: null,
        projectId: c.project_id || null,
        urgency: age > 21 ? "overdue" : age > 7 ? "due-soon" : "normal",
        raw: c as Record<string, unknown>,
      };
    });
}

function deliveriesToActionItems(dels: DeliverySource[]): ActionItem[] {
  return dels
    .filter((d) => d.status !== "Delivered")
    .filter((d) => {
      const dueDays = daysUntilDate(d.scheduled_date);
      return d.status === "Delayed" || (dueDays !== null && dueDays <= 7);
    })
    .map((d): ActionItem => {
      const dueDays = daysUntilDate(d.scheduled_date);
      const late = d.status === "Delayed" || (dueDays !== null && dueDays < 0);
      return {
        id: d.id || String(Math.random()),
        itemType: "DEL",
        title: d.delivery_title || d.description || "Delivery",
        status: d.status || "Scheduled",
        priority: null,
        owner: null,
        dueDate: d.scheduled_date || null,
        linkedTo: null,
        projectId: d.project_id || null,
        urgency: late ? "overdue" : "due-soon",
        raw: d as Record<string, unknown>,
      };
    });
}

function urgencyOrder(u: ActionItem["urgency"]): number {
  switch (u) {
    case "overdue": return 0;
    case "blocking": return 1;
    case "due-soon": return 2;
    case "awaiting": return 3;
    default: return 4;
  }
}

// ── Schedule health derivation ────────────────────────────────────────────

function deriveScheduleHealth(tasks: ScheduleTaskSource[]): { label: string; tone: PanelTone } {
  if (tasks.length === 0) return { label: "No Data", tone: "neutral" };
  const activeTasks = tasks.filter((t) => t.status !== "Complete" && t.status !== "Cancelled");
  if (activeTasks.length === 0) return { label: "On Track", tone: "good" };
  const delayed = activeTasks.filter((t) => t.status === "Delayed").length;
  const overdueTasks = activeTasks.filter((t) => {
    const d = daysUntilDate(t.end_date || t.start_date);
    return d !== null && d < 0 && t.status !== "Complete";
  }).length;
  const atRiskCount = delayed + overdueTasks;
  const ratio = atRiskCount / activeTasks.length;
  if (ratio > 0.25 || atRiskCount > 5) return { label: "Behind", tone: "danger" };
  if (ratio > 0.1 || atRiskCount > 2) return { label: "At Risk", tone: "warn" };
  return { label: "On Track", tone: "good" };
}

// ── Main export ───────────────────────────────────────────────────────────

export function buildCommandCenterSummary(sources: CommandCenterSources): CommandCenterSummary {
  const { rfis, submittals, changeOrders, deliveries, workPackages, scheduleTasks } = sources;

  // ── KPIs ────────────────────────────────────────────────────────────────

  const openRfis = rfis.filter((r) => OPEN_RFI_STATUSES.has(r.status || "Open"));
  const overdueRfis = openRfis.filter(isOverdueRfi);

  // "Open Action Items" = open RFIs + pending submittals + pending COs + blocked WPs
  const pendingSubmittals = submittals.filter((s) => PENDING_SUB_STATUSES.has(s.status || ""));
  const pendingCOs = changeOrders.filter((c) => PENDING_CO_STATUSES.has(c.status || ""));
  const openActionItems = openRfis.length + pendingSubmittals.length + pendingCOs.length;

  // "Approvals Pending" = submittals waiting for GC/EOR response
  const approvalStatuses = new Set(["OFA", "IFA"]);
  const approvalsPending = submittals.filter((s) => approvalStatuses.has(s.status || "")).length;

  // "Field Issues" = WPs on hold + deliveries delayed
  const wpOnHold = workPackages.filter((w) => w.status === "On Hold" || w.status === "Blocked").length;
  const deliveriesDelayed = deliveries.filter((d) => d.status === "Delayed" || (d.status !== "Delivered" && (() => {
    const dd = daysUntilDate(d.scheduled_date);
    return dd !== null && dd < 0;
  })())).length;
  const fieldIssues = wpOnHold + deliveriesDelayed;

  // "Budget Variance" = number of pending COs (no SOV $ available without more data)
  // MISSING: we don't have SOV items in this source bundle, so we surface CO count as a proxy.
  const budgetVariance: number | null = pendingCOs.length;

  // Schedule health
  const { label: scheduleHealthLabel, tone: scheduleHealthTone } = deriveScheduleHealth(scheduleTasks);

  // ── KPI tones ────────────────────────────────────────────────────────────

  const tones: CommandCenterSummary["tones"] = {
    openActionItems: toneFromCount(openActionItems, 5, 15),
    approvalsPending: toneFromCount(approvalsPending, 3, 8),
    overdueRfis: toneFromCount(overdueRfis.length, 1, 5),
    fieldIssues: toneFromCount(fieldIssues, 1, 4),
    budgetVariance: toneFromCount(budgetVariance ?? 0, 3, 8),
    scheduleHealth: scheduleHealthTone,
  };

  // ── Panel: Today's Priorities ────────────────────────────────────────────
  // Items due today / overdue / blocking — sorted by urgency then RFI risk score.

  const todayPriorities: PanelRow[] = [];
  for (const rfi of openRfis) {
    const row = rfiTodayPriority(rfi);
    if (row) todayPriorities.push(row);
  }
  for (const del of deliveries) {
    const row = deliveryTodayRow(del);
    if (row) todayPriorities.push(row);
  }
  for (const wp of workPackages) {
    const row = workPackageBlockedRow(wp);
    if (row) todayPriorities.push(row);
  }
  // Sort: danger first, then warn, then neutral
  todayPriorities.sort((a, b) => {
    const toneOrder: Record<PanelTone, number> = { danger: 0, warn: 1, neutral: 2, good: 3 };
    return (toneOrder[a.tone] ?? 3) - (toneOrder[b.tone] ?? 3);
  });

  // ── Panel: Waiting On ─────────────────────────────────────────────────────
  // Submittals and RFIs where ball is in GC/EOR's court.

  const waitingOn: PanelRow[] = [];
  for (const sub of submittals) {
    const row = submittialWaitingRow(sub);
    if (row) waitingOn.push(row);
  }
  // RFIs where BIC != Contractor
  for (const rfi of openRfis) {
    const bic = rfi.ball_in_court || "Contractor";
    if (bic === "Contractor") continue;
    const age = daysSinceDate(rfi.submitted_date);
    waitingOn.push({
      id: rfi.id || String(Math.random()),
      label: `${rfi.rfi_number || "RFI"} — ${rfi.title || rfi.subject || "Untitled RFI"}`,
      sub: `${bic} · ${age}d`,
      tone: age > 14 ? "warn" : "neutral",
      itemType: "RFI",
    });
  }

  // ── Panel: Risk Watchlist ─────────────────────────────────────────────────
  // Top-risk RFIs + stale COs + delayed deliveries.

  const riskWatchlist: PanelRow[] = [];
  // Top 3 RFIs by risk score
  const topRiskRfis = [...openRfis]
    .sort((a, b) => riskScore(b as Parameters<typeof riskScore>[0]) - riskScore(a as Parameters<typeof riskScore>[0]))
    .slice(0, 3);
  for (const rfi of topRiskRfis) {
    const overdue = isOverdueRfi(rfi);
    const age = daysSinceDate(rfi.submitted_date);
    riskWatchlist.push({
      id: rfi.id || String(Math.random()),
      label: `${rfi.rfi_number || "RFI"} — ${rfi.title || rfi.subject || "Untitled RFI"}`,
      sub: overdue ? `${Math.abs(daysUntilDate(rfi.date_required) ?? 0)}d past due` : `Open ${age}d`,
      tone: overdue ? "danger" : rfi.priority === "Critical" || rfi.priority === "High" ? "warn" : "neutral",
      itemType: "RFI",
    });
  }
  // Stale COs
  for (const co of changeOrders) {
    const row = coRiskRow(co);
    if (row) riskWatchlist.push(row);
  }

  // ── Action items table ────────────────────────────────────────────────────

  const actionItems: ActionItem[] = [
    ...rfisToActionItems(rfis),
    ...submittalToActionItems(submittals),
    ...changeOrderToActionItems(changeOrders),
    ...deliveriesToActionItems(deliveries),
  ].sort((a, b) => urgencyOrder(a.urgency) - urgencyOrder(b.urgency));

  return {
    kpis: {
      openActionItems,
      approvalsPending,
      overdueRfis: overdueRfis.length,
      fieldIssues,
      budgetVariance,
      scheduleHealth: scheduleHealthLabel,
    },
    panels: {
      todayPriorities: todayPriorities.slice(0, 6),
      waitingOn: waitingOn.slice(0, 6),
      riskWatchlist: riskWatchlist.slice(0, 5),
    },
    tones,
    actionItems,
  };
}
