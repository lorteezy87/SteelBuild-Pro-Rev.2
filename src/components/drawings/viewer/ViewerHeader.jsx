/**
 * Drawings-viewer command header — "you are here" bar.
 *
 * Renders two rows:
 *   1. Breadcrumb: Project › Set › Sheet — each segment clickable where
 *      it makes sense (Project → /Projects, Set → /Drawings?set=…).
 *   2. Stage pipeline: a segmented 7-stop strip (Not Started → IFC) with
 *      the active stage highlighted. Gives the user immediate context
 *      on where this sheet lives in the approval flow without having to
 *      eyeball the tiny stage chip in the sidebar.
 *
 * Dumb component: every bit of data comes in via props. The viewer page
 * passes `activeDrawing` and `projectName`.
 */

import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ChevronRight, Home } from "lucide-react";

const mono = { fontFamily: "var(--font-mono)" };

// Pipeline order + canonical labels. "Released" is labelled "IFC" for the
// end user since that's what the shop floor calls it.
const PIPELINE = [
  { key: "Not Started", label: "Not Started", color: "#6B7280" },
  { key: "OFA",         label: "OFA",         color: "#3B82F6" },
  { key: "BFA",         label: "BFA",         color: "#06B6D4" },
  { key: "OFS",         label: "OFS",         color: "#F59E0B" },
  { key: "BFS",         label: "BFS",         color: "#F97316" },
  { key: "FFF",         label: "FFF",         color: "#84CC16" },
  { key: "Released",    label: "IFC",         color: "#10B981" },
];

export default function ViewerHeader({ projectName, activeDrawing }) {
  const navigate = useNavigate();

  const setName = activeDrawing?.drawing_set_name || null;
  const setId = activeDrawing?.drawing_set_id || null;
  const sheet = activeDrawing
    ? `${activeDrawing.sheet_number}${activeDrawing.title ? ` — ${activeDrawing.title}` : ""}`
    : null;

  const currentStageIdx = activeDrawing
    ? PIPELINE.findIndex((s) => s.key === activeDrawing.stage)
    : -1;

  const revLabel =
    activeDrawing?.revision_number != null
      ? `R${activeDrawing.revision_number}`
      : null;

  return (
    <div
      style={{
        borderBottom: "1px solid var(--border-default)",
        background:
          "linear-gradient(180deg, var(--bg-sidebar) 0%, var(--bg-surface) 100%)",
        flexShrink: 0,
      }}
    >
      {/* Row 1 — breadcrumb */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 16px",
          ...mono,
          fontSize: 10,
          color: "var(--text-muted)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontWeight: 700,
          overflow: "hidden",
        }}
      >
        <button
          type="button"
          onClick={() => navigate(createPageUrl("Projects"))}
          title="All projects"
          style={crumbBtn}
        >
          <Home size={10} />
        </button>

        {projectName && (
          <>
            <ChevronRight size={10} style={{ opacity: 0.5 }} />
            <button
              type="button"
              onClick={() => navigate(createPageUrl("Projects"))}
              style={crumbBtn}
              title={projectName}
            >
              {truncate(projectName, 32)}
            </button>
          </>
        )}

        {setName && (
          <>
            <ChevronRight size={10} style={{ opacity: 0.5 }} />
            <button
              type="button"
              onClick={() =>
                setId
                  ? navigate(`${createPageUrl("Drawings")}?set=${setId}`)
                  : navigate(createPageUrl("Drawings"))
              }
              style={crumbBtn}
              title={setName}
            >
              {truncate(setName, 28)}
            </button>
          </>
        )}

        {sheet && (
          <>
            <ChevronRight size={10} style={{ opacity: 0.5 }} />
            <span
              style={{
                color: "var(--text-primary)",
                textTransform: "none",
                letterSpacing: 0,
                fontWeight: 600,
                fontSize: 11,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={sheet}
            >
              {sheet}
            </span>
            {revLabel && (
              <span
                style={{
                  marginLeft: 8,
                  padding: "1px 6px",
                  border: "1px solid var(--border-default)",
                  borderRadius: 3,
                  color: "var(--text-muted)",
                  ...mono,
                  fontSize: 9,
                }}
              >
                {revLabel}
              </span>
            )}
          </>
        )}
      </div>

      {/* Row 2 — stage pipeline */}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: 2,
          padding: "6px 16px 10px",
        }}
      >
        {PIPELINE.map((stage, i) => {
          const isActive = i === currentStageIdx;
          const isPast = currentStageIdx >= 0 && i < currentStageIdx;
          const color = stage.color;

          return (
            <div
              key={stage.key}
              style={{
                flex: 1,
                minWidth: 0,
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "4px 2px",
                borderRadius: 3,
                background: isActive
                  ? `${color}22`
                  : isPast
                  ? "var(--bg-surface-low)"
                  : "transparent",
                border: isActive
                  ? `1px solid ${color}`
                  : "1px solid transparent",
                transition: "background 0.15s, border-color 0.15s",
              }}
              title={stage.label}
            >
              <div
                style={{
                  width: "100%",
                  height: 4,
                  borderRadius: 999,
                  background: isPast || isActive ? color : "var(--border-default)",
                  opacity: isActive ? 1 : isPast ? 0.7 : 0.35,
                  marginBottom: 4,
                }}
              />
              <div
                style={{
                  ...mono,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.10em",
                  color: isActive
                    ? color
                    : isPast
                    ? "var(--text-secondary)"
                    : "var(--text-muted)",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "100%",
                }}
              >
                {stage.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const crumbBtn = {
  display: "inline-flex",
  alignItems: "center",
  gap: 3,
  background: "none",
  border: "none",
  padding: "2px 4px",
  borderRadius: 3,
  color: "var(--text-muted)",
  cursor: "pointer",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

function truncate(s, max) {
  if (!s || s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
