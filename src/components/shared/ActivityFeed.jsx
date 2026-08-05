import React, { useMemo } from "react";
import {
  A,
  ENTITY_COLORS,
  ACTION_COLORS,
  ACTION_VERBS,
  timeAgo,
  groupByDate,
} from "./activityFeedHelpers";

// Accessors that tolerate both the snake_case shape that the Supabase
// activities table ships (entity_type, performed_by, …) and the legacy
// camelCase shape that older seed scripts + tests sometimes use. The
// component was previously hard-coded to camelCase, which made every
// row read `undefined` once the migration moved these columns.

export default function ActivityFeed({ activities = [], compact = false }) {
  const grouped = useMemo(() => groupByDate(activities), [activities]);

  if (activities.length === 0) return null;

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

            {items.map((activity) => {
              const entType = A.entityType(activity);
              const entName = A.entityName(activity);
              const user    = A.user(activity);
              const projName = A.projectName(activity);
              const action   = A.action(activity) || "";
              const desc     = A.description(activity);
              const ts       = A.timestamp(activity);
              return (
                <div
                  key={activity.id}
                  style={{
                    padding: compact ? "8px 0" : "12px 0",
                    borderLeft: `2px solid ${ENTITY_COLORS[entType] || "var(--border-default)"}`,
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
                      background: ACTION_COLORS[action] || "var(--accent)",
                      flexShrink: 0,
                      marginTop: 3,
                      boxShadow: `0 0 4px ${ACTION_COLORS[action] || "var(--accent)"}`,
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
                      <span style={{ fontWeight: 500 }}>{user || "Someone"}</span>
                      <span style={{ color: "var(--text-secondary)" }}>
                        {" "}{ACTION_VERBS[action] || action || "updated"}
                      </span>
                      {entName && <span style={{ fontWeight: 500 }}> {entName}</span>}
                    </div>

                    {desc && (
                      <div
                        style={{
                          fontFamily: "var(--font-body)",
                          fontSize: 10,
                          color: "var(--text-muted)",
                          marginTop: 2,
                        }}
                      >
                        {desc}
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
                      {ts && (
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 9,
                            color: "var(--text-muted)",
                          }}
                        >
                          {timeAgo(ts)}
                        </span>
                      )}

                      {projName && (
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
                          {projName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}