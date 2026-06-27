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
import { useAppSecurity } from "@/components/shared/useAppSecurity";
import { getReviewerColor } from "@/lib/reviewerColors";

export function ActivityTab({ zone }) {
  const { getUserRole } = useAppSecurity();
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
          // Reviewer color-coding — use the activity row's actor_email
          // (when present in metadata) to look up the user's role and
          // tint a small chip alongside the activity title. Falls back
          // gracefully (no chip) when the email isn't available, so
          // existing renders keep working unchanged.
          const actorEmail = r?.metadata?.actor_email || null;
          const role = actorEmail ? getUserRole(actorEmail) : null;
          const roleColor = role ? getReviewerColor(role) : null;
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
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.4 }}>
                    {title}
                  </div>
                  {role && roleColor && (
                    <span
                      title={`${actorEmail} — ${role}`}
                      style={{
                        ...mono,
                        fontSize: 8, fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        padding: "1px 5px",
                        borderRadius: 2,
                        color: roleColor,
                        background: `color-mix(in srgb, ${roleColor} 14%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${roleColor} 40%, transparent)`,
                      }}
                    >
                      {role}
                    </span>
                  )}
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
