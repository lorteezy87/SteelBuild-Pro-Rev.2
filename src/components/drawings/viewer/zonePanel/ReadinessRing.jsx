/**
 * ReadinessRing — extracted from ZonePanel.jsx (Overview tab).
 *
 * Tiny SVG ring used by the Overview tab. Renders a background track
 * + foreground arc filled in proportion to `pct` (0–100). Null pct
 * shows a dashed placeholder so "no data" is visually distinct from
 * "0%". Color threshold buckets roughly track the zone status palette
 * so a low-readiness gauge visually agrees with a red/amber status.
 *
 * Pure presentation — no hooks, no service calls. Pulled out unchanged.
 */

import React from "react";
import { ArrowDown } from "lucide-react";
import { mono } from "./zonePanelConstants";

export function ReadinessRing({ pct, label, drivers = [], dragInfo = null }) {
  const SIZE = 56;
  const STROKE = 6;
  const R = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * R;
  const hasData = pct !== null && pct !== undefined;
  const safe = hasData ? Math.max(0, Math.min(100, pct)) : 0;
  const color =
    !hasData ? "#94A3B8" :
    safe >= 80 ? "#22C55E" :
    safe >= 50 ? "#F59E0B" :
                 "#EF4444";
  // V3.1: dragInfo enriches the tooltip with a "Drag from N upstream
  // zones: …" line and the top contributors. dragInfo.drag is a number
  // in [0,1]; contributors is a sorted array from computeDependencyImpact.
  const dragLines = (() => {
    if (!dragInfo || !(dragInfo.drag > 0)) return [];
    const top = (dragInfo.contributors || []).slice(0, 3);
    const head = `Drag from ${top.length} upstream zone${top.length !== 1 ? "s" : ""} (-${Math.round(dragInfo.drag * 100)}%)`;
    const body = top.map((c) =>
      `· ${c.zoneLabel || "zone"} ${c.relationship || ""} (-${Math.round(c.contribution * 100)}%)`,
    );
    return [head, ...body];
  })();
  const baseLine = `${label}: ${hasData ? `${safe}%` : "no data"}`;
  const driverLines = drivers.length > 0 ? drivers.map((d) => `· ${d}`) : [];
  const title = [baseLine, ...driverLines, ...dragLines].join("\n");
  return (
    <div
      title={title}
      style={{
        padding: "10px 10px 8px",
        background: "var(--bg-page)",
        border: "1px solid var(--border-default)",
        borderRadius: 3,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ display: "block" }}>
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          fill="none"
          stroke="var(--divider)"
          strokeWidth={STROKE}
          strokeDasharray={hasData ? undefined : "3 3"}
        />
        {hasData && (
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={R}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeDasharray={`${(safe / 100) * C} ${C}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            style={{ transition: "stroke-dasharray 0.25s ease" }}
          />
        )}
        <text
          x={SIZE / 2} y={SIZE / 2 + 4}
          textAnchor="middle"
          fontFamily="var(--font-mono, monospace)"
          fontSize={hasData ? 13 : 10}
          fontWeight={800}
          fill={hasData ? "var(--text-primary)" : "var(--text-muted)"}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {hasData ? `${safe}%` : "—"}
        </text>
      </svg>
      <div
        style={{
          ...mono,
          fontSize: 9,
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          textAlign: "center",
          display: "flex",
          alignItems: "center",
          gap: 3,
          justifyContent: "center",
        }}
      >
        {label}
        {dragInfo && dragInfo.drag > 0 && (
          <ArrowDown
            size={10}
            color="#EF4444"
            aria-label="Dragged down by upstream zones"
          />
        )}
      </div>
    </div>
  );
}

export default ReadinessRing;
