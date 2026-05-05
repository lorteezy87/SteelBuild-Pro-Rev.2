import React from "react";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Keyboard, Film, RotateCw } from "lucide-react";
import { STAGES, mono, toolBtn } from "@/pages/drawingViewer/drawingViewerUtils";
import { formatScaleFraction } from "@/components/drawings/viewer/scaleParse";

// 48px-tall toolbar that sits below the breadcrumb header. Hosts:
//   - sidebar toggle
//   - sheet info (number, title, revision, stage)
//   - page nav (only when totalPages > 1)
//   - zoom controls (-, preset dropdown, +)
//   - rotation toggle (cycle 90deg)
//   - render-mode toggle (canvas <-> iframe)
//   - download
//   - scale indicator + AUTO scale-detect (only when pdfDoc loaded)
//   - filmstrip / context-panel / shortcuts toggles
//
// Pure presentation — every piece of state and every callback is owned by
// DrawingViewer and passed in by prop. DOM and inline styles are byte-
// identical to the JSX block this replaces.
export default function ViewerToolbar({
  sidebarOpen,
  setSidebarOpen,
  activeDrawing,
  totalPages,
  currentPage,
  setCurrentPage,
  zoom,
  setZoom,
  handleZoomPreset,
  rotation,
  setRotation,
  renderMode,
  setRenderMode,
  handleDownload,
  pdfDoc,
  markupScale,
  handleAutoDetectScale,
  filmstripOpen,
  setFilmstripOpen,
  contextOpen,
  setContextOpen,
  setShortcutsOpen,
}) {
  return (
    <div className="sbd-topbar" style={{ height: 48, borderBottom: "1px solid var(--border-default)", display: "flex", alignItems: "center", gap: 10, padding: "0 16px", flexShrink: 0, background: "var(--bg-surface)" }}>
      {/* Sidebar toggle */}
      <button
        onClick={() => setSidebarOpen((o) => !o)}
        title={sidebarOpen ? "Hide sheet list (more drawing space)" : "Show sheet list"}
        style={{
          ...toolBtn,
          display: "inline-flex",
          alignItems: "center",
          padding: "6px 8px",
          color: sidebarOpen ? "var(--accent)" : "var(--text-muted)",
          background: sidebarOpen ? "var(--accent-muted)" : "var(--bg-surface-low)",
          border: sidebarOpen ? "1px solid var(--accent)" : "1px solid var(--border-default)",
          flexShrink: 0,
        }}
      >
        {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
      </button>
      {/* Sheet info */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {activeDrawing ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{activeDrawing.sheet_number}</span>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeDrawing.title}</span>
            <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", flexShrink: 0 }}>R{activeDrawing.revision_number ?? "0"}</span>
            {activeDrawing.stage && (
              <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: STAGES[activeDrawing.stage]?.color, flexShrink: 0 }}>
                {activeDrawing.stage === "Released" ? "IFC" : activeDrawing.stage}
              </span>
            )}
          </div>
        ) : (
          <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>SELECT A SHEET</span>
        )}
      </div>

      {/* Page nav (for multi-page PDFs) */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}
            style={toolBtn}>‹</button>
          <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>{currentPage}/{totalPages}</span>
          <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
            style={toolBtn}>›</button>
        </div>
      )}

      {/* Zoom controls — pro-viewer style: -/+ around a preset dropdown.
          Dropdown value "fitW" / "fitP" / "1" maps to actions in handleZoomPreset. */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button onClick={() => setZoom((z) => Math.max(0.1, +(z - 0.1).toFixed(2)))} title="Zoom out (−)" style={toolBtn}>−</button>
        <select
          value={zoom.toFixed(2)}
          onChange={(e) => handleZoomPreset(e.target.value)}
          style={{
            fontFamily: "var(--font-mono)", fontSize: 10, padding: "4px 6px",
            border: "1px solid var(--border-default)", borderRadius: 4,
            background: "var(--bg-surface)", color: "var(--text-primary)",
            minWidth: 82, cursor: "pointer",
          }}
        >
          {/* Current value as first item so the select always reflects reality */}
          <option value={zoom.toFixed(2)}>{Math.round(zoom * 100)}%</option>
          <option value="fitW">Fit Width</option>
          <option value="fitP">Fit Page</option>
          <option value="0.50">50%</option>
          <option value="0.75">75%</option>
          <option value="1.00">100%</option>
          <option value="1.25">125%</option>
          <option value="1.50">150%</option>
          <option value="2.00">200%</option>
          <option value="3.00">300%</option>
          <option value="4.00">400%</option>
        </select>
        <button onClick={() => setZoom((z) => Math.min(5.0, +(z + 0.1).toFixed(2)))} title="Zoom in (+)" style={toolBtn}>+</button>
      </div>
      <button
        onClick={() => setRotation((r) => (r + 90) % 360)}
        title={`Rotate (R) — currently ${rotation}°`}
        style={{
          ...toolBtn,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "5px 8px",
          color: rotation !== 0 ? "var(--accent)" : "var(--text-muted)",
          background: rotation !== 0 ? "rgba(200,155,32,0.10)" : "none",
        }}
      >
        <RotateCw size={12} />
        {rotation !== 0 && <span style={{ ...mono, fontSize: 9, fontWeight: 700 }}>{rotation}°</span>}
      </button>
      <button
        onClick={() => setRenderMode((m) => m === "iframe" ? "canvas" : "iframe")}
        title={renderMode === "iframe" ? "Switch to canvas (markups)" : "Switch to iframe (browser PDF)"}
        style={{
          ...toolBtn, ...mono, fontSize: 9,
          color: renderMode === "iframe" ? "var(--accent)" : "var(--text-muted)",
          background: renderMode === "iframe" ? "rgba(200,155,32,0.1)" : "none",
        }}
      >
        {renderMode === "iframe" ? "IFRAME" : "CANVAS"}
      </button>
      <button onClick={handleDownload} disabled={!activeDrawing?.file_url}
        style={{ ...toolBtn, ...mono, fontSize: 9, color: "var(--accent)", opacity: activeDrawing?.file_url ? 1 : 0.3 }}>
        ↓ PDF
      </button>

      {/* Scale indicator + auto-detect button. Shown only when a PDF is
          loaded. Reads activeDrawing.markup_scale; if null, shows "NO SCALE"
          + an AUTO button that parses the title block. */}
      {pdfDoc && (
        <>
          <div style={{ width: 1, height: 16, background: "var(--divider)", margin: "0 4px" }} />
          <span
            title={markupScale
              ? `Calibrated scale (1 PDF inch = ${markupScale.toFixed(1)} real inches). Measurements render in real ft-in.`
              : "No scale calibrated — measure tool shows raw page-inches with a ~ prefix."}
            style={{
              ...mono, fontSize: 9, fontWeight: 700,
              padding: "4px 8px",
              borderRadius: 3,
              background: markupScale ? "rgba(0,229,255,0.10)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${markupScale ? "rgba(0,229,255,0.45)" : "var(--border-default)"}`,
              color: markupScale ? "#00E5FF" : "var(--text-muted)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {markupScale ? formatScaleFraction(markupScale) : "NO SCALE"}
          </span>
          <button
            onClick={handleAutoDetectScale}
            title="Scan the PDF title block and try to auto-detect the scale (K key opens the manual Calibrate tool if this fails)"
            disabled={!activeDrawing?.id}
            style={{
              ...toolBtn, ...mono, fontSize: 9,
              color: "var(--text-muted)",
              opacity: activeDrawing?.id ? 1 : 0.4,
            }}
          >
            AUTO
          </button>
        </>
      )}
      <button
        onClick={() => setFilmstripOpen((o) => !o)}
        title={filmstripOpen ? "Hide thumbnail filmstrip (F)" : "Show thumbnail filmstrip (F)"}
        style={{
          ...toolBtn,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "5px 8px",
          color: filmstripOpen ? "var(--accent)" : "var(--text-muted)",
          background: filmstripOpen ? "rgba(200,155,32,0.10)" : "none",
        }}
      >
        <Film size={12} />
      </button>
      <button
        onClick={() => setContextOpen((o) => !o)}
        title={contextOpen ? "Hide sheet context panel (I)" : "Show sheet context panel (I)"}
        style={{
          ...toolBtn,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "5px 8px",
          color: contextOpen ? "var(--accent)" : "var(--text-muted)",
          background: contextOpen ? "rgba(200,155,32,0.10)" : "none",
        }}
      >
        {contextOpen ? <PanelRightClose size={12} /> : <PanelRightOpen size={12} />}
      </button>
      <button
        onClick={() => setShortcutsOpen((o) => !o)}
        title="Keyboard shortcuts (?)"
        style={{
          ...toolBtn,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "5px 8px",
          color: "var(--text-muted)",
        }}
      >
        <Keyboard size={12} />
        <span style={{ ...mono, fontSize: 9, fontWeight: 700 }}>?</span>
      </button>
    </div>
  );
}
