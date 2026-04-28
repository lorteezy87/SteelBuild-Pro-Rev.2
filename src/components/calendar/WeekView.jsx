/**
 * WeekView — 7-column horizontal layout, full event detail per day.
 *
 * No hour rows (this is a project tracker, not a calendaring app for
 * meetings). Each column gets the day header at top and a vertical list
 * of every event for that day in wide-mode pills.
 */

import React, { useMemo } from "react";
import {
  buildWeekGrid,
  isWeekend,
  sameDay,
  toIsoDate,
  fromIsoDate,
  rangesOverlap,
  dowShort,
} from "@/lib/calendarMath";
import EventPill from "./EventPill";

export default function WeekView({ focus, today, events, onDayClick, onEventClick }) {
  const days = useMemo(() => buildWeekGrid(focus), [focus]);
  const eventsByDay = useMemo(() => {
    const map = new Map();
    for (const d of days) {
      map.set(toIsoDate(d), events.filter((ev) =>
        rangesOverlap(d, d, fromIsoDate(ev.start), fromIsoDate(ev.end || ev.start))
      ));
    }
    return map;
  }, [days, events]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        gap: 8,
        height: "100%",
        minHeight: 0,
      }}
    >
      {days.map((d) => {
        const iso = toIsoDate(d);
        const isToday = sameDay(d, today);
        const isWknd = isWeekend(d);
        const list = eventsByDay.get(iso) || [];
        return (
          <div
            key={iso}
            style={{
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              minHeight: 0,
              border: "1px solid var(--border-default)",
              borderRadius: 6,
              background: isToday
                ? "color-mix(in srgb, var(--accent) 5%, var(--bg-surface))"
                : isWknd
                ? "var(--bg-surface-low)"
                : "var(--bg-surface)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {isToday && (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0, top: 0, bottom: 0, width: 3,
                  background: "var(--accent)",
                  boxShadow: "0 0 8px var(--accent)",
                }}
              />
            )}
            <button
              onClick={() => onDayClick && onDayClick(d)}
              style={{
                width: "100%",
                padding: "10px 12px 8px",
                background: "transparent",
                border: "none",
                borderBottom: "1px solid var(--divider)",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  marginBottom: 2,
                }}
              >
                {dowShort(d)}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 22,
                  fontWeight: 700,
                  color: isToday ? "var(--accent)" : "var(--text-primary)",
                  lineHeight: 1,
                }}
              >
                {d.getDate()}
              </div>
              {list.length > 0 && (
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "var(--text-secondary)",
                    marginTop: 4,
                    letterSpacing: "0.06em",
                  }}
                >
                  {list.length} EVENT{list.length === 1 ? "" : "S"}
                </div>
              )}
            </button>
            <div
              style={{
                flex: 1,
                padding: 8,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                overflowY: "auto",
                minHeight: 0,
              }}
            >
              {list.length === 0 ? (
                <div
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 11,
                    color: "var(--text-muted)",
                    fontStyle: "italic",
                    padding: "4px 2px",
                  }}
                >
                  No events
                </div>
              ) : (
                list.map((ev) => (
                  <EventPill
                    key={ev.id}
                    event={ev}
                    mode="wide"
                    onClick={onEventClick}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
