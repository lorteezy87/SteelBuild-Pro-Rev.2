import React from "react";

export default function StatCard({ label, value, sub, color = "blue", icon: Icon }) {
  const getColorVars = (colorName) => {
    const vars = {
      blue: { bg: "var(--accent-muted)", text: "var(--accent)", border: "var(--accent-border)" },
      green: { bg: "var(--success-muted)", text: "var(--status-success)", border: "var(--success-border)" },
      amber: { bg: "var(--warning-muted)", text: "var(--status-warning)", border: "var(--warning-border)" },
      rose: { bg: "var(--danger-muted)", text: "var(--status-error)", border: "var(--danger-border)" },
      purple: { bg: "var(--info-muted)", text: "var(--status-info)", border: "var(--info-border)" },
      slate: { bg: "var(--hover-bg)", text: "var(--text-secondary)", border: "var(--border-default)" },
    };
    return vars[colorName] || vars.blue;
  };
  const colorVars = getColorVars(color);

  return (
    <div style={{ borderRadius: "12px", border: `1px solid ${colorVars.border}`, padding: "16px", background: colorVars.bg }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <span style={{ fontSize: "12px", fontWeight: "500", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.04em", color: colorVars.text }}>{label}</span>
        {Icon && <Icon className="w-4 h-4" style={{ opacity: 0.5, color: colorVars.text }} />}
      </div>
      <p style={{ fontSize: "24px", fontWeight: "700", letterSpacing: "-0.02em", color: colorVars.text }}>{value}</p>
      {sub && <p style={{ fontSize: "12px", marginTop: "4px", opacity: 0.6, color: colorVars.text }}>{sub}</p>}
    </div>
  );
}