/**
 * Pure helpers for Job Status Report page.
 */
import { getPsrReportDate } from "@/lib/importPsrSpreadsheet";

export const HEALTH = {
  "On Track": { color: "var(--success)", label: "On Track" },
  "Watch":    { color: "var(--warning)", label: "Watch" },
  "At Risk":  { color: "var(--danger)",  label: "At Risk" },
};

export const HEALTH_SORT_ORDER = { "At Risk": 0, "Watch": 1, "On Track": 2 };

export const PHASE_TOKEN = {
  "Pre-Construction":      "var(--text-muted)",
  "Detailing":             "var(--info)",
  "Procurement":           "var(--warning)",
  "Fabrication":           "var(--accent)",
  "Delivery":              "var(--phase-delivery)",
  "Installation":          "var(--phase-erection)",
  "Installation/Erection": "var(--phase-erection)",
  "Erection":              "var(--phase-erection)",
  "Closeout":              "var(--phase-closeout)",
};

export const READINESS_META = {
  "ready":         { label: "READY",        color: "var(--success)", bg: "var(--success-muted)", border: "var(--success-border)" },
  "needs-review":  { label: "NEEDS REVIEW", color: "var(--warning)", bg: "var(--warning-muted)", border: "var(--warning-border)" },
  "missing-data":  { label: "MISSING DATA", color: "var(--danger)",  bg: "var(--danger-muted)",  border: "var(--danger-border)" },
  "never-run":     { label: "NOT YET RUN",  color: "var(--info)",    bg: "var(--info-muted)",    border: "var(--info-border)" },
};

export function getReportAge(project: any, nowMs: number = Date.now()): number | null {
  const d = getPsrReportDate(project);
  if (!d) return null;
  const ms = nowMs - new Date(d).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

/**
 * Compute report readiness for a project.
 */
export function computeReadiness(project: any, nowMs: number = Date.now()) {
  const checks = [
    { key: "phase",            label: "phase",           ok: !!project.phase },
    { key: "health_status",    label: "health",          ok: !!project.health_status },
    { key: "contract_value",   label: "contract value",  ok: !!(project.original_contract_value || project.contract_value) },
    { key: "target_date",      label: "target date",     ok: !!project.target_completion_date },
    { key: "pm",               label: "project manager", ok: !!(project.project_manager || project.pm_name || project.owner) },
  ];
  const ok = checks.filter(c => c.ok).length;
  const pct = Math.round((ok / checks.length) * 100);
  const missing = checks.filter(c => !c.ok).map(c => c.label);
  const age = getReportAge(project, nowMs);

  let status: string;
  if (missing.length >= 2)             status = "missing-data";
  else if (project.health_status === "At Risk") status = "needs-review";
  else if (age === null)               status = "never-run";
  else                                 status = "ready";

  return { pct, missing, status, age };
}

export function sortProjectsByHealthThenName(projects: any[]) {
  return [...projects].sort((a, b) => {
    const aOrder = HEALTH_SORT_ORDER[a.health_status] ?? 3;
    const bOrder = HEALTH_SORT_ORDER[b.health_status] ?? 3;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}
