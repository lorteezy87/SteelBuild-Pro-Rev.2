export const PROJECT_CONTROL_CENTER_RULES = {
  priorityWeights: {
    overdueDay: 8,
    dueWithinThreeDays: 18,
    approvalDependency: 22,
    pendingExternalResponse: 20,
    unresolvedFieldIssue: 24,
    revisionUnacknowledged: 26,
    blocksFabrication: 30,
    blocksDelivery: 24,
    blocksErection: 34,
    costExposureBandLow: 10,
    costExposureBandMedium: 18,
    costExposureBandHigh: 28,
    criticalPathTask: 28,
    nearCriticalTask: 18,
    staleUpdateBandLow: 8,
    staleUpdateBandHigh: 16,
  },
  severityThresholds: {
    critical: 80,
    high: 56,
    medium: 32,
  },
};

export const PROJECT_CONTROL_CENTER_RISK_CATEGORIES = [
  "Schedule Risk",
  "Cost Risk",
  "Drawing / Revision Risk",
  "Procurement Risk",
  "Field Coordination Risk",
  "Approval Risk",
];

export const PROJECT_CONTROL_CENTER_WAITING_BUCKETS = [
  "Waiting On GC",
  "Waiting On Engineer",
  "Waiting On Architect",
  "Waiting On Detailer",
  "Waiting On Shop",
  "Waiting On Field",
  "Waiting On Vendor",
];

export const RESPONSIBLE_PARTY_OPTIONS = [
  "All",
  "Project Manager",
  "GC",
  "Engineer",
  "Architect",
  "Detailer",
  "Shop",
  "Field",
  "Vendor",
  "Internal",
];

export const PHASE_OPTIONS = [
  "All",
  "Preconstruction",
  "Detailing",
  "Procurement",
  "Fabrication",
  "Delivery",
  "Installation",
  "Closeout",
];

export function getSeverityFromScore(score) {
  if (score >= PROJECT_CONTROL_CENTER_RULES.severityThresholds.critical) return "Critical";
  if (score >= PROJECT_CONTROL_CENTER_RULES.severityThresholds.high) return "High";
  if (score >= PROJECT_CONTROL_CENTER_RULES.severityThresholds.medium) return "Medium";
  return "Low";
}

export function getSeverityColor(severity) {
  switch (severity) {
    case "Critical":
      return "var(--status-error)";
    case "High":
      return "var(--status-warning)";
    case "Medium":
      return "var(--accent)";
    default:
      return "var(--text-muted)";
  }
}

export function getSeverityBackground(severity) {
  switch (severity) {
    case "Critical":
      return "rgba(255,61,61,0.12)";
    case "High":
      return "rgba(255,184,0,0.12)";
    case "Medium":
      return "rgba(0,229,255,0.10)";
    default:
      return "rgba(255,255,255,0.04)";
  }
}
