import React from "react";
import { base44 } from "@/api/base44Client";

/**
 * Right-click context menu for a work-package bar. Lets the PM
 * reassign the WP to any resource or unassign it outright. The menu
 * is a plain fixed-position div so it escapes the timeline's scroll
 * container without portal gymnastics.
 */
export default function WPContextMenu({
  contextMenu,
  resources = [],
  qc,
  onClose,
  onToast,
}) {
  if (!contextMenu) return null;

  const { wp, x, y } = contextMenu;

  const reassign = async (res) => {
    await base44.entities.WorkPackage.update(wp.id, { crew: res.name });
    qc.invalidateQueries({ queryKey: ["work-packages"] });
    qc.invalidateQueries({ queryKey: ["wps-all"] });
    onClose();
    onToast?.(`${wp.wp_number} → ${res.name}`);
  };

  const unassign = async () => {
    await base44.entities.WorkPackage.update(wp.id, { crew: "", released_date: null });
    qc.invalidateQueries({ queryKey: ["work-packages"] });
    qc.invalidateQueries({ queryKey: ["wps-all"] });
    onClose();
    onToast?.(`${wp.wp_number} unassigned`);
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed", left: x, top: y,
        background: "var(--bg-surface-low)", border: "1px solid var(--border-default)",
        borderRadius: 8, padding: "4px 0", zIndex: 10000,
        boxShadow: "0 8px 32px rgba(0,0,0,0.7)", minWidth: 200,
      }}
    >
      <div style={{
        padding: "6px 12px",
        fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)",
        letterSpacing: "0.12em", borderBottom: "1px solid var(--divider)", marginBottom: 4,
      }}>
        {wp.wp_number} — {wp.name}
      </div>
      <div style={{
        padding: "2px 12px 4px",
        fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
        letterSpacing: "0.10em", textTransform: "uppercase",
      }}>
        Reassign to
      </div>

      {resources.map((res) => {
        const isCurrent = wp.crew === res.name;
        return (
          <button
            key={res.id}
            onClick={() => reassign(res)}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(245,158,11,0.10)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = isCurrent ? "var(--accent-muted)" : "transparent")}
            style={{
              display: "block", width: "100%", padding: "7px 12px", textAlign: "left",
              background: isCurrent ? "var(--accent-muted)" : "transparent",
              border: "none", color: "var(--text-primary)",
              fontFamily: "var(--font-body)", fontSize: 11, cursor: "pointer",
            }}
          >
            {res.name}{" "}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
              ({res.role})
            </span>
          </button>
        );
      })}

      <div style={{ borderTop: "1px solid var(--divider)", margin: "4px 0" }} />

      <button
        onClick={unassign}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,23,68,0.08)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        style={{
          display: "block", width: "100%", padding: "7px 12px", textAlign: "left",
          background: "transparent", border: "none", color: "#FF3D3D",
          fontFamily: "var(--font-body)", fontSize: 11, cursor: "pointer",
        }}
      >
        Unassign
      </button>
    </div>
  );
}
