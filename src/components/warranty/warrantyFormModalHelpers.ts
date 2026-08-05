/** Pure empty form + style tokens for WarrantyFormModal. */

export const EMPTY_WARRANTY_FORM = {
  project_id: "",
  warranty_type: "Material",
  component_description: "",
  vendor_name: "",
  vendor_contact: "",
  vendor_phone: "",
  vendor_email: "",
  warranty_term_years: "1",
  coverage_percentage: "100",
  start_date: new Date().toISOString().split("T")[0],
  expiration_date: "",
  exclusions: "",
  is_active: true,
  notes: "",
};

export const WARRANTY_INPUT_STYLE: Record<string, string | number> = {
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

export const WARRANTY_LABEL_STYLE: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: "9px",
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: "4px",
};
