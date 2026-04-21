/**
 * WpRow — single work-package card row in the list view.
 *
 * Grid layout:
 *   [checkbox][ID+sheets+tons][name+discipline+BIC][phase chevron]
 *   [progress bar + due][status pill][more]
 *
 * Per-row PhaseChevron shows the WP's current phase highlighted within
 * the full Detailing → Fabrication → Delivery → Erection pipeline.
 */

import React from "react";
import { PhaseChevron, ProgressBar, StatusPill, BicPill, Icon } from "@/components/design-system";
import { PHASE_COLOR, PHASE_HEX } from "@/components/design-system/tokens";

const GRID = "20px 100px minmax(180px, 1fr) minmax(360px, 1.4fr) 140px 110px 30px";
const PHASE_IDX = { Detailing: 0, Fabrication: 1, Delivery: 2, Erection: 3 };

const STAGES = [
  { id: "Detailing",   label: "DETAIL", color: PHASE_HEX.Detailing   },
  { id: "Fabrication", label: "FAB",    color: PHASE_HEX.Fabrication },
  { id: "Delivery",    label: "SHIP",   color: PHASE_HEX.Delivery    },
  { id: "Erection",    label: "ERECT",  color: PHASE_HEX.Erection    },
];

export default function WpRow({ wp, selected, onToggle, onEdit, onOpen }) {
  const activeIdx = PHASE_IDX[wp.phase] ?? 0;

  return (
    <div
      onClick={onOpen}
      style={{
        background: selected ? "var(--accent-muted)" : "var(--bg-surface)",
        border: selected ? "1px solid var(--accent)" : "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        padding: "10px 14px",
        display: "grid",
        gridTemplateColumns: GRID,
        gap: 12,
        alignItems: "center",
        transition: "all 0.12s",
        cursor: "pointer",
      }}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={!!selected} onChange={onToggle} />
      </div>
      <div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 700,
            color: "var(--accent)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {wp.wp_number || "—"}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            marginTop: 2,
            letterSpacing: "0.08em",
          }}
        >
          {Number(wp.tonnage || 0).toFixed(1)}T
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {wp.name || "—"}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
          {wp.discipline && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                color: "var(--text-muted)",
                letterSpacing: "0.10em",
                textTransform: "uppercase",
              }}
            >
              {wp.discipline}
            </span>
          )}
          {wp.crew && <BicPill bic={wp.crew} />}
        </div>
      </div>
      <div>
        <PhaseChevron stages={STAGES} activeIdx={activeIdx} showIcons />
      </div>
      <div>
        <ProgressBar
          value={Number(wp.percent_complete) || 0}
          color={PHASE_COLOR[wp.phase] || "var(--accent)"}
          height={4}
          sub={`${Number(wp.percent_complete) || 0}% · DUE ${wp.scheduled_end_date || wp.due_date || "—"}`}
        />
      </div>
      <StatusPill label={wp.status || "Not Started"} />
      <div onClick={(e) => { e.stopPropagation(); onEdit?.(wp); }}>
        <Icon name="more" size={12} color="var(--text-muted)" />
      </div>
    </div>
  );
}
