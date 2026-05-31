/**
 * Floating toolbar for drawing markup — tool picker + color swatch.
 *
 * Anchored to the top-left of the canvas viewport so it's always
 * accessible without needing to scroll. Keeps the tool state owned by
 * the parent (DrawingViewer) so keyboard shortcuts and the toolbar
 * always agree.
 */

import React, { useState } from "react";
import { MousePointer2, Pencil, Square, ArrowUpRight, StickyNote, Highlighter, Ruler, Scaling, Trash2, X } from "lucide-react";

const mono = { fontFamily: "var(--font-mono)" };

export const MARKUP_COLORS = [
  { value: "#FF3D3D", label: "Red" },
  { value: "#FFB347", label: "Orange" },
  { value: "#F5D547", label: "Yellow" },
  { value: "#3DCC5C", label: "Green" },
  { value: "#3B82F6", label: "Blue" },
  { value: "#111111", label: "Black" },
];

export const MARKUP_TOOLS = [
  { key: "select",    label: "Select",     shortcut: "V", icon: MousePointer2 },
  { key: "pen",       label: "Redline",    shortcut: "P", icon: Pencil },
  { key: "rect",      label: "Rect",       shortcut: "B", icon: Square },
  // Highlight drags like rect but commits with a translucent fill and
  // no stroke — lets users mark up large areas without obscuring the PDF.
  { key: "highlight", label: "Highlight",  shortcut: "H", icon: Highlighter },
  { key: "arrow",     label: "Arrow",      shortcut: "A", icon: ArrowUpRight },
  // Measure is two-click: first click anchors, second click commits a
  // line + live distance label. Persists so a review partner can see it.
  { key: "measure",   label: "Measure",    shortcut: "M", icon: Ruler },
  // Calibrate — identical gesture to measure but on commit prompts for
  // the real-world distance between the two picked points, and stores
  // the resulting scale factor on the drawing row. Every subsequent
  // measurement reads that scale to render real feet-inches.
  { key: "calibrate", label: "Calibrate",  shortcut: "K", icon: Scaling },
  { key: "note",      label: "Note",       shortcut: "T", icon: StickyNote },
];

export default function AnnotationToolbar({
  activeTool,
  onToolChange,
  activeColor,
  onColorChange,
  markupCount,
  onClearPage,
  saving,
  saveError,
}) {
  // Collapsed by default so the markup palette doesn't sit on top of the
  // drawing while the user is just reviewing. It auto-expands the moment a
  // markup tool is active (chosen by mouse OR keyboard shortcut), and the
  // user can pin/close it manually. Keeps the sheet clean for plain viewing
  // while leaving markup one click away.
  const [expanded, setExpanded] = useState(false);
  const open = expanded || activeTool !== "select";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        title="Markup tools (V select · P redline · B box · A arrow · M measure · T note)"
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 10,
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          background: "rgba(17,22,30,0.92)",
          border: "1px solid var(--border-strong)",
          borderRadius: 6,
          padding: "7px 11px",
          boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
          backdropFilter: "blur(3px)",
          color: "var(--text-secondary)",
          cursor: "pointer",
          ...mono,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        <Pencil size={14} />
        Markup
        {markupCount > 0 && (
          <span
            style={{
              ...mono,
              fontSize: 9,
              fontWeight: 700,
              color: "var(--accent-text)",
              background: "var(--accent)",
              borderRadius: 999,
              padding: "1px 6px",
              lineHeight: 1.4,
            }}
          >
            {markupCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        background: "rgba(17,22,30,0.92)",
        border: "1px solid var(--border-strong)",
        borderRadius: 6,
        padding: 6,
        boxShadow: "0 6px 18px rgba(0,0,0,0.55)",
        backdropFilter: "blur(3px)",
      }}
    >
      {/* Tool buttons */}
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {MARKUP_TOOLS.map((tool) => {
          const Icon = tool.icon;
          const active = activeTool === tool.key;
          return (
            <button
              key={tool.key}
              type="button"
              onClick={() => onToolChange(tool.key)}
              title={`${tool.label} (${tool.shortcut})`}
              style={{
                width: 32,
                height: 32,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: active ? "var(--accent)" : "var(--bg-surface-low)",
                color: active ? "var(--accent-text)" : "var(--text-secondary)",
                border: `1px solid ${active ? "var(--accent)" : "var(--border-default)"}`,
                borderRadius: 4,
                cursor: "pointer",
                padding: 0,
                transition: "background 0.12s, color 0.12s",
              }}
            >
              <Icon size={15} />
            </button>
          );
        })}
        {/* Collapse — return to plain viewing (select tool + hide palette) */}
        <button
          type="button"
          onClick={() => { onToolChange("select"); setExpanded(false); }}
          title="Close markup tools"
          style={{
            width: 28,
            height: 32,
            marginLeft: 2,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            color: "var(--text-muted)",
            border: "1px solid var(--border-default)",
            borderRadius: 4,
            cursor: "pointer",
            padding: 0,
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Color swatches */}
      <div style={{ display: "flex", gap: 4, alignItems: "center", padding: "2px 0" }}>
        {MARKUP_COLORS.map((c) => {
          const active = activeColor === c.value;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => onColorChange(c.value)}
              title={c.label}
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: c.value,
                border: active ? "2px solid var(--accent)" : "1px solid rgba(255,255,255,0.25)",
                cursor: "pointer",
                padding: 0,
                boxShadow: active ? "0 0 0 2px rgba(200,155,32,0.35)" : "none",
              }}
            />
          );
        })}
      </div>

      {/* Status + clear */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          paddingTop: 4,
          borderTop: "1px solid var(--divider)",
        }}
      >
        <span
          style={{
            ...mono,
            fontSize: 9,
            color: saveError ? "var(--status-error)" : "var(--text-muted)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            flex: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={saveError || ""}
        >
          {saveError ? "⚠ SAVE FAILED" : saving ? "SAVING…" : `${markupCount} ON PAGE`}
        </span>
        <button
          type="button"
          onClick={onClearPage}
          disabled={markupCount === 0}
          title="Clear all markup on this page"
          style={{
            width: 22,
            height: 22,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "none",
            color: markupCount === 0 ? "var(--text-muted)" : "var(--status-error)",
            border: `1px solid ${markupCount === 0 ? "var(--border-default)" : "rgba(255,61,61,0.35)"}`,
            borderRadius: 3,
            cursor: markupCount === 0 ? "not-allowed" : "pointer",
            opacity: markupCount === 0 ? 0.4 : 1,
            padding: 0,
          }}
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}
