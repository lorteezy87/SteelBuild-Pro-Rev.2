/**
 * BoardView — four-column kanban of the filtered work packages,
 * columns keyed by `STATUS_COLUMNS`. Each card shows phase chevron
 * pipeline, progress bar, tonnage, health dots (RFI-blocked /
 * material-pending), crew, and edit/delete actions.
 *
 * Cards route to the parent's WP detail modal through `onSelect`.
 */

import React from "react";
import ChevronPipeline from "@/components/shared/ChevronPipeline";
import { LIFECYCLE_STAGES, PHASE_COLORS, STATUS_COLORS, STATUS_COLUMNS } from "./constants";
import PhaseIcon from "./PhaseIcon";

export default function BoardView({ filtered, onSelect, onEdit, onDelete }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, alignItems: "start" }}>
      {STATUS_COLUMNS.map((col) => {
        const items = filtered.filter((w) => w.status === col);
        const color = STATUS_COLORS[col];
        return (
          <div
            key={col}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-card)",
              padding: 10,
              borderTop: `3px solid ${color}`,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color,
                fontWeight: 700,
                letterSpacing: "0.08em",
              }}
            >
              <span>{col.toUpperCase()}</span>
              <span
                style={{
                  background: "var(--bg-surface-low)",
                  border: "1px solid var(--divider)",
                  borderRadius: "var(--radius-badge)",
                  padding: "2px 8px",
                  fontSize: 9,
                }}
              >
                {items.length}
              </span>
            </div>

            {items.map((wp) => (
              <Card key={wp.id} wp={wp} onSelect={onSelect} onEdit={onEdit} onDelete={onDelete} />
            ))}

            {items.length === 0 && (
              <div
                style={{
                  padding: 16,
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--text-muted)",
                  textAlign: "center",
                }}
              >
                No packages
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Card({ wp, onSelect, onEdit, onDelete }) {
  const phaseColor = PHASE_COLORS[wp.phase] || "var(--text-muted)";

  // Health flags — either the explicit boolean or a hint in the notes
  // (so WPs added before the columns existed still surface their risks).
  const hasRFIBlock = (wp.notes || "").toLowerCase().includes("rfi") || wp.rfi_blocked;
  const hasMaterialPending = (wp.notes || "").toLowerCase().includes("material") || wp.material_pending;

  const completedStages = LIFECYCLE_STAGES
    .slice(0, LIFECYCLE_STAGES.findIndex((s) => s.key === wp.phase))
    .map((s) => s.key);

  return (
    <div
      onClick={() => onSelect(wp)}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-surface-mid)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-surface)")}
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        padding: 12,
        marginBottom: 8,
        borderLeft: `3px solid ${phaseColor}`,
        cursor: "pointer",
        transition: "background 0.1s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--accent)" }}>
            {wp.wp_number}
          </span>
          {hasRFIBlock && (
            <span
              title="Blocked by RFI"
              style={{
                width: 7, height: 7, borderRadius: "50%",
                background: "var(--status-error)",
                boxShadow: "0 0 6px rgba(239,68,68,0.5)",
                display: "inline-block", flexShrink: 0,
              }}
            />
          )}
          {hasMaterialPending && (
            <span
              title="Material pending"
              style={{
                width: 7, height: 7, borderRadius: "50%",
                background: "var(--status-warning)",
                boxShadow: "0 0 6px rgba(245,158,11,0.5)",
                display: "inline-block", flexShrink: 0,
              }}
            />
          )}
        </div>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            padding: "2px 7px",
            borderRadius: "var(--radius-badge)",
            background: `${phaseColor}22`,
            color: phaseColor,
            letterSpacing: "0.08em",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <PhaseIcon phase={wp.phase} size={9} />
          {wp.phase}
        </span>
      </div>

      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
        {wp.name}
      </div>

      <div style={{ marginBottom: 6 }}>
        <ChevronPipeline
          stages={LIFECYCLE_STAGES}
          currentStage={wp.phase}
          completedStages={completedStages}
          height={22}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <div style={{ flex: 1, height: 4, background: "var(--bg-surface-high)", borderRadius: 2 }}>
          <div
            style={{
              width: `${Math.min(100, Math.max(0, Number(wp.percent_complete) || 0))}%`,
              height: "100%",
              background: phaseColor,
              borderRadius: 2,
              transition: "width 0.5s ease",
            }}
          />
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: phaseColor }}>
          {Math.min(100, Math.max(0, Number(wp.percent_complete) || 0))}%
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
          {(Number(wp.tonnage) || 0).toFixed(1)}T
        </span>
      </div>

      {(hasRFIBlock || hasMaterialPending) && (
        <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
          {hasRFIBlock && <HealthBadge color="var(--status-error)" bg="rgba(239,61,61,0.12)" border="rgba(239,68,68,0.25)">RFI BLOCKED</HealthBadge>}
          {hasMaterialPending && <HealthBadge color="var(--status-warning)" bg="rgba(245,158,11,0.12)" border="rgba(245,158,11,0.25)">MTL PENDING</HealthBadge>}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)" }}>
          Crew: {wp.crew || "\u2014"}
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(wp); }}
            style={{
              padding: "3px 8px",
              borderRadius: "var(--radius-btn)",
              border: "1px solid var(--border-default)",
              background: "var(--bg-surface-high)",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            EDIT
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(wp); }}
            style={{
              padding: "3px 8px",
              borderRadius: "var(--radius-btn)",
              border: "1px solid var(--danger-border)",
              background: "rgba(255,61,61,0.08)",
              color: "var(--status-error)",
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

function HealthBadge({ color, bg, border, children }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: "var(--radius-badge)",
        background: bg,
        color,
        border: `1px solid ${border}`,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}
