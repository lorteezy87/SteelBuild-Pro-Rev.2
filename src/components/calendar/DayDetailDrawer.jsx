/**
 * DayDetailDrawer — right-side slide-in showing every event for one day.
 *
 * Reused from Month view's day click + the "+N more" overflow link.
 * Same visual language as the Day view, just embedded in a slim 420px
 * panel that overlays the calendar without unmounting it.
 */

import React, { useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { fromIsoDate, rangesOverlap, formatLongDate } from "@/lib/calendarMath";
import { EVENT_TYPE_GROUPS } from "@/lib/calendarEvents";
import EventPill from "./EventPill";

export default function DayDetailDrawer({ day, events, onClose, onEventClick, onJumpToDay }) {
  const list = useMemo(() => {
    if (!day) return [];
    return events.filter((ev) =>
      rangesOverlap(day, day, fromIsoDate(ev.start), fromIsoDate(ev.end || ev.start))
    );
  }, [day, events]);

  const grouped = useMemo(() => {
    const map = new Map();
    EVENT_TYPE_GROUPS.forEach((g) => map.set(g.key, []));
    list.forEach((ev) => {
      const arr = map.get(ev.type) || [];
      arr.push(ev);
      map.set(ev.type, arr);
    });
    return map;
  }, [list]);

  // Esc to close
  useEffect(() => {
    if (!day) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [day, onClose]);

  if (!day) return null;

  return (
    <>
      {/* Scrim — click to dismiss */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.42)",
          backdropFilter: "blur(2px)",
          zIndex: 80,
        }}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label={`Events for ${formatLongDate(day)}`}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 440,
          maxWidth: "92vw",
          background: "var(--bg-elevated, var(--bg-surface))",
          borderLeft: "1px solid var(--border-default)",
          boxShadow: "-12px 0 40px rgba(0,0,0,0.45)",
          zIndex: 81,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 18px",
            borderBottom: "1px solid var(--divider)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.16em",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              {list.length} EVENT{list.length === 1 ? "" : "S"}
            </div>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 19,
                fontWeight: 800,
                margin: 0,
                color: "var(--text-primary)",
                lineHeight: 1.2,
              }}
            >
              {formatLongDate(day)}
            </h2>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {onJumpToDay && (
              <button
                onClick={() => onJumpToDay(day)}
                title="Open this day in Day view"
                style={{
                  height: 30,
                  padding: "0 12px",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 5,
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: "var(--accent)",
                  textTransform: "uppercase",
                }}
              >
                Open Day
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                width: 30,
                height: 30,
                background: "transparent",
                border: "1px solid var(--border-default)",
                borderRadius: 5,
                cursor: "pointer",
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {list.length === 0 && (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                fontFamily: "var(--font-body)",
                fontSize: 13,
                color: "var(--text-muted)",
              }}
            >
              No events on this day.
            </div>
          )}
          {EVENT_TYPE_GROUPS.map((group) => {
            const items = grouped.get(group.key) || [];
            if (items.length === 0) return null;
            return (
              <section key={group.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    aria-hidden
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: group.color,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.18em",
                      color: "var(--text-secondary)",
                      textTransform: "uppercase",
                    }}
                  >
                    {group.label} · {items.length}
                  </span>
                </header>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {items.map((ev) => (
                    <EventPill key={ev.id} event={ev} mode="wide" onClick={onEventClick} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </aside>
    </>
  );
}
