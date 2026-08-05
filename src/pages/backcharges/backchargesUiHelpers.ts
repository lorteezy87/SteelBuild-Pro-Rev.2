/**
 * Pure form empties + chrome style tokens for Backcharges UI.
 */

export const bcMono: Record<string, string> = {
  fontFamily: "var(--font-mono, ui-monospace, monospace)",
};

export const BACKCHARGE_CARD_STYLE: Record<string, string | number> = {
  background: "var(--bg-surface-secondary)",
  border: "1px solid var(--border-default)",
  borderRadius: 4,
  padding: 16,
};

export const BACKCHARGE_INPUT_STYLE: Record<string, string | number> = {
  ...bcMono,
  width: "100%",
  boxSizing: "border-box",
  fontSize: 12,
  padding: "7px 9px",
  borderRadius: 3,
  background: "var(--bg-input, var(--bg-surface-low))",
  border: "1px solid var(--border-default)",
  color: "var(--text-primary)",
  outline: "none",
};

export const BACKCHARGE_LABEL_STYLE: Record<string, string | number> = {
  ...bcMono,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  display: "block",
  marginBottom: 4,
};

export const BACKCHARGE_BTN_STYLE: Record<string, string | number> = {
  ...bcMono,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  padding: "7px 14px",
  borderRadius: 3,
  border: "1px solid var(--border-default)",
  cursor: "pointer",
};

export const BACKCHARGE_BTN_PRIMARY_STYLE: Record<string, string | number> = {
  ...BACKCHARGE_BTN_STYLE,
  background: "var(--accent-muted)",
  borderColor: "var(--accent)",
  color: "var(--accent)",
};

export const EMPTY_BACKCHARGE_FORM = {
  title: "",
  description: "",
  responsible_party: "",
  responsible_party_type: "subcontractor",
  reason_code: "rework",
  status: "draft",
  amount: "",
  incident_date: "",
  notice_date: "",
  backcharge_number: "",
  notes: "",
  linked_co_id: "",
  source_rfi_id: "",
} as const;

export const EMPTY_TM_TICKET = {
  ticket_number: "",
  ticket_date: "",
  description: "",
  labor_hours: "",
  labor_rate: "",
  equipment_cost: "",
  material_cost: "",
  markup_percent: "",
  signed_by: "",
} as const;
