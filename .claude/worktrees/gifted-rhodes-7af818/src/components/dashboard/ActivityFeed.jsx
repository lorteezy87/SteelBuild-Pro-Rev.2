import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const ACTION_ICONS = {
  created: "✚",
  updated: "✎",
  deleted: "⊗",
  status_changed: "➜",
  moved: "⇄",
  uploaded: "⬆",
  commented: "💬",
};

export default function ActivityFeed({ limit = 8 }) {
  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => base44.entities.Activity.list("-timestamp", limit),
    initialData: [],
  });

  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderRadius: "12px",
      padding: "16px",
    }}>
      <h3 style={{
        fontFamily: "var(--font-mono)",
        fontSize: "10px",
        fontWeight: 700,
        color: "var(--text-primary)",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        margin: "0 0 12px 0",
      }}>
        Recent Activity
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {activities.length > 0 ? (
          activities.map((a) => (
            <div
              key={a.id}
              style={{
                padding: "8px 10px",
                background: "var(--bg-surface-secondary)",
                border: "1px solid var(--border-default)",
                borderRadius: "8px",
                display: "flex",
                gap: "8px",
                alignItems: "flex-start",
              }}
            >
              <div style={{
                fontSize: "14px",
                opacity: 0.6,
                flexShrink: 0,
              }}>
                {ACTION_ICONS[a.action] || "•"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: "11px",
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  <strong>{a.userName}</strong> {a.action === "created" ? "created" : a.action === "updated" ? "updated" : a.action}
                  {" "}<span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--accent)" }}>{a.entityName}</span>
                </div>
                <div style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "8px",
                  color: "var(--text-muted)",
                  marginTop: "2px",
                }}>
                  {a.projectName} • {timeAgo(a.timestamp)}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div style={{
            padding: "20px",
            textAlign: "center",
            fontFamily: "var(--font-mono)",
            fontSize: "9px",
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}>
            No activity
          </div>
        )}
      </div>
    </div>
  );
}