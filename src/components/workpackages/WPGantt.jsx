import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ─── Phase colors (matches page) ────────────────────────────────────
const PHASE_COLOR = {
  Detailing:   "#0D9488",
  Fabrication: "var(--accent)",
  Delivery:    "#00B8D9",
  Erection:    "var(--status-success-bright)",
};

const LEFT_COL = 340;
const ROW_H    = 38;
const HEADER_H = 56;

// ─── Date helpers ────────────────────────────────────────────────────
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}
function toISO(d) {
  return d.toISOString().slice(0, 10);
}
function fmtDate(d) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtDateLong(d) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// ─── Compute WP bar dates ────────────────────────────────────────────
function getWPDates(wp) {
  const start = wp.released_date
    ? startOfDay(new Date(wp.released_date))
    : startOfDay(new Date(wp.created_date || Date.now()));

  const estDays = Math.max(3, Math.ceil((Number(wp.tonnage) || 0) / 2));

  let end;
  if (wp.target_end_date) {
    end = startOfDay(new Date(wp.target_end_date));
  } else if (wp.status === "Complete" && wp.updated_date) {
    end = startOfDay(new Date(wp.updated_date));
  } else {
    end = addDays(start, estDays);
  }

  // Ensure end >= start + 1
  if (end <= start) end = addDays(start, Math.max(1, estDays));

  return { start, end };
}

// ─── Conflict detection ──────────────────────────────────────────────
function detectConflicts(wps) {
  const conflicts = new Set();
  const conflictList = [];

  wps.forEach(wp => {
    if (wp.phase === "Erection") {
      const deliveryWP = wps.find(w => w.phase === "Delivery" && w.name === wp.name);
      if (deliveryWP && wp.released_date && deliveryWP.released_date) {
        const erectionStart = startOfDay(new Date(wp.released_date));
        const deliveryEnd = addDays(
          new Date(deliveryWP.released_date),
          Math.max(3, Math.ceil((Number(deliveryWP.tonnage) || 0) / 2))
        );
        if (erectionStart < deliveryEnd) {
          conflicts.add(wp.id);
          conflicts.add(deliveryWP.id);
          conflictList.push({ wp1: deliveryWP, wp2: wp, type: "Erection starts before delivery complete" });
        }
      }
    }
  });

  return { conflictSet: conflicts, conflictList };
}

// ─── Zoom level config ───────────────────────────────────────────────
const ZOOM_LEVELS = [
  { id: "day",   label: "Day",   pxPerDay: 40,  tickEvery: 1,  fmt: d => fmtDate(d) },
  { id: "week",  label: "Week",  pxPerDay: 18,  tickEvery: 7,  fmt: d => `W${Math.ceil(d.getDate() / 7)} ${d.toLocaleDateString("en-US", { month: "short" })}` },
  { id: "month", label: "Month", pxPerDay: 6,   tickEvery: 28, fmt: d => d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }) },
];

// ─── Main Gantt Component ────────────────────────────────────────────
export default function WPGantt({ wps, updateMut }) {
  const [zoomId, setZoomId] = useState("week");
  const [dragState, setDragState] = useState(null); // { wpId, edge, startX, origDate }
  const [tooltip, setTooltip] = useState(null); // { x, y, text }
  const timelineRef = useRef(null);
  const scrollRef = useRef(null);
  const leftRef = useRef(null);

  const zoom = ZOOM_LEVELS.find(z => z.id === zoomId) || ZOOM_LEVELS[1];
  const pxPerDay = zoom.pxPerDay;

  // Compute date range from all WPs
  const { rangeStart, rangeEnd, totalDays } = useMemo(() => {
    if (!wps.length) {
      const today = startOfDay(new Date());
      return { rangeStart: addDays(today, -30), rangeEnd: addDays(today, 60), totalDays: 90 };
    }
    let minDate = null;
    let maxDate = null;
    wps.forEach(wp => {
      const { start, end } = getWPDates(wp);
      if (!minDate || start < minDate) minDate = start;
      if (!maxDate || end > maxDate) maxDate = end;
    });
    const rs = addDays(minDate, -14);
    const re = addDays(maxDate, 21);
    return { rangeStart: rs, rangeEnd: re, totalDays: daysBetween(rs, re) };
  }, [wps]);

  const totalWidth = totalDays * pxPerDay;
  const today = startOfDay(new Date());
  const todayOffset = daysBetween(rangeStart, today) * pxPerDay;

  // Scroll to today on mount / zoom change
  useEffect(() => {
    if (scrollRef.current) {
      const targetScroll = Math.max(0, todayOffset - 200);
      scrollRef.current.scrollLeft = targetScroll;
    }
  }, [zoomId, todayOffset]);

  // Sync left panel scroll with timeline scroll
  const handleTimelineScroll = useCallback((e) => {
    if (leftRef.current) leftRef.current.scrollTop = e.target.scrollTop;
  }, []);

  // Build tick marks for header
  const ticks = useMemo(() => {
    const result = [];
    let cursor = new Date(rangeStart);
    while (cursor < rangeEnd) {
      result.push(new Date(cursor));
      cursor = addDays(cursor, zoom.tickEvery);
    }
    return result;
  }, [rangeStart, rangeEnd, zoom]);

  // Weekend bands
  const weekendBands = useMemo(() => {
    if (pxPerDay < 12) return []; // Don't show on month zoom
    const bands = [];
    let cursor = new Date(rangeStart);
    while (cursor < rangeEnd) {
      if (cursor.getDay() === 6) { // Saturday
        bands.push({
          x: daysBetween(rangeStart, cursor) * pxPerDay,
          width: 2 * pxPerDay,
        });
        cursor = addDays(cursor, 2);
      } else {
        cursor = addDays(cursor, 1);
      }
    }
    return bands;
  }, [rangeStart, rangeEnd, pxPerDay]);

  const { conflictSet, conflictList } = useMemo(() => detectConflicts(wps), [wps]);

  // ── Drag handlers ────────────────────────────────────────────────
  const handleBarMouseDown = useCallback((e, wp, edge) => {
    e.preventDefault();
    e.stopPropagation();
    const { start, end } = getWPDates(wp);
    setDragState({
      wpId: wp.id,
      edge, // "left" | "right"
      startX: e.clientX,
      origStart: start,
      origEnd: end,
      currentDate: edge === "left" ? start : end,
    });
  }, []);

  useEffect(() => {
    if (!dragState) return;

    const onMove = (e) => {
      const dx = e.clientX - dragState.startX;
      const daysDelta = Math.round(dx / pxPerDay);
      let newDate;
      if (dragState.edge === "left") {
        newDate = addDays(dragState.origStart, daysDelta);
        // Don't allow start after end - 1
        if (newDate >= dragState.origEnd) newDate = addDays(dragState.origEnd, -1);
      } else {
        newDate = addDays(dragState.origEnd, daysDelta);
        // Don't allow end before start + 1
        if (newDate <= dragState.origStart) newDate = addDays(dragState.origStart, 1);
      }
      setDragState(prev => ({ ...prev, currentDate: newDate }));
      setTooltip({ x: e.clientX, y: e.clientY, text: fmtDateLong(newDate) });
    };

    const onUp = () => {
      if (dragState) {
        const wp = wps.find(w => w.id === dragState.wpId);
        if (wp) {
          const field = dragState.edge === "left" ? "released_date" : "target_end_date";
          updateMut.mutate({ id: wp.id, data: { [field]: toISO(dragState.currentDate) } });
        }
      }
      setDragState(null);
      setTooltip(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragState, pxPerDay, wps, updateMut]);

  // Compute bar positions — override dates during drag
  const getBarDates = useCallback((wp) => {
    const base = getWPDates(wp);
    if (!dragState || dragState.wpId !== wp.id) return base;
    if (dragState.edge === "left") return { start: dragState.currentDate, end: base.end };
    return { start: base.start, end: dragState.currentDate };
  }, [dragState]);

  if (!wps.length) {
    return (
      <div style={{ textAlign: "center", padding: "60px 24px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
        NO WORK PACKAGES TO DISPLAY
      </div>
    );
  }

  const totalHeight = wps.length * ROW_H;

  return (
    <div style={{ background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden", userSelect: "none" }}>
      {/* ── Toolbar ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", borderBottom: "1px solid var(--border-default)", background: "var(--info-muted)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Zoom */}
          <div style={{ display: "flex", background: "var(--hover-bg)", borderRadius: 6, border: "1px solid var(--bg-surface-high)", overflow: "hidden" }}>
            {ZOOM_LEVELS.map((z, i) => (
              <button
                key={z.id}
                onClick={() => setZoomId(z.id)}
                style={{ padding: "4px 10px", background: zoomId === z.id ? "var(--accent-muted)" : "transparent", border: "none", borderRight: i < ZOOM_LEVELS.length - 1 ? "1px solid var(--bg-surface-high)" : "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 9, color: zoomId === z.id ? "var(--accent)" : "var(--text-secondary)", fontWeight: zoomId === z.id ? 700 : 400, letterSpacing: "0.08em" }}
              >
                {z.label.toUpperCase()}
              </button>
            ))}
          </div>
          {/* Legend */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {Object.entries(PHASE_COLOR).map(([ph, color]) => (
              <div key={ph} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>{ph}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Conflict badge */}
        {conflictList.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,23,68,0.10)", border: "1px solid rgba(255,23,68,0.30)", borderRadius: 6, padding: "4px 10px" }}>
            <span style={{ fontSize: 11 }}>⚠</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error-bright)", fontWeight: 700 }}>{conflictList.length} CONFLICT{conflictList.length > 1 ? "S" : ""}</span>
          </div>
        )}
      </div>

      {/* ── Main layout: fixed left col + scrollable timeline ── */}
      <div style={{ display: "flex", overflow: "hidden" }}>

        {/* LEFT COLUMN — WP info */}
        <div style={{ width: LEFT_COL, flexShrink: 0, borderRight: "1px solid var(--border-default)" }}>
          {/* Header spacer */}
          <div style={{ height: HEADER_H, borderBottom: "1px solid var(--border-default)", background: "rgba(0,0,0,0.15)", display: "flex", alignItems: "center", padding: "0 12px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>Work Package</span>
          </div>
          {/* Rows */}
          <div ref={leftRef} style={{ overflowY: "hidden", maxHeight: Math.min(totalHeight, 500) }}>
            {wps.map((wp, i) => {
              const phColor = PHASE_COLOR[wp.phase] || "var(--accent)";
                const isConflict = conflictSet.has(wp.id);
              return (
                <div
                  key={wp.id}
                  style={{ height: ROW_H, display: "flex", alignItems: "center", padding: "0 10px 0 12px", borderBottom: "1px solid var(--hover-bg)", background: i % 2 === 0 ? "transparent" : "var(--hover-bg)", borderLeft: isConflict ? "2px solid var(--status-error-bright)" : "2px solid transparent", gap: 8 }}
                >
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: phColor, flexShrink: 0 }} />
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--accent)", fontWeight: 700, whiteSpace: "nowrap" }}>{wp.wp_number}</span>
                      {isConflict && <span style={{ fontSize: 9 }}>⚠</span>}
                    </div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.2 }}>{wp.name}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: phColor, whiteSpace: "nowrap" }}>{wp.phase}</div>
                    {wp.tonnage > 0 && <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>{Number(wp.tonnage).toLocaleString()} T</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* TIMELINE ── scrollable */}
        <div
          ref={scrollRef}
          onScroll={handleTimelineScroll}
          style={{ flex: 1, overflowX: "auto", overflowY: "hidden", position: "relative" }}
        >
          <div ref={timelineRef} style={{ width: totalWidth, position: "relative" }}>

            {/* HEADER — date ticks */}
            <div style={{ height: HEADER_H, borderBottom: "1px solid var(--border-default)", background: "rgba(0,0,0,0.15)", position: "sticky", top: 0, zIndex: 10 }}>
              {ticks.map((tick, i) => {
                const x = daysBetween(rangeStart, tick) * pxPerDay;
                return (
                  <div key={i} style={{ position: "absolute", left: x, top: 0, height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <div style={{ width: 1, height: "100%", background: "var(--hover-bg)", position: "absolute", left: 0, top: 0 }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", paddingLeft: 5, whiteSpace: "nowrap" }}>
                      {zoom.fmt(tick)}
                    </span>
                  </div>
                );
              })}
              {/* Today marker in header */}
              {todayOffset >= 0 && todayOffset <= totalWidth && (
                <div style={{ position: "absolute", left: todayOffset, top: 0, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", paddingBottom: 4, zIndex: 2 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--accent)", fontWeight: 700, background: "var(--bg-page)", padding: "0 3px" }}>TODAY</span>
                </div>
              )}
            </div>

            {/* ROWS AREA */}
            <div style={{ position: "relative", height: totalHeight }}>
              {/* Weekend bands */}
              {weekendBands.map((b, i) => (
                <div key={i} style={{ position: "absolute", left: b.x, top: 0, width: b.width, height: totalHeight, background: "var(--hover-bg)", pointerEvents: "none" }} />
              ))}

              {/* Vertical tick lines */}
              {ticks.map((tick, i) => {
                const x = daysBetween(rangeStart, tick) * pxPerDay;
                return <div key={i} style={{ position: "absolute", left: x, top: 0, width: 1, height: totalHeight, background: "var(--hover-bg)", pointerEvents: "none" }} />;
              })}

              {/* Today line */}
              {todayOffset >= 0 && todayOffset <= totalWidth && (
                <div style={{ position: "absolute", left: todayOffset, top: 0, width: 2, height: totalHeight, background: "var(--accent)", opacity: 0.6, pointerEvents: "none", zIndex: 3 }} />
              )}

              {/* WP bars */}
              {wps.map((wp, i) => {
                const { start, end } = getBarDates(wp);
                const barX = daysBetween(rangeStart, start) * pxPerDay;
                const barW = Math.max(8, daysBetween(start, end) * pxPerDay);
                const phColor = PHASE_COLOR[wp.phase] || "var(--accent)";
                const isConflict = conflictSet.has(wp.id);
                const isDragging = dragState?.wpId === wp.id;
                const pct = wp.percent_complete || 0;

                return (
                  <div
                    key={wp.id}
                    style={{ position: "absolute", top: i * ROW_H + 7, left: barX, width: barW, height: ROW_H - 14, borderRadius: 5 }}
                  >
                    {/* Bar background */}
                    <div style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: 5,
                      background: `${phColor}30`,
                      border: isConflict
                        ? "1.5px dashed var(--status-error-bright)"
                        : isDragging
                          ? `1.5px solid ${phColor}`
                          : `1px solid ${phColor}60`,
                      boxShadow: isDragging ? `0 0 12px ${phColor}50` : "none",
                      overflow: "hidden",
                    }}>
                      {/* Progress fill */}
                      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: `${phColor}55`, borderRadius: "5px 0 0 5px", transition: dragState ? "none" : "width 0.3s" }} />
                      {/* Label */}
                      {barW > 60 && (
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", paddingLeft: 8, gap: 4, overflow: "hidden" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: phColor, fontWeight: 700, whiteSpace: "nowrap" }}>{wp.wp_number}</span>
                          {barW > 120 && <span style={{ fontFamily: "var(--font-body)", fontSize: 9, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{wp.name}</span>}
                          {barW > 180 && wp.tonnage > 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{Number(wp.tonnage).toLocaleString()}T</span>}
                        </div>
                      )}
                    </div>

                    {/* Left drag handle */}
                    <div
                      onMouseDown={(e) => handleBarMouseDown(e, wp, "left")}
                      style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize", borderRadius: "5px 0 0 5px", background: isDragging && dragState.edge === "left" ? `${phColor}80` : "transparent", zIndex: 5 }}
                    />
                    {/* Right drag handle */}
                    <div
                      onMouseDown={(e) => handleBarMouseDown(e, wp, "right")}
                      style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize", borderRadius: "0 5px 5px 0", background: isDragging && dragState.edge === "right" ? `${phColor}80` : "transparent", zIndex: 5 }}
                    />

                    {/* Conflict icon */}
                    {isConflict && (
                      <div style={{ position: "absolute", right: -14, top: "50%", transform: "translateY(-50%)", fontSize: 12, zIndex: 6 }}>⚠</div>
                    )}
                  </div>
                );
              })}

              {/* Row separators */}
              {wps.map((_, i) => (
                <div key={i} style={{ position: "absolute", left: 0, top: (i + 1) * ROW_H, width: "100%", height: 1, background: "var(--hover-bg)", pointerEvents: "none" }} />
              ))}

              {/* Row hover bands (even rows) */}
              {wps.map((_, i) => i % 2 === 1 ? (
                <div key={i} style={{ position: "absolute", left: 0, top: i * ROW_H, width: "100%", height: ROW_H, background: "var(--hover-bg)", pointerEvents: "none" }} />
              ) : null)}
            </div>
          </div>
        </div>
      </div>

      {/* Conflicts list */}
      {conflictList.length > 0 && (
        <div style={{ borderTop: "1px solid rgba(255,23,68,0.20)", padding: "8px 14px", background: "rgba(255,23,68,0.05)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--status-error-bright)", letterSpacing: "0.12em", marginBottom: 6 }}>SCHEDULING CONFLICTS</div>
          {conflictList.map((c, i) => (
            <div key={i} style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "rgba(255,100,100,0.85)", marginBottom: 3 }}>
              ⚠ <strong>{c.type}</strong> — {c.wp1.name} (Delivery) vs {c.wp2.name} (Erection)
            </div>
          ))}
        </div>
      )}

      {/* Drag tooltip */}
      {tooltip && (
        <div style={{ position: "fixed", left: tooltip.x + 12, top: tooltip.y - 30, background: "var(--bg-surface-low)", border: "1px solid var(--accent-border)", borderRadius: 6, padding: "4px 10px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", zIndex: 9999, pointerEvents: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.6)" }}>
          {tooltip.text}
        </div>
      )}
    </div>
  );
}