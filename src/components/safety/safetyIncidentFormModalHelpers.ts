/** Pure empty form + style tokens for SafetyIncidentFormModal. */

import { localToday } from "@/utils/dates";

export const EMPTY_SAFETY_INCIDENT_FORM = {
  project_id: "",
  incident_type: "Hazard",
  severity: "Medium",
  incident_date: localToday(),
  incident_time: "",
  location: "",
  reported_by: "",
  description: "",
  injuries: "",
  root_cause: "",
  corrective_actions: "",
  responsible_party: "",
  action_due_date: "",
  status: "Open",
  investigation_completed: false,
  safety_trained: false,
  witnesses: "",
  notes: "",
};

export const SAFETY_FORM_INPUT_STYLE: Record<string, string | number> = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: "8px",
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
};

export const SAFETY_FORM_LABEL_STYLE: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: "9px",
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: "4px",
};
