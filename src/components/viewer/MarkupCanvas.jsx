import React, { useEffect, useRef, useState, useCallback } from "react";

const HIT_RADIUS = 8; // px for hit testing

function getCanvasPoint(e, canvasEl, zoom) {
  const rect = canvasEl.getBoundingClientRect();
  // coords in logical CSS pixels, normalized by zoom so stored values are zoom-independent
  return {
    x: (e.clientX - rect.left) / zoom,
    y: (e.clientY - rect.top) / zoom,
  };
}

function hitTestMarkup(markup, px, py, zoom) {
  const tol = HIT_RADIUS / zoom;
  switch (markup.type) {
    case "rect": {
      const { x, y, width, height } = markup;
      return px >= x - tol && px <= x + width + tol && py >= y - tol && py <= y + height + tol;
    }
    case "line": {
      const [p1, p2] = markup.points || [];
      if (!p1 || !p2) return false;
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) return false;
      const t = Math.max(0, Math.min(1, ((px - p1.x) * dx + (py - p1.y) * dy) / (len * len)));
      const cx = p1.x + t * dx, cy = p1.y + t * dy;
      return Math.hypot(px - cx, py - cy) <= tol;
    }
    case "freehand": {
      const pts = markup.points || [];
      for (let i = 1; i < pts.length; i++) {
        const p1 = pts[i - 1], p2 = pts[i];
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) continue;
        const t = Math.max(0, Math.min(1, ((px - p1.x) * dx + (py - p1.y) * dy) / (len * len)));
        const cx = p1.x + t * dx, cy = p1.y + t * dy;
        if (Math.hypot(px - cx, py - cy) <= tol) return true;
      }
      return false;
    }
    case "text":
    case "stamp": {
      const { x, y, text = "", fontSize = 14 } = markup;
      const w = (markup.type === "stamp" ? 100 : text.length * fontSize * 0.6) / zoom;
      const h = fontSize * 1.5 / zoom;
      return px >= x - tol && px <= x + w + tol && py >= y - h - tol && py <= y + tol;
    }
    default:
      return false;
  }
}

function drawMarkupOnCtx(ctx, markup, zoom, isSelected) {
  const dpr = window.devicePixelRatio || 1;
  // coords are stored in logical px relative to zoom=1
  // canvas pixels = logical coords * zoom * dpr
  const scale = zoom * dpr;
  const color = markup.color || "var(--accent)";
  const alpha = (markup.opacity ?? 100) / 100;
  const lineWidth = markup.lineWidth || 2;

  ctx.save();
  ctx.globalAlpha = alpha;

  switch (markup.type) {
    case "rect": {
      const { x, y, width, height } = markup;
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth * dpr;
      ctx.strokeRect(x * scale, y * scale, width * scale, height * scale);
      if (markup.fill) {
        ctx.fillStyle = color + "33";
        ctx.fillRect(x * scale, y * scale, width * scale, height * scale);
      }
      break;
    }
    case "line": {
      const [p1, p2] = markup.points || [];
      if (p1 && p2) {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth * dpr;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p1.x * scale, p1.y * scale);
        ctx.lineTo(p2.x * scale, p2.y * scale);
        ctx.stroke();
        // Arrow head
        if (markup.arrow) {
          const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          const arrowLen = 12 * dpr;
          ctx.beginPath();
          ctx.moveTo(p2.x * scale, p2.y * scale);
          ctx.lineTo(
            p2.x * scale - arrowLen * Math.cos(angle - Math.PI / 6),
            p2.y * scale - arrowLen * Math.sin(angle - Math.PI / 6)
          );
          ctx.moveTo(p2.x * scale, p2.y * scale);
          ctx.lineTo(
            p2.x * scale - arrowLen * Math.cos(angle + Math.PI / 6),
            p2.y * scale - arrowLen * Math.sin(angle + Math.PI / 6)
          );
          ctx.stroke();
        }
      }
      break;
    }
    case "freehand": {
      const pts = markup.points || [];
      if (pts.length < 2) break;
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth * dpr;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(pts[0].x * scale, pts[0].y * scale);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x * scale, pts[i].y * scale);
      }
      ctx.stroke();
      break;
    }
    case "text": {
      const { x, y, text = "Text", fontSize = 14 } = markup;
      ctx.fillStyle = color;
      ctx.font = `${fontSize * dpr}px var(--font-body)`;
      ctx.fillText(text, x * scale, y * scale);
      break;
    }
    case "stamp": {
      const { x, y, text = "APPROVED", fontSize = 16 } = markup;
      const pw = 100 * dpr;
      const ph = 36 * dpr;
      const px2 = x * scale;
      const py2 = (y - 28) * scale;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5 * dpr;
      ctx.beginPath();
      ctx.roundRect(px2, py2, pw, ph, 6 * dpr);
      ctx.stroke();
      ctx.fillStyle = color + "22";
      ctx.fill();
      ctx.fillStyle = color;
      ctx.font = `bold ${fontSize * dpr}px var(--font-mono)`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, px2 + pw / 2, py2 + ph / 2);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      break;
    }
    default:
      break;
  }

  // Selection highlight
  if (isSelected) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#00B8D9";
    ctx.lineWidth = 2 * dpr;
    ctx.setLineDash([5 * dpr, 3 * dpr]);
    // Draw bounding box
    const bb = getBoundingBox(markup);
    if (bb) {
      ctx.strokeRect(
        (bb.x - 4) * scale, (bb.y - 4) * scale,
        (bb.w + 8) * scale, (bb.h + 8) * scale
      );
      // handles
      const handles = [
        { x: bb.x - 4, y: bb.y - 4 },
        { x: bb.x + bb.w + 4, y: bb.y - 4 },
        { x: bb.x + bb.w + 4, y: bb.y + bb.h + 4 },
        { x: bb.x - 4, y: bb.y + bb.h + 4 },
      ];
      ctx.setLineDash([]);
      ctx.fillStyle = "#00B8D9";
      handles.forEach((h) => {
        ctx.fillRect(h.x * scale - 4 * dpr, h.y * scale - 4 * dpr, 8 * dpr, 8 * dpr);
      });
    }
    ctx.setLineDash([]);
  }

  ctx.restore();
}

function getBoundingBox(markup) {
  switch (markup.type) {
    case "rect":
      return { x: markup.x, y: markup.y, w: markup.width, h: markup.height };
    case "line": {
      const [p1, p2] = markup.points || [{ x: 0, y: 0 }, { x: 0, y: 0 }];
      return { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), w: Math.abs(p2.x - p1.x), h: Math.abs(p2.y - p1.y) };
    }
    case "freehand": {
      const pts = markup.points || [];
      if (!pts.length) return null;
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    case "text":
    case "stamp":
      return { x: markup.x, y: markup.y - 28, w: 100, h: 32 };
    default:
      return null;
  }
}

export default function MarkupCanvas({
  markups,
  selectedMarkup,
  zoomLevel,
  activeTool,
  markupMode,
  activeColor,
  activeStamp,
  pdfCanvasRef,
  onAddMarkup,
  onSelectMarkup,
  onUpdateMarkup,
}) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState(null);
  const [currentPath, setCurrentPath] = useState([]);
  const [dragging, setDragging] = useState(null); // { markupId, offsetX, offsetY }
  const [livePoint, setLivePoint] = useState(null); // current mouse pos while drawing
  const [textInput, setTextInput] = useState(null); // { x, y, visible }
  const textRef = useRef(null);

  // Sync canvas size to the PDF canvas
  useEffect(() => {
    const syncSize = () => {
      const pdfCanvas = pdfCanvasRef?.current;
      const myCanvas = canvasRef.current;
      if (!pdfCanvas || !myCanvas) return;
      // Match pixel buffer dimensions exactly
      myCanvas.width = pdfCanvas.width;
      myCanvas.height = pdfCanvas.height;
      // Match CSS display dimensions exactly
      myCanvas.style.width = pdfCanvas.style.width || pdfCanvas.offsetWidth + "px";
      myCanvas.style.height = pdfCanvas.style.height || pdfCanvas.offsetHeight + "px";
    };
    syncSize();
    // Re-sync whenever the PDF canvas is re-rendered (zoom/page changes)
    const obs = new ResizeObserver(syncSize);
    if (pdfCanvasRef?.current) obs.observe(pdfCanvasRef.current);
    return () => obs.disconnect();
  }, [pdfCanvasRef, zoomLevel]);

  // Redraw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    markups.forEach((m) => {
      drawMarkupOnCtx(ctx, m, zoomLevel, selectedMarkup?.id === m.id);
    });

    const dpr = window.devicePixelRatio || 1;
    const scale = zoomLevel * dpr;

    // Draw in-progress freehand
    if (isDrawing && activeTool === "freehand" && currentPath.length > 1) {
      ctx.save();
      ctx.strokeStyle = activeColor || "var(--accent)";
      ctx.lineWidth = 2 * dpr;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(currentPath[0].x * scale, currentPath[0].y * scale);
      currentPath.forEach((p) => ctx.lineTo(p.x * scale, p.y * scale));
      ctx.stroke();
      ctx.restore();
    }

    // Draw in-progress rect preview
    if (isDrawing && activeTool === "rect" && startPoint && livePoint) {
      const x = Math.min(startPoint.x, livePoint.x) * scale;
      const y = Math.min(startPoint.y, livePoint.y) * scale;
      const w = Math.abs(livePoint.x - startPoint.x) * scale;
      const h = Math.abs(livePoint.y - startPoint.y) * scale;
      ctx.save();
      ctx.strokeStyle = activeColor || "var(--accent)";
      ctx.lineWidth = 2 * dpr;
      ctx.setLineDash([6 * dpr, 3 * dpr]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Draw in-progress line/arrow preview
    if (isDrawing && (activeTool === "line" || activeTool === "arrow") && startPoint && livePoint) {
      ctx.save();
      ctx.strokeStyle = activeColor || "var(--accent)";
      ctx.lineWidth = 2 * dpr;
      ctx.lineCap = "round";
      ctx.setLineDash([6 * dpr, 3 * dpr]);
      ctx.beginPath();
      ctx.moveTo(startPoint.x * scale, startPoint.y * scale);
      ctx.lineTo(livePoint.x * scale, livePoint.y * scale);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }, [markups, selectedMarkup, zoomLevel, isDrawing, currentPath, activeColor, activeTool, startPoint, livePoint]);

  const getPoint = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    return getCanvasPoint(e, canvas, zoomLevel);
  }, [zoomLevel]);

  const handleMouseDown = (e) => {
    if (!markupMode) return;
    const pt = getPoint(e);

    // Select tool — hit test
    if (activeTool === "select") {
      const hit = [...markups].reverse().find((m) => hitTestMarkup(m, pt.x, pt.y, zoomLevel));
      if (hit) {
        onSelectMarkup(hit);
        const bb = getBoundingBox(hit);
        setDragging({ markupId: hit.id, offsetX: pt.x - (bb?.x ?? pt.x), offsetY: pt.y - (bb?.y ?? pt.y) });
      } else {
        onSelectMarkup(null);
      }
      return;
    }

    // Text tool — show input overlay
    if (activeTool === "text") {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      setTextInput({ x: pt.x, y: pt.y, screenX: e.clientX - rect.left, screenY: e.clientY - rect.top });
      setTimeout(() => textRef.current?.focus(), 50);
      return;
    }

    // Stamp tool — place immediately
    if (activeTool === "stamp") {
      onAddMarkup({
        type: "stamp",
        x: pt.x,
        y: pt.y,
        text: activeStamp?.label || "APPROVED",
        color: activeStamp?.color || "#00D68F",
        fontSize: 16,
        opacity: 100,
      });
      return;
    }

    setIsDrawing(true);
    setStartPoint(pt);
    if (activeTool === "freehand") setCurrentPath([pt]);
  };

  const handleMouseMove = (e) => {
    if (!markupMode) return;

    // Drag selected markup
    if (dragging) {
      const pt = getPoint(e);
      const markup = markups.find((m) => m.id === dragging.markupId);
      if (!markup) return;
      const dx = pt.x - dragging.offsetX;
      const dy = pt.y - dragging.offsetY;
      const bb = getBoundingBox(markup);
      if (!bb) return;
      const deltaX = dx - bb.x;
      const deltaY = dy - bb.y;

      // Translate markup
      if (markup.type === "rect") {
        onUpdateMarkup(markup.id, { x: markup.x + deltaX, y: markup.y + deltaY });
      } else if (markup.type === "line") {
        onUpdateMarkup(markup.id, {
          points: markup.points.map((p) => ({ x: p.x + deltaX, y: p.y + deltaY })),
        });
      } else if (markup.type === "freehand") {
        onUpdateMarkup(markup.id, {
          points: markup.points.map((p) => ({ x: p.x + deltaX, y: p.y + deltaY })),
        });
      } else if (markup.type === "text" || markup.type === "stamp") {
        onUpdateMarkup(markup.id, { x: markup.x + deltaX, y: markup.y + deltaY });
      }
      setDragging({ ...dragging, offsetX: pt.x - (getBoundingBox({ ...markup, x: markup.x + deltaX, y: markup.y + deltaY })?.x ?? 0), offsetY: pt.y - (getBoundingBox({ ...markup, x: markup.x + deltaX, y: markup.y + deltaY })?.y ?? 0) });
      return;
    }

    if (!isDrawing) return;
    const pt = getPoint(e);
    setLivePoint(pt);
    if (activeTool === "freehand") {
      setCurrentPath((prev) => [...prev, pt]);
    }
  };

  const handleMouseUp = (e) => {
    setLivePoint(null);
    if (dragging) { setDragging(null); return; }
    if (!isDrawing || !startPoint) return;

    const endPoint = getPoint(e);

    switch (activeTool) {
      case "rect": {
        const w = endPoint.x - startPoint.x;
        const h = endPoint.y - startPoint.y;
        if (Math.abs(w) > 4 && Math.abs(h) > 4) {
          onAddMarkup({
            type: "rect",
            x: Math.min(startPoint.x, endPoint.x),
            y: Math.min(startPoint.y, endPoint.y),
            width: Math.abs(w),
            height: Math.abs(h),
            color: activeColor,
            opacity: 100,
            lineWidth: 2,
            fill: false,
          });
        }
        break;
      }
      case "line":
      case "arrow": {
        if (Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y) > 4) {
          onAddMarkup({
            type: "line",
            points: [startPoint, endPoint],
            color: activeColor,
            opacity: 100,
            lineWidth: 2,
            arrow: activeTool === "arrow",
          });
        }
        break;
      }
      case "freehand": {
        if (currentPath.length > 2) {
          onAddMarkup({
            type: "freehand",
            points: currentPath,
            color: activeColor,
            opacity: 100,
            lineWidth: 2,
          });
        }
        setCurrentPath([]);
        break;
      }
      default:
        break;
    }

    setIsDrawing(false);
    setStartPoint(null);
  };

  const handleTextSubmit = (text) => {
    if (text.trim() && textInput) {
      onAddMarkup({
        type: "text",
        x: textInput.x,
        y: textInput.y,
        text: text.trim(),
        color: activeColor,
        fontSize: 14,
        opacity: 100,
      });
    }
    setTextInput(null);
  };

  const getCursor = () => {
    if (!markupMode) return "default";
    if (dragging) return "grabbing";
    switch (activeTool) {
      case "select": return "default";
      case "freehand": return "crosshair";
      case "text": return "text";
      case "stamp": return "copy";
      default: return "crosshair";
    }
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setLivePoint(null); setDragging(null); }}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          cursor: getCursor(),
          pointerEvents: markupMode || (markups.length > 0 && activeTool === "select") ? "auto" : "none",
          zIndex: 10,
        }}
      />

      {/* Floating text input */}
      {textInput && (
        <div
          style={{
            position: "absolute",
            left: textInput.screenX,
            top: textInput.screenY - 20,
            zIndex: 20,
          }}
        >
          <input
            ref={textRef}
            autoFocus
            placeholder="Type and press Enter"
            onBlur={(e) => handleTextSubmit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleTextSubmit(e.target.value);
              if (e.key === "Escape") setTextInput(null);
            }}
            style={{
              background: "rgba(var(--bg-sidebar), 0.92)",
              border: `1px solid ${activeColor}`,
              color: activeColor,
              padding: "4px 8px",
              borderRadius: 4,
              fontFamily: "var(--font-body)",
              fontSize: 14,
              outline: "none",
              minWidth: 140,
              boxShadow: `0 0 8px ${activeColor}44`,
            }}
          />
        </div>
      )}
    </>
  );
}