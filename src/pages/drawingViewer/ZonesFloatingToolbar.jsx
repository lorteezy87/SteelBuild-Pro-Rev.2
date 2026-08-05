import React from "react";
import { mono } from "@/pages/drawingViewer/drawingViewerUtils";

// Floating top-right zone-mode toolbar. Three-state OFF/VIEW/DRAW
// switcher plus the heat / deps / shape / proposals / +rev mini-buttons
// that flank it. Pure presentation — every piece of state is owned by
// DrawingViewer and passed in by prop. Visibility (the wrapper conditional
// `activeDrawing?.file_url && renderMode === "canvas" && !pdfError`)
// stays in the parent so we don't render a wrapper at all when the canvas
// path isn't mounted.
//
// DOM and inline styles are byte-identical to the JSX block this replaces.
export default function ZonesFloatingToolbar({
  zoneMode,
  setZoneMode,
  setSelectedZoneId,
  filteredZones,
  zones,
  zoneOverlay,
  setZoneOverlay,
  showDeps,
  setShowDeps,
  drawShape,
  setDrawShape,
  activeDrawing,
  proposalPanelOpen,
  setProposalPanelOpen,
  pendingProposalCount,
  currentRevision,
  handleNewRevision,
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 10,
        right: 12,
        zIndex: 40,
        display: "flex",
        gap: 6,
        padding: 4,
        borderRadius: 6,
        background: "color-mix(in srgb, var(--bg-surface-lowest) 72%, transparent)",
        border: "1px solid var(--border-default)",
        backdropFilter: "blur(6px)",
        fontFamily: "var(--font-mono)",
      }}
      title="Zones: rectangular coordination areas linked to RFIs / WPs / deliveries."
    >
      {[
        { id: "off",  label: "OFF",   desc: "Hide zone overlay" },
        { id: "view", label: `VIEW${filteredZones.length ? ` · ${filteredZones.length}` : ""}`, desc: "Show zones · click to select" },
        { id: "draw", label: "DRAW",  desc: "Drag-create a new zone" },
      ].map((btn) => {
        const isActive = zoneMode === btn.id;
        return (
          <button
            key={btn.id}
            onClick={() => { setZoneMode(btn.id); setSelectedZoneId(null); }}
            title={btn.desc}
            style={{
              padding: "5px 10px",
              border: `1px solid ${isActive ? "var(--status-info)" : "transparent"}`,
              background: isActive
                ? "color-mix(in srgb, var(--status-info) 14%, transparent)"
                : "transparent",
              color: isActive ? "var(--status-info)" : "var(--text-muted)",
              borderRadius: 3,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.10em",
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            {btn.label}
          </button>
        );
      })}
      {/* Heatmap overlay toggle — only useful when there are
          zones to recolor. In VIEW mode it swaps the status
          palette for a density-weighted cool→amber→red ramp so
          hot zones on the sheet jump out at a glance. Hidden
          in OFF + DRAW because there's nothing to recolor. */}
      {zoneMode === "view" && zones.length > 0 && (
        <button
          onClick={() => setZoneOverlay((v) => (v === "heatmap" ? "status" : "heatmap"))}
          title={zoneOverlay === "heatmap"
            ? "Switch back to status colors"
            : "Heatmap: recolor zones by weighted issue density (overdue RFIs, failed inspections, blocked WPs, late deliveries)"}
          style={{
            padding: "5px 10px",
            border: `1px solid ${zoneOverlay === "heatmap" ? "var(--status-error)" : "transparent"}`,
            background: zoneOverlay === "heatmap"
              ? "color-mix(in srgb, var(--status-error) 14%, transparent)"
              : "transparent",
            color: zoneOverlay === "heatmap" ? "var(--status-error)" : "var(--text-muted)",
            borderRadius: 3,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.10em",
            cursor: "pointer",
            textTransform: "uppercase",
            marginLeft: 4,
          }}
        >
          HEAT
        </button>
      )}

      {/* V3.1 — DEPS overlay toggle. Renders directed dependency
          arrows between zones (red=blocks, amber=depends_on,
          gray dashed=relates_to). Cross-sheet edges show as a
          "→ Sheet X" pill instead of an arrow. Hidden in OFF
          mode because there are no zone shapes to anchor
          arrows to. */}
      {zoneMode !== "off" && (
        <button
          onClick={() => setShowDeps((v) => !v)}
          title={showDeps
            ? "Hide dependency arrows"
            : "Show directed dependency arrows between zones (V3.1)"}
          style={{
            padding: "5px 10px",
            border: `1px solid ${showDeps ? "var(--status-warning)" : "transparent"}`,
            background: showDeps
              ? "color-mix(in srgb, var(--status-warning) 14%, transparent)"
              : "transparent",
            color: showDeps ? "var(--status-warning)" : "var(--text-muted)",
            borderRadius: 3,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.10em",
            cursor: "pointer",
            textTransform: "uppercase",
            marginLeft: 4,
          }}
        >
          DEPS
        </button>
      )}

      {/* Shape chooser — only relevant while DRAW is active.
          Rectangle is fastest (drag) and polygon is for
          irregular zones like erection bays or stair cores.
          Hidden outside of DRAW mode to keep the toolbar quiet. */}
      {zoneMode === "draw" && (
        <div
          role="group"
          aria-label="Zone shape"
          style={{
            display: "flex",
            gap: 4,
            marginLeft: 4,
            paddingLeft: 6,
            borderLeft: "1px solid var(--border-default)",
          }}
          title="Shape to draw"
        >
          {[
            { id: "rect",    label: "▭", desc: "Rectangle — drag to create" },
            { id: "polygon", label: "⬠", desc: "Polygon — click to add vertices, Enter/double-click to finish, Esc to cancel" },
          ].map((s) => {
            const isActive = drawShape === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setDrawShape(s.id)}
                title={s.desc}
                style={{
                  padding: "5px 8px",
                  border: `1px solid ${isActive ? "var(--status-info)" : "transparent"}`,
                  background: isActive
                    ? "color-mix(in srgb, var(--status-info) 14%, transparent)"
                    : "transparent",
                  color: isActive ? "var(--status-info)" : "var(--text-muted)",
                  borderRadius: 3,
                  fontSize: 12,
                  lineHeight: 1,
                  cursor: "pointer",
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      {/* V3.0 — Proposals drawer launcher. Always visible in
          zone-mode so a PM can review AI-suggested zones without
          needing to draw any zones first. Badge shows pending
          count on this drawing. */}
      {activeDrawing && (
        <button
          onClick={() => setProposalPanelOpen((v) => !v)}
          title="Open the AI proposals drawer — zones suggested by clustering analyzer findings"
          style={{
            padding: "5px 10px",
            border: `1px solid ${proposalPanelOpen ? "var(--status-info)" : "transparent"}`,
            background: proposalPanelOpen
              ? "color-mix(in srgb, var(--status-info) 14%, transparent)"
              : pendingProposalCount > 0 ? "color-mix(in srgb, var(--status-info) 6%, transparent)" : "transparent",
            color: proposalPanelOpen || pendingProposalCount > 0 ? "var(--status-info)" : "var(--text-muted)",
            borderRadius: 3,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.10em",
            cursor: "pointer",
            textTransform: "uppercase",
            marginLeft: 4,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          PROPOSALS
          {pendingProposalCount > 0 && (
            <span style={{
              ...mono,
              fontSize: 9,
              padding: "1px 5px",
              borderRadius: 8,
              background: "var(--accent)",
              color: "var(--on-accent)",
            }}>
              {pendingProposalCount}
            </span>
          )}
        </button>
      )}

      {/* Revision carry-forward — only offered when there's at
          least one zone to carry. Invisible on a brand-new
          sheet so the chrome stays quiet. */}
      {currentRevision && zones.length > 0 && (
        <button
          onClick={handleNewRevision}
          title={`Create a new revision of ${activeDrawing?.sheet_number || "this sheet"} — zones will be copied forward.`}
          style={{
            padding: "5px 10px",
            border: "1px dashed var(--accent)",
            background: "transparent",
            color: "var(--accent)",
            borderRadius: 3,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.10em",
            cursor: "pointer",
            textTransform: "uppercase",
            marginLeft: 4,
          }}
        >
          + Rev
        </button>
      )}
    </div>
  );
}
