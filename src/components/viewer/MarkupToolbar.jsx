import React, { useEffect, useState } from "react";
import {
  MousePointer2,
  Pencil,
  Minus,
  ArrowRight,
  Square,
  Circle,
  Type,
  Stamp,
  Ruler,
  MessageSquare,
  Trash2,
} from "lucide-react";

const CloudIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 8a6 6 0 0 1 12 0 c2 0 4 1.5 4 4s-2 4-4 4H6 C4 16 2 14.5 2 12 s2-4 4-4" />
  </svg>
);

const TOOLS = [
  { id: "select", label: "Select", kbd: "V", Icon: MousePointer2 },
  { id: "freehand", label: "Pencil", kbd: "P", Icon: Pencil },
  { id: "line", label: "Line", kbd: "L", Icon: Minus },
  { id: "arrow", label: "Arrow", kbd: "A", Icon: ArrowRight },
  { id: "rect", label: "Rectangle", kbd: "R", Icon: Square },
  { id: "circle", label: "Circle", kbd: "C", Icon: Circle },
  { id: "cloud", label: "Cloud", kbd: "D", Icon: CloudIcon },
  { id: "measure", label: "Measure", kbd: "M", Icon: Ruler },
  { id: "text", label: "Text", kbd: "T", Icon: Type },
  { id: "callout", label: "Callout", kbd: "K", Icon: MessageSquare },
  { id: "stamp", label: "Stamp", kbd: "S", Icon: Stamp },
];

const COLORS = [
  "var(--accent)",
  "#FF3D3D",
  "#FFB020",
  "#FFE600",
  "#00D68F",
  "#00B8D9",
  "#0D9488",
  "#FFFFFF",
];

const LINE_WIDTHS = [1, 2, 4, 8];

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
}

export default function MarkupToolbar({
  activeTool,
  onToolChange,
  activeColor,
  onColorChange,
  activeStamp,
  onStampChange,
  stamps = [],
  lineWidth,
  onLineWidthChange,
  opacity,
  onOpacityChange,
  onUndo,
}) {
  const [stampOpen, setStampOpen] = useState(false);

  useEffect(() => {
    const handler = (event) => {
      if (isTypingTarget(event.target)) return;
      const tool = TOOLS.find((item) => item.kbd.toLowerCase() === event.key.toLowerCase());
      if (!tool) return;
      event.preventDefault();
      onToolChange(tool.id);
      if (tool.id !== "stamp") {
        setStampOpen(false);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onToolChange]);

  return (
    <div
      className="sbd-card"
      style={{
        position: "fixed",
        left: 12,
        top: "50%",
        transform: "translateY(-50%)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 10,
        zIndex: 60,
        userSelect: "none",
        width: 72,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {TOOLS.map(({ id, label, kbd, Icon }) => (
          <div key={id} style={{ position: "relative" }}>
            <button
              onClick={() => {
                onToolChange(id);
                if (id === "stamp") {
                  setStampOpen((prev) => !prev);
                } else {
                  setStampOpen(false);
                }
              }}
              title={`${label} (${kbd})`}
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: activeTool === id ? "var(--accent)" : "var(--bg-surface-high)",
                border: `1px solid ${activeTool === id ? "var(--accent-border)" : "var(--border-default)"}`,
                color: activeTool === id ? "#fff" : "var(--text-secondary)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s",
                margin: "0 auto",
              }}
            >
              <Icon size={15} />
            </button>
            {activeTool !== id && (
              <span
                style={{
                  position: "absolute",
                  right: 6,
                  bottom: 3,
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  lineHeight: 1,
                  color: "var(--text-muted)",
                  background: "rgba(0,0,0,0.45)",
                  borderRadius: 3,
                  padding: "1px 3px",
                }}
              >
                {kbd}
              </span>
            )}

            {id === "stamp" && stampOpen && (
              <div
                style={{
                  position: "absolute",
                  left: "calc(100% + 10px)",
                  top: 0,
                  background: "var(--bg-surface-low)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 10,
                  padding: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  minWidth: 140,
                  boxShadow: "0 10px 28px rgba(0,0,0,0.45)",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "var(--text-muted)",
                    letterSpacing: "0.14em",
                  }}
                >
                  SELECT STAMP
                </div>
                {stamps.map((stamp) => (
                  <button
                    key={stamp.id}
                    onClick={() => {
                      onStampChange(stamp);
                      onToolChange("stamp");
                      setStampOpen(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 8px",
                      background: activeStamp?.id === stamp.id ? `${stamp.color}22` : "transparent",
                      border: `1px solid ${activeStamp?.id === stamp.id ? `${stamp.color}55` : "transparent"}`,
                      borderRadius: 6,
                      cursor: "pointer",
                      color: stamp.color,
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                    }}
                  >
                    <div style={{ width: 10, height: 10, borderRadius: 3, border: `2px solid ${stamp.color}` }} />
                    {stamp.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ height: 1, background: "var(--divider)" }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
          {LINE_WIDTHS.map((width) => (
            <button
              key={width}
              onClick={() => onLineWidthChange(width)}
              title={`${width}px`}
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                border: width === lineWidth ? "1px solid #fff" : "1px solid var(--border-default)",
                background: "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <span
                style={{
                  width: width + 2,
                  height: width + 2,
                  borderRadius: "50%",
                  background: width === lineWidth ? activeColor : "var(--text-muted)",
                  display: "block",
                }}
              />
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.14em",
              color: "var(--text-muted)",
              textAlign: "center",
            }}
          >
            OPACITY
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={opacity}
            onChange={(event) => onOpacityChange(Number(event.target.value))}
            style={{ width: "100%" }}
          />
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              color: "var(--text-secondary)",
              textAlign: "center",
            }}
          >
            {opacity}%
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 5,
          }}
        >
          {COLORS.map((color) => (
            <button
              key={color}
              onClick={() => onColorChange(color)}
              title={color}
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: color,
                border: activeColor === color ? "2px solid #fff" : "1px solid var(--border-strong)",
                cursor: "pointer",
                justifySelf: "center",
              }}
            />
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              background: activeColor,
              border: "2px solid var(--border-strong)",
              boxShadow: `0 0 10px ${activeColor}44`,
            }}
          />
          <button
            onClick={onUndo}
            title="Undo (Ctrl+Z)"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "1px solid var(--border-strong)",
              background: "var(--bg-surface-high)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
