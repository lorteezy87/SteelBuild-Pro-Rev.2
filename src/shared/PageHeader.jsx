import React from "react";
import { RefreshCw, Plus } from "lucide-react";

export default function PageHeader({ title, subtitle, onAdd, onRefresh, addLabel }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 3, height: 20, background: "var(--accent)", borderRadius: 2 }} />
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: 0, letterSpacing: "0.04em", textTransform: "uppercase" }}>{title}</h1>
          {subtitle && <p style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", margin: "2px 0 0", letterSpacing: "0.14em", textTransform: "uppercase" }}>{subtitle}</p>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {onRefresh && (
          <button onClick={onRefresh} style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: 8, padding: "6px 12px",
            color: "var(--text-secondary)",
            fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500,
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
          >
            <RefreshCw size={12} /> Refresh
          </button>
        )}
        {onAdd && (
          <button onClick={onAdd} style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--accent)",
            border: "none", borderRadius: 8, padding: "7px 14px",
            color: "#fff",
            fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--accent-hover)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.transform = "none"; }}
          >
            <Plus size={12} /> {addLabel || "New"}
          </button>
        )}
      </div>
    </div>
  );
}