import { useCallback, useEffect, useRef, useState } from "react";

// Owns the imperative pdfjs canvas render. The page hands in the loaded
// pdfjs document, the current page index, the zoom factor, and the rotation
// (degrees), and gets back:
//
//   - canvasRef       — attach to the <canvas> element. Render writes to it.
//   - rendering       — boolean, drives the RenderSkeleton overlay.
//   - currentViewport — pdfjs PageViewport for the active render. AnnotationLayer
//                       uses this to project markup (stored in PDF user units)
//                       to canvas pixels and hit-test pointer events.
//   - canvasSize      — { width, height } of the rendered canvas in CSS pixels.
//                       Mirrors viewport.width/height; published AFTER render
//                       so overlays never display against a mismatched canvas
//                       (prevents a 1-frame "jump" on zoom).
//   - pageSize        — natural page size at scale 1, in PDF user units. Used
//                       by the callout overlay (which stores coords in PDF
//                       units with a top-left origin and multiplies by zoom).
//   - linkHotspots    — pdfjs-extracted Link annotations, projected to canvas
//                       pixels. Empty array if pdfjs raises while extracting.
//
// Behaviour matches the previous inline renderPage byte-for-byte: cancels
// any in-flight render before starting a new one, rotation is honoured at
// scale 1 AND at the user's zoom, link rects are projected via
// viewport.convertToViewportPoint() so rotation is implicitly applied.
export function usePdfRenderer({ pdfDoc, currentPage, zoom, rotation }) {
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);

  const [rendering, setRendering] = useState(false);
  const [currentViewport, setCurrentViewport] = useState(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [linkHotspots, setLinkHotspots] = useState([]);

  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    // Cancel any in-flight render
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    setRendering(true);
    try {
      const page = await pdfDoc.getPage(currentPage);
      const baseViewport = page.getViewport({ scale: 1, rotation });
      setPageSize({ width: baseViewport.width, height: baseViewport.height });
      const viewport = page.getViewport({ scale: zoom, rotation });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");

      renderTaskRef.current = page.render({ canvasContext: ctx, viewport });
      await renderTaskRef.current.promise;

      // Publish viewport + size so AnnotationLayer can project markup.
      // We do this AFTER the render so the overlay never displays against
      // a mismatched canvas (prevents a 1-frame "jump" on zoom).
      setCurrentViewport(viewport);
      setCanvasSize({ width: viewport.width, height: viewport.height });

      // ── Extract link annotations for clickable overlays ──────────────
      try {
        const annots = await page.getAnnotations({ intent: "display" });
        const linkAnnots = annots
          .filter((a) => a.subtype === "Link" && a.rect)
          .map((a) => {
            // Transform PDF rect [x1,y1,x2,y2] to canvas pixel coords
            const [x1, y1, x2, y2] = a.rect;
            const p1 = viewport.convertToViewportPoint(x1, y1);
            const p2 = viewport.convertToViewportPoint(x2, y2);
            const left = Math.min(p1[0], p2[0]);
            const top = Math.min(p1[1], p2[1]);
            const width = Math.abs(p2[0] - p1[0]);
            const height = Math.abs(p2[1] - p1[1]);
            return {
              id: a.id || `${x1}-${y1}`,
              left, top, width, height,
              url: a.url || null,
              dest: a.dest || null,
              unsafeUrl: a.unsafeUrl || null,
              title: a.title || "",
            };
          });
        setLinkHotspots(linkAnnots);
      } catch {
        setLinkHotspots([]);
      }
    } catch (err) {
      if (err?.name !== "RenderingCancelledException") {
        console.error("Render error:", err);
      }
    } finally {
      setRendering(false);
      renderTaskRef.current = null;
    }
  }, [pdfDoc, currentPage, zoom, rotation]);

  useEffect(() => { renderPage(); }, [renderPage]);

  return {
    canvasRef,
    rendering,
    currentViewport,
    canvasSize,
    pageSize,
    linkHotspots,
  };
}
