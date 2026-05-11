import React from "react";
import { useNavigate } from "react-router-dom";

/**
 * Single row in the Action Feed.
 *
 * Layout (left to right):
 *  1. 4px urgency color bar
 *  2. Item type pill badge
 *  3. Project tag (job number, optionally + name)
 *  4. Title (one line, truncated; hover for full text via title attr)
 *  5. Age / due text
 *  6. Status label
 *  7. Owner / waiting-on (truncated; hover for full)
 *  8. Quick action button
 *
 * `compact` prop (default false): shrinks the project tag (number-only,
 * no name) and the owner pill so the title gets more horizontal room.
 * Used by the side-by-side UpcomingWindows panels where row width is
 * roughly half the page. The full project name still surfaces on hover
 * via the wrapper's `title` attribute.
 */

const URGENCY_COLORS = {
  overdue:    "var(--status-error)",
  "due-soon": "var(--status-warning)",
  blocking:   "var(--accent)",
  awaiting:   "var(--text-muted)",
  normal:     "var(--border-default)",
};

const URGENCY_WASH = {
  overdue:    "rgba(248,81,73,0.03)",
  "due-soon": "rgba(227,179,65,0.03)",
  blocking:   "rgba(200,155,32,0.03)",
  awaiting:   "transparent",
  normal:     "transparent",
};

const TYPE_COLORS = {
  RFI:  { color: "var(--status-warning)", bg: "var(--warning-muted)",       badge: "sbd-badge-warning" },
  DWG:  { color: "var(--status-info)",    bg: "var(--info-muted)",          badge: "sbd-badge-info" },
  SUB:  { color: "var(--secondary)",      bg: "rgba(68,226,205,0.12)",      badge: "sbd-badge-info" },
  CO:   { color: "var(--accent)",         bg: "var(--accent-muted)",        badge: "sbd-badge-info" },
  DEL:  { color: "#0D9488",              bg: "rgba(13,148,136,0.12)",       badge: "sbd-badge-success" },
  WP:   { color: "var(--status-success)", bg: "var(--success-muted)",       badge: "sbd-badge-success" },
  PAY:  { color: "var(--tertiary)",       bg: "rgba(168,240,203,0.12)",     badge: "sbd-badge-gold" },
  NOTE: { color: "var(--text-muted)",     bg: "var(--hover-bg)",            badge: "sbd-badge" },
};

const Pill = ({ label, color, bg, badgeClass }) => (
  <span
    className={`sbd-badge ${badgeClass || ""}`}
    style={{
      fontFamily: "var(--font-mono)",
      fontSize: 8,
      fontWeight: 700,
      padding: "2px 8px",
      borderRadius: 2,
      background: bg,
      color,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      whiteSpace: "nowrap",
    }}
  >
    {label}
  </span>
);

export default function ActionRow({ item, isSelected, onOpenDetail, compact = false }) {
  const navigate = useNavigate();
  const barColor = URGENCY_COLORS[item.urgency] || "var(--border-default)";
  const wash = URGENCY_WASH[item.urgency] || "transparent";
  const typeCfg = TYPE_COLORS[item.itemType] || TYPE_COLORS.NOTE;

  const handleQuickAction = (e) => {
    e.stopPropagation();
    if (item.quickAction?.route) {
      navigate(item.quickAction.route);
    }
  };

  // Hover-tooltip text: full project context + title so the user can
  // recover anything that got truncated by tight column widths.
  const rowTooltip = [
    item.projectNumber && `[${item.projectNumber}]`,
    item.projectName,
    item.title,
  ].filter(Boolean).join(" — ");

  return (
    <div
      role="row"
      tabIndex={0}
      onClick={() => onOpenDetail?.(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpenDetail?.(item);
      }}
      title={rowTooltip}
      className="sbd-card-hover"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px 9px 0",
        borderBottom: "1px solid var(--divider)",
        cursor: "pointer",
        background: isSelected ? "var(--accent-muted)" : wash,
        transition: "filter 0.1s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.12)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
    >
      {/* 1. Urgency bar */}
      <div
        style={{
          width: 4,
          alignSelf: "stretch",
          borderRadius: "2px 0 0 2px",
          background: barColor,
          flexShrink: 0,
        }}
      />

      {/* 2. Item type badge */}
      <Pill label={item.itemType} color={typeCfg.color} bg={typeCfg.bg} badgeClass={typeCfg.badge} />

      {/* 3. Project tag — number pill + name label so a glance tells the
          user *which job* an item belongs to. The user explicitly asked
          for project names: a stripped 8-char job number alone made it
          hard to triage portfolio-wide. Falls back to "—" when neither is
          known so the column stays visually aligned. */}
      {(item.projectNumber || item.projectName) ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
            maxWidth: compact ? 80 : 220,
            minWidth: 0,
          }}
          title={item.projectName || item.projectNumber || ""}
        >
          {item.projectNumber && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 600,
                color: "var(--text-muted)",
                background: "var(--bg-surface-high)",
                padding: "2px 6px",
                borderRadius: 2,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {item.projectNumber}
            </span>
          )}
          {/* Project name hidden in compact mode — title attr on the row
              wrapper above still surfaces it on hover. Saves ~120-150px
              of horizontal room for the title in narrow side-by-side
              panels (UpcomingWindows). */}
          {!compact && item.projectName && (
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 11,
                fontWeight: 500,
                color: "var(--text-secondary)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                minWidth: 0,
              }}
            >
              {item.projectName}
            </span>
          )}
        </div>
      ) : (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--text-muted)",
            flexShrink: 0,
          }}
        >
          —
        </span>
      )}

      {/* 4. Title — hover for full text via the wrapper's title attribute. */}
      <div
        title={item.title}
        style={{
          flex: 1,
          fontSize: 12,
          fontWeight: 500,
          color: "var(--text-primary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          minWidth: 0,
        }}
      >
        {item.title}
      </div>

      {/* 5. Age / due */}
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 600,
          color: item.urgency === "overdue" ? "var(--status-error)" : "var(--text-secondary)",
          whiteSpace: "nowrap",
          minWidth: 70,
          textAlign: "right",
        }}
      >
        {item.displayStatus}
      </span>

      {/* 6. Owner / waiting-on — hide entirely in compact mode to free
            up space for the title; rowTooltip already includes context. */}
      {item.owner && !compact && (
        <span
          title={item.owner}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 600,
            color: "var(--text-muted)",
            background: "var(--bg-surface-high)",
            padding: "2px 6px",
            borderRadius: 2,
            whiteSpace: "nowrap",
            maxWidth: 80,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.owner}
        </span>
      )}

      {/* 7. Quick action button */}
      <button
        onClick={handleQuickAction}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: "0.06em",
          padding: "4px 10px",
          borderRadius: 4,
          border: "1px solid var(--border-default)",
          background: "var(--bg-surface-low)",
          color: "var(--text-secondary)",
          cursor: "pointer",
          whiteSpace: "nowrap",
          textTransform: "uppercase",
          transition: "border-color 0.12s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
      >
        {item.quickAction?.label || "View"}
      </button>
    </div>
  );
}
