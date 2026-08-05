import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import {
  extractDetails,
  URGENCY_COLORS,
  PAGE_FOR_TYPE,
} from "./itemDetailDrawerHelpers";

/**
 * Slide-out detail drawer for a single feed item.
 * Opens from the right side. Fixed header + scrollable body + pinned footer.
 */

const Row = ({ label, value }) => {
  if (value == null || value === "") return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid var(--divider)" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)", textAlign: "right", maxWidth: "60%", wordBreak: "break-word" }}>
        {value}
      </span>
    </div>
  );
};

export default function ItemDetailDrawer({ item, onClose }) {
  const navigate = useNavigate();
  const drawerRef = useRef(null);

  useEffect(() => {
    if (item) drawerRef.current?.focus();
  }, [item]);

  if (!item) return null;

  const barColor = URGENCY_COLORS[item.urgency] || "var(--border-default)";
  const details = extractDetails(item);

  // Resolve a navigation target for the "Go to item" button. Prefer the feed
  // item's own quickAction.route (the legacy command-center path supplies it),
  // else derive one from the item's type + project — the canonical presentation path's
  // ActionItems don't carry quickAction, which is why the button used to be a
  // permanent no-op there. Routes map to the page registry (src/config/routes.js).
  const targetRoute = (() => {
    if (item.quickAction?.route) return item.quickAction.route;
    const page = PAGE_FOR_TYPE[item.itemType];
    const pid = item.projectId || item.raw?.project_id || item.project_id;
    return page && pid ? `/${page}?project=${pid}` : null;
  })();

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          zIndex: 1100,
        }}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        className="sbd-sidebar"
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: 420,
          maxWidth: "90vw",
          height: "100vh",
          minWidth: 0,
          background: "var(--bg-surface-secondary)",
          borderLeft: "1px solid var(--border-default)",
          padding: 0,
          zIndex: 1101,
          display: "flex",
          flexDirection: "column",
          outline: "none",
        }}
      >
        {/* Header (fixed) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "16px 20px",
            borderBottom: "1px solid var(--divider)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 4,
              height: 28,
              borderRadius: 2,
              background: barColor,
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "'Space Grotesk', var(--font-display)",
                fontSize: 14,
                fontWeight: 700,
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {item.title}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: barColor,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginTop: 2,
              }}
            >
              {item.urgency} — {item.displayStatus || item.status}
            </div>
          </div>
          <button
            className="sbd-btn-ghost"
            onClick={onClose}
            aria-label="Close detail drawer"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 4,
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body (scrollable) */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {details.map((d, i) => (
            <Row key={i} label={d.label} value={d.value} />
          ))}
        </div>

        {/* Footer (pinned) */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--divider)",
            display: "flex",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <button
            className="sbd-btn-primary"
            onClick={() => { if (targetRoute) navigate(targetRoute); }}
            disabled={!targetRoute}
            style={{
              flex: 1,
              background: "var(--accent)",
              border: "none",
              borderRadius: 4,
              padding: "8px 16px",
              color: "white",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              cursor: targetRoute ? "pointer" : "not-allowed",
              opacity: targetRoute ? 1 : 0.5,
            }}
          >
            {item.quickAction?.label || "Go to Item"}
          </button>
          <button
            className="sbd-btn-ghost"
            onClick={onClose}
            style={{
              background: "var(--bg-surface-low)",
              border: "1px solid var(--border-default)",
              borderRadius: 4,
              padding: "8px 16px",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}
