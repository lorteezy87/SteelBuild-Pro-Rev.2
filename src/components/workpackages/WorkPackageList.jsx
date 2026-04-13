import React, { useMemo } from "react";
import StatusBadge from "../shared/StatusBadge";

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

const STAGE_STYLES = {
  "Not Started": { bg: "rgba(144,144,149,0.12)", color: "var(--text-muted)" },
  OFA: { bg: "rgba(0,229,255,0.12)", color: "var(--status-info)" },
  BFA: { bg: "rgba(255,185,95,0.12)", color: "var(--status-warning)" },
  OFS: { bg: "rgba(68,226,205,0.12)", color: "var(--secondary)" },
  BFS: { bg: "rgba(68,226,205,0.12)", color: "var(--secondary)" },
  FFF: { bg: "rgba(255,185,95,0.15)", color: "var(--tertiary)" },
  Released: { bg: "rgba(168,240,203,0.12)", color: "var(--status-success)" },
};

export default function WorkPackageList({
  workPackages,
  drawings = [],
  expandedWP,
  onExpand,
  onEdit,
  onDelete,
  showProject = false,
  compact = false,
  selected = new Set(),
  onToggleSelect,
  onSelectAll,
  onCreateWP,
}) {
  const drawingMap = useMemo(() => {
    const m = {};
    drawings.forEach((d) => (m[d.id] = d));
    return m;
  }, [drawings]);

  if (workPackages.length === 0) {
    return (
      <div
        style={{
          padding: "48px 32px",
          textAlign: "center",
          background: "var(--bg-surface)",
          border: "2px dashed var(--border-default)",
          borderRadius: "var(--radius-card)",
        }}
      >
        {/* Hierarchy diagram */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginBottom: 16 }}>
          {[
            { label: "AREA", color: "var(--phase-delivery)", icon: "\u25A3" },
            { label: "SEQUENCE", color: "var(--phase-fab)", icon: "\u25B6" },
            { label: "WORK PKG", color: "var(--accent)", icon: "\u25C8" },
          ].map((item, i) => (
            <React.Fragment key={item.label}>
              {i > 0 && (
                <svg width="20" height="12" viewBox="0 0 20 12" style={{ flexShrink: 0, opacity: 0.35 }}>
                  <path d="M2 6H15M15 6L11 2M15 6L11 10" stroke="var(--text-muted)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                </svg>
              )}
              <div style={{
                padding: "6px 14px", borderRadius: "var(--radius-badge)",
                border: `1px solid ${item.color}`,
                background: `${item.color}12`,
              }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: item.color, letterSpacing: "0.08em" }}>
                  {item.icon} {item.label}
                </span>
              </div>
            </React.Fragment>
          ))}
        </div>

        <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>
          No Work Packages Found
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginBottom: 6, maxWidth: 420, margin: "0 auto 6px" }}>
          Work packages organize steel by the hierarchy above.
          Each package tracks tonnage, drawings, and crew through the fabrication lifecycle.
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginBottom: 20, letterSpacing: "0.06em" }}>
          Try adjusting your filters, or create the first package to get started.
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
          <button
            onClick={() => onCreateWP ? onCreateWP() : onEdit?.({})}
            style={{
              padding: "8px 20px", borderRadius: "var(--radius-btn)",
              border: "none", background: "var(--accent)",
              color: "var(--accent-text)", fontFamily: "var(--font-mono)",
              fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em",
            }}
          >
            + Create Work Package
          </button>
          <button
            onClick={() => { /* CSV import placeholder */ }}
            title="Import work packages from a CSV file (coming soon)"
            style={{
              padding: "8px 20px", borderRadius: "var(--radius-btn)",
              border: "1px solid var(--border-strong)",
              background: "transparent",
              color: "var(--text-secondary)", fontFamily: "var(--font-mono)",
              fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em",
            }}
          >
            Import from CSV
          </button>
        </div>
      </div>
    );
  }

  const formatDate = (d) =>
    d
      ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "—";

  const hoursColor = (actual, budget) => {
    if (!budget) return "var(--text-muted)";
    return Number(actual || 0) <= Number(budget || 0) ? "var(--status-success)" : "var(--status-error)";
  };

  const renderHours = (label, actual, budget) => {
    const pct = budget ? Math.min(100, Math.round(((Number(actual) || 0) / Number(budget)) * 100)) : 0;
    const color = hoursColor(actual, budget);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, height: 6, background: "var(--bg-surface-high)", borderRadius: 3 }}>
          <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color }}>
          {Number(actual || 0)}/{Number(budget || 0)}h
        </span>
      </div>
    );
  };

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          background: "var(--bg-surface-secondary)",
          borderBottom: "1px solid var(--divider)",
          padding: compact ? "6px 16px" : "10px 16px",
          display: "grid",
          gridTemplateColumns: `24px 4px 70px 1fr 100px 60px 100px ${compact ? "" : "80px "}90px`,
          gap: 10,
          alignItems: "center",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        <input
          type="checkbox"
          checked={workPackages.length > 0 && selected.size === workPackages.length}
          onChange={onSelectAll}
          style={{ cursor: "pointer", accentColor: "var(--accent)" }}
          title="Select all"
        />
        <span></span>
        <span>WP #</span>
        <span>Name</span>
        <span>Phase / Status</span>
        <span>Tons</span>
        <span>Progress</span>
        {!compact && <span>Hours</span>}
        <span>Actions</span>
      </div>

      {workPackages.map((wp) => {
        const phaseColor = PHASE_COLORS[wp.phase] || "var(--text-muted)";
        const statusColor = STATUS_COLORS[wp.status] || "var(--text-muted)";
        const percent = Math.min(100, Math.max(0, Number(wp.percent_complete) || 0));
        const isExpanded = expandedWP?.id === wp.id;

        const isSelected = selected.has(wp.id);
        return (
          <React.Fragment key={wp.id}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `24px 4px 70px 1fr 100px 60px 100px ${compact ? "" : "80px "}90px`,
                gap: 10,
                padding: "0 16px",
                height: compact ? 34 : 48,
                alignItems: "center",
                borderBottom: "1px solid var(--divider)",
                cursor: "pointer",
                background: isSelected ? "rgba(99,102,241,0.06)" : isExpanded ? "var(--bg-surface-low)" : "transparent",
              }}
              onClick={() => onExpand?.(wp)}
              onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--hover-bg)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? "rgba(99,102,241,0.06)" : isExpanded ? "var(--bg-surface-low)" : "transparent"; }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => { e.stopPropagation(); onToggleSelect?.(wp.id); }}
                onClick={(e) => e.stopPropagation()}
                style={{ cursor: "pointer", accentColor: "var(--accent)" }}
              />
              <div style={{ width: 4, height: compact ? 24 : 36, borderRadius: 2, background: phaseColor }} />
              <div style={{ fontFamily: "var(--font-mono)", fontSize: compact ? 9 : 10, fontWeight: 700, color: "var(--accent)" }}>{wp.wp_number}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: compact ? 0 : 2 }}>
                <div style={{ fontFamily: "var(--font-body)", fontSize: compact ? 11 : 12, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {wp.name}
                </div>
                {!compact && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 9 }}>
                    {showProject && <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent)", fontWeight: 700 }}>{wp.project_name || "—"}</span>}
                    {wp.crew && <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", fontStyle: "italic" }}>{wp.crew}</span>}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: "var(--radius-badge)", background: `${phaseColor}15`, color: phaseColor, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {wp.phase || "—"}
                </span>
                <StatusBadge status={wp.status} variant="pill" />
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>
                {(Number(wp.tonnage) || 0).toFixed(1)}T
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ flex: 1, height: compact ? 4 : 6, background: "var(--bg-surface-high)", borderRadius: 3 }}>
                  <div style={{ width: `${percent}%`, height: "100%", background: phaseColor, borderRadius: 3 }} />
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: phaseColor }}>{percent}%</span>
              </div>
              {!compact && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: hoursColor(wp.shop_hours_actual, wp.shop_hours_budget) }}>
                  {(wp.shop_hours_actual || 0)}/{wp.shop_hours_budget || 0}h
                </div>
              )}
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-start" }}>
                {wp.status !== "Complete" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit?.({ ...wp, _quickComplete: true });
                    }}
                    title="Mark complete"
                    style={{
                      padding: "3px 8px",
                      borderRadius: "var(--radius-btn)",
                      border: "1px solid var(--success-border)",
                      background: "var(--success-muted)",
                      color: "var(--status-success)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ✓
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit?.(wp);
                  }}
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
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete?.(wp);
                  }}
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

            {isExpanded && (
              <div
                style={{
                  borderBottom: "1px solid var(--divider)",
                  borderLeft: `3px solid ${phaseColor}`,
                  background: "var(--bg-surface-low)",
                  padding: "14px 16px 14px 20px",
                }}
              >
                <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)", letterSpacing: "0.1em" }}>
                    OVERVIEW
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
                  <StatBox label="Phase" value={wp.phase || "—"} color={phaseColor} />
                  <StatBox label="Status" value={wp.status || "—"} color={statusColor} />
                  <StatBox label="Tonnage" value={`${(Number(wp.tonnage) || 0).toFixed(1)}T`} color="var(--text-primary)" />
                  <StatBox label="% Complete" value={`${percent}%`} color={phaseColor} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 14 }}>
                  <CheckItem label="VIF Confirmed" done={wp.vif_confirmed} />
                  <CheckItem label="Load List" done={wp.load_list_complete} />
                  <CheckItem label="Sequence" done={wp.sequence_confirmed} />
                </div>

                {wp.notes && (
                  <div style={{ marginBottom: 12, fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    {wp.notes}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 16 }}>
                  <div>
                    <Label text="Shop Hours" />
                    {renderHours("Shop", wp.shop_hours_actual, wp.shop_hours_budget)}
                  </div>
                  <div>
                    <Label text="Field Hours" />
                    {renderHours("Field", wp.field_hours_actual, wp.field_hours_budget)}
                  </div>
                </div>

                <div>
                  <Label text="Linked Drawings" />
                  {renderDrawings(wp, drawingMap)}
                </div>
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function Label({ text }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        color: "var(--text-muted)",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        marginBottom: 4,
      }}
    >
      {text}
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        padding: 10,
      }}
    >
      <Label text={label} />
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function CheckItem({ label, done }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 10, color: done ? "var(--status-success)" : "var(--text-muted)" }}>
      <span>{done ? "✓" : "○"}</span>
      {label}
    </div>
  );
}

function renderDrawings(wp, drawingMap) {
  const ids = (wp.linked_drawing_ids || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!ids.length) {
    return (
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
        No drawings linked — add via Edit.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "90px 1fr 80px 60px",
        gap: 8,
        padding: "8px 0",
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>Sheet</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>Title</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>Stage</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>Due</span>
      {ids.map((id) => {
        const d = drawingMap[id];
        const style = d ? STAGE_STYLES[d.stage] || STAGE_STYLES["Not Started"] : STAGE_STYLES["Not Started"];
        const overdue = d?.due_date && new Date(`${d.due_date}T00:00:00Z`) < new Date() && d.stage !== "Released";
        return (
          <React.Fragment key={id}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", fontWeight: 700 }}>
              {d?.sheet_number || id}
            </div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {d?.title || "—"}
            </div>
            <div
              style={{
                background: style.bg,
                color: style.color,
                padding: "2px 7px",
                borderRadius: "var(--radius-badge)",
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              {d?.stage || "Not Started"}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: overdue ? "var(--status-error)" : "var(--text-muted)",
                fontWeight: overdue ? 700 : 500,
              }}
            >
              {d?.due_date ? formatDate(d.due_date).replace(", 2026", "") : "—"}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
