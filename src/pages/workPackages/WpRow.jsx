/**
 * WpRow — single work-package card row in the list view.
 *
 * Grid layout:
 *   [checkbox][ID+sheets+tons][name+discipline+BIC][phase chevron]
 *   [progress bar + due][status pill][edit · del]
 *
 * Per-row PhaseChevron shows the WP's current phase highlighted within
 * the full Detailing → Fabrication → Delivery → Erection pipeline.
 */

import React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { PhaseChevron, ProgressBar, StatusPill, BicPill } from "@/components/design-system";
import { PHASE_COLOR, PHASE_HEX } from "@/components/design-system/tokens";

// Trailing column widened from 30→56px so the edit + delete icons fit
// side-by-side without crowding the status pill.
const GRID = "20px 100px minmax(180px, 1fr) minmax(360px, 1.4fr) 140px 110px 56px";
const PHASE_IDX = { Detailing: 0, Fabrication: 1, Delivery: 2, Erection: 3 };

const STAGES = [
  { id: "Detailing",   label: "DETAIL", color: PHASE_HEX.Detailing   },
  { id: "Fabrication", label: "FAB",    color: PHASE_HEX.Fabrication },
  { id: "Delivery",    label: "SHIP",   color: PHASE_HEX.Delivery    },
  { id: "Erection",    label: "ERECT",  color: PHASE_HEX.Erection    },
];

export default function WpRow({ wp, selected, onToggle, onEdit, onOpen, onDelete }) {
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
      {/* Per-row actions — Edit + Delete. stopPropagation so the row's
       * onOpen handler doesn't also fire when clicking an action icon.
       * onDelete is optional so callers that pass no handler (e.g. a
       * read-only view) won't render the icon at all. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit?.(wp); }}
          aria-label={`Edit ${wp.wp_number || "work package"}`}
          title="Edit"
          style={actionBtnStyle("var(--text-muted)")}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.borderColor = "var(--accent)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border-default)"; }}
        >
          <Pencil size={12} />
        </button>
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(wp); }}
            aria-label={`Delete ${wp.wp_number || "work package"}`}
            title="Delete"
            style={actionBtnStyle("var(--text-muted)")}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--status-error)"; e.currentTarget.style.borderColor = "var(--status-error)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border-default)"; }}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

const actionBtnStyle = (color) => ({
  width: 24,
  height: 24,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  border: "1px solid var(--border-default)",
  borderRadius: 4,
  color,
  cursor: "pointer",
  padding: 0,
  transition: "color 0.12s, border-color 0.12s",
});
