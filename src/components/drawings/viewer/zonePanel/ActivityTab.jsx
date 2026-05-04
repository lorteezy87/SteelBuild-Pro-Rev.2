/**
 * ActivityTab — extracted from ZonePanel.jsx.
 *
 * Reverse-chrono stream of zone + link events backed by the
 * drawing_zone_activity table. Triggers on drawing_zones and
 * drawing_links feed it automatically — no client-side writes needed.
 *
 * Each entry shows:
 *   - vertical timeline rail with color-coded dot keyed to event type
 *   - short human-readable phrase ("Linked RFI-012", "Status: green →
 *     amber", "Renamed from Z-001 to Stair 2")
 *   - optional secondary line ("by Rule Engine", "created from zone")
 *   - relative + absolute timestamp
 *
 * Owns its own TanStack query keyed on zone.id — same key as before
 * extraction so cache behavior is unchanged.
 */

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { listZoneActivity } from "@/lib/drawingHub";
import { mono } from "./zonePanelConstants";
import { describeActivity, formatRelative } from "./zonePanelHelpers";

export function ActivityTab({ zone }) {
  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["drawing-zone-activity", zone?.id],
    queryFn: () => listZoneActivity(zone.id),
    enabled: !!zone?.id,
    staleTime: 10 * 1000,
  });

  if (isFetching && rows.length === 0) {
    return <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>Loading activity…</div>;
  }
  if (!rows.length) {
    return (
      <div style={{ padding: "24px 4px", textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
        No activity yet — actions you take on this zone will show up here.
      </div>
    );
  }

  return (
    <div style={{ position: "relative", paddingLeft: 18 }}>
      {/* Vertical rail */}
      <div style={{
        position: "absolute",
        left: 5, top: 6, bottom: 6,
        width: 1,
        background: "var(--divider)",
      }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r) => {
          const { color, title, subtitle } = describeActivity(r);
          return (
            <div key={r.id} style={{ position: "relative" }}>
              {/* Dot */}
              <div style={{
                position: "absolute",
                left: -18,
                top: 3,
                width: 10,
                height: 10,
                borderRadius: 5,
                background: color,
                border: "2px solid var(--bg-surface-secondary)",
                boxShadow: `0 0 0 1px ${color}`,
              }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.4 }}>
                  {title}
                </div>
                {subtitle && (
                  <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.02em" }}>
                    {subtitle}
                  </div>
                )}
                <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>
                  {formatRelative(r.created_at)} · {new Date(r.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ActivityTab;
