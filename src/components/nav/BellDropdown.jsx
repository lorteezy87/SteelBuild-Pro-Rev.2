import React, { useState, useEffect, useRef } from "react";
import { SEVERITY_COLOR, timeAgo } from "@/config/moduleRegistry";

export default function BellDropdown({ alerts, unreadCount, onMarkAllRead, onViewAll }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const recent = alerts.slice(0, 8);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          width: 32, height: 32, borderRadius: 8,
          background: open ? "var(--accent-muted)" : "var(--hover-bg)",
          border: `1px solid ${open ? "var(--accent-border)" : "var(--border)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", position: "relative", transition: "all 0.15s",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill={open ? "var(--accent)" : "var(--text-muted)"}>
          <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: 3, right: 3,
            background: "var(--status-error)", borderRadius: 8,
            minWidth: 14, height: 14,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
            color: "white", padding: "0 3px",
            boxShadow: "0 0 6px var(--status-error)80", lineHeight: 1,
          }}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </div>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          width: 320,
          background: "var(--bg-surface-secondary)", border: "1px solid var(--border-default)",
          borderTop: "2px solid var(--accent)", borderRadius: 12,
          boxShadow: "var(--shadow-lg)", zIndex: 2000, overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--divider)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-primary)", fontWeight: 700, letterSpacing: "0.08em" }}>ALERTS</span>
              {unreadCount > 0 && (
                <span style={{ background: "var(--status-error)", color: "white", borderRadius: 10, padding: "1px 6px", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700 }}>
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button onClick={onMarkAllRead} style={{
                fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--accent)",
                letterSpacing: "0.08em", background: "none", border: "none",
                cursor: "pointer", padding: "2px 6px", borderRadius: 4, transition: "background 0.1s",
              }}>
                MARK ALL READ
              </button>
            )}
          </div>

          {/* Alert list */}
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {recent.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>No unread alerts</div>
            ) : (
              recent.map((a) => <AlertRow key={a.id} alert={a} />)
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: "8px 14px", borderTop: "1px solid var(--divider)", display: "flex", justifyContent: "flex-end" }}>
            <button onClick={() => { onViewAll(); setOpen(false); }} style={{
              fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)",
              letterSpacing: "0.08em", background: "none", border: "none",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
            }}>
              VIEW ALL ALERTS &rarr;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AlertRow({ alert }) {
  const color = SEVERITY_COLOR[alert.severity] || "var(--text-muted)";
  return (
    <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--divider)", display: "flex", gap: 8, alignItems: "flex-start" }}>
      <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 4, boxShadow: `0 0 5px ${color}88` }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alert.title}</div>
        {alert.project_name && <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", letterSpacing: "0.06em", marginTop: 1 }}>{alert.project_name}</div>}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", whiteSpace: "nowrap", flexShrink: 0, marginTop: 2 }}>{timeAgo(alert.created_date)}</div>
    </div>
  );
}
