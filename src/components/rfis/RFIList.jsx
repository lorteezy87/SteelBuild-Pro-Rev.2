import React from "react";

const PRIORITY_COLORS = {
  Critical: "var(--status-error)",
  High: "var(--status-warning)",
  Medium: "var(--status-info)",
  Low: "var(--text-muted)",
};

const STATUS_COLORS = {
  Open: "var(--status-warning)",
  "Under Review": "var(--status-info)",
  Answered: "var(--status-success)",
  Closed: "var(--text-muted)",
};

const BIC_COLORS = {
  Contractor: { bg: "rgba(255,107,0,0.12)", text: "var(--accent)" },
  GC: { bg: "rgba(0,229,255,0.12)", text: "var(--secondary)" },
  Engineer: { bg: "rgba(245,158,11,0.12)", text: "var(--status-warning)" },
  Architect: { bg: "rgba(34,197,94,0.12)", text: "var(--status-success)" },
  Owner: { bg: "rgba(239,68,68,0.12)", text: "var(--status-error)" },
};

const daysOpen = (rfi) => {
  const start = new Date(rfi.submitted_date || rfi.created_date || new Date());
  const end = ["Answered", "Closed"].includes(rfi.status) && rfi.date_answered
    ? new Date(rfi.date_answered)
    : new Date();
  return Math.max(0, Math.floor((end - start) / 86400000));
};

const fmtDate = (d) => {
  if (!d) return "—";
  return new Date(d + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
};

const SortIcon = ({ field, sortField, sortDir }) => {
  if (sortField !== field) return <span style={{ opacity: 0.25, fontSize: 8 }}>⇅</span>;
  return (
    <span style={{ color: "var(--accent)", fontSize: 8 }}>
      {sortDir === "asc" ? "↑" : "↓"}
    </span>
  );
};

const COLS = "28px 80px 100px 2fr 70px 100px 100px 68px 46px 100px";

export default function RFIList({
  rfis = [],
  onEdit,
  onSelect,
  selectedIds = new Set(),
  onToggleSelect,
  onToggleSelectAll,
  sortField,
  sortDir,
  onSort,
  loading,
  onDelete,
}) {
  if (loading) {
    return (
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          padding: 40,
          textAlign: "center",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--text-muted)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        Loading RFIs...
      </div>
    );
  }

  if (!rfis.length) {
    return (
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          padding: 40,
          textAlign: "center",
        }}
      >
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-muted)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}>
          No RFIs match filters
        </div>
      </div>
    );
  }

  const ColHead = ({ children, field, right }) => (
    <div
      onClick={() => field && onSort && onSort(field)}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        fontWeight: 700,
        color: sortField === field ? "var(--accent)" : "var(--text-muted)",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        cursor: field ? "pointer" : "default",
        userSelect: "none",
        display: "flex",
        alignItems: "center",
        gap: 3,
        justifyContent: right ? "flex-end" : "flex-start",
      }}
    >
      {children}
      {field && <SortIcon field={field} sortField={sortField} sortDir={sortDir} />}
    </div>
  );

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: COLS,
          gap: 10,
          padding: "10px 16px",
          background: "var(--bg-sidebar)",
          borderBottom: "1px solid var(--divider)",
          alignItems: "center",
        }}
      >
        <input
          type="checkbox"
          checked={rfis.length > 0 && selectedIds.size === rfis.length}
          onChange={onToggleSelectAll}
          style={{ cursor: "pointer", accentColor: "var(--accent)" }}
        />
        <ColHead field="rfi_number">RFI #</ColHead>
        <ColHead field="project_name">Project</ColHead>
        <ColHead>Title</ColHead>
        <ColHead field="priority">Priority</ColHead>
        <ColHead>Status</ColHead>
        <ColHead>Ball in Court</ColHead>
        <ColHead field="date_required">Due</ColHead>
        <ColHead field="days_open" right>
          Days
        </ColHead>
        <ColHead>Actions</ColHead>
      </div>

      {/* Rows */}
      {rfis.map((rfi) => {
        const isOverdue =
          rfi.date_required &&
          !["Answered", "Closed"].includes(rfi.status) &&
          new Date(rfi.date_required) < new Date();
        const isClosed = ["Answered", "Closed"].includes(rfi.status);
        const isCritical = rfi.priority === "Critical" && !isClosed;
        const days = daysOpen(rfi);
        const bic = rfi.ball_in_court || "Contractor";
        const bicStyle = BIC_COLORS[bic] || BIC_COLORS.Contractor;
        const isSelected = selectedIds.has(rfi.id);

        return (
          <div
            key={rfi.id}
            onClick={() => onSelect && onSelect(rfi)}
            style={{
              display: "grid",
              gridTemplateColumns: COLS,
              gap: 10,
              padding: "10px 16px",
              borderBottom: "1px solid var(--divider)",
              alignItems: "center",
              borderLeft: isOverdue
                ? "3px solid var(--status-error)"
                : isCritical
                ? "3px solid var(--status-error)"
                : isSelected
                ? "3px solid var(--accent)"
                : "3px solid transparent",
              background: isSelected
                ? "var(--accent-muted)"
                : isCritical
                ? "rgba(239,68,68,0.03)"
                : "transparent",
              opacity: isClosed ? 0.6 : 1,
              cursor: "pointer",
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.background = "var(--hover-bg)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isSelected
                ? "var(--accent-muted)"
                : isCritical
                ? "rgba(239,68,68,0.03)"
                : "transparent";
            }}
          >
            {/* Checkbox */}
            <div onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelect && onToggleSelect(rfi.id)}
                style={{ cursor: "pointer", accentColor: "var(--accent)" }}
              />
            </div>

            {/* RFI # */}
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--accent)",
              fontWeight: 700,
              letterSpacing: "0.04em",
            }}>
              {rfi.rfi_number || "—"}
            </div>

            {/* Project */}
            <div style={{
              fontSize: 9,
              color: "var(--text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {rfi.project_name || "—"}
            </div>

            {/* Title + drawing ref */}
            <div>
              <div style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {rfi.title}
              </div>
              {rfi.drawing_reference && (
                <div style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  color: "var(--text-muted)",
                  marginTop: 2,
                }}>
                  {rfi.drawing_reference}
                </div>
              )}
            </div>

            {/* Priority badge */}
            <div>
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "2px 7px",
                background: `${PRIORITY_COLORS[rfi.priority] || "var(--text-muted)"}20`,
                borderRadius: 9999,
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 700,
                color: PRIORITY_COLORS[rfi.priority] || "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}>
                {rfi.priority}
              </span>
            </div>

            {/* Status badge */}
            <div>
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "2px 7px",
                background: `${STATUS_COLORS[rfi.status] || "var(--text-muted)"}20`,
                borderRadius: 9999,
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 700,
                color: STATUS_COLORS[rfi.status] || "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}>
                {rfi.status}
              </span>
            </div>

            {/* Ball in Court */}
            <div>
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "2px 7px",
                background: bicStyle.bg,
                borderRadius: 9999,
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 700,
                color: bicStyle.text,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}>
                {bic}
              </span>
            </div>

            {/* Due date */}
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: isOverdue ? "var(--status-error)" : "var(--text-muted)",
              fontWeight: isOverdue ? 700 : 400,
            }}>
              {fmtDate(rfi.date_required)}
            </div>

            {/* Days open */}
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 700,
              color: days > 14 ? "var(--status-error)" : days > 7 ? "var(--status-warning)" : "var(--text-muted)",
              textAlign: "right",
            }}>
              {days}d
            </div>

            {/* Actions */}
            <div
              style={{ display: "flex", gap: 4 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => onEdit && onEdit(rfi)}
                style={{
                  background: "transparent",
                  border: "1px solid var(--border-default)",
                  borderRadius: 4,
                  padding: "3px 8px",
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  cursor: "pointer",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                }}
              >
                EDIT
              </button>
              {!isClosed && (
                <button
                  onClick={() => onEdit && onEdit({ ...rfi, _quickClose: true })}
                  style={{
                    background: "var(--success-muted)",
                    border: "1px solid var(--success-border)",
                    borderRadius: 4,
                    padding: "3px 7px",
                    color: "var(--status-success)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  ✓
                </button>
              )}
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete && onDelete(rfi);
                  }}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--danger-border)",
                    borderRadius: 4,
                    padding: "3px 7px",
                    color: "var(--status-error)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Footer */}
      <div
        style={{
          padding: "8px 16px",
          background: "var(--bg-sidebar)",
          borderTop: "1px solid var(--divider)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          color: "var(--text-muted)",
          letterSpacing: "0.10em",
        }}>
          {rfis.length} RFIs · {rfis.filter((r) => !["Answered", "Closed"].includes(r.status)).length} open ·{" "}
          {rfis.filter(
            (r) =>
              r.date_required &&
              !["Answered", "Closed"].includes(r.status) &&
              new Date(r.date_required) < new Date()
          ).length}{" "}
          overdue
        </span>
        {selectedIds.size > 0 && (
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            color: "var(--accent)",
            fontWeight: 700,
            letterSpacing: "0.08em",
          }}>
            {selectedIds.size} SELECTED
          </span>
        )}
      </div>
    </div>
  );
}
