import React from "react";
import { formatCurrency } from "../shared/formatters";

function DetailRow({ label, value, valueColor }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border-default)" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", flexShrink: 0 }}>{label}</span>
      <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: valueColor || "var(--text-secondary)", fontWeight: 500, textAlign: "right", marginLeft: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "55%" }}>{value}</span>
    </div>
  );
}

export default function ProjectDetailsCard({ project, wps }) {
  const shopBudget = wps.reduce((s, w) => s + (Number(w.shop_hours_budget) || 0), 0);
  const shopActual = wps.reduce((s, w) => s + (Number(w.shop_hours_actual) || 0), 0);
  const fieldBudget = wps.reduce((s, w) => s + (Number(w.field_hours_budget) || 0), 0);
  const fieldActual = wps.reduce((s, w) => s + (Number(w.field_hours_actual) || 0), 0);
  const totalTonnage = Math.round(wps.reduce((s, w) => s + (Number(w.tonnage) || 0), 0));

  const shopBurn = shopBudget > 0 ? Math.round(shopActual / shopBudget * 100) : 0;
  const fieldBurn = fieldBudget > 0 ? Math.round(fieldActual / fieldBudget * 100) : 0;

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden", height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ width: 3, height: 16, background: "var(--chart-4)", borderRadius: 2 }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Project Details</span>
      </div>

      <div style={{ padding: "8px 16px 14px" }}>
        {/* People */}
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", padding: "8px 0 4px", marginBottom: 0 }}>Team</div>
        <DetailRow label="Project Manager" value={project.project_manager} />
        <DetailRow label="Superintendent" value={project.superintendent} />
        <DetailRow label="Client" value={project.client} />
        <DetailRow label="General Contractor" value={project.general_contractor} />
        <DetailRow label="Engineer of Record" value={project.engineer_of_record} />

        {/* Contract */}
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", padding: "12px 0 4px" }}>Contract</div>
        <DetailRow label="Contract Type" value={project.contract_type} />
        <DetailRow label="Contract Value" value={project.original_contract_value ? formatCurrency(project.original_contract_value).replace(/\.\d+/, "") : null} valueColor="var(--accent)" />
        <DetailRow label="Retainage" value={project.retainage_percent != null ? `${project.retainage_percent}%` : null} />
        <DetailRow label="Contingency" value={project.contingency_amount ? formatCurrency(project.contingency_amount).replace(/\.\d+/, "") : null} />

        {/* Steel metrics */}
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", padding: "12px 0 4px" }}>Steel Scope</div>
        <DetailRow label="Total Tonnage" value={totalTonnage > 0 ? `${totalTonnage.toLocaleString()} T` : null} valueColor="var(--status-warning)" />
        <DetailRow label="Work Packages" value={wps.length > 0 ? `${wps.length} packages` : null} />

        {/* Labor */}
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", padding: "12px 0 4px" }}>Labor</div>
        <DetailRow label="Shop Hrs Budget" value={shopBudget > 0 ? `${shopBudget.toLocaleString()} hrs` : null} />
        <DetailRow label="Shop Hrs Actual" value={shopActual > 0 ? `${shopActual.toLocaleString()} hrs (${shopBurn}%)` : null} valueColor={shopBurn > 100 ? "var(--status-error)" : shopBurn > 85 ? "var(--status-warning)" : "var(--status-success)"} />
        <DetailRow label="Field Hrs Budget" value={fieldBudget > 0 ? `${fieldBudget.toLocaleString()} hrs` : null} />
        <DetailRow label="Field Hrs Actual" value={fieldActual > 0 ? `${fieldActual.toLocaleString()} hrs (${fieldBurn}%)` : null} valueColor={fieldBurn > 100 ? "var(--status-error)" : fieldBurn > 85 ? "var(--status-warning)" : "var(--status-success)"} />
      </div>
    </div>
  );
}