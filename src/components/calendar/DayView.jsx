/**
 * DayView — single-day full list, grouped by source type.
 *
 * High signal for "what do I need to do today?". Sections (Tasks ·
 * Deliveries · RFIs · etc.) are emitted in the same priority order as
 * `EVENT_TYPE_GROUPS` so the eye can scan top-to-bottom for what's
 * urgent first.
 *
 * If a single source group exceeds 10 items the rest collapse behind a
 * "show all" disclosure — keeps a really busy day from blowing up.
 */

import React, { useMemo, useState } from "react";
import { fromIsoDate, rangesOverlap, formatLongDate } from "@/lib/calendarMath";
import { EVENT_TYPE_GROUPS } from "@/lib/calendarEvents";
import EventPill from "./EventPill";

const COLLAPSE_AT = 10;

export default function DayView({ focus, events, onEventClick }) {
  const dayEvents = useMemo(
    () => events.filter((ev) =>
      rangesOverlap(focus, focus, fromIsoDate(ev.start), fromIsoDate(ev.end || ev.start))
    ),
    [focus, events]
  );

  const grouped = useMemo(() => {
    const map = new Map();
    EVENT_TYPE_GROUPS.forEach((g) => map.set(g.key, []));
    dayEvents.forEach((ev) => {
      const arr = map.get(ev.type) || [];
      arr.push(ev);
      map.set(ev.type, arr);
    });
    return map;
  }, [dayEvents]);

  if (dayEvents.length === 0) {
    return (
      <div
        style={{
          padding: 48,
          textAlign: "center",
          background: "var(--bg-surface)",
          border: "1px dashed var(--border-default)",
          borderRadius: 8,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: 6,
          }}
        >
          Nothing scheduled
        </div>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 13,
            color: "var(--text-muted)",
          }}
        >
          {formatLongDate(focus)} has no tasks, deliveries, or due items.
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
        gap: 14,
      }}
    >
      {EVENT_TYPE_GROUPS.map((group) => {
        const list = grouped.get(group.key) || [];
        if (list.length === 0) return null;
        return (
          <DaySection
            key={group.key}
            group={group}
            list={list}
            onEventClick={onEventClick}
          />
        );
      })}
    </div>
  );
}

function DaySection({ group, list, onEventClick }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? list : list.slice(0, COLLAPSE_AT);
  const hidden = list.length - visible.length;

  return (
    <div
      style={{
        border: "1px solid var(--border-default)",
        borderRadius: 8,
        background: "var(--bg-surface)",
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: 8,
          borderBottom: "1px solid var(--divider)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              background: group.color,
              boxShadow: `0 0 6px ${group.color}`,
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.16em",
              color: "var(--text-secondary)",
              textTransform: "uppercase",
            }}
          >
            {group.label}
          </span>
        </div>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 700,
            color: "var(--text-primary)",
            padding: "2px 8px",
            borderRadius: 3,
            background: "var(--bg-surface-high)",
          }}
        >
          {list.length}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {visible.map((ev) => (
          <EventPill key={ev.id} event={ev} mode="wide" onClick={onEventClick} />
        ))}
      </div>
      {hidden > 0 && (
        <button
          onClick={() => setExpanded(true)}
          style={{
            background: "none",
            border: "1px solid var(--border-default)",
            borderRadius: 4,
            padding: "6px 10px",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            color: "var(--accent)",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
          }}
        >
          Show {hidden} more
        </button>
      )}
    </div>
  );
}
