import React from "react";

/**
 * OfflineOutboxIndicator — app-wide field-sync status.
 *
 * Renders nothing until it has something to say (offline, or captures waiting
 * to sync), so it never clutters the UI online with an empty queue. Floats
 * bottom-centre above the iOS home-indicator safe-area. Themed with CSS vars
 * only (design system). Fed by the single OutboxProvider so the count is
 * accurate no matter which page the foreman is on.
 */
export default function OfflineOutboxIndicator({ pending = 0, online = true, onSync }) {
  const show = !online || pending > 0;
  if (!show) return null;

  const changes = `${pending} change${pending === 1 ? "" : "s"}`;
  const label = !online
    ? pending > 0
      ? `Offline · ${changes} queued`
      : "Offline — captures will sync when you reconnect"
    : `${changes} waiting to sync`;

  const edge = online ? "var(--accent)" : "var(--warning)";

  return (
    <div
      role="status"
      aria-live="polite"
      className="field-outbox-indicator"
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: "max(12px, env(safe-area-inset-bottom))",
        zIndex: 800,
        display: "flex",
        alignItems: "center",
        gap: 10,
        maxWidth: "calc(100vw - 24px)",
        padding: "8px 14px",
        borderRadius: 8,
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        fontWeight: 700,
        color: "var(--text-primary)",
        background: "var(--bg-surface)",
        border: `1px solid ${edge}`,
        boxShadow: "0 12px 28px rgba(0, 0, 0, 0.36)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          flex: "0 0 8px",
          background: edge,
        }}
      />
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      {online && pending > 0 && typeof onSync === "function" && (
        <button
          type="button"
          onClick={onSync}
          style={{
            minHeight: 32,
            padding: "4px 10px",
            borderRadius: 6,
            border: "1px solid var(--accent)",
            background: "var(--accent-muted)",
            color: "var(--accent)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 800,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          SYNC NOW
        </button>
      )}
    </div>
  );
}
