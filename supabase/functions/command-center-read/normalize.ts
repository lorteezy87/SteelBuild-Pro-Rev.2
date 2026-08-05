import { buildRecordLink } from "../../../src/lib/recordLinks.ts";
import type { SteelBuildEntityType } from "./contract.ts";

export interface ProjectIdentity {
  id: string;
  number?: string;
  name: string;
}

export interface NormalizedSourceItem {
  id: string;
  source: {
    sourceType: "steelbuild";
    sourceId: string;
    sourceUrl: string;
    entityType: SteelBuildEntityType;
  };
  project: ProjectIdentity;
  entityType: SteelBuildEntityType;
  title: string;
  number?: string;
  status: string;
  owner?: string;
  waitingOn?: string;
  dates: { dueAt?: string; startAt?: string; endAt?: string };
  risk: { level: "low" | "medium" | "high" | "critical"; reasons: string[] };
  updatedAt: string;
  sourceUrl: string;
}

export function normalizeSourceRow(input: {
  entityType: SteelBuildEntityType;
  row: Record<string, unknown>;
  project: ProjectIdentity;
  baseUrl: string;
}): NormalizedSourceItem {
  const id = requireText(input.row.id, "id", 200);
  const updatedAt = requireTimestamp(input.row.updated_at ?? input.row.created_at, "updated_at");
  const normalized = normalizeFields(input.entityType, input.row);
  const sourceUrl = buildRecordLink({
    baseUrl: input.baseUrl,
    entityType: input.entityType,
    projectId: input.project.id,
    recordId: input.entityType === "drawing_revision"
      ? requireText(input.row.drawing_id, "drawing_id", 200)
      : id,
    ...(input.entityType === "drawing_revision" ? { revisionId: id } : {}),
  });

  return {
    id,
    source: {
      sourceType: "steelbuild",
      sourceId: id,
      sourceUrl,
      entityType: input.entityType,
    },
    project: input.project,
    entityType: input.entityType,
    title: normalized.title,
    ...(normalized.number === undefined ? {} : { number: normalized.number }),
    status: normalized.status,
    ...(normalized.owner === undefined ? {} : { owner: normalized.owner }),
    ...(normalized.waitingOn === undefined ? {} : { waitingOn: normalized.waitingOn }),
    dates: normalized.dates,
    risk: normalized.risk,
    updatedAt,
    sourceUrl,
  };
}

function normalizeFields(entityType: SteelBuildEntityType, row: Record<string, unknown>) {
  switch (entityType) {
    case "project": {
      const onHold = row.on_hold === true;
      const health = optionalText(row.health_status, 100) ?? "Unknown";
      const reasons = [
        onHold ? optionalText(row.on_hold_reason, 500) ?? "Project is explicitly on hold" : undefined,
        /critical/i.test(health) ? `Project health: ${health}` : undefined,
      ].filter((value): value is string => value !== undefined);
      return {
        title: requireText(row.name, "project.name", 500),
        number: optionalText(row.project_number, 100),
        status: onHold ? "on_hold" : optionalText(row.phase, 100) ?? "active",
        owner: optionalText(row.project_manager, 200),
        waitingOn: undefined,
        dates: compactDates({
          dueAt: toIsoTimestamp(row.target_completion_date ?? row.forecast_completion_date),
          startAt: toIsoTimestamp(row.start_date),
        }),
        risk: { level: projectRiskLevel(health, onHold), reasons },
      };
    }
    case "rfi": {
      const reasons = [
        row.schedule_impact === true
          ? `Schedule impact${positiveNumber(row.schedule_impact_days) === undefined ? "" : `: ${positiveNumber(row.schedule_impact_days)} days`}`
          : undefined,
        row.cost_impact === true ? "Cost impact" : undefined,
      ].filter((value): value is string => value !== undefined);
      const priority = optionalText(row.priority, 100) ?? "Normal";
      return {
        title: optionalText(row.title, 500) ?? "Untitled RFI",
        number: optionalText(row.rfi_number, 100),
        status: optionalText(row.status, 100) ?? "Unknown",
        owner: optionalText(row.assigned_to, 200),
        waitingOn: optionalText(row.ball_in_court, 200),
        dates: compactDates({ dueAt: toIsoTimestamp(row.date_required ?? row.due_date) }),
        risk: { level: priorityRiskLevel(priority), reasons },
      };
    }
    case "change_order": {
      const scheduleImpactDays = positiveNumber(row.schedule_impact_days);
      const amount = finiteNumber(row.co_amount);
      const reasons = [
        scheduleImpactDays === undefined ? undefined : `Schedule impact: ${scheduleImpactDays} days`,
        amount === undefined ? undefined : `Amount: ${formatAmount(amount)}`,
      ].filter((value): value is string => value !== undefined);
      return {
        title: optionalText(row.title, 500) ?? "Untitled change order",
        number: optionalText(row.co_number, 100),
        status: optionalText(row.status, 100) ?? "Unknown",
        owner: optionalText(row.approved_by, 200),
        waitingOn: undefined,
        dates: compactDates({
          startAt: toIsoTimestamp(row.submitted_date),
          endAt: toIsoTimestamp(row.approved_date),
        }),
        risk: { level: scheduleImpactDays === undefined ? "medium" as const : "high" as const, reasons },
      };
    }
    case "drawing_revision":
      return {
        title: requireText(row.sheet_title, "drawing_revision.sheet_title", 500),
        number: `${requireText(row.sheet_number, "drawing_revision.sheet_number", 100)} Rev ${requireText(row.revision_code, "drawing_revision.revision_code", 100)}`,
        status: optionalText(row.release_status, 100) ?? (row.is_current === true ? "current" : "superseded"),
        owner: undefined,
        waitingOn: undefined,
        dates: compactDates({ startAt: toIsoTimestamp(row.issued_at) }),
        risk: { level: "low" as const, reasons: [] as string[] },
      };
    case "schedule_task": {
      const priority = optionalText(row.priority, 100) ?? "Normal";
      const blockerReasons = boundedBlockerReasons(row.blockers);
      return {
        title: optionalText(row.task_name, 500) ?? "Untitled schedule task",
        number: optionalText(row.wbs_code, 100),
        status: optionalText(row.status, 100) ?? "Unknown",
        owner: optionalText(row.assigned_to ?? row.resource_names, 200),
        waitingOn: undefined,
        dates: compactDates({
          startAt: toIsoTimestamp(row.start_date),
          dueAt: toIsoTimestamp(row.end_date ?? row.target_release),
        }),
        risk: {
          level: blockerReasons.length > 0 ? "critical" as const : priorityRiskLevel(priority),
          reasons: blockerReasons,
        },
      };
    }
    case "submittal": {
      const daysInReview = positiveNumber(row.days_in_review);
      return {
        title: requireText(row.title, "submittal.title", 500),
        number: [optionalText(row.submittal_number, 100), optionalText(row.revision, 100)]
          .filter(Boolean)
          .join(" Rev ") || undefined,
        status: optionalText(row.status, 100) ?? "Unknown",
        owner: optionalText(row.submitted_by, 200),
        waitingOn: optionalText(row.ball_in_court ?? row.reviewer, 200),
        dates: compactDates({
          dueAt: toIsoTimestamp(row.required_date),
          startAt: toIsoTimestamp(row.submitted_date),
          endAt: toIsoTimestamp(row.approved_date ?? row.returned_date),
        }),
        risk: {
          level: "low" as const,
          reasons: daysInReview === undefined ? [] : [`In review: ${daysInReview} days`],
        },
      };
    }
  }
}

function compactDates(input: { dueAt?: string; startAt?: string; endAt?: string }) {
  return {
    ...(input.dueAt === undefined ? {} : { dueAt: input.dueAt }),
    ...(input.startAt === undefined ? {} : { startAt: input.startAt }),
    ...(input.endAt === undefined ? {} : { endAt: input.endAt }),
  };
}

function projectRiskLevel(health: string, onHold: boolean): "low" | "medium" | "high" | "critical" {
  if (onHold || /critical/i.test(health)) return "critical";
  if (/at risk|high/i.test(health)) return "high";
  if (/watch|medium|warning/i.test(health)) return "medium";
  return "low";
}

function priorityRiskLevel(priority: string): "low" | "medium" | "high" | "critical" {
  if (/critical|urgent/i.test(priority)) return "critical";
  if (/high/i.test(priority)) return "high";
  if (/medium|normal/i.test(priority)) return "medium";
  return "low";
}

function boundedBlockerReasons(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .slice(0, 5)
      .map((entry) => `Blocked: ${entry.trim().slice(0, 300)}`);
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry === true || (typeof entry === "string" && entry.trim().length > 0))
      .slice(0, 5)
      .map(([key, entry]) => `Blocked: ${key.slice(0, 100)}${typeof entry === "string" ? ` - ${entry.trim().slice(0, 200)}` : ""}`);
  }
  return [];
}

function toIsoTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function requireTimestamp(value: unknown, field: string): string {
  const timestamp = toIsoTimestamp(value);
  if (timestamp === undefined) throw new Error(`${field} must be a valid source timestamp`);
  return timestamp;
}

function requireText(value: unknown, field: string, maximum: number): string {
  const text = optionalText(value, maximum);
  if (text === undefined) throw new Error(`${field} is required`);
  return text;
}

function optionalText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized === "" ? undefined : normalized.slice(0, maximum);
}

function finiteNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(number) ? number : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  const number = finiteNumber(value);
  return number !== undefined && number > 0 ? number : undefined;
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(amount);
}
