import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, FileText, Home, Layers, Lock, Unlock } from "lucide-react";
import { usePermissions } from "@/services/permissions";
import { createPageUrl } from "@/utils";
import { STAGES, STAGE_MAP } from "@/components/drawings/drawingsConfig";
import { formatDrawingSetNumber } from "@/lib/drawingSetOrdering";

const mono = { fontFamily: "var(--font-mono)" };

export default function ViewerHeader({ projectName, activeDrawing, drawingSet, onUnlock }) {
  const navigate = useNavigate();
  const { isAdmin } = usePermissions();
  const isLocked = !!drawingSet?.is_locked;
  const [unlocking, setUnlocking] = useState(false);
  const [reason, setReason] = useState("");

  const setId = activeDrawing?.drawing_set_id || drawingSet?.id || null;
  const setName = drawingSet?.set_name || activeDrawing?.drawing_set_name || "Unassigned set";
  const setNumber = formatDrawingSetNumber(drawingSet || { set_name: setName });
  const sheetNumber = activeDrawing?.sheet_number || activeDrawing?.drawing_number || "No sheet selected";
  const sheetTitle = activeDrawing?.title || "Open a sheet from the navigator";
  const revisionLabel = activeDrawing?.revision_number != null ? `R${activeDrawing.revision_number}` : "R0";
  const discipline = activeDrawing?.discipline || "Discipline TBD";
  const stageKey = activeDrawing?.stage || "Not Started";
  const stageConfig = STAGE_MAP[stageKey] || STAGE_MAP["Not Started"];
  const stageIndex = STAGES.findIndex((stage) => stage.key === stageKey);
  const progress = stageIndex >= 0 ? Math.round(((stageIndex + 1) / STAGES.length) * 100) : 0;

  return (
    <header className="drawing-viewer-header" style={headerStyle}>
      <div className="drawing-viewer-breadcrumb-row" style={breadcrumbRowStyle}>
        <button
          type="button"
          onClick={() => navigate(createPageUrl("Projects"))}
          title="All projects"
          className="drawing-header-crumb"
          style={crumbBtn}
        >
          <Home size={13} />
          Projects
        </button>

        {projectName && (
          <>
            <ChevronRight size={13} style={{ color: "var(--text-muted)" }} />
            <button
              type="button"
              onClick={() => navigate(createPageUrl("Projects"))}
              title={projectName}
              className="drawing-header-crumb"
              style={crumbBtn}
            >
              {truncate(projectName, 34)}
            </button>
          </>
        )}

        <ChevronRight size={13} style={{ color: "var(--text-muted)" }} />
        <button
          type="button"
          onClick={() => navigate(setId ? `${createPageUrl("Drawings")}?set=${setId}` : createPageUrl("Drawings"))}
          title={setName}
          className="drawing-header-crumb"
          style={crumbBtn}
        >
          <Layers size={13} />
          {truncate(setName, 34)}
        </button>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {isLocked ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span style={lockBadgeStyle} title={drawingSet?.locked_reason || "Set is locked from edits"}>
                <Lock size={12} />
                Locked{drawingSet?.locked_reason ? ` — ${truncate(drawingSet.locked_reason, 40)}` : ""}
              </span>
              {isAdmin && !unlocking && (
                <button
                  type="button"
                  onClick={() => setUnlocking(true)}
                  title="Admin override: unlock this set (a reason is required)"
                  style={unlockButtonStyle}
                >
                  <Unlock size={11} />
                  Unlock
                </button>
              )}
              {isAdmin && unlocking && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <input
                    autoFocus
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && reason.trim()) { onUnlock?.(reason.trim()); setUnlocking(false); setReason(""); }
                      if (e.key === "Escape") { setUnlocking(false); setReason(""); }
                    }}
                    placeholder="Reason to unlock (required)…"
                    style={unlockReasonInput}
                  />
                  <button
                    type="button"
                    disabled={!reason.trim()}
                    onClick={() => { onUnlock?.(reason.trim()); setUnlocking(false); setReason(""); }}
                    style={{ ...unlockButtonStyle, opacity: reason.trim() ? 1 : 0.5, cursor: reason.trim() ? "pointer" : "not-allowed" }}
                  >
                    Confirm
                  </button>
                  <button type="button" onClick={() => { setUnlocking(false); setReason(""); }} style={unlockCancelButton}>
                    Cancel
                  </button>
                </span>
              )}
            </span>
          ) : (
            <span style={openBadgeStyle}>Editable</span>
          )}
        </div>
      </div>

      <div className="drawing-viewer-header-command" style={commandRowStyle}>
        <div style={sheetTitleBlockStyle}>
          <div style={viewerKickerStyle}>Drawing Viewer</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <FileText size={22} style={{ color: "var(--accent)", flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <h1 style={sheetHeadingStyle}>
                <span style={{ ...mono, color: "var(--accent)", whiteSpace: "nowrap" }}>{sheetNumber}</span>
                <span style={sheetTitleTextStyle}>{sheetTitle}</span>
              </h1>
              <div style={sublineStyle}>
                <span>Set {setNumber}</span>
                <span>{setName}</span>
                <span>{discipline}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="drawing-viewer-header-status" style={statusPanelStyle}>
          <MetaBlock label="Stage" value={stageConfig?.label || stageKey} color={stageConfig?.color} />
          <MetaBlock label="Revision" value={revisionLabel} />
          <MetaBlock label="Page" value={activeDrawing?.pdf_page ? `PDF ${activeDrawing.pdf_page}` : "PDF 1"} />
        </div>
      </div>

      <div style={stageRowStyle}>
        <div style={stageProgressTrackStyle}>
          <div style={{ ...stageProgressFillStyle, width: `${progress}%`, background: stageConfig?.color || "var(--accent)" }} />
        </div>
        <div className="drawing-viewer-header-stages" style={stageStripStyle}>
          {STAGES.map((stage, index) => {
            const isActive = stage.key === stageKey;
            const isPast = stageIndex >= 0 && index < stageIndex;
            return (
              <div
                key={stage.key}
                title={stage.label}
                style={{
                  ...stageNodeStyle,
                  borderColor: isActive ? stage.color : "var(--viewer-line, var(--border-default))",
                  background: isActive ? stage.bg : isPast ? "rgba(255,255,255,0.04)" : "transparent",
                  color: isActive ? stage.color : isPast ? "var(--text-secondary)" : "var(--text-muted)",
                }}
              >
                <span style={{ ...stageDotStyle, background: isPast || isActive ? stage.color : "var(--border-default)" }} />
                <span>{stage.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </header>
  );
}

function MetaBlock({ label, value, color }) {
  return (
    <div style={metaBlockStyle}>
      <span style={metaLabelStyle}>{label}</span>
      <strong style={{ ...metaValueStyle, color: color || "var(--text-primary)" }}>{value || "TBD"}</strong>
    </div>
  );
}

const headerStyle = {
  flexShrink: 0,
  borderBottom: "1px solid var(--viewer-line, var(--border-default))",
  background:
    "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface-low) 94%, #172033 6%) 0%, var(--viewer-panel-bg, var(--bg-surface)) 100%)",
};

const breadcrumbRowStyle = {
  minHeight: 36,
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 16px",
  borderBottom: "1px solid var(--viewer-line, var(--border-default))",
  overflow: "hidden",
};

const crumbBtn = {
  ...mono,
  minWidth: 0,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 8px",
  border: "1px solid transparent",
  borderRadius: 6,
  background: "transparent",
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 0,
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const commandRowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 16,
  alignItems: "stretch",
  padding: "14px 16px 12px",
};

const sheetTitleBlockStyle = {
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const viewerKickerStyle = {
  ...mono,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 0,
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

const sheetHeadingStyle = {
  margin: 0,
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  minWidth: 0,
  fontFamily: "Space Grotesk, var(--font-display)",
  fontSize: 22,
  lineHeight: 1.1,
  fontWeight: 850,
  letterSpacing: 0,
};

const sheetTitleTextStyle = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "var(--text-primary)",
};

const sublineStyle = {
  marginTop: 5,
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  color: "var(--text-muted)",
  fontSize: 12,
};

const statusPanelStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(74px, auto))",
  gap: 8,
  alignContent: "stretch",
};

const metaBlockStyle = {
  minWidth: 78,
  padding: "8px 10px",
  border: "1px solid var(--viewer-line, var(--border-default))",
  borderRadius: 8,
  background: "var(--viewer-panel-bg-soft, var(--bg-surface-low))",
};

const metaLabelStyle = {
  ...mono,
  display: "block",
  marginBottom: 4,
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: 0,
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

const metaValueStyle = {
  ...mono,
  display: "block",
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 0,
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const stageRowStyle = {
  padding: "0 16px 12px",
};

const stageProgressTrackStyle = {
  height: 3,
  borderRadius: 999,
  overflow: "hidden",
  background: "var(--border-default)",
  marginBottom: 8,
};

const stageProgressFillStyle = {
  height: "100%",
  borderRadius: 999,
  transition: "width 180ms ease",
};

const stageStripStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(72px, 1fr))",
  gap: 6,
  overflowX: "auto",
};

const stageNodeStyle = {
  ...mono,
  minHeight: 28,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "5px 8px",
  border: "1px solid",
  borderRadius: 6,
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: 0,
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const stageDotStyle = {
  width: 7,
  height: 7,
  borderRadius: 999,
  flexShrink: 0,
};

const lockBadgeStyle = {
  ...mono,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 8px",
  borderRadius: 6,
  background: "rgba(245, 158, 11, 0.12)",
  border: "1px solid rgba(245, 158, 11, 0.42)",
  color: "#f59e0b",
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: 0,
  textTransform: "uppercase",
};

const openBadgeStyle = {
  ...mono,
  padding: "5px 8px",
  borderRadius: 6,
  background: "rgba(16, 185, 129, 0.12)",
  border: "1px solid rgba(16, 185, 129, 0.36)",
  color: "#10b981",
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: 0,
  textTransform: "uppercase",
};

const unlockButtonStyle = {
  ...mono,
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  marginLeft: 4,
  padding: "2px 7px",
  borderRadius: 5,
  background: "rgba(245, 158, 11, 0.18)",
  border: "1px solid rgba(245, 158, 11, 0.48)",
  color: "#f59e0b",
  cursor: "pointer",
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: 0,
  textTransform: "uppercase",
};

const unlockReasonInput = {
  ...mono,
  fontSize: 11,
  padding: "4px 8px",
  borderRadius: 5,
  border: "1px solid var(--border-default)",
  background: "var(--bg-input, #0d1117)",
  color: "var(--text-primary)",
  width: 200,
  outline: "none",
};

const unlockCancelButton = {
  ...mono,
  padding: "3px 8px",
  borderRadius: 5,
  background: "transparent",
  border: "1px solid var(--border-default)",
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: 0,
  textTransform: "uppercase",
};

function truncate(value, max) {
  const text = String(value || "");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}
