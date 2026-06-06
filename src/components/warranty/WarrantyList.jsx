import React, { useState } from "react";
import { formatLocalDate } from "@/utils/dates";

const TYPE_COLORS = {
  Material: "var(--status-info)",
  "Structural Steel": "var(--accent)",
  Connections: "var(--status-warning)",
  Coating: "var(--status-success)",
  Welds: "var(--text-muted)",
  Installation: "var(--status-info)",
  Equipment: "var(--accent)",
  Other: "var(--text-muted)",
};

export default function WarrantyList({ warranties }) {
  const [expanded, setExpanded] = useState(null);
  const today = new Date();

  if (warranties.length === 0) {
    return (
      <div style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-card)", padding: "40px", textAlign: "center" }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>No warranties</p>
      </div>
    );
  }

  const getWarrantyStatus = (warranty) => {
    if (!warranty.is_active) return { label: "Inactive", color: "var(--text-muted)" };
    const expDate = new Date(warranty.expiration_date);
    if (expDate <= today) return { label: "Expired", color: "var(--status-error)" };
    const daysUntilExpiry = Math.floor((expDate - today) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry <= 90) return { label: "Expiring Soon", color: "var(--status-warning)" };
    return { label: "Active", color: "var(--status-success)" };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {warranties.map((warranty) => {
        const status = getWarrantyStatus(warranty);
        const expDate = new Date(warranty.expiration_date);
        const daysRemaining = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

        return (
          <div key={warranty.id} style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-card)", overflow: "hidden", cursor: "pointer", transition: "background 0.1s" }} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-surface-low)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-surface)"; }}>
            {/* Header */}
            <div onClick={() => setExpanded(expanded === warranty.id ? null : warranty.id)} style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "16px", alignItems: "center", borderBottom: expanded === warranty.id ? "1px solid var(--divider)" : "none" }}>
              <div>
                <div style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", background: `${TYPE_COLORS[warranty.warranty_type]}18`, borderRadius: 9999, marginBottom: "6px" }}>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: TYPE_COLORS[warranty.warranty_type], textTransform: "uppercase", letterSpacing: "0.06em" }}>{warranty.warranty_type}</span>
                </div>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>{warranty.component_description}</div>
              </div>

              <div>
                <div style={{ fontSize: "10px", color: "var(--text-secondary)", marginBottom: "4px" }}>📅 {formatLocalDate(warranty.start_date)}</div>
                <div style={{ fontSize: "10px", color: "var(--text-secondary)" }}>Expires: {expDate.toLocaleDateString()}</div>
                <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "2px" }}>{warranty.vendor_name}</div>
              </div>

              <div>
                <div style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", background: `${status.color}18`, borderRadius: 9999, marginBottom: "6px" }}>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: status.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>{status.label}</span>
                </div>
                {warranty.is_active && daysRemaining > 0 && (
                  <div style={{ fontSize: "11px", fontWeight: 600, color: daysRemaining <= 90 ? "var(--status-warning)" : "var(--status-success)" }}>
                    {daysRemaining} {daysRemaining === 1 ? "day" : "days"} remaining
                  </div>
                )}
                {warranty.coverage_percentage < 100 && (
                  <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "2px" }}>{warranty.coverage_percentage}% coverage</div>
                )}
              </div>

              <div style={{ fontSize: "14px", color: "var(--text-muted)", transform: expanded === warranty.id ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>▼</div>
            </div>

            {/* Expanded */}
            {expanded === warranty.id && (
              <div style={{ padding: "16px", borderTop: "1px solid var(--divider)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "12px" }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Vendor Contact</div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                      {warranty.vendor_contact && <div>{warranty.vendor_contact}</div>}
                      {warranty.vendor_phone && <div>📞 {warranty.vendor_phone}</div>}
                      {warranty.vendor_email && <div>📧 {warranty.vendor_email}</div>}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Term</div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                      {warranty.warranty_term_years} {warranty.warranty_term_years === 1 ? "year" : "years"}
                      {warranty.coverage_percentage < 100 && <div style={{ marginTop: "2px" }}>Coverage: {warranty.coverage_percentage}%</div>}
                    </div>
                  </div>
                </div>

                {warranty.exclusions && (
                  <div style={{ marginBottom: "12px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Exclusions</div>
                    <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>{warranty.exclusions}</p>
                  </div>
                )}

                {warranty.notes && (
                  <div style={{ marginBottom: "12px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Notes</div>
                    <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>{warranty.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}