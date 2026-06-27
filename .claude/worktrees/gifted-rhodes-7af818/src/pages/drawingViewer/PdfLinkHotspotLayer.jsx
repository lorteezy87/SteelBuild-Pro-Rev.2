import React from "react";

// Clickable layer that floats above the rendered canvas and surfaces
// pdfjs-extracted Link annotations (internal page refs + external URLs)
// as hover-highlighting hotspots. Width / height are read straight off
// the canvas DOM node (NOT from canvasSize state) so the layer matches
// the size pdfjs actually wrote even on the first frame after a render —
// behaviour kept byte-identical with the inline JSX it replaces.
//
// `annotLayerRef` is forwarded so DrawingViewer can keep the same DOM
// reference it always had (cheap insurance against any consumer that may
// be reading it).
export default function PdfLinkHotspotLayer({
  linkHotspots,
  canvasRef,
  annotLayerRef,
  onAnnotationClick,
}) {
  if (!linkHotspots || linkHotspots.length === 0) return null;
  return (
    <div
      ref={annotLayerRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: canvasRef.current?.width || 0,
        height: canvasRef.current?.height || 0,
        pointerEvents: "none",
      }}
    >
      {linkHotspots.map((a) => (
        <div
          key={a.id}
          onClick={() => onAnnotationClick(a)}
          title={a.title || a.url || "Link"}
          style={{
            position: "absolute",
            left: a.left,
            top: a.top,
            width: a.width,
            height: a.height,
            cursor: "pointer",
            pointerEvents: "auto",
            border: "1px solid transparent",
            borderRadius: 2,
            transition: "border-color 0.15s, background 0.15s",
            background: "transparent",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "rgba(200,155,32,0.12)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "transparent"; }}
        />
      ))}
    </div>
  );
}
