import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

const sectionLabelStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: "9px",
  fontWeight: 700,
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  marginBottom: "6px",
};

export default function DailyLogsList({ logs = [] }) {
  const [expandedId, setExpandedId] = useState(null);

  // Fetch action_items + rfis from any project that appears in the logs so we
  // can label related-id chips with human-readable names.  Cheap: 1 hit per
  // project, cached by tanstack-query for 60s.
  const projectIds = useMemo(
    () => Array.from(new Set(logs.map((l) => l.project_id).filter(Boolean))),
    [logs]
  );

  // Pull every action_item / rfi for the visible projects in a single list
  // call when a single project is in scope (the common case).  Falls back to
  // a global list() when multiple projects are visible.
  const { data: actionItems = [] } = useQuery({
    queryKey: ["action-items-link-labels", projectIds.join(",")],
    queryFn: async () => {
      if (projectIds.length === 1) {
        return base44.entities.ActionItem.filter({ project_id: projectIds[0] });
      }
      if (projectIds.length === 0) return [];
      return base44.entities.ActionItem.list();
    },
    staleTime: 60 * 1000,
    enabled: projectIds.length > 0,
  });

  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis-link-labels", projectIds.join(",")],
    queryFn: async () => {
      if (projectIds.length === 1) {
        return base44.entities.RFI.filter({ project_id: projectIds[0] });
      }
      if (projectIds.length === 0) return [];
      return base44.entities.RFI.list();
    },
    staleTime: 60 * 1000,
    enabled: projectIds.length > 0,
  });

  const actionItemMap = useMemo(() => {
    const m = new Map();
    actionItems.forEach((a) => m.set(a.id, a));
    return m;
  }, [actionItems]);

  const rfiMap = useMemo(() => {
    const m = new Map();
    rfis.forEach((r) => m.set(r.id, r));
    return m;
  }, [rfis]);

  if (logs.length === 0) {
    return (
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "12px",
          padding: "40px",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          No daily logs
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {logs.map((log) => {
        const photos = asArray(log.photos);
        const aiIds = asArray(log.related_action_item_ids);
        const rfiIds = asArray(log.related_rfi_ids);
        const photoCount = photos.length;
        const linkCount = aiIds.length + rfiIds.length;

        return (
        <div
          key={log.id}
          onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "12px",
            padding: "16px",
            cursor: "pointer",
            transition: "border-color 0.15s, background 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--accent-border)";
            e.currentTarget.style.background = "var(--hover-bg)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-default)";
            e.currentTarget.style.background = "var(--bg-surface)";
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: expandedId === log.id ? "12px" : 0,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                {new Date(log.date).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: "var(--text-muted)",
                  marginTop: "2px",
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <span>
                  {log.crew_name} • {log.headcount} people • {log.hours_worked}h
                </span>
                {photoCount > 0 && (
                  <span style={{ color: "var(--accent)" }}>· {photoCount} photo{photoCount === 1 ? "" : "s"}</span>
                )}
                {linkCount > 0 && (
                  <span style={{ color: "var(--status-info)" }}>· {linkCount} link{linkCount === 1 ? "" : "s"}</span>
                )}
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: log.delay_hours > 0 ? "var(--status-error)" : "var(--status-success)",
                  fontWeight: 600,
                  marginBottom: "4px",
                }}
              >
                {log.delay_hours > 0 ? `${log.delay_hours}h delays` : "No delays"}
              </div>
              {log.safety_incidents > 0 && (
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "9px",
                    color: "var(--status-error)",
                    fontWeight: 600,
                  }}
                >
                  ⚠ {log.safety_incidents} incident{log.safety_incidents !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          </div>

          {/* Expanded Content */}
          {expandedId === log.id && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "16px",
                paddingTop: "12px",
                borderTop: "1px solid var(--divider)",
              }}
            >
              <div>
                <div style={sectionLabelStyle}>Weather</div>
                <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                  {log.weather_description} • {log.temperature}°F • {log.wind_speed} mph wind
                </div>
              </div>

              <div>
                <div style={sectionLabelStyle}>Superintendent</div>
                <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                  {log.superintendent || "—"}
                </div>
              </div>

              {log.activities && (
                <div>
                  <div style={sectionLabelStyle}>Activities</div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    {log.activities}
                  </div>
                </div>
              )}

              {log.equipment_used && (
                <div>
                  <div style={sectionLabelStyle}>Equipment</div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                    {log.equipment_used}
                  </div>
                </div>
              )}

              {log.materials_received && (
                <div>
                  <div style={sectionLabelStyle}>Materials Received</div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                    {log.materials_received}
                  </div>
                </div>
              )}

              {log.delays && (
                <div>
                  <div style={{ ...sectionLabelStyle, color: "var(--status-error)" }}>Delays / Issues</div>
                  <div style={{ fontSize: "11px", color: "var(--status-error)" }}>
                    {log.delays}
                  </div>
                </div>
              )}

              {log.safety_notes && (
                <div>
                  <div style={sectionLabelStyle}>Safety Notes</div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                    {log.safety_notes}
                  </div>
                </div>
              )}

              {/* Related Action Items */}
              {aiIds.length > 0 && (
                <div onClick={(e) => e.stopPropagation()}>
                  <div style={sectionLabelStyle}>Related Action Items</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {aiIds.map((id) => {
                      const a = actionItemMap.get(id);
                      const label = a ? (a.title || a.description?.slice(0, 32) || `Item ${id.slice(0, 6)}`) : `Item ${String(id).slice(0, 6)}`;
                      return (
                        <span
                          key={id}
                          title={a?.description || label}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "3px 8px",
                            borderRadius: 999,
                            background: "var(--accent-muted)",
                            color: "var(--accent)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 10,
                            fontWeight: 700,
                            maxWidth: 220,
                          }}
                        >
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {label}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Related RFIs */}
              {rfiIds.length > 0 && (
                <div onClick={(e) => e.stopPropagation()}>
                  <div style={sectionLabelStyle}>Related RFIs</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {rfiIds.map((id) => {
                      const r = rfiMap.get(id);
                      const label = r ? (r.rfi_number || r.title || `RFI ${id.slice(0, 6)}`) : `RFI ${String(id).slice(0, 6)}`;
                      return (
                        <span
                          key={id}
                          title={r?.title || label}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "3px 8px",
                            borderRadius: 999,
                            background: "rgba(14,165,233,0.12)",
                            color: "#0EA5E9",
                            fontFamily: "var(--font-mono)",
                            fontSize: 10,
                            fontWeight: 700,
                            maxWidth: 220,
                          }}
                        >
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {label}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Photos */}
              {photos.length > 0 && (
                <div
                  style={{ gridColumn: "1 / -1" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={sectionLabelStyle}>Photos ({photos.length})</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {photos.map((p, idx) => {
                      const url = p.file_url || p.path || p.url || "";
                      return (
                        <a
                          key={idx}
                          href={url || undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={p.name || `photo-${idx}`}
                          style={{
                            display: "block",
                            width: 80,
                            height: 80,
                            borderRadius: 8,
                            border: "1px solid var(--border-default)",
                            overflow: "hidden",
                            background: "var(--bg-input)",
                          }}
                        >
                          {url ? (
                            <img
                              src={url}
                              alt={p.name || `photo-${idx}`}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                display: "block",
                              }}
                              onError={(e) => { e.currentTarget.style.display = "none"; }}
                            />
                          ) : null}
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}
