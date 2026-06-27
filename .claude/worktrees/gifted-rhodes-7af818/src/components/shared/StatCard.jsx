import { useState } from "react";

export default function StatCard({ label, value, color = "var(--accent)", active, onClick, icon: Icon, sub, pulse }) {
  const [hovered, setHovered] = useState(false);
  const isClickable = typeof onClick === "function";

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      style={{
        background: active ? `${color}10` : "var(--bg-surface)",
        border: active ? `1.5px solid ${color}` : "1.5px solid transparent",
        borderTop: `2px solid ${color}`,
        borderRadius: "var(--radius-card)",
        padding: Icon ? "12px 14px" : "12px",
        cursor: isClickable ? "pointer" : "default",
        transition: "all 0.15s",
        boxShadow: active
          ? `0 0 0 1px ${color}33`
          : hovered && isClickable
            ? "0 2px 8px rgba(0,0,0,0.10)"
            : "none",
        transform: hovered && isClickable ? "translateY(-1px)" : "none",
        display: Icon ? "flex" : "block",
        alignItems: "center",
        gap: Icon ? 12 : undefined,
        animation: pulse ? "overAllocPulse 2s ease-in-out infinite" : undefined,
      }}
    >
      {Icon && (
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon style={{ width: 16, height: 16, color }} />
        </div>
      )}
      <div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 600, color, marginBottom: 4 }}>{value}</div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</div>
        {sub && <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}
