import React from "react";

export default function HamburgerMenu({ open, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: 40, height: 40, borderRadius: 10,
        background: "var(--hover-bg)", border: "1px solid var(--border)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 4, cursor: "pointer", flexShrink: 0,
      }}
    >
      {open ? (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round">
          <line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" />
        </svg>
      ) : (
        <>
          <div style={{ width: 16, height: 1.5, background: "var(--text-secondary)", borderRadius: 1 }} />
          <div style={{ width: 11, height: 1.5, background: "var(--text-muted)", borderRadius: 1, alignSelf: "flex-start", marginLeft: 10 }} />
          <div style={{ width: 16, height: 1.5, background: "var(--text-secondary)", borderRadius: 1 }} />
        </>
      )}
    </button>
  );
}
