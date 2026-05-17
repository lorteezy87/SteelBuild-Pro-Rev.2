/**
 * Pure helpers for the Constraint Log.
 */

/**
 * Short-form label for a constraint type — used on narrow list rows and
 * board cards where the full name wouldn't fit.
 */
export function abbreviateType(type) {
  const map = {
    "Engineering Hold":          "ENGINEER",
    "Approval Hold":             "APPROVAL",
    "Procurement Hold":          "PROCURE",
    "Quality Hold":              "QUALITY",
    "Schedule Hold":             "SCHEDULE",
    "Resource Hold":             "RESOURCE",
    "Production Hold":           "PROD",
    "IFC Hold":                  "IFC",
    "Missing Embeds":             "EMBEDS",
    "Anchor Bolt Issue":          "ANCHOR BOLT",
    "Approved Submittal Missing": "SUBMITTAL",
    "Release Pending":            "RELEASE",
    "Field Measurement Needed":   "FIELD MEAS",
    "Access Issue":               "ACCESS",
    "Crane / Logistics Conflict": "CRANE/LOG",
    "Predecessor Not Complete":   "PREDEC",
    "Material Not Available":     "MATERIAL",
    "Design Change Pending":      "DESIGN CHG",
    Other:                        "OTHER",
  };
  return map[type] || (type || "").slice(0, 10).toUpperCase();
}

/** True if the given constraint is overdue (not resolved/closed AND past due_date). */
export function isOverdue(c) {
  if (!c?.due_date) return false;
  if (["Resolved", "Closed"].includes(c.status)) return false;
  return new Date(`${c.due_date}T00:00:00Z`) < new Date();
}

/** True if the constraint is considered "done" (resolved or closed). */
export const isResolved = (c) => ["Resolved", "Closed"].includes(c?.status);
