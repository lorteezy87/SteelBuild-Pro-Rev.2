/**
 * WeekAhead — 7-day calendar ribbon on the right side of the Command
 * Center today-first layout.
 *
 * Each day renders as a stacked card:
 *   ┌───────────────────────────────────┐
 *   │ MON · APR 21   ● TODAY            │
 *   │ 3 due  ·  2 deliveries            │
 *   │ • RFI-024 Hayden pour             │
 *   │ • DEL-023 girders 40T             │
 *   │ • ...                             │
 *   └───────────────────────────────────┘
 *
 * The first card (today) gets an accent-muted background + "TODAY" pill.
 * Days with zero activity render as a faint "clear" row instead of empty.
 */

import React from "react";

const TYPE_COLOR = {
  RFI:  "var(--status-warning)",
  DWG:  "var(--phase-fabrication)",
  SUB:  "var(--secondary)",
  CO:   "var(--accent)",
  DEL:  "var(--phase-delivery)",
  WP:   "var(--phase-erection)",
  PAY:  "var(--tertiary)",
  NOTE: "var(--text-muted)",
};

function ItemLine({ entry }) {
  const color = TYPE_COLOR[entry.type] || "var(--text-muted)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          fontWeight: 700,
          padding: "1px 5px",
          borderRadius: 2,
          background: `color-mix(in srgb, ${color} 16%, transparent)`,
          color,
          letterSpacing: "0.06em",
          flexShrink: 0,
        }}
      >
        {entry.type}
      </span>
      {entry.projectNumber && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            flexShrink: 0,
          }}
        >
          {entry.projectNumber}
        </span>
      )}
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          color: "var(--text-secondary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          minWidth: 0,
        }}
      >
        {entry.title}
      </span>
    </div>
  );
}

export default function WeekAhead({ weekByDay = [], onForwardLookClick }) {
  return (
    <div
      className="sbd-card"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        padding: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: "1px solid var(--divider)",
          background: "var(--bg-surface-low)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>📅</span>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 13,
              fontWeight: 800,
              color: "var(--text-primary)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Week Ahead
          </span>
        </div>
        {onForwardLookClick && (
          <button
            onClick={onForwardLookClick}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              color: "var(--accent)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            14-Day →
          </button>
        )}
      </div>

      <div style={{ overflowY: "auto", flex: 1 }}>
        {weekByDay.map((day) => {
          const hasActivity = day.items.length > 0;
          return (
            <div
              key={day.date}
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid var(--divider)",
                background: day.isToday
                  ? "var(--accent-muted)"
                  : hasActivity
                  ? "transparent"
                  : "var(--bg-surface-low)",
                borderLeft: day.isToday ? "3px solid var(--accent)" : "3px solid transparent",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: hasActivity ? 6 : 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      fontWeight: 800,
                      color: day.isToday ? "var(--accent)" : "var(--text-primary)",
                      letterSpacing: "0.12em",
                    }}
                  >
                    {day.label}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 600,
                      color: "var(--text-muted)",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {day.month} {day.dayOfMonth}
                  </span>
                  {day.isToday && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 8,
                        fontWeight: 800,
                        padding: "1px 6px",
                        borderRadius: 2,
                        background: "var(--accent)",
                        color: "var(--bg-base)",
                        letterSpacing: "0.12em",
                      }}
                    >
                      TODAY
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {day.deliveries > 0 && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        fontWeight: 700,
                        color: "var(--phase-delivery)",
                        letterSpacing: "0.06em",
                      }}
                    >
                      🚚 {day.deliveries}
                    </span>
                  )}
                  {day.due > 0 && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        fontWeight: 700,
                        color: "var(--status-warning)",
                        letterSpacing: "0.06em",
                      }}
                    >
                      ⏰ {day.due}
                    </span>
                  )}
                  {!hasActivity && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        color: "var(--text-muted)",
                        letterSpacing: "0.08em",
                      }}
                    >
                      — CLEAR —
                    </span>
                  )}
                </div>
              </div>

              {hasActivity && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {day.items.slice(0, 4).map((entry, i) => (
                    <ItemLine key={i} entry={entry} />
                  ))}
                  {day.items.length > 4 && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        letterSpacing: "0.08em",
                        marginTop: 2,
                      }}
                    >
                      + {day.items.length - 4} more
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
