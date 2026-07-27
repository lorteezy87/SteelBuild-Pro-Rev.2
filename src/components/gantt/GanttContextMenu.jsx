import React, { useEffect, useRef } from "react";

const MENU_WIDTH = 240;
const ITEM_HEIGHT = 30;
const SEP_HEIGHT = 1;
const PADDING_V = 6;

function clampPosition(x, y, itemCount, sepCount) {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const h = PADDING_V * 2 + itemCount * ITEM_HEIGHT + sepCount * SEP_HEIGHT;
  return {
    left: Math.min(x, vw - MENU_WIDTH - 8),
    top: Math.min(y, vh - h - 8),
  };
}

export default function GanttContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    // Only close on LEFT-button mousedown outside the menu. Right-clicks
    // elsewhere must be allowed to reach the row's onContextMenu handler,
    // which will reposition this menu to the new target.
    const onDown = (e) => {
      if (e.button !== 0) return;
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    const onScroll = () => onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  const itemCount = items.filter((i) => i.type !== "sep").length;
  const sepCount = items.filter((i) => i.type === "sep").length;
  const { left, top } = clampPosition(x, y, itemCount, sepCount);

  return (
    <div
      ref={ref}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        left,
        top,
        width: MENU_WIDTH,
        background: "var(--bg-surface-low)",
        border: "1px solid var(--accent-border)",
        borderRadius: 6,
        padding: `${PADDING_V}px 0`,
        boxShadow: "var(--shadow-lg)",
        zIndex: 1000,
        fontFamily: "var(--font-body)",
      }}
    >
      {items.map((item, idx) => {
        if (item.type === "sep") {
          return (
            <div
              key={`sep-${idx}`}
              style={{ height: 1, background: "var(--divider)", margin: "4px 8px" }}
            />
          );
        }
        const disabled = !!item.disabled;
        return (
          <button
            key={item.label}
            onClick={() => {
              if (disabled) return;
              onClose();
              item.onClick?.();
            }}
            disabled={disabled}
            role="menuitem"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              height: ITEM_HEIGHT,
              padding: "0 12px",
              background: "transparent",
              border: "none",
              cursor: disabled ? "not-allowed" : "pointer",
              color: disabled
                ? "var(--text-muted)"
                : item.danger
                ? "var(--status-error)"
                : "var(--text-primary)",
              fontFamily: "var(--font-body)",
              fontSize: 12,
              textAlign: "left",
              opacity: disabled ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!disabled) e.currentTarget.style.background = "var(--hover-bg)";
            }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {item.icon && (
                <span style={{ width: 14, fontSize: 11, lineHeight: 1, color: "var(--text-muted)" }}>
                  {item.icon}
                </span>
              )}
              {item.label}
            </span>
            {item.shortcut && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.05em" }}>
                {item.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
