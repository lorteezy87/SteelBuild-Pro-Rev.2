import React from "react";
import { Zap, Download } from "lucide-react";

export default function ViewerToolbar({
  document,
  markupMode,
  onToggleMarkupMode,
  onRunAIAnalysis,
  analysisRunning,
  onBack,
  zoomLevel,
  onZoom,
  currentPage,
  onPageChange,
  onDownload,
  onFitWidth,
  recordTitle,
  recordMeta,
}) {
  const zoomLevels = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

  return (
    <div
      style={{
        height: 48,
        background: "var(--bg-sidebar)",
        borderBottom: "1px solid var(--bg-surface-high)",
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12
      }}
    >
      {/* Left - Back and title */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-secondary)",
                      cursor: "pointer",
                      fontSize: 20,
            padding: 0
          }}
        >
          ←
        </button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {recordTitle || `${document.documentNumber || ""} · ${document.displayName || ""}`}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(160,175,210,0.50)" }}>
            {recordMeta || `Rev ${document.revisionNumber || 0}`}
          </div>
        </div>
      </div>

      {/* Center - Zoom and Navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Zoom controls */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: "var(--bg-surface-high)",
            borderRadius: 6,
            padding: 4
          }}
        >
          <button
            onClick={() => onZoom(Math.max(zoomLevel - 0.25, 0.25))}
            style={{
              padding: "4px 8px",
              background: "none",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600
            }}
          >
            −
          </button>
          <select
            value={zoomLevel}
            onChange={(e) => onZoom(parseFloat(e.target.value))}
            style={{
              padding: "4px 6px",
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              cursor: "pointer"
            }}
          >
            {zoomLevels.map((z) => (
              <option key={z} value={z}>
                {Math.round(z * 100)}%
              </option>
            ))}
          </select>
          <button
            onClick={() => onZoom(Math.min(zoomLevel + 0.25, 4))}
            style={{
              padding: "4px 8px",
              background: "none",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600
            }}
          >
            +
          </button>
        </div>

        {/* Page navigation */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 10 }}>
          <button
            onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
            style={{
              padding: "4px 8px",
              background: "var(--accent-muted)",
              border: "1px solid var(--accent-border)",
              color: "var(--accent)",
              borderRadius: 4,
              cursor: "pointer"
            }}
          >
            ←
          </button>
          <span style={{ color: "var(--text-muted)", minWidth: 40, textAlign: "center" }}>
            Page {currentPage}
          </span>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            style={{
              padding: "4px 8px",
              background: "var(--accent-muted)",
              border: "1px solid var(--accent-border)",
              color: "var(--accent)",
              borderRadius: 4,
              cursor: "pointer"
            }}
          >
            →
          </button>
        </div>
      </div>

      {/* Right - Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={onToggleMarkupMode}
          style={{
            padding: "6px 12px",
            background: markupMode ? "var(--accent-muted)" : "transparent",
            border: "1px solid var(--border-default)",
            color: markupMode ? "var(--accent)" : "var(--text-secondary)",
            borderRadius: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.15s"
          }}
        >
          {markupMode ? "✎ MARKUP ON" : "MARKUP"}
        </button>

        <button
          onClick={onRunAIAnalysis}
          disabled={analysisRunning}
          style={{
            padding: "6px 12px",
            background: "linear-gradient(135deg,#8B5CF6,#6D40D4)",
            border: "none",
            color: "#fff",
            borderRadius: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 600,
            cursor: analysisRunning ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            opacity: analysisRunning ? 0.6 : 1
          }}
        >
          <Zap size={14} />
          {analysisRunning ? "ANALYZING..." : "AI ANALYZE"}
        </button>

        {onFitWidth && (
          <button
            onClick={onFitWidth}
            title="Fit to width"
            style={{ padding: "6px 10px", background: "transparent", border: "1px solid var(--border-default)", color: "var(--text-secondary)", borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, cursor: "pointer" }}
          >
            ⊞ FIT
          </button>
        )}

        {onDownload && (
          <button
            onClick={onDownload}
            style={{ padding: "6px 10px", background: "transparent", border: "1px solid var(--border-default)", color: "var(--text-secondary)", borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
          >
            <Download size={13} />
            PDF
          </button>
        )}
      </div>
    </div>
  );
}