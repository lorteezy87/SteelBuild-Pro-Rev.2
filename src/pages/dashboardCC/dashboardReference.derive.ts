import type { AttentionTone } from "@/components/command";
import type { DashboardSummary } from "./dashboardControlCenter.derive";

interface SourceRow extends Record<string, unknown> {
  id?: string;
  status?: string | null;
  title?: string | null;
  description?: string | null;
}

export interface DashboardAttentionItem {
  id: string;
  issue: string;
  deadline: string | null;
  risk: string | null;
  owner: string | null;
  nextAction: string | null;
  tone: AttentionTone;
  target?: string;
}

export interface DashboardOperationalBand {
  id: "approvals" | "production" | "field" | "commercial";
  label: string;
  metric: string;
  detail: string;
  tone: AttentionTone;
  target: string;
}

export interface DashboardReferenceModel {
  attention: DashboardAttentionItem[];
  bands: DashboardOperationalBand[];
}

export interface DashboardReferenceInput {
  summary: DashboardSummary;
  todayIso: string;
  rfis: SourceRow[];
  submittals: SourceRow[];
  workPackages: SourceRow[];
  deliveries: SourceRow[];
  changeOrders: SourceRow[];
}

const CLOSED_RFI = new Set(["closed", "answered", "void", "cancelled"]);
const CLOSED_SUBMITTAL = new Set(["approved", "approved as noted", "released for fabrication", "void", "rejected"]);
const CLOSED_CO = new Set(["approved", "rejected", "void"]);

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function normalize(value: unknown): string {
  return text(value).toLowerCase();
}

function dateOnly(value: unknown): string | null {
  const raw = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function dateLabel(value: unknown): string | null {
  const raw = dateOnly(value);
  if (!raw) return null;
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function daysFrom(todayIso: string, value: unknown): number | null {
  const raw = dateOnly(value);
  if (!raw) return null;
  const today = new Date(`${todayIso}T00:00:00Z`);
  const target = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(today.getTime()) || Number.isNaN(target.getTime())) return null;
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function rowTitle(row: SourceRow, fallback: string): string {
  return text(row.title) || text(row.description) || fallback;
}

function collectAttention(input: DashboardReferenceInput): DashboardAttentionItem[] {
  const items: DashboardAttentionItem[] = [];

  for (const rfi of input.rfis) {
    if (CLOSED_RFI.has(normalize(rfi.status))) continue;
    const dueDays = daysFrom(input.todayIso, rfi.date_required);
    const scheduleImpact = Boolean(rfi.schedule_impact);
    const costImpact = Boolean(rfi.cost_impact);
    const requiresAttention = (dueDays !== null && dueDays <= 3) || scheduleImpact || costImpact;
    if (!requiresAttention) continue;
    const number = text(rfi.rfi_number) || "RFI";
    const title = rowTitle(rfi, "Untitled RFI");
    items.push({
      id: `rfi:${text(rfi.id) || number}`,
      issue: `${number} — ${title}`,
      deadline: dateLabel(rfi.date_required),
      risk: scheduleImpact ? "Schedule" : costImpact ? "Cost" : "Approval",
      owner: text(rfi.ball_in_court) || null,
      nextAction: text(rfi.next_action) || "Obtain response",
      tone: dueDays !== null && dueDays < 0 ? "danger" : "warn",
      target: "RFIs",
    });
  }

  for (const submittal of input.submittals) {
    if (CLOSED_SUBMITTAL.has(normalize(submittal.status))) continue;
    const dueDays = daysFrom(input.todayIso, submittal.required_date);
    if (dueDays === null || dueDays > 3) continue;
    const number = text(submittal.submittal_number) || "Submittal";
    items.push({
      id: `sub:${text(submittal.id) || number}`,
      issue: `${number} — ${rowTitle(submittal, "Untitled package")}`,
      deadline: dateLabel(submittal.required_date),
      risk: "Fab release",
      owner: text(submittal.ball_in_court) || null,
      nextAction: dueDays < 0 ? "Resolve overdue approval" : "Confirm approval path",
      tone: dueDays < 0 ? "danger" : "warn",
      target: "DrawingSubmittalHub",
    });
  }

  for (const wp of input.workPackages) {
    if (normalize(wp.status) !== "on hold") continue;
    const number = text(wp.wp_number) || "WP";
    items.push({
      id: `wp:${text(wp.id) || number}`,
      issue: `${number} — ${rowTitle(wp, "Work package")}`,
      deadline: null,
      risk: "Production",
      owner: text(wp.owner) || null,
      nextAction: "Clear hold before production",
      tone: "danger",
      target: "WorkPackages",
    });
  }

  for (const delivery of input.deliveries) {
    const status = normalize(delivery.status);
    const dueDays = daysFrom(input.todayIso, delivery.scheduled_date);
    const late = status === "delayed" || (dueDays !== null && dueDays < 0 && status !== "delivered" && status !== "received");
    if (!late) continue;
    items.push({
      id: `delivery:${text(delivery.id) || rowTitle(delivery, "Delivery")}`,
      issue: rowTitle(delivery, "Delivery"),
      deadline: dateLabel(delivery.scheduled_date),
      risk: "Field readiness",
      owner: text(delivery.carrier) || null,
      nextAction: "Recover delivery plan",
      tone: "danger",
      target: "Deliveries",
    });
  }

  for (const co of input.changeOrders) {
    if (CLOSED_CO.has(normalize(co.status))) continue;
    const ageStart = co.submitted_date ?? co.created_date;
    const submittedDays = daysFrom(input.todayIso, ageStart);
    const age = submittedDays === null ? null : Math.abs(Math.min(0, submittedDays));
    if (age === null || age < 21) continue;
    const number = text(co.co_number) || "CO";
    items.push({
      id: `co:${text(co.id) || number}`,
      issue: `${number} — ${rowTitle(co, "Change order")}`,
      deadline: null,
      risk: "Commercial",
      owner: text(co.ball_in_court) || null,
      nextAction: "Close commercial decision",
      tone: age >= 30 ? "danger" : "warn",
      target: "ChangeOrders",
    });
  }

  const rank: Record<AttentionTone, number> = { danger: 0, warn: 1, info: 2, neutral: 3, good: 4 };
  return items
    .sort((a, b) => rank[a.tone] - rank[b.tone] || a.issue.localeCompare(b.issue))
    .slice(0, 8);
}

function buildBands(input: DashboardReferenceInput, attention: DashboardAttentionItem[]): DashboardOperationalBand[] {
  const pendingSubmittals = input.submittals.filter((row) => !CLOSED_SUBMITTAL.has(normalize(row.status))).length;
  const activeWps = input.workPackages.filter((row) => !["complete", "completed", "closed"].includes(normalize(row.status))).length;
  const heldWps = input.workPackages.filter((row) => normalize(row.status) === "on hold").length;
  const lateDeliveries = input.deliveries.filter((row) => {
    const status = normalize(row.status);
    const dueDays = daysFrom(input.todayIso, row.scheduled_date);
    return status === "delayed" || (dueDays !== null && dueDays < 0 && status !== "delivered" && status !== "received");
  }).length;
  const pendingCos = input.changeOrders.filter((row) => !CLOSED_CO.has(normalize(row.status))).length;
  const approvalRisks = attention.filter((item) => item.target === "RFIs" || item.target === "DrawingSubmittalHub").length;
  const productionRisks = attention.filter((item) => item.target === "WorkPackages" || item.target === "Deliveries").length;
  const commercialRisks = attention.filter((item) => item.target === "ChangeOrders").length;

  return [
    {
      id: "approvals",
      label: "Approvals & Engineering",
      metric: `${input.summary.openRfis + pendingSubmittals} open`,
      detail: `${input.summary.openRfis} RFIs · ${pendingSubmittals} submittals`,
      tone: approvalRisks > 0 ? "warn" : "neutral",
      target: "DrawingSubmittalHub",
    },
    {
      id: "production",
      label: "Fabrication & Logistics",
      metric: `${activeWps} active WPs`,
      detail: heldWps || lateDeliveries ? `${heldWps} holds · ${lateDeliveries} late loads` : "No active holds or late loads",
      tone: productionRisks > 0 ? "danger" : "neutral",
      target: "WorkPackages",
    },
    {
      id: "field",
      label: "Field Readiness",
      metric: lateDeliveries ? `${lateDeliveries} late` : "Ready view",
      detail: lateDeliveries ? "Delivery recovery needs field coordination" : "No late delivery evidence loaded",
      tone: lateDeliveries ? "danger" : "neutral",
      target: "FieldHub",
    },
    {
      id: "commercial",
      label: "Commercial Exposure",
      metric: `${pendingCos} pending CO${pendingCos === 1 ? "" : "s"}`,
      detail: commercialRisks ? `${commercialRisks} aging decisions need action` : "No aging CO decisions flagged",
      tone: commercialRisks ? "warn" : "neutral",
      target: "CostHub",
    },
  ];
}

export function buildDashboardReferenceModel(input: DashboardReferenceInput): DashboardReferenceModel {
  const attention = collectAttention(input);
  return { attention, bands: buildBands(input, attention) };
}
