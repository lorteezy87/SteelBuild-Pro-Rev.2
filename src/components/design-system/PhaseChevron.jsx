/**
 * PhaseChevron — the signature lifecycle-pipeline component.
 *
 * Renders a sequence of stages with one of three visual styles:
 *
 *   "chevron" (default) — arrow-pointed segments in a row, each
 *                         filled with its stage color. Current stage
 *                         gets a 2px dark inner border + outer glow.
 *                         Past stages fill solid; future stages go
 *                         muted (65% opacity + bg-surface-low fill).
 *
 *   "bar"              — single horizontal bar, segments sized by
 *                         `count` with colored fills; legend below.
 *
 *   "dots"             — connected dots with labels inline, each dot
 *                         filled when past/present, hollow when future.
 *
 * Reused across every lifecycle surface in the app:
 *   - WP phases (Detailing → Fabrication → Delivery → Erection)
 *   - RFI lifecycle (Open → Under Review → Answered → Closed)
 *   - Delivery status (Scheduled → Loading → In Transit → Delivered)
 *   - Drawing stages (Not Started → OFA → BFA → OFS → BFS → FFF → Released)
 *   - Change Order lifecycle (Draft → Submitted → Under Review → Approved)
 *
 * Set `showIcons` to true to render `PhaseIcon` glyphs inside the
 * chevron when the stage label matches a known phase (auto-mapped
 * via CHEVRON_PHASE_MAP).
 *
 * Each stage is `{ id, label, color, count? }`.
 */

import React from "react";
import PhaseIcon from "./PhaseIcon";

/**
 * Map chevron-stage labels back to `PhaseIcon` keys for automatic
 * glyph rendering. Covers the 4 production-phase aliases used across
 * Dashboard, WP list, and WP board.
 */
const CHEVRON_PHASE_MAP = {
  DETAIL:      "Detailing",
  DETAILING:   "Detailing",
  FAB:         "Fabrication",
  FABRICATION: "Fabrication",
  SHIP:        "Delivery",
  DELIVERY:    "Delivery",
  ERECT:       "Erection",
  ERECTION:    "Erection",
};

export default function PhaseChevron({ stages, activeIdx = 0, style = "chevron", showIcons = true }) {
  if (style === "dots") return <DotsStyle stages={stages} activeIdx={activeIdx} />;
  if (style === "bar")  return <BarStyle stages={stages} />;
  return <ChevronStyle stages={stages} activeIdx={activeIdx} showIcons={showIcons} />;
}

function ChevronStyle({ stages, activeIdx, showIcons }) {
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "stretch" }}>
      {stages.map((s, i) => {
        const isActive = i === activeIdx;
        const isFuture = i > activeIdx;
        const fill = isFuture ? "var(--bg-surface-low)" : s.color;
        const textColor = isFuture ? "var(--text-muted)" : "#0B0E11";

        const clip =
          i === 0
            ? "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)"
            : i === stages.length - 1
            ? "polygon(0 0, 100% 0, 100% 100%, 0 100%, 12px 50%)"
            : "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)";

        const phaseKey = CHEVRON_PHASE_MAP[s.label];

        return (
          <div
            key={s.id}
            style={{
              flex: 1,
              clipPath: clip,
              background: fill,
              padding: "8px 14px 8px 20px",
              position: "relative",
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              boxShadow: isActive ? `inset 0 0 0 2px #0B0E11, 0 0 16px ${s.color}50` : "none",
              opacity: isFuture ? 0.65 : 1,
            }}
          >
            {showIcons && phaseKey && (
              <div style={{ marginBottom: 2, opacity: isFuture ? 0.6 : 1 }}>
                <PhaseIcon
                  phase={phaseKey}
                  size={14}
                  color={isFuture ? "var(--text-muted)" : "#0B0E11"}
                />
              </div>
            )}
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 800,
                color: textColor,
                letterSpacing: "0.12em",
              }}
            >
              {s.label}
            </div>
            {s.count !== undefined && (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  color: isFuture ? "var(--text-muted)" : "rgba(11,14,17,0.7)",
                  marginTop: 2,
                  letterSpacing: "0.08em",
                }}
              >
                {s.count}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BarStyle({ stages }) {
  const totalCount = stages.reduce((s, x) => s + (x.count || 0), 0) || 1;
  return (
    <div>
      <div style={{ display: "flex", height: 10, borderRadius: 3, overflow: "hidden", border: "1px solid var(--border-default)" }}>
        {stages.map((s) => (
          <div
            key={s.id}
            style={{
              flex: Math.max(0.05, (s.count || 0) / totalCount),
              background: s.color,
              minWidth: 6,
            }}
            title={`${s.label}: ${s.count}`}
          />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, flexWrap: "wrap", gap: 8 }}>
        {stages.map((s) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: s.color }} />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 700,
                color: "var(--text-muted)",
                letterSpacing: "0.12em",
              }}
            >
              {s.label}{" "}
              <span style={{ color: s.color, fontSize: 10 }}>{s.count}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DotsStyle({ stages, activeIdx }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {stages.map((s, i) => (
        <React.Fragment key={s.id}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              opacity: i <= activeIdx ? 1 : 0.45,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                background: i <= activeIdx ? s.color : "var(--bg-surface-high)",
                border: `1.5px solid ${s.color}`,
                boxShadow: i === activeIdx ? `0 0 10px ${s.color}` : "none",
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                color: i <= activeIdx ? s.color : "var(--text-muted)",
                letterSpacing: "0.12em",
              }}
            >
              {s.label}
              {s.count !== undefined ? ` ${s.count}` : ""}
            </span>
          </div>
          {i < stages.length - 1 && (
            <div style={{ width: 12, height: 1, background: "var(--divider)" }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
