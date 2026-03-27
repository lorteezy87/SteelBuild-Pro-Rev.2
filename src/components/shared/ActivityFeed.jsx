import React, { useMemo } from "react";

const ENTITY_COLORS = {
  RFI: "var(--status-info)",
  Drawing: "var(--status-warning)",
  WorkPackage: "var(--status-success)",
  ChangeOrder: "var(--status-error)",
  DailyLog: "var(--chart-4)",
  Photo: "var(--status-warning)",
  Project: "var(--accent)",
};

const ACTION_VERBS = {
  created: "created",
  updated: "updated",
  deleted: "deleted",
  status_changed: "changed status of",
  moved: "moved",
  uploaded: "uploaded",
};

function timeAgo(timestamp) {
  const now = new Date();
  const date = new Date(timestamp);
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}

function groupByDate(activities) {
  const groups = {
    Today: [],
    Yesterday: [],
    "This Week": [],
    Older: [],
  };

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  activities.forEach((activity) => {
    const actDate = new Date(activity.timestamp);
    const actDateOnly = new Date(actDate.getFullYear(), actDate.getMonth(), actDate.getDate());

    if (actDateOnly.getTime() === today.getTime()) {
      groups.Today.push(activity);
    } else if (actDateOnly.getTime() === yesterday.getTime()) {
      groups.Yesterday.push(activity);
    } else if (actDateOnly > weekAgo) {
      groups["This Week"].push(activity);
    } else {
      groups.Older.push(activity);
    }
  });

  return groups;
}

export default function ActivityFeed({ activities = [], compact = false }) {
  const grouped = useMemo(() => groupByDate(activities), [activities]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 0 : 12 }}>
      {Object.entries(grouped).map(([period, items]) => {
        if (items.length === 0) return null;

        return (
          <div key={period}>
            {!compact && (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--text-muted)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "12px 0 8px",
                  borderTop: "1px solid var(--divider)",
                }}
              >
                {period}
              </div>
            )}

            {items.map((activity) => (
              <div
                key={activity.id}
                style={{
                  padding: compact ? "8px 0" : "12px 0",
                  borderLeft: `2px solid ${ENTITY_COLORS[activity.entityType] || "rgba(255,255,255,0.10)"}`,
                  paddingLeft: 12,
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                }}
              >
                {/* Dot */}
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: ENTITY_COLORS[activity.entityType] || "var(--accent)",
                    flexShrink: 0,
                    marginTop: 3,
                    boxShadow: `0 0 4px ${ENTITY_COLORS[activity.entityType] || "var(--accent)"}`,
                  }}
                />

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: compact ? 11 : 12,
                      color: "var(--text-primary)",
                      lineHeight: 1.4,
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{activity.userName}</span>
                    <span style={{ color: "var(--text-secondary)" }}>
                      {" "}
                      {ACTION_VERBS[activity.action] || activity.action}
                    </span>
                    <span style={{ fontWeight: 500 }}> {activity.entityName}</span>
                  </div>

                  {activity.description && (
                    <div
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: 10,
                        color: "var(--text-muted)",
                        marginTop: 2,
                      }}
                    >
                      {activity.description}
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      marginTop: 4,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        color: "var(--text-muted)",
                      }}
                    >
                      {timeAgo(activity.timestamp)}
                    </span>

                    {activity.projectName && (
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 8,
                          background: "var(--warning-muted)",
                          border: "1px solid var(--warning-border)",
                          borderRadius: 4,
                          padding: "2px 6px",
                          color: "var(--status-warning)",
                          letterSpacing: "0.06em",
                        }}
                      >
                        {activity.projectName}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {activities.length === 0 && (
        <div
          style={{
            padding: "24px 0",
            textAlign: "center",
            fontFamily: "var(--font-body)",
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          No activity yet
        </div>
      )}
    </div>
  );
}