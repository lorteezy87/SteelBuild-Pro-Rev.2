/**
 * TodayAgenda — the today-focused hero block for the redesigned Command
 * Center. Five grouped sections stack from most-urgent to background:
 *
 *   1. 🔴 Blocking (urgency === 'blocking' — take action NOW)
 *   2. ⚠  Overdue (past due, needs triage)
 *   3. ⏰ Due Today (due date = today)
 *   4. 🚚 Arriving Today (deliveries scheduled today)
 *   5. 🔨 Active Work Packages (field/shop in progress)
 *
 * Each section is collapsible; each row is clickable and routes to the
 * matching page with the project pre-scoped.
 *
 * If a section is empty we still render a compact "no items" pill so the
 * layout stays predictable and the PM can see that area is healthy.
 */

import React from "react";
import { useNavigate } from "react-router-dom";

const TYPE_COLOR = {
  RFI:  "var(--status-warning)",
  DWG:  "var(--phase-fabrication)",
  SUB:  "var(--secondary)",
  CO:   "var(--accent)",
  DEL:  "var(--phase-delivery)",
  WP:   "var(--phase-erection)",
  PAY:  "var(--tertiary)",
  NOTE: "var(--text-muted)",
};

function Pill({ label, color }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 700,
        padding: "2px 6px",
        borderRadius: 3,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        color,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

// Shared project tag used by every row type. Number pill + name label
// (truncated). User reported portfolio-wide triage was hard with only the
// 8-char job number visible; the name resolves the ambiguity. Falls back
// to "—" to keep column alignment consistent across rows.
function ProjectTag({ projectNumber, projectName }) {
  if (!projectNumber && !projectName) {
    return (
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
    );
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexShrink: 0,
        maxWidth: 200,
        minWidth: 0,
      }}
      title={projectName || projectNumber || ""}
    >
      {projectNumber && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 600,
            color: "var(--text-muted)",
            background: "var(--bg-surface-high)",
            padding: "2px 6px",
            borderRadius: 3,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {projectNumber}
        </span>
      )}
      {projectName && (
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
          {projectName}
        </span>
      )}
    </div>
  );
}

function Section({ title, icon, accent, items, empty, renderRow, onOpenDetail }) {
  const hasItems = items && items.length > 0;
  return (
    <div
      className="sbd-card"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderLeft: `3px solid ${hasItems ? accent : "var(--border-default)"}`,
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
        padding: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          background: hasItems
            ? `color-mix(in srgb, ${accent} 6%, transparent)`
            : "var(--bg-surface-low)",
          borderBottom: hasItems ? "1px solid var(--divider)" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14, lineHeight: 1 }}>{icon}</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: hasItems ? accent : "var(--text-secondary)",
              }}
            >
              {title}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                color: "var(--text-muted)",
                letterSpacing: "0.08em",
              }}
            >
              {hasItems ? items.length : 0}
            </span>
          </div>
        </div>
      </div>

      {hasItems ? (
        <div>
          {items.slice(0, 8).map((item, i) => (
            <div
              key={item.id || item.sourceId || i}
              onClick={() => {
                if (onOpenDetail) onOpenDetail(item);
              }}
              style={{
                padding: "10px 14px",
                borderBottom: i < Math.min(items.length, 8) - 1 ? "1px solid var(--divider)" : "none",
                cursor: onOpenDetail ? "pointer" : "default",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {renderRow(item)}
            </div>
          ))}
          {items.length > 8 && (
            <div
              style={{
                padding: "8px 14px",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                color: "var(--text-muted)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                borderTop: "1px solid var(--divider)",
                background: "var(--bg-surface-low)",
              }}
            >
              + {items.length - 8} more — see full feed below
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            padding: "14px",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 600,
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {empty || "Nothing here — good sign."}
        </div>
      )}
    </div>
  );
}

function FeedItemRow({ item }) {
  const typeColor = TYPE_COLOR[item.itemType] || "var(--text-muted)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Pill label={item.itemType} color={typeColor} />
      <ProjectTag projectNumber={item.projectNumber} projectName={item.projectName} />
      <span
        style={{
          flex: 1,
          fontFamily: "var(--font-body)",
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
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 700,
          color: item.urgency === "overdue" ? "var(--status-error)" : "var(--text-secondary)",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {item.displayStatus}
      </span>
      {item.owner && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 600,
            color: "var(--text-muted)",
            background: "var(--bg-surface-high)",
            padding: "2px 6px",
            borderRadius: 3,
            whiteSpace: "nowrap",
            maxWidth: 110,
            overflow: "hidden",
            textOverflow: "ellipsis",
            flexShrink: 0,
          }}
        >
          {item.owner}
        </span>
      )}
    </div>
  );
}

function DeliveryRow({ item, navigate }) {
  return (
    <div
      onClick={() => navigate(item.route)}
      style={{ display: "flex", alignItems: "center", gap: 10 }}
    >
      <Pill label="DEL" color={TYPE_COLOR.DEL} />
      <ProjectTag projectNumber={item.projectNumber} projectName={item.projectName} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12,
            fontWeight: 500,
            color: "var(--text-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.title}
        </div>
        {item.subtitle && (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-muted)",
              letterSpacing: "0.06em",
              marginTop: 2,
            }}
          >
            {item.subtitle}
          </div>
        )}
      </div>
      <Pill label={item.status} color="var(--phase-delivery)" />
    </div>
  );
}

function WorkPackageRow({ item, navigate }) {
  return (
    <div
      onClick={() => navigate(item.route)}
      style={{ display: "flex", alignItems: "center", gap: 10 }}
    >
      <Pill label="WP" color={TYPE_COLOR.WP} />
      <ProjectTag projectNumber={item.projectNumber} projectName={item.projectName} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12,
            fontWeight: 500,
            color: "var(--text-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.title}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <div
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: "var(--bg-surface-high)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, item.percent || 0)}%`,
                background: "var(--phase-erection)",
                transition: "width 0.2s",
              }}
            />
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              color: "var(--text-muted)",
              letterSpacing: "0.06em",
              minWidth: 34,
              textAlign: "right",
            }}
          >
            {item.percent || 0}%
          </span>
        </div>
      </div>
      <Pill label={item.phase || "—"} color="var(--phase-erection)" />
    </div>
  );
}

export default function TodayAgenda({ buckets, onOpenDetail }) {
  const navigate = useNavigate();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Section
        title="Blocking"
        icon="🔴"
        accent="var(--status-error)"
        items={buckets.blocking}
        empty="No blocking items — fabrication and erection are clear."
        renderRow={(item) => <FeedItemRow item={item} />}
        onOpenDetail={onOpenDetail}
      />

      <Section
        title="Overdue"
        icon="⚠"
        accent="var(--status-error)"
        items={buckets.overdue}
        empty="Nothing overdue — stay ahead of it."
        renderRow={(item) => <FeedItemRow item={item} />}
        onOpenDetail={onOpenDetail}
      />

      <Section
        title="Due Today"
        icon="⏰"
        accent="var(--status-warning)"
        items={buckets.dueToday}
        empty="Nothing due today — focus on the week ahead."
        renderRow={(item) => <FeedItemRow item={item} />}
        onOpenDetail={onOpenDetail}
      />

      <Section
        title="Arriving Today"
        icon="🚚"
        accent="var(--phase-delivery)"
        items={buckets.arrivingToday}
        empty="No deliveries scheduled today."
        renderRow={(item) => <DeliveryRow item={item} navigate={navigate} />}
        onOpenDetail={null}
      />

      <Section
        title="Active Work Packages"
        icon="🔨"
        accent="var(--phase-erection)"
        items={buckets.activeWork}
        empty="No active work packages in fabrication or erection."
        renderRow={(item) => <WorkPackageRow item={item} navigate={navigate} />}
        onOpenDetail={null}
      />
    </div>
  );
}
