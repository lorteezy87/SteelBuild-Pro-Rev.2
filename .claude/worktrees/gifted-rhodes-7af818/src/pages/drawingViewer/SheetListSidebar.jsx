import React from "react";
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, FileCheck2, Search } from "lucide-react";
import { STAGE_ORDER } from "@/components/drawings/drawingsConfig";
import { STAGES, mono } from "@/pages/drawingViewer/drawingViewerUtils";

export default function SheetListSidebar({
  sidebarOpen,
  navigate,
  search,
  setSearch,
  filtered,
  drawings,
  activeId,
  setActiveId,
  activeIndex,
}) {
  const attachedCount = drawings.filter((drawing) => drawing.file_url).length;
  const priorityCount = drawings.filter((drawing) => drawing.priority_flag).length;
  const stageCounts = STAGE_ORDER.reduce((acc, stage) => {
    acc[stage] = drawings.filter((drawing) => drawing.stage === stage).length;
    return acc;
  }, {});

  return (
    <aside
      className={`drawing-sheet-sidebar ${sidebarOpen ? "is-open" : "is-closed"}`}
      style={{
        width: sidebarOpen ? "var(--viewer-sidebar-width)" : 0,
        flexShrink: 0,
        borderRight: sidebarOpen ? "1px solid var(--viewer-line, var(--border-default))" : "none",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: "width 0.2s ease",
        padding: 0,
        minWidth: 0,
      }}
    >
      <div style={headerStyle}>
        <button type="button" onClick={() => navigate("/Drawings")} style={backButtonStyle}>
          <ArrowLeft size={14} />
          Drawing Register
        </button>

        <div style={titleRowStyle}>
          <div>
            <div style={kickerStyle}>Sheet Navigator</div>
            <div style={titleStyle}>{filtered.length} visible</div>
          </div>
          <div style={countBadgeStyle}>{drawings.length}</div>
        </div>

        <div style={metricGridStyle}>
          <MiniMetric icon={<FileCheck2 size={13} />} label="PDFs" value={`${attachedCount}/${drawings.length}`} />
          <MiniMetric icon={<AlertTriangle size={13} />} label="Flags" value={priorityCount} tone={priorityCount > 0 ? "risk" : "normal"} />
        </div>

        <div style={searchWrapStyle}>
          <Search size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search sheets"
            className="sbd-input"
            style={searchInputStyle}
          />
        </div>

        <div style={stageMiniStripStyle}>
          {STAGE_ORDER.map((stage) => {
            const cfg = STAGES[stage];
            const count = stageCounts[stage] || 0;
            return (
              <span
                key={stage}
                title={`${cfg?.label || stage}: ${count}`}
                style={{
                  ...stageMiniDotStyle,
                  background: count ? (cfg?.color || "var(--border-default)") : "var(--border-default)",
                  opacity: count ? 1 : 0.28,
                }}
              />
            );
          })}
        </div>
      </div>

      <div style={listStyle}>
        {filtered.map((drawing) => {
          const isActive = drawing.id === activeId;
          const stage = STAGES[drawing.stage] || STAGES["Not Started"];
          return (
            <button
              key={drawing.id}
              type="button"
              onClick={() => setActiveId(drawing.id)}
              className="drawing-sheet-card"
              style={{
                ...sheetCardStyle,
                borderColor: isActive ? "rgba(200,155,32,0.78)" : "var(--viewer-line, var(--border-default))",
                background: isActive ? "rgba(200,155,32,0.12)" : "var(--viewer-panel-bg-soft, var(--bg-surface-low))",
              }}
            >
              <span style={{ ...sheetAccentStyle, background: stage?.color || "var(--border-default)" }} />
              <div style={sheetCardTopStyle}>
                <div style={{ minWidth: 0 }}>
                  <div style={sheetNumberStyle}>{drawing.sheet_number || drawing.drawing_number || "Sheet TBD"}</div>
                  <div style={sheetTitleStyle}>{drawing.title || "Untitled drawing"}</div>
                </div>
                <div style={sheetBadgesStyle}>
                  <span style={stageBadgeStyle(stage?.color)}>{stage?.label || drawing.stage || "Not Started"}</span>
                  {drawing.priority_flag && <span style={priorityDotStyle} title="Priority flag" />}
                </div>
              </div>
              <div style={sheetMetaStyle}>
                <span>R{drawing.revision_number ?? "0"}</span>
                <span>{drawing.discipline || "No discipline"}</span>
                <span>{drawing.file_url ? "PDF attached" : "No PDF"}</span>
              </div>
              {drawing.drawing_set_name && (
                <div style={setNameStyle}>{drawing.drawing_set_name}</div>
              )}
            </button>
          );
        })}

        {filtered.length === 0 && (
          <div style={emptyStyle}>
            <Search size={18} />
            <span>No sheets match the current search.</span>
          </div>
        )}
      </div>

      {filtered.length > 0 && (
        <div style={footerStyle}>
          <button
            type="button"
            onClick={() => {
              const previous = filtered[activeIndex - 1];
              if (previous) setActiveId(previous.id);
            }}
            disabled={activeIndex <= 0}
            style={navButtonStyle(activeIndex <= 0)}
            title="Previous sheet"
          >
            <ChevronLeft size={16} />
          </button>
          <span style={footerCountStyle}>{Math.max(0, activeIndex + 1)} / {filtered.length}</span>
          <button
            type="button"
            onClick={() => {
              const next = filtered[activeIndex + 1];
              if (next) setActiveId(next.id);
            }}
            disabled={activeIndex >= filtered.length - 1}
            style={navButtonStyle(activeIndex >= filtered.length - 1)}
            title="Next sheet"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </aside>
  );
}

function MiniMetric({ icon, label, value, tone = "normal" }) {
  return (
    <div style={{
      ...miniMetricStyle,
      borderColor: tone === "risk" ? "rgba(239,68,68,0.32)" : "var(--viewer-line, var(--border-default))",
      color: tone === "risk" ? "var(--status-error)" : "var(--text-secondary)",
    }}>
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const headerStyle = {
  padding: "14px",
  borderBottom: "1px solid var(--viewer-line, var(--border-default))",
  background: "var(--viewer-panel-bg)",
};

const backButtonStyle = {
  ...mono,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  marginBottom: 14,
  padding: "5px 0",
  background: "transparent",
  border: "none",
  color: "var(--accent)",
  cursor: "pointer",
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: 0,
  textTransform: "uppercase",
};

const titleRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
};

const kickerStyle = {
  ...mono,
  marginBottom: 4,
  color: "var(--text-muted)",
  fontSize: 10,
  fontWeight: 850,
  letterSpacing: 0,
  textTransform: "uppercase",
};

const titleStyle = {
  fontFamily: "Space Grotesk, var(--font-display)",
  color: "var(--text-primary)",
  fontSize: 20,
  lineHeight: 1.1,
  fontWeight: 850,
  letterSpacing: 0,
};

const countBadgeStyle = {
  ...mono,
  minWidth: 42,
  height: 34,
  display: "grid",
  placeItems: "center",
  border: "1px solid var(--viewer-line, var(--border-default))",
  borderRadius: 8,
  background: "var(--viewer-panel-bg-soft, var(--bg-surface-low))",
  color: "var(--text-primary)",
  fontSize: 13,
  fontWeight: 900,
};

const metricGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
  marginBottom: 12,
};

const miniMetricStyle = {
  ...mono,
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 8px",
  border: "1px solid",
  borderRadius: 8,
  background: "var(--viewer-panel-bg-soft, var(--bg-surface-low))",
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: 0,
  textTransform: "uppercase",
};

const searchWrapStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  border: "1px solid var(--viewer-line, var(--border-default))",
  borderRadius: 8,
  background: "var(--bg-input)",
};

const searchInputStyle = {
  width: "100%",
  minWidth: 0,
  padding: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 13,
  boxSizing: "border-box",
};

const stageMiniStripStyle = {
  display: "grid",
  gridTemplateColumns: `repeat(${STAGE_ORDER.length}, 1fr)`,
  gap: 4,
  marginTop: 12,
};

const stageMiniDotStyle = {
  height: 4,
  borderRadius: 999,
};

const listStyle = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  padding: "10px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const sheetCardStyle = {
  position: "relative",
  width: "100%",
  display: "block",
  padding: "10px 10px 10px 12px",
  border: "1px solid",
  borderRadius: 8,
  color: "inherit",
  cursor: "pointer",
  textAlign: "left",
  transition: "border-color 120ms ease, background 120ms ease, transform 120ms ease",
};

const sheetAccentStyle = {
  position: "absolute",
  top: 10,
  bottom: 10,
  left: 0,
  width: 3,
  borderRadius: "0 999px 999px 0",
};

const sheetCardTopStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 10,
};

const sheetNumberStyle = {
  ...mono,
  marginBottom: 4,
  color: "var(--text-primary)",
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 0,
};

const sheetTitleStyle = {
  maxWidth: 178,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "var(--text-secondary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
};

const sheetBadgesStyle = {
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  gap: 5,
};

const stageBadgeStyle = (color) => ({
  ...mono,
  maxWidth: 74,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  padding: "2px 6px",
  border: `1px solid ${color || "var(--border-default)"}55`,
  borderRadius: 6,
  color: color || "var(--text-muted)",
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: 0,
  textTransform: "uppercase",
});

const priorityDotStyle = {
  width: 8,
  height: 8,
  borderRadius: 999,
  background: "var(--status-error)",
};

const sheetMetaStyle = {
  ...mono,
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 8,
  color: "var(--text-muted)",
  fontSize: 9,
  fontWeight: 750,
  letterSpacing: 0,
};

const setNameStyle = {
  marginTop: 7,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "var(--text-muted)",
  fontSize: 11,
};

const emptyStyle = {
  ...mono,
  minHeight: 120,
  display: "grid",
  placeItems: "center",
  gap: 8,
  padding: 20,
  textAlign: "center",
  color: "var(--text-muted)",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 0,
  textTransform: "uppercase",
};

const footerStyle = {
  padding: "10px 14px",
  borderTop: "1px solid var(--viewer-line, var(--border-default))",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  background: "var(--viewer-panel-bg)",
};

const footerCountStyle = {
  ...mono,
  color: "var(--text-muted)",
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: 0,
};

const navButtonStyle = (disabled) => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 38,
  height: 30,
  border: "1px solid var(--viewer-line, var(--border-default))",
  borderRadius: 8,
  background: "var(--viewer-panel-bg-soft, var(--bg-surface-low))",
  color: "var(--text-secondary)",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.38 : 1,
});
