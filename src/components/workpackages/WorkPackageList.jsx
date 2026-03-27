import React from "react";

const PHASE_COLORS = {
  Detailing: "var(--status-info)",
  Fabrication: "var(--status-warning)",
  Delivery: "var(--accent)",
  Erection: "var(--status-success)",
};

const STATUS_COLORS = {
  "Not Started": "var(--text-muted)",
  "In Progress": "var(--status-warning)",
  Complete: "var(--status-success)",
  "On Hold": "var(--status-error)",
};

export default function WorkPackageList({ workPackages, onSelectWP, onEdit, showProject = true }) {
  if (workPackages.length === 0) {
    return (
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "12px",
          padding: "40px",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          No work packages
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--divider)",
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr 1fr 100px 100px 80px 80px",
          gap: "12px",
          background: "var(--bg-surface-secondary)",
        }}
      >
        {["Package", "Phase", "Tonnage", "Progress", "Status", "Hours", "Actions"].map((col) => (
          <div
            key={col}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              fontWeight: 700,
              color: "var(--text-muted)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {col}
          </div>
        ))}
      </div>

      {/* Rows */}
      {workPackages.map((wp) => (
        <div
          key={wp.id}
          onClick={() => onSelectWP(wp)}
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--divider)",
            display: "grid",
            gridTemplateColumns: "1.5fr 1fr 1fr 100px 100px 80px 80px",
            gap: "12px",
            alignItems: "center",
            cursor: "pointer",
            transition: "background 0.1s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--hover-bg)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
        >
          {/* Package */}
          <div>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              {wp.name}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                color: "var(--text-muted)",
                marginTop: "2px",
              }}
            >
              {wp.wp_number}
            </div>
            {showProject && wp.project_name && (
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--accent)',
                marginTop: 1, letterSpacing: '0.04em',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {wp.project_name}
              </div>
            )}
          </div>

          {/* Phase */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "4px 8px",
              background: `${PHASE_COLORS[wp.phase]}20`,
              border: `1px solid ${PHASE_COLORS[wp.phase]}40`,
              borderRadius: "6px",
              width: "fit-content",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "8px",
                fontWeight: 600,
                color: PHASE_COLORS[wp.phase],
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {wp.phase}
            </span>
          </div>

          {/* Tonnage */}
          <div
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--text-secondary)",
            }}
          >
            {wp.tonnage}T
          </div>

          {/* Progress Bar */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <div
                style={{
                  flex: 1,
                  height: "4px",
                  background: "var(--border-default)",
                  borderRadius: "2px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    background: "var(--accent)",
                    width: `${wp.percent_complete || 0}%`,
                    transition: "width 0.3s",
                  }}
                />
              </div>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "8px",
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  minWidth: "20px",
                }}
              >
                {wp.percent_complete || 0}%
              </span>
            </div>
          </div>

          {/* Status */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "4px 8px",
              background: `${STATUS_COLORS[wp.status]}20`,
              border: `1px solid ${STATUS_COLORS[wp.status]}40`,
              borderRadius: "6px",
              width: "fit-content",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "8px",
                fontWeight: 600,
                color: STATUS_COLORS[wp.status],
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {wp.status}
            </span>
          </div>

          {/* Hours */}
          <div
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--text-secondary)",
            }}
          >
            {wp.shop_hours_actual || 0}/{wp.shop_hours_budget || 0}h
          </div>

          {/* Actions */}
          <div
            style={{ display: "flex", gap: 4 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => onEdit && onEdit(wp)}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: 6, padding: "4px 8px",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                fontSize: 8, cursor: "pointer", fontWeight: 700,
              }}
            >
              EDIT
            </button>
            {wp.status !== "Complete" && (
              <button
                onClick={() => onEdit && onEdit({ ...wp, _quickComplete: true })}
                style={{
                  background: "var(--success-glow)",
                  border: "1px solid var(--success-border)",
                  borderRadius: 6, padding: "4px 8px",
                  color: "var(--status-success)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 8, cursor: "pointer", fontWeight: 700,
                }}
              >
                ✓
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}