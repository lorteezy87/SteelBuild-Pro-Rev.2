import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const ACTION_COLORS = {
  created: "var(--status-success)",
  updated: "var(--status-info)",
  status_changed: "var(--status-warning)",
  deleted: "var(--status-error)",
};

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function EntityHistory({ entityType, entityName, maxItems = 10 }) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ["entity-history", entityType, entityName],
    queryFn: async () => {
      const all = await base44.entities.Activity.filter(
        { entityType, entityName },
        "-timestamp"
      );
      return all.slice(0, maxItems);
    },
    enabled: !!entityType && !!entityName,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div style={{ padding: 12, fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
        Loading history…
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div style={{ padding: 12, fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}>
        No history recorded
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", padding: "0 0 8px", borderBottom: "1px solid var(--divider)" }}>
        Change History
      </div>
      {history.map((entry, i) => (
        <div key={entry.id || i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: i < history.length - 1 ? "1px solid var(--divider)" : "none", alignItems: "flex-start" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: ACTION_COLORS[entry.action] || "var(--text-muted)", marginTop: 4, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", lineHeight: 1.4 }}>
              <span style={{ fontWeight: 600 }}>{entry.userName || "System"}</span>
              {" "}
              <span style={{ color: ACTION_COLORS[entry.action] || "var(--text-muted)" }}>{entry.action?.replace("_", " ")}</span>
            </div>
            {entry.description && (
              <div style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                {entry.description}
              </div>
            )}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", flexShrink: 0, whiteSpace: "nowrap" }}>
            {timeAgo(entry.timestamp)}
          </div>
        </div>
      ))}
    </div>
  );
}
