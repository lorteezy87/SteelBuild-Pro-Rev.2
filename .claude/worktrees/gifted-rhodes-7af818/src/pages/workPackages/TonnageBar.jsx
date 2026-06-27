/**
 * TonnageBar — "Tonnage Pipeline" card that shows a segmented bar
 * (one segment per phase, colored + glow-shadowed) plus a breakdown
 * strip showing completed vs. total tonnage per phase with a mini
 * progress bar.
 *
 * Takes a pre-computed `phaseTons` array:
 *   [{ phase, tons, completeTons, color, hex }, …]
 * so all the rollup math stays in the page shell.
 */

import React from "react";
import PhaseIcon from "./PhaseIcon";

export default function TonnageBar({ phaseTons }) {
  const total = Math.max(phaseTons.reduce((s, p) => s + p.tons, 0), 1);

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        padding: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
            fontWeight: 700,
          }}
        >
          TONNAGE PIPELINE
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 800, color: "var(--accent)" }}>
          {total.toFixed(1)}T
        </div>
      </div>

      {/* Segmented bar */}
      <div
        style={{
          display: "flex",
          height: 28,
          overflow: "hidden",
          borderRadius: "var(--radius-badge)",
          marginBottom: 12,
          background: "var(--hover-bg)",
        }}
      >
        {phaseTons.map((p) => {
          const pct = (p.tons / total) * 100;
          const width = Math.max(pct > 0 ? 8 : 0, pct);
          return (
            <div
              key={p.phase}
              style={{
                width: `${width}%`,
                background: p.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "width 0.6s ease",
                overflow: "hidden",
                boxShadow: p.tons > 0 ? `inset 0 0 12px ${p.hex}44, 0 0 8px ${p.hex}22` : "none",
              }}
              title={`${p.phase}: ${(Number(p.tons) || 0).toFixed(1)}T (${Math.round(pct)}%)`}
            >
              {pct > 12 && (
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    fontWeight: 700,
                    color: "#fff",
                    whiteSpace: "nowrap",
                    textShadow: "0 1px 3px rgba(0,0,0,0.5)",
                  }}
                >
                  {(Number(p.tons) || 0).toFixed(1)}T
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Per-phase KPI breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        {phaseTons.map((p) => {
          const pct = p.tons > 0 ? Math.round((p.completeTons / p.tons) * 100) : 0;
          return (
            <div
              key={p.phase}
              style={{
                background: "var(--bg-surface-low)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-badge)",
                padding: "8px 10px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <PhaseIcon phase={p.phase} size={13} />
                <span style={{ fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 700, color: p.color }}>
                  {p.phase}
                </span>
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  marginBottom: 4,
                }}
              >
                {p.completeTons.toFixed(1)}T / {p.tons.toFixed(1)}T
                <span style={{ fontSize: 9, fontWeight: 600, color: p.color, marginLeft: 4 }}>({pct}%)</span>
              </div>
              <div style={{ height: 3, background: "var(--bg-surface-high)", borderRadius: 2, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: p.color,
                    borderRadius: 2,
                    transition: "width 0.5s ease",
                    boxShadow: pct > 0 ? `0 0 6px ${p.hex}44` : "none",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
