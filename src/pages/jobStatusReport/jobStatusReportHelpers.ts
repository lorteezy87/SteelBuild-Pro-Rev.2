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

export function enrichProjectsWithReadiness<T>(
  projects: T[],
  nowMs: number = Date.now(),
): Array<T & { _readiness: ReturnType<typeof computeReadiness> }> {
  return (projects || []).map((p) => ({ ...p, _readiness: computeReadiness(p, nowMs) }));
}

export function computeJobStatusKpis(
  enriched: Array<{ _readiness: { status: string }; health_status?: string | null }>,
  nowMs: number = Date.now(),
) {
  const readyCount = enriched.filter((p) => p._readiness.status === "ready").length;
  const needsReviewCount = enriched.filter((p) => p._readiness.status === "needs-review").length;
  const missingDataCount = enriched.filter((p) => p._readiness.status === "missing-data").length;
  const atRiskCount = enriched.filter((p) => p.health_status === "At Risk").length;
  const weekAgo = nowMs - 7 * 86400000;
  const generatedThisWeek = enriched.filter((p) => {
    const d = getPsrReportDate(p);
    return d && new Date(d).getTime() >= weekAgo;
  }).length;
  return { readyCount, needsReviewCount, missingDataCount, atRiskCount, generatedThisWeek };
}

export function filterJobStatusProjects<
  T extends {
    name?: string | null;
    project_number?: string | null;
    client?: string | null;
    health_status?: string | null;
    _readiness: { status: string };
  },
>(
  enriched: T[],
  opts: { search: string; healthFilter: string; readinessFilter: string },
): T[] {
  const q = (opts.search || "").trim().toLowerCase();
  return (enriched || [])
    .filter((p) => {
      if (q) {
        const match =
          (p.name || "").toLowerCase().includes(q) ||
          (p.project_number || "").toLowerCase().includes(q) ||
          (p.client || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      if (opts.healthFilter !== "all" && p.health_status !== opts.healthFilter) return false;
      if (opts.readinessFilter !== "all" && p._readiness.status !== opts.readinessFilter) return false;
      return true;
    })
    .sort((a, b) => {
      const aOrder = HEALTH_SORT_ORDER[a.health_status as keyof typeof HEALTH_SORT_ORDER] ?? 3;
      const bOrder = HEALTH_SORT_ORDER[b.health_status as keyof typeof HEALTH_SORT_ORDER] ?? 3;
      return aOrder - bOrder;
    });
}

/** Count projects matching a health_status label (e.g. "At Risk", "Watch"). */
export function countByHealthStatus<T extends { health_status?: string | null }>(
  projects: T[],
  status: string,
): number {
  return (projects || []).filter((p) => p.health_status === status).length;
}

