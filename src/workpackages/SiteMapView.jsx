import React, { useState, useMemo } from "react";
import { X, AlertTriangle, CheckCircle2, Clock, Pause } from "lucide-react";

const PHASE_COLOR = {
  Detailing: "#8B5CF6",
  Fabrication: "var(--accent)",
  Delivery: "#00B8D9",
  Erection: "#00D68F",
};

const STATUS_COLOR = {
  "Complete":    "#00D68F",
  "In Progress": "var(--status-warning)",
  "On Hold":     "#FF3D3D",
  "Not Started": "var(--text-muted)",
};

function mono(style = {}) {
  return { fontFamily: "var(--font-mono)", ...style };
}

function MiniBar({ value = 0, color = "var(--accent)", height = 4 }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 2, height, overflow: "hidden", width: "100%" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.4s" }} />
    </div>
  );
}

// Derive zones from WP names by extracting prefixes/keywords
function deriveZones(wps) {
  const zoneMap = {};

  wps.forEach(wp => {
    // Try to extract a zone key from the WP name:
    // Look for patterns like "Level 1", "Grid A", "Bay 1", "Zone X", "Col Line A"
    // Fallback: use the first word or two as zone
    let zone = "General";
    const name = wp.name || "";

    const patterns = [
      /\b(level\s*\d+[a-z]?)/i,
      /\b(floor\s*\d+[a-z]?)/i,
      /\b(bay\s*[a-z0-9]+)/i,
      /\b(grid\s*[a-z0-9]+)/i,
      /\b(zone\s*[a-z0-9]+)/i,
      /\b(col(?:umn)?\s*line\s*[a-z0-9]+)/i,
      /\b(bldg\s*[a-z0-9]+)/i,
      /\b(building\s*[a-z0-9]+)/i,
      /\b(area\s*[a-z0-9]+)/i,
      /\b(phase\s*\d+)/i,
      /\b(section\s*[a-z0-9]+)/i,
    ];

    for (const pat of patterns) {
      const m = name.match(pat);
      if (m) { zone = m[1].trim(); break; }
    }

    if (zone === "General") {
      // Use first meaningful word segment
      const words = name.split(/[\s\-_/]+/).filter(Boolean);
      if (words.length >= 2) {
        zone = `${words[0]} ${words[1]}`;
      } else if (words.length === 1) {
        zone = words[0];
      }
    }

    // Normalize zone label
    zone = zone.replace(/\s+/g, " ").trim();

    if (!zoneMap[zone]) {
      zoneMap[zone] = { label: zone, wps: [] };
    }
    zoneMap[zone].wps.push(wp);
  });

  return Object.values(zoneMap);
}

// Compute zone health
function zoneHealth(zone) {
  const { wps } = zone;
  if (!wps.length) return { color: "rgba(255,255,255,0.06)", label: "Empty", issues: [] };

  const onHold = wps.filter(w => w.status === "On Hold");
  const noDrawings = wps.filter(w => !(w.linked_drawing_ids || "").split(",").some(s => s.trim()));
  const inProgress = wps.filter(w => w.status === "In Progress");
  const complete = wps.filter(w => w.status === "Complete");
  const avgProgress = wps.reduce((s, w) => s + (Number(w.percent_complete) || 0), 0) / wps.length;

  const issues = [
    ...onHold.map(w => ({ type: "hold", label: `${w.wp_number} On Hold`, wp: w })),
    ...noDrawings.map(w => ({ type: "warn", label: `${w.wp_number} No Drawings`, wp: w })),
  ];

  let color, label;
  if (onHold.length > 0) {
    color = "rgba(255,61,61,0.18)";
    label = "Blocked";
  } else if (noDrawings.length > 0) {
    color = "rgba(255,179,0,0.15)";
    label = "Warning";
  } else if (complete.length === wps.length) {
    color = "rgba(0,214,143,0.15)";
    label = "Complete";
  } else if (inProgress.length > 0) {
    color = "var(--warning-muted)";
    label = "Active";
  } else {
    color = "var(--info-muted)";
    label = "Planned";
  }

  return { color, label, issues, avgProgress, onHold, inProgress, complete, noDrawings };
}

// ─── Zone Cell ────────────────────────────────────────────────────
function ZoneCell({ zone, isSelected, onClick }) {
  const [hovered, setHovered] = useState(false);
  const health = zoneHealth(zone);
  const borderColor = zone.wps.length === 0
    ? "rgba(255,255,255,0.05)"
    : health.label === "Blocked"   ? "rgba(255,61,61,0.50)"
    : health.label === "Warning"   ? "rgba(255,179,0,0.50)"
    : health.label === "Complete"  ? "rgba(0,214,143,0.50)"
    : health.label === "Active"    ? "rgba(245,158,11,0.50)"
    : "var(--accent-border)";

  return (
    <div
      onClick={() => zone.wps.length > 0 && onClick(zone)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: isSelected ? health.color.replace("0.15", "0.30").replace("0.18", "0.30").replace("0.07", "0.18") : health.color,
        border: `1px solid ${isSelected ? borderColor : hovered ? borderColor : "rgba(255,255,255,0.07)"}`,
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: 10,
        padding: "12px 14px",
        cursor: zone.wps.length > 0 ? "pointer" : "default",
        transition: "all 0.15s",
        minHeight: 90,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 6,
        boxShadow: isSelected ? `0 0 0 2px ${borderColor}` : "none",
        position: "relative",
        transform: (hovered || isSelected) && zone.wps.length > 0 ? "translateY(-1px)" : "none",
      }}
    >
      {/* Zone label */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 4 }}>
        <div style={mono({ fontSize: 9, color: "rgba(220,225,240,0.85)", fontWeight: 700, letterSpacing: "0.06em", lineHeight: 1.3, flex: 1 })}>
          {zone.label.toUpperCase()}
        </div>
        {health.issues.length > 0 && (
          <span style={{ fontSize: 11, flexShrink: 0 }}>
            {health.label === "Blocked" ? "🔴" : "⚠️"}
          </span>
        )}
      </div>

      {zone.wps.length === 0 ? (
        <div style={mono({ fontSize: 8, color: "rgba(160,175,210,0.25)" })}>NO WPS</div>
      ) : (
        <>
          {/* Progress bar */}
          <MiniBar
            value={health.avgProgress || 0}
            color={
              health.label === "Blocked" ? "#FF3D3D" :
              health.label === "Complete" ? "#00D68F" :
              health.label === "Active" ? "var(--status-warning)" : "var(--accent)"
            }
            height={4}
          />
          {/* Stats row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 6 }}>
              <span style={mono({ fontSize: 8, color: "rgba(160,175,210,0.55)" })}>{zone.wps.length} WP{zone.wps.length !== 1 ? "s" : ""}</span>
              {health.inProgress?.length > 0 && (
                <span style={mono({ fontSize: 8, color: "var(--status-warning)" })}>▶ {health.inProgress.length}</span>
              )}
              {health.onHold?.length > 0 && (
                <span style={mono({ fontSize: 8, color: "#FF3D3D" })}>⏸ {health.onHold.length}</span>
              )}
            </div>
            <span style={mono({ fontSize: 8, color: "rgba(160,175,210,0.45)" })}>{Math.round(health.avgProgress || 0)}%</span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Zone Detail Panel ────────────────────────────────────────────
function ZoneDetailPanel({ zone, onClose, onSelectWP }) {
  const health = zoneHealth(zone);

  const statusGroups = {
    "On Hold": zone.wps.filter(w => w.status === "On Hold"),
    "In Progress": zone.wps.filter(w => w.status === "In Progress"),
    "Not Started": zone.wps.filter(w => w.status === "Not Started"),
    "Complete": zone.wps.filter(w => w.status === "Complete"),
  };

  const borderColor =
    health.label === "Blocked" ? "#FF3D3D" :
    health.label === "Warning" ? "#FFB300" :
    health.label === "Complete" ? "#00D68F" :
    health.label === "Active" ? "var(--status-warning)" : "var(--accent)";

  const totalTonnage = zone.wps.reduce((s, w) => s + (Number(w.tonnage) || 0), 0);

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0,
      width: 380,
      background: "var(--bg-page)",
      borderLeft: `2px solid ${borderColor}`,
      zIndex: 500,
      display: "flex",
      flexDirection: "column",
      boxShadow: "-20px 0 60px rgba(0,0,0,0.6)",
      overflowY: "auto",
    }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={mono({ fontSize: 8, color: "rgba(160,175,210,0.45)", letterSpacing: "0.14em", marginBottom: 4 })}>ZONE / AREA</div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 22, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.1 }}>
              {zone.label}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.07)", border: "none", borderRadius: 6, width: 28, height: 28, cursor: "pointer", color: "rgba(255,255,255,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={14} />
          </button>
        </div>

        {/* Zone summary pills */}
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <span style={{ background: `${borderColor}22`, border: `1px solid ${borderColor}55`, borderRadius: 4, padding: "2px 8px", ...mono({ fontSize: 8, color: borderColor }) }}>
            {health.label}
          </span>
          <span style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 4, padding: "2px 8px", ...mono({ fontSize: 8, color: "rgba(160,175,210,0.65)" }) }}>
            {zone.wps.length} Work Packages
          </span>
          {totalTonnage > 0 && (
            <span style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 4, padding: "2px 8px", ...mono({ fontSize: 8, color: "rgba(160,175,210,0.65)" }) }}>
              {totalTonnage.toLocaleString()} T
            </span>
          )}
        </div>

        {/* Overall progress */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={mono({ fontSize: 8, color: "rgba(160,175,210,0.45)", letterSpacing: "0.10em" })}>ZONE PROGRESS</span>
            <span style={mono({ fontSize: 10, color: borderColor, fontWeight: 700 })}>{Math.round(health.avgProgress || 0)}%</span>
          </div>
          <MiniBar value={health.avgProgress || 0} color={borderColor} height={6} />
        </div>
      </div>

      <div style={{ padding: "16px 20px", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Issues / Alerts */}
        {health.issues.length > 0 && (
          <div>
            <div style={mono({ fontSize: 8, letterSpacing: "0.14em", color: "rgba(160,175,210,0.40)", textTransform: "uppercase", marginBottom: 6 })}>
              ⚠ High-Priority Issues ({health.issues.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {health.issues.map((issue, i) => (
                <div key={i} style={{
                  background: issue.type === "hold" ? "rgba(255,61,61,0.10)" : "rgba(255,179,0,0.08)",
                  border: `1px solid ${issue.type === "hold" ? "rgba(255,61,61,0.30)" : "rgba(255,179,0,0.25)"}`,
                  borderRadius: 6,
                  padding: "8px 10px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                }}
                onClick={() => onSelectWP(issue.wp)}
                >
                  {issue.type === "hold"
                    ? <Pause size={12} color="#FF3D3D" />
                    : <AlertTriangle size={12} color="#FFB300" />
                  }
                  <div style={{ flex: 1 }}>
                    <div style={mono({ fontSize: 9, color: issue.type === "hold" ? "#FF3D3D" : "#FFB300", fontWeight: 700 })}>
                      {issue.label}
                    </div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "rgba(160,175,210,0.55)", marginTop: 1 }}>
                      {issue.wp.name}
                    </div>
                  </div>
                  <span style={mono({ fontSize: 8, color: "rgba(160,175,210,0.35)" })}>→</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Work Packages by Status */}
        {Object.entries(statusGroups).map(([status, wps]) => {
          if (!wps.length) return null;
          const sc = STATUS_COLOR[status] || "rgba(160,175,210,0.5)";
          return (
            <div key={status}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: sc }} />
                <span style={mono({ fontSize: 8, color: sc, letterSpacing: "0.10em", textTransform: "uppercase" })}>{status}</span>
                <span style={mono({ fontSize: 8, color: "rgba(160,175,210,0.35)" })}>({wps.length})</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {wps.map(wp => {
                  const phColor = PHASE_COLOR[wp.phase] || "var(--accent)";
                  const noDrawings = !(wp.linked_drawing_ids || "").split(",").some(s => s.trim());
                  return (
                    <div
                      key={wp.id}
                      onClick={() => onSelectWP(wp)}
                      style={{
                        background: "var(--bg-surface-low)",
                        border: `1px solid rgba(255,255,255,0.07)`,
                        borderLeft: `3px solid ${phColor}`,
                        borderRadius: 8,
                        padding: "8px 10px",
                        cursor: "pointer",
                        transition: "all 0.1s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                      onMouseLeave={e => e.currentTarget.style.background = "var(--bg-surface-low)"}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={mono({ fontSize: 9, color: phColor })}>{wp.wp_number}</span>
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          {noDrawings && <span title="No drawings linked" style={mono({ fontSize: 8, color: "#FFB300" })}>⚠</span>}
                          <span style={mono({ fontSize: 9, color: "rgba(160,175,210,0.45)" })}>{wp.percent_complete || 0}%</span>
                        </div>
                      </div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "rgba(220,225,240,0.80)", marginBottom: 5, fontWeight: 500, lineHeight: 1.2 }}>
                        {wp.name}
                      </div>
                      <MiniBar
                        value={wp.percent_complete || 0}
                        color={wp.status === "Complete" ? "#00D68F" : wp.status === "On Hold" ? "#FF3D3D" : phColor}
                        height={3}
                      />
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                        <span style={mono({ fontSize: 8, color: "rgba(160,175,210,0.40)" })}>{wp.phase}</span>
                        {wp.crew && <span style={mono({ fontSize: 8, color: "rgba(160,175,210,0.40)" })}>👷 {wp.crew}</span>}
                        {wp.tonnage && <span style={mono({ fontSize: 8, color: "rgba(160,175,210,0.40)" })}>{Number(wp.tonnage).toLocaleString()} T</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────
function Legend() {
  const items = [
    { color: "rgba(0,214,143,0.50)", label: "Complete" },
    { color: "var(--accent-border)", label: "Active" },
    { color: "rgba(255,179,0,0.50)", label: "Warning (no drawings)" },
    { color: "rgba(255,61,61,0.50)", label: "Blocked (on hold)" },
    { color: "var(--accent-border)", label: "Planned" },
  ];
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
      {items.map(item => (
        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: item.color, border: `1px solid ${item.color}` }} />
          <span style={mono({ fontSize: 8, color: "rgba(160,175,210,0.50)" })}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main SiteMapView ─────────────────────────────────────────────
export default function SiteMapView({ wps, onSelectWP }) {
  const [selectedZone, setSelectedZone] = useState(null);

  const zones = useMemo(() => deriveZones(wps), [wps]);

  // Summary stats
  const totalIssues = zones.reduce((s, z) => s + zoneHealth(z).issues.length, 0);
  const activeZones = zones.filter(z => zoneHealth(z).label === "Active").length;
  const blockedZones = zones.filter(z => zoneHealth(z).label === "Blocked").length;
  const completeZones = zones.filter(z => zoneHealth(z).label === "Complete").length;

  const handleSelectWP = (wp) => {
    setSelectedZone(null);
    onSelectWP(wp);
  };

  return (
    <div style={{ paddingRight: selectedZone ? 395 : 0, transition: "padding-right 0.25s" }}>
      {/* Header bar */}
      <div style={{
        background: "var(--bg-surface-low)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 10,
        padding: "10px 16px",
        marginBottom: 14,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 8,
      }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <span style={mono({ fontSize: 8, color: "rgba(160,175,210,0.45)", letterSpacing: "0.12em" })}>
            SITE MAP · {zones.length} ZONES
          </span>
          {[
            { label: "ACTIVE", value: activeZones, color: "var(--status-warning)" },
            { label: "BLOCKED", value: blockedZones, color: "#FF3D3D" },
            { label: "COMPLETE", value: completeZones, color: "#00D68F" },
            { label: "ISSUES", value: totalIssues, color: "#FFB300" },
          ].map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: s.color }} />
              <span style={mono({ fontSize: 8, color: s.color, fontWeight: 700 })}>{s.value} {s.label}</span>
            </div>
          ))}
        </div>
        <span style={mono({ fontSize: 8, color: "rgba(160,175,210,0.30)" })}>
          Click a zone to inspect
        </span>
      </div>

      <Legend />

      {zones.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 24px" }}>
          <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.3 }}>🗺</div>
          <div style={mono({ fontSize: 10, color: "rgba(160,175,210,0.35)" })}>NO WORK PACKAGES TO MAP</div>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 10,
        }}>
          {zones.map(zone => (
            <ZoneCell
              key={zone.label}
              zone={zone}
              isSelected={selectedZone?.label === zone.label}
              onClick={setSelectedZone}
            />
          ))}
        </div>
      )}

      {/* Zone Detail Panel */}
      {selectedZone && (
        <ZoneDetailPanel
          zone={selectedZone}
          onClose={() => setSelectedZone(null)}
          onSelectWP={handleSelectWP}
        />
      )}
    </div>
  );
}