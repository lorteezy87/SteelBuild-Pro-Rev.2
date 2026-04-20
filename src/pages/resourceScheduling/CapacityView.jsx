import React from "react";

/**
 * Capacity-mode view for the Resource Scheduling page. Shows
 *   - Shop Fab Hours budget / actual / remaining
 *   - Field Install Hours budget / actual / remaining
 *   - Active Workload by Phase
 *   - Tonnage Scheduled vs Capacity (list of in-flight fab WPs)
 *
 * The parent page owns the data; we just render. No drag/drop here,
 * so this view is safe to extract without touching the drag refs.
 */
export default function CapacityView({ capacity, workPackages }) {
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Hours capacity grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

          {/* Shop Fab Hours */}
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 3, height: 14, background: "var(--accent)", borderRadius: 2 }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Shop Fab Hours</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
              {[
                { label: "Budget", value: capacity.shopBudget.toLocaleString() + "h", color: "var(--text-primary)" },
                { label: "Actual", value: capacity.shopActual.toLocaleString() + "h", color: capacity.shopActual > capacity.shopBudget ? "var(--status-error)" : "var(--text-primary)" },
                { label: "Remaining", value: Math.max(0, capacity.shopRemaining).toLocaleString() + "h", color: capacity.shopRemaining < 0 ? "var(--status-error)" : "var(--status-success)" },
              ].map(({ label, value, color }, i) => (
                <div key={label} style={{ padding: "14px 16px", borderRight: i < 2 ? "1px solid var(--divider)" : "none" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: "0 16px 14px" }}>
              <div style={{ height: 6, background: "var(--bg-surface-high)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(100, capacity.shopBudget > 0 ? (capacity.shopActual / capacity.shopBudget) * 100 : 0)}%`, background: capacity.shopActual > capacity.shopBudget ? "var(--status-error)" : "var(--accent)", borderRadius: 3, transition: "width 0.4s" }} />
              </div>
            </div>
          </div>

          {/* Field Install Hours */}
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 3, height: 14, background: "var(--phase-erection)", borderRadius: 2 }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Field Install Hours</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
              {[
                { label: "Budget", value: capacity.fieldBudget.toLocaleString() + "h", color: "var(--text-primary)" },
                { label: "Actual", value: capacity.fieldActual.toLocaleString() + "h", color: capacity.fieldActual > capacity.fieldBudget ? "var(--status-error)" : "var(--text-primary)" },
                { label: "Remaining", value: Math.max(0, capacity.fieldRemaining).toLocaleString() + "h", color: capacity.fieldRemaining < 0 ? "var(--status-error)" : "var(--status-success)" },
              ].map(({ label, value, color }, i) => (
                <div key={label} style={{ padding: "14px 16px", borderRight: i < 2 ? "1px solid var(--divider)" : "none" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: "0 16px 14px" }}>
              <div style={{ height: 6, background: "var(--bg-surface-high)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(100, capacity.fieldBudget > 0 ? (capacity.fieldActual / capacity.fieldBudget) * 100 : 0)}%`, background: capacity.fieldActual > capacity.fieldBudget ? "var(--status-error)" : "var(--phase-erection)", borderRadius: 3, transition: "width 0.4s" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Active WPs by phase */}
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 3, height: 14, background: "var(--accent)", borderRadius: 2 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Active Workload by Phase</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            {[
              { label: "Detailing",   count: capacity.byPhase.Detailing,   color: "var(--phase-detailing)" },
              { label: "Fabrication", count: capacity.byPhase.Fabrication, color: "var(--phase-fab)" },
              { label: "Delivery",    count: capacity.byPhase.Delivery,    color: "var(--phase-delivery)" },
              { label: "Erection",    count: capacity.byPhase.Erection,    color: "var(--phase-erection)" },
            ].map(({ label, count, color }, i) => (
              <div key={label} style={{ padding: "16px 20px", borderRight: i < 3 ? "1px solid var(--divider)" : "none", borderTop: `3px solid ${color}` }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 700, color, lineHeight: 1, marginBottom: 4 }}>{count}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>active packages</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tonnage in fab */}
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", padding: "14px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 3, height: 14, background: "var(--phase-fab)", borderRadius: 2 }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Tonnage Scheduled vs Capacity</span>
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--phase-fab)" }}>
              {capacity.inFabTons.toFixed(1)}T
              <span style={{ fontSize: 9, color: "var(--text-muted)", marginLeft: 4 }}>in fab now</span>
            </span>
          </div>
          {workPackages.filter(w => w.phase === "Fabrication" && w.status === "In Progress").map(wp => (
            <div key={wp.id} style={{ display: "grid", gridTemplateColumns: "1fr 60px 80px 80px", padding: "7px 0", borderBottom: "1px solid var(--divider)", gap: 12, alignItems: "center" }}>
              <div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", fontWeight: 700, marginRight: 6 }}>{wp.wp_number}</span>
                <span style={{ fontSize: 11, color: "var(--text-primary)" }}>{wp.name}</span>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", textAlign: "right" }}>{wp.tonnage ? `${wp.tonnage}T` : "—"}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", textAlign: "right" }}>{wp.shop_hours_budget || 0}h bdg</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, textAlign: "right", color: (wp.shop_hours_actual || 0) > (wp.shop_hours_budget || 0) ? "var(--status-error)" : "var(--accent)" }}>
                {wp.shop_hours_actual || 0}h act
              </div>
            </div>
          ))}
          {workPackages.filter(w => w.phase === "Fabrication" && w.status === "In Progress").length === 0 && (
            <div style={{ textAlign: "center", padding: "16px 0", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>NO ACTIVE FAB PACKAGES</div>
          )}
        </div>

      </div>
    </div>
  );
}
