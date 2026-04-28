/**
 * MonthView — 6-week × 7-day calendar grid.
 *
 * Day cells:
 *   - Tall (~150px) so 3-4 events fit comfortably with breathing room.
 *   - Today gets a left rail in --accent + a subtle tint.
 *   - Weekends get a slightly darker background so weeks visually break.
 *   - Days outside the focused month are dimmed.
 *   - Top 3 events render as compact pills; "+N more" link expands the
 *     day in the side drawer.
 *   - Clicking the day number / empty area opens the day drawer too.
 */

import React, { useMemo } from "react";
import {
  buildMonthGrid,
  inSameMonth,
  isWeekend,
  sameDay,
  toIsoDate,
  fromIsoDate,
  rangesOverlap,
  dowShort,
} from "@/lib/calendarMath";
import EventPill from "./EventPill";

const MAX_VISIBLE = 3;
const DAY_HEADERS_SUN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAY_HEADERS_MON = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export default function MonthView({ focus, today, events, onDayClick, onEventClick, weekStart = "sunday" }) {
  const days = useMemo(() => buildMonthGrid(focus, weekStart), [focus, weekStart]);
  const DAY_HEADERS = weekStart === "monday" ? DAY_HEADERS_MON : DAY_HEADERS_SUN;

  // Pre-bucket events by ISO date for fast lookup. A multi-day event
  // ends up in every day it spans — that's deliberate so it shows up on
  // each day cell of the month grid.
  const eventsByDay = useMemo(() => {
    const map = new Map();
    for (const d of days) {
      const iso = toIsoDate(d);
      const list = events.filter((ev) =>
        rangesOverlap(d, d, fromIsoDate(ev.start), fromIsoDate(ev.end || ev.start))
      );
      map.set(iso, list);
    }
    return map;
  }, [days, events]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* DOW header row */}
      <div
        className="calendar-dow-header"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          background: "var(--bg-surface-low)",
          borderTop: "1px solid var(--border-default)",
          borderLeft: "1px solid var(--border-default)",
          borderRight: "1px solid var(--border-default)",
          borderTopLeftRadius: 6,
          borderTopRightRadius: 6,
        }}
      >
        {DAY_HEADERS.map((d) => (
          <div
            key={d}
            style={{
              padding: "8px 10px",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.16em",
              color: "var(--text-muted)",
              textAlign: "left",
              borderRight: "1px solid var(--divider)",
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 6 × 7 grid */}
      <div
        className="calendar-month-grid"
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gridTemplateRows: "repeat(6, minmax(150px, 1fr))",
          border: "1px solid var(--border-default)",
          borderTop: "none",
          borderBottomLeftRadius: 6,
          borderBottomRightRadius: 6,
          background: "var(--bg-surface)",
        }}
      >
        {days.map((d, i) => {
          const iso = toIsoDate(d);
          const inMonth = inSameMonth(d, focus);
          const isToday = sameDay(d, today);
          const isWknd = isWeekend(d);
          const dayEvents = eventsByDay.get(iso) || [];
          const visible = dayEvents.slice(0, MAX_VISIBLE);
          const overflow = dayEvents.length - visible.length;
          const col = i % 7;
          const row = Math.floor(i / 7);

          return (
            <div
              key={iso}
              role="button"
              tabIndex={0}
              onClick={() => onDayClick && onDayClick(d)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onDayClick && onDayClick(d);
                }
              }}
              className="calendar-day-cell"
              style={{
                position: "relative",
                padding: "6px 6px 4px",
                background: isToday
                  ? "color-mix(in srgb, var(--accent) 6%, var(--bg-surface))"
                  : isWknd
                  ? "var(--bg-surface-low)"
                  : "var(--bg-surface)",
                opacity: inMonth ? 1 : 0.45,
                borderRight: col < 6 ? "1px solid var(--divider)" : "none",
                borderTop: row > 0 ? "1px solid var(--divider)" : "none",
                cursor: "pointer",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                gap: 3,
                minHeight: 0,
                transition: "background 120ms",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isToday
                  ? "color-mix(in srgb, var(--accent) 10%, var(--bg-surface))"
                  : "color-mix(in srgb, var(--text-primary) 4%, var(--bg-surface))";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isToday
                  ? "color-mix(in srgb, var(--accent) 6%, var(--bg-surface))"
                  : isWknd
                  ? "var(--bg-surface-low)"
                  : "var(--bg-surface)";
              }}
            >
              {/* Today's left rail */}
              {isToday && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 3,
                    background: "var(--accent)",
                    boxShadow: "0 0 8px var(--accent)",
                  }}
                />
              )}

              {/* Day number */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingLeft: 2,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: isToday ? 14 : 12,
                    fontWeight: isToday ? 700 : 500,
                    color: isToday
                      ? "var(--accent)"
                      : inMonth
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                    letterSpacing: "0.02em",
                  }}
                >
                  {d.getDate()}
                </span>
                {/* On the 1st of a non-focus month, also show short month name */}
                {d.getDate() === 1 && !inMonth && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      color: "var(--text-muted)",
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                    }}
                  >
                    {dowShort(d) /* placeholder so layout stays consistent */}
                  </span>
                )}
              </div>

              {/* Event pills */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  flex: 1,
                  minHeight: 0,
                  overflow: "hidden",
                }}
              >
                {visible.map((ev) => (
                  <EventPill
                    key={ev.id}
                    event={ev}
                    mode="compact"
                    onClick={onEventClick}
                  />
                ))}
                {overflow > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDayClick && onDayClick(d);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "2px 6px",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      textAlign: "left",
                      letterSpacing: "0.04em",
                    }}
                  >
                    +{overflow} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
