import React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Film,
  Keyboard,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { STAGES, mono } from "@/pages/drawingViewer/drawingViewerUtils";
import { formatScaleFraction } from "@/components/drawings/viewer/scaleParse";

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
  const stage = STAGES[activeDrawing?.stage];
  const hasPdf = !!activeDrawing?.file_url;
  const canPage = totalPages > 1;

  return (
    <div className="drawing-viewer-toolbar">
      <div style={toolbarGroupStyle}>
        <ToolbarButton
          active={sidebarOpen}
          onClick={() => setSidebarOpen((open) => !open)}
          title={sidebarOpen ? "Hide sheet navigator" : "Show sheet navigator"}
          icon={sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          label="Sheets"
        />
        <div style={sheetBadgeStyle}>
          <span style={sheetNumberStyle}>{activeDrawing?.sheet_number || "No sheet"}</span>
          <span style={sheetStageStyle(stage?.color)}>{stage?.label || activeDrawing?.stage || "Not Started"}</span>
        </div>
      </div>

      <div style={toolbarGroupStyle}>
        <ToolbarButton
          disabled={!canPage || currentPage <= 1}
          onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          title="Previous PDF page"
          icon={<ChevronLeft size={15} />}
        />
        <span style={pageIndicatorStyle}>{Math.max(1, currentPage)} / {Math.max(1, totalPages || 1)}</span>
        <ToolbarButton
          disabled={!canPage || currentPage >= totalPages}
          onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
          title="Next PDF page"
          icon={<ChevronRight size={15} />}
        />
      </div>

      <div style={toolbarGroupStyle}>
        <ToolbarButton
          onClick={() => setZoom((value) => Math.max(0.1, +(value - 0.1).toFixed(2)))}
          title="Zoom out"
          icon={<ZoomOut size={15} />}
        />
        <select
          value={zoom.toFixed(2)}
          onChange={(event) => handleZoomPreset(event.target.value)}
          title="Zoom preset"
          style={zoomSelectStyle}
        >
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
        <ToolbarButton
          onClick={() => setZoom((value) => Math.min(5.0, +(value + 0.1).toFixed(2)))}
          title="Zoom in"
          icon={<ZoomIn size={15} />}
        />
        <ToolbarButton
          onClick={() => handleZoomPreset("fitP")}
          title="Fit page"
          icon={<Maximize2 size={15} />}
        />
      </div>

      <div style={toolbarGroupStyle}>
        <ToolbarButton
          active={rotation !== 0}
          onClick={() => setRotation((value) => (value + 90) % 360)}
          title={`Rotate drawing. Current rotation ${rotation}deg`}
          icon={<RotateCw size={15} />}
          label={rotation !== 0 ? `${rotation}deg` : null}
        />
        <ToolbarButton
          active={renderMode === "iframe"}
          onClick={() => setRenderMode((mode) => mode === "iframe" ? "canvas" : "iframe")}
          title={renderMode === "iframe" ? "Switch to canvas viewer" : "Switch to browser PDF viewer"}
          label={renderMode === "iframe" ? "Browser PDF" : "Canvas"}
        />
        <ToolbarButton
          disabled={!hasPdf}
          onClick={handleDownload}
          title="Download source PDF"
          icon={<Download size={15} />}
          label="PDF"
        />
      </div>

      {pdfDoc && (
        <div style={toolbarGroupStyle}>
          <span
            title={markupScale
              ? `Calibrated scale. 1 PDF inch = ${markupScale.toFixed(1)} real inches.`
              : "No scale calibrated. Measure tool shows approximate page inches."}
            style={scaleBadgeStyle(!!markupScale)}
          >
            {markupScale ? formatScaleFraction(markupScale) : "No Scale"}
          </span>
          <ToolbarButton
            disabled={!activeDrawing?.id}
            onClick={handleAutoDetectScale}
            title="Scan the PDF title block and try to auto-detect scale"
            label="Auto Scale"
          />
        </div>
      )}

      <div style={{ ...toolbarGroupStyle, marginLeft: "auto" }}>
        <ToolbarButton
          active={filmstripOpen}
          onClick={() => setFilmstripOpen((open) => !open)}
          title={filmstripOpen ? "Hide thumbnail strip" : "Show thumbnail strip"}
          icon={<Film size={15} />}
        />
        <ToolbarButton
          active={contextOpen}
          onClick={() => setContextOpen((open) => !open)}
          title={contextOpen ? "Hide drawing context" : "Show drawing context"}
          icon={contextOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
          label="Context"
        />
        <ToolbarButton
          onClick={() => setShortcutsOpen((open) => !open)}
          title="Keyboard shortcuts"
          icon={<Keyboard size={15} />}
        />
      </div>
    </div>
  );
}

function ToolbarButton({ active = false, disabled = false, onClick, title, icon, label }) {
  return (
    <button
      type="button"
      className="drawing-toolbar-button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      style={{
        ...buttonStyle,
        color: active ? "var(--accent)" : "var(--text-secondary)",
        background: active ? "rgba(200,155,32,0.12)" : "var(--viewer-panel-bg-soft, var(--bg-surface-low))",
        borderColor: active ? "rgba(200,155,32,0.62)" : "var(--viewer-line, var(--border-default))",
        opacity: disabled ? 0.42 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}

const toolbarGroupStyle = {
  minHeight: 34,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px",
  border: "1px solid var(--viewer-line, var(--border-default))",
  borderRadius: 8,
  background: "color-mix(in srgb, var(--bg-surface) 86%, transparent)",
};

const buttonStyle = {
  ...mono,
  minWidth: 32,
  minHeight: 28,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "5px 8px",
  border: "1px solid",
  borderRadius: 6,
  fontSize: 10,
  fontWeight: 850,
  letterSpacing: 0,
  textTransform: "uppercase",
  lineHeight: 1,
  transition: "border-color 120ms ease, background 120ms ease, color 120ms ease",
};

const sheetBadgeStyle = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  padding: "0 7px",
  minWidth: 0,
};

const sheetNumberStyle = {
  ...mono,
  fontSize: 12,
  fontWeight: 900,
  color: "var(--text-primary)",
  whiteSpace: "nowrap",
};

const sheetStageStyle = (color) => ({
  ...mono,
  maxWidth: 112,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 9,
  fontWeight: 900,
  color: color || "var(--text-muted)",
  textTransform: "uppercase",
});

const pageIndicatorStyle = {
  ...mono,
  minWidth: 46,
  textAlign: "center",
  fontSize: 10,
  fontWeight: 800,
  color: "var(--text-secondary)",
};

const zoomSelectStyle = {
  ...mono,
  minWidth: 94,
  height: 28,
  padding: "4px 8px",
  border: "1px solid var(--viewer-line, var(--border-default))",
  borderRadius: 6,
  background: "var(--viewer-panel-bg-soft, var(--bg-surface-low))",
  color: "var(--text-primary)",
  fontSize: 10,
  fontWeight: 800,
  cursor: "pointer",
};

const scaleBadgeStyle = (isCalibrated) => ({
  ...mono,
  minHeight: 28,
  display: "inline-flex",
  alignItems: "center",
  padding: "5px 9px",
  borderRadius: 6,
  border: `1px solid ${isCalibrated ? "rgba(0,229,255,0.45)" : "var(--viewer-line, var(--border-default))"}`,
  background: isCalibrated ? "rgba(0,229,255,0.10)" : "var(--viewer-panel-bg-soft, var(--bg-surface-low))",
  color: isCalibrated ? "#00E5FF" : "var(--text-muted)",
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: 0,
  textTransform: "uppercase",
  whiteSpace: "nowrap",
});
