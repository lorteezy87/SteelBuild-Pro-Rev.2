import React from "react";

/**
 * Sticky two-row header for the scheduling timeline:
 *   Row 1 (month zoom only): month banners
 *   Row 2: day/week columns, with the "today" column highlighted
 *
 * `timelineRef` is lifted — we forward it onto the row-2 inner div so
 * pointer-move math in the parent can read scrollLeft + getBoundingClientRect
 * on that element.
 */
const TimelineHeader = React.forwardRef(function TimelineHeader(
  { zoomMode, monthBanners, headers },
  timelineRef,
) {
  return (
    <>
      {/* HEADER ROW 1 — month banners (month zoom only) */}
      {zoomMode === "month" && (
        <div
          style={{
            position: "sticky",
            top: 0,
            background: "var(--bg-surface-low)",
            borderBottom: "1px solid var(--bg-surface-high)",
            display: "flex",
            zIndex: 20,
          }}
        >
          <div style={{
            width: 220, flexShrink: 0,
            background: "var(--bg-page)",
            borderRight: "1px solid var(--border-default)",
          }} />
          <div style={{ display: "flex" }}>
            {monthBanners.map((banner, idx) => (
              <div
                key={idx}
                style={{
                  width: banner.width,
                  padding: "6px 8px",
                  textAlign: "center",
                  borderRight: "1px solid var(--border-default)",
                  flexShrink: 0,
                }}
              >
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-primary)", fontWeight: 700 }}>
                  {banner.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HEADER ROW 2 — week/day columns */}
      <div
        style={{
          position: "sticky",
          top: zoomMode === "month" ? 32 : 0,
          background: "var(--bg-surface-low)",
          borderBottom: "1px solid var(--bg-surface-high)",
          display: "flex",
          zIndex: 19,
        }}
      >
        <div style={{
          width: 220, flexShrink: 0,
          background: "var(--bg-page)",
          borderRight: "1px solid var(--border-default)",
        }} />
        <div ref={timelineRef} style={{ display: "flex" }}>
          {headers.map((h, idx) => (
            <div
              key={idx}
              style={{
                width: h.width,
                borderRight: "1px solid var(--border-default)",
                padding: "6px 8px",
                textAlign: "center",
                background: h.isToday ? "rgba(245,158,11,0.08)" : "transparent",
                borderTop: h.isToday ? "2px solid var(--accent)" : "none",
                flexShrink: 0,
              }}
            >
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                color: h.isToday ? "var(--status-warning)" : "var(--text-primary)",
              }}>
                {h.label}
              </div>
              {h.subLabel && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
                  {h.subLabel}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
});

export default TimelineHeader;
