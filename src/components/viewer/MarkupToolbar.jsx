import React, { useState } from "react";
import { MousePointer2, Minus, Square, Pencil, Type, Stamp, ArrowRight, Trash2 } from "lucide-react";

const TOOLS = [
  { id: "select",   label: "Select",    Icon: MousePointer2 },
  { id: "freehand", label: "Draw",      Icon: Pencil },
  { id: "line",     label: "Line",      Icon: Minus },
  { id: "arrow",    label: "Arrow",     Icon: ArrowRight },
  { id: "rect",     label: "Rectangle", Icon: Square },
  { id: "text",     label: "Text",      Icon: Type },
  { id: "stamp",    label: "Stamp",     Icon: Stamp },
];

const COLORS = [
  "var(--accent)", "#FF3D3D", "var(--status-warning)", "#FFE600",
  "var(--status-success)", "var(--accent)", "#8B5CF6", "#FFFFFF",
];

export default function MarkupToolbar({
  activeTool,
  onToolChange,
  activeColor,
  onColorChange,
  activeStamp,
  onStampChange,
  stamps = [],
}) {
  const [stampOpen, setStampOpen] = useState(false);

  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        top: "50%",
        transform: "translateY(-50%)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        background: "var(--bg-surface-low)",
        border: "1px solid var(--border-default)",
        borderRadius: 10,
        padding: 8,
        zIndex: 50,
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        userSelect: "none",
      }}
    >
      {/* Drawing tools */}
      {TOOLS.map(({ id, label, Icon }) => (
        <div key={id} style={{ position: "relative" }}>
          <button
            onClick={() => {
              onToolChange(id);
              if (id !== "stamp") setStampOpen(false);
              else setStampOpen((o) => !o);
            }}
            title={label}
            style={{
              width: 36,
              height: 36,
              borderRadius: 7,
              background: activeTool === id ? "var(--accent-muted)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${activeTool === id ? "var(--accent-border)" : "rgba(255,255,255,0.10)"}`,
              color: activeTool === id ? "var(--accent)" : "var(--text-secondary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.12s",
            }}
          >
            <Icon size={15} />
          </button>

          {/* Stamp picker flyout */}
          {id === "stamp" && stampOpen && (
            <div
              style={{
                position: "absolute",
                left: "calc(100% + 8px)",
                top: 0,
                background: "var(--bg-surface-low)",
                border: "1px solid var(--border-default)",
                borderRadius: 8,
                padding: 8,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                minWidth: 130,
                boxShadow: "0 8px 24px rgba(0,0,0,0.60)",
                zIndex: 60,
              }}
            >
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 7,
                color: "var(--text-muted)", letterSpacing: "0.12em",
                marginBottom: 4, paddingLeft: 2,
              }}>SELECT STAMP</div>
              {stamps.map((stamp) => (
                <button
                  key={stamp.id}
                  onClick={() => { onStampChange(stamp); setStampOpen(false); onToolChange("stamp"); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 8px",
                    background: activeStamp?.id === stamp.id ? `${stamp.color}22` : "transparent",
                    border: `1px solid ${activeStamp?.id === stamp.id ? stamp.color + "55" : "transparent"}`,
                    borderRadius: 5, cursor: "pointer",
                    color: stamp.color,
                    fontFamily: "var(--font-mono)", fontSize: 9,
                    fontWeight: 700, letterSpacing: "0.10em",
                    whiteSpace: "nowrap",
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: 2, border: `2px solid ${stamp.color}` }} />
                  {stamp.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Divider */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "2px 0" }} />

      {/* Color swatches */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {COLORS.map((color) => (
          <button
            key={color}
            onClick={() => onColorChange(color)}
            title={color}
            style={{
              width: 22,
              height: 22,
              borderRadius: 5,
              background: color,
              border: activeColor === color
                ? "2px solid #fff"
                : "1px solid rgba(255,255,255,0.15)",
              cursor: "pointer",
              alignSelf: "center",
              transition: "transform 0.1s",
              transform: activeColor === color ? "scale(1.15)" : "scale(1)",
            }}
          />
        ))}
      </div>

      {/* Active color preview */}
      <div style={{
        width: 22, height: 22, borderRadius: 5,
        background: activeColor,
        border: "2px solid rgba(255,255,255,0.30)",
        alignSelf: "center",
        marginTop: 2,
        boxShadow: `0 0 8px ${activeColor}88`,
      }} />
    </div>
  );
}