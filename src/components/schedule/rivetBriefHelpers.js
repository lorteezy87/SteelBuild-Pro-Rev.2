/**
 * rivetBriefHelpers — pure task/date utility functions extracted verbatim from
 * ScheduleRivetBrief.jsx (behavior-preserving decomposition). These are
 * zero-state, deterministic helpers the brief's analysis engine + render loop
 * call; keeping them here makes them independently unit-testable and shrinks the
 * container. No React. Bodies are byte-identical to the originals.
 */

import { PHASES } from "@/utils/phases";
import { formatDateShort } from "@/components/shared/formatters";
import { isSummaryTask as isSummaryTaskCanonical } from "@/lib/schedule/summaryTasks";

const CLOSED_STATUSES = ["complete", "completed", "closed", "cancelled", "canceled"];

export function dateValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isOpenTask(task) {
  const status = String(task?.status || "").toLowerCase();
  return !CLOSED_STATUSES.some((closed) => status.includes(closed));
}

// Delegates to the canonical predicate (src/lib/schedule/summaryTasks.js) so
// this and every other surface share one definition of "summary/parent row".
export function isSummaryTask(task, parentIds = new Set()) {
  return isSummaryTaskCanonical(task, parentIds);
}

export function isWorkTask(task, parentIds = new Set()) {
  return !isSummaryTask(task, parentIds);
}

export function taskOwner(task) {
  return String(task?.resource_names || task?.assigned_to || "").trim();
}

export function daysFromToday(value) {
  const parsed = dateValue(value);
  if (!parsed) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  return Math.round((parsed - today) / 86400000);
}

export function taskName(task) {
  return task?.task_name || task?.name || task?.title || "Unnamed task";
}

export function phaseOf(task) {
  return PHASES.includes(task?.phase) ? task.phase : "Unassigned";
}

export function dependencyIds(task) {
  const raw = task?.dependencies || task?.predecessors || task?.predecessor_ids;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return raw.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

export function dependencyCount(task) {
  return dependencyIds(task).length;
}

export function taskMetadata(task) {
  if (!task?.metadata) return {};
  if (typeof task.metadata === "object") return task.metadata;
  if (typeof task.metadata === "string") {
    try {
      const parsed = JSON.parse(task.metadata);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function isCriticalTask(task) {
  const metadata = taskMetadata(task);
  return Boolean(metadata.is_critical || metadata.critical_path || task?.is_critical || task?.critical_path);
}

export function progressValue(task) {
  const value = Number(task?.percent_complete);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

export function taskDate(task) {
  return task?.end_date || task?.start_date || task?.target_date || null;
}

export function formatBriefTask(task) {
  const date = taskDate(task);
  return `${taskName(task)} (${phaseOf(task)} / ${task?.status || "No status"} / ${date ? formatDateShort(date) : "TBD"})`;
}

export function formatAnalysisDate(date = new Date()) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function daysBetween(task, field, min, max) {
  const days = daysFromToday(task?.[field]);
  return days != null && days >= min && days <= max;
}

export function shiftedByDays(effective) {
  const value = Number(effective?.shiftedBy);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
