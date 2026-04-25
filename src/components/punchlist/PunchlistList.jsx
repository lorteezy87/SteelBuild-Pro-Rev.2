import React, { useState } from "react";

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

const STATUS_COLORS = {
  Open: "var(--status-error)",
  "In Progress": "var(--status-warning)",
  Completed: "var(--status-success)",
  "On Hold": "var(--text-muted)",
  Deferred: "var(--accent)",
};

const PRIORITY_COLORS = {
  Critical: "var(--status-error)",
  High: "var(--status-warning)",
  Medium: "var(--status-info)",
  Low: "var(--accent)",
};

const CATEGORY_ICONS = {
  Structural: "🏗",
  Connections: "⚙",
  "Painting/Coating": "🎨",
  Hardware: "🔩",
  "Fit-Up": "📏",
  Cleanup: "🧹",
  Documentation: "📋",
  Other: "📌",
};

export default function PunchlistList({ items = [] }) {
  const [expanded, setExpanded] = useState(null);

  if (items.length === 0) {
    return (
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "40px", textAlign: "center" }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>No items</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {items.map((item) => {
        const photos = asArray(item.photos);
        return (
        <div key={item.id} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "10px", overflow: "hidden", cursor: "pointer", transition: "all 0.15s" }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; }}>
          {/* Header */}
          <div onClick={() => setExpanded(expanded === item.id ? null : item.id)} style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "auto 1fr 1fr 1fr auto", gap: "16px", alignItems: "center", borderBottom: expanded === item.id ? "1px solid var(--divider)" : "none" }}>
            <div style={{ fontSize: "20px" }}>{CATEGORY_ICONS[item.category] || "📌"}</div>

            <div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>{item.description}</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: "2px", fontSize: "10px", color: "var(--text-muted)", flexWrap: "wrap" }}>
                {item.location && <span>📍 {item.location}</span>}
                {photos.length > 0 && (
                  <span style={{ color: "var(--accent)" }}>📷 {photos.length}</span>
                )}
              </div>
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "4px" }}>
                <div style={{ flex: 1, height: "4px", background: "var(--border-default)", borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{ height: "100%", background: "var(--accent)", width: `${item.percent_complete}%` }} />
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", color: "var(--text-muted)", minWidth: "20px" }}>{item.percent_complete}%</span>
              </div>
              {item.target_completion_date && <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>Due: {new Date(item.target_completion_date).toLocaleDateString()}</div>}
            </div>

            <div>
              <div style={{ display: "inline-flex", alignItems: "center", padding: "3px 6px", background: `${STATUS_COLORS[item.status]}20`, border: `1px solid ${STATUS_COLORS[item.status]}40`, borderRadius: "4px", marginBottom: "4px" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "7px", fontWeight: 600, color: STATUS_COLORS[item.status], textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.status}</span>
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", padding: "3px 6px", background: `${PRIORITY_COLORS[item.priority]}20`, border: `1px solid ${PRIORITY_COLORS[item.priority]}40`, borderRadius: "4px" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "7px", fontWeight: 600, color: PRIORITY_COLORS[item.priority], textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.priority}</span>
              </div>
            </div>

            <div style={{ fontSize: "14px", color: "var(--text-muted)", transform: expanded === item.id ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>▼</div>
          </div>

          {/* Expanded */}
          {expanded === item.id && (
            <div style={{ padding: "16px", borderTop: "1px solid var(--divider)" }}>
              {item.assigned_to && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Assigned To</div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{item.assigned_to}</div>
                </div>
              )}

              {item.notes && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Notes</div>
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>{item.notes}</p>
                </div>
              )}

              {item.verification_date && (
                <div style={{ padding: "8px", background: "var(--bg-input)", borderRadius: "6px", marginTop: "12px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--status-success)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>✓ Verified</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "10px", color: "var(--text-secondary)" }}>
                    <div>By: {item.verified_by}</div>
                    <div>Date: {new Date(item.verification_date).toLocaleDateString()}</div>
                  </div>
                </div>
              )}

              {photos.length > 0 && (
                <div style={{ marginTop: "12px" }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Photos ({photos.length})</div>
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
                            width: 72,
                            height: 72,
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
                              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
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