import React from "react";
import { parseUTCDate, statusIn } from "../shared/formatters";

/**
 * DeliveryRail — horizontal 30-day strip showing upcoming deliveries
 * bucketed by day across the entire portfolio.
 *
 * Layout:
 *   - Header: title + summary count, on-track vs late breakdown
 *   - Day columns: one per day from today → today+29. Weekends get a
 *     muted tint so the week cadence is obvious.
 *   - Per-day: a count + a stacked dot per delivery (up to 4 visible,
 *     then "+N" overflow badge). Dot color encodes status — late/
 *     overdue = red, scheduled = accent, ready/on-site = green.
 *   - Click a day → popover lists each delivery for that day with
 *     PO, vendor, project number, tonnage. Each row links to the
 *     delivery on /Deliveries.
 *
 * Intentionally DOES NOT group by project (per-project rows would be
 * sparse and forced endless horizontal scroll for <20 projects). The
 * chronological bucketing answers "what's hitting site this month" —
 * which is the portfolio question a PM leadership team cares about.
 */
export default function DeliveryRail({ deliveries = [], projectMap = {}, onOpenDelivery, onOpenProject }) {
  const todayStart = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const DAYS = 30;

  // Bucket deliveries by day-offset-from-today. Skip delivered items
  // and anything outside the 30-day window.
  const { byDay, totals } = React.useMemo(() => {
    const b = Array.from({ length: DAYS }, () => []);
    const totals = { total: 0, late: 0, scheduled: 0, ready: 0, tonsTotal: 0 };
    const msPerDay = 86400000;
    const maxTs = todayStart.getTime() + DAYS * msPerDay;
    for (const d of deliveries || []) {
      if (!d.scheduled_date) continue;
      const when = parseUTCDate(d.scheduled_date);
      if (!when) continue;
      const ts = when.getTime();
      if (ts < todayStart.getTime() || ts >= maxTs) continue;
      if (statusIn(d.status, ["Delivered"])) continue;
      const offset = Math.floor((ts - todayStart.getTime()) / msPerDay);
      if (offset < 0 || offset >= DAYS) continue;
      b[offset].push(d);
      totals.total += 1;
      totals.tonsTotal += Number(d.weight_tons) || 0;
      const statusLower = (d.status || "").toLowerCase();
      if (statusLower.includes("ready") || statusLower.includes("on-site") || statusLower.includes("onsite")) {
        totals.ready += 1;
      } else if (statusLower.includes("late") || statusLower.includes("delay")) {
        totals.late += 1;
      } else {
        totals.scheduled += 1;
      }
    }
    return { byDay: b, totals };
  }, [deliveries, todayStart]);

  // Selected-day popover state. null = no popover.
  const [selectedDay, setSelectedDay] = React.useState(null);

  // Early return — empty state when no upcoming deliveries.
  if (totals.total === 0) {
    return (
      <div style={{ gridColumn: "span 12", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 4, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>30-Day Delivery Rail</div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
            No deliveries scheduled in the next 30 days across the portfolio.
          </div>
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--status-success)", padding: "3px 10px", borderRadius: 3, background: "var(--success-muted)", border: "1px solid var(--success-border)" }}>
          ✓ ALL CLEAR
        </span>
      </div>
    );
  }

  // Day header labels: weekday letter + day number. Every 7 days gets a
  // divider-row tick so the user can eyeball week boundaries.
  const dayHeaders = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(todayStart);
    d.setDate(d.getDate() + i);
    const day = d.getDay();
    return {
      iso:         d.toISOString().slice(0, 10),
      weekday:     day,
      dateNum:     d.getDate(),
      monthShort:  d.toLocaleDateString("en-US", { month: "short" }),
      weekdayLetter: d.toLocaleDateString("en-US", { weekday: "narrow" }),
      isWeekend:   day === 0 || day === 6,
      isToday:     i === 0,
      isMonthFirst: d.getDate() === 1 || i === 0,
    };
  });

  return (
    <div style={{ gridColumn: "span 12", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 4, overflow: "hidden" }}>
      {/* Header row */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            30-Day Delivery Rail
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>
            {totals.total} upcoming · {totals.tonsTotal.toFixed(1)}T
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontFamily: "var(--font-mono)", fontSize: 10 }}>
          {totals.late > 0 && (
            <span style={{ color: "var(--status-error)", padding: "3px 8px", borderRadius: 3, background: "var(--danger-muted)", border: "1px solid var(--danger-border)", fontWeight: 700 }}>
              {totals.late} LATE
            </span>
          )}
          <span style={{ color: "var(--accent)", padding: "3px 8px", borderRadius: 3, background: "var(--accent-muted)", border: "1px solid var(--accent-border)", fontWeight: 700 }}>
            {totals.scheduled} SCHEDULED
          </span>
          {totals.ready > 0 && (
            <span style={{ color: "var(--status-success)", padding: "3px 8px", borderRadius: 3, background: "var(--success-muted)", border: "1px solid var(--success-border)", fontWeight: 700 }}>
              {totals.ready} READY
            </span>
          )}
        </div>
      </div>

      {/* Day strip */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${DAYS}, minmax(0, 1fr))`, padding: "8px 0", background: "var(--bg-surface-low)" }}>
        {dayHeaders.map((h, i) => {
          const items = byDay[i] || [];
          const count = items.length;
          const isSelected = selectedDay === i;
          const hasLate = items.some((d) => (d.status || "").toLowerCase().includes("late") || (d.status || "").toLowerCase().includes("delay"));
          return (
            <div
              key={i}
              onClick={() => count > 0 && setSelectedDay(isSelected ? null : i)}
              style={{
                padding: "4px 2px",
                borderLeft: h.weekday === 1 ? "2px solid var(--divider)" : "none",  // week boundary
                background: isSelected
                  ? "var(--accent-muted)"
                  : h.isToday
                    ? "rgba(184,134,11,0.06)"
                    : h.isWeekend
                      ? "rgba(2,6,23,0.025)"
                      : "transparent",
                borderTop: h.isToday ? "2px solid var(--accent)" : "2px solid transparent",
                cursor: count > 0 ? "pointer" : "default",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                minHeight: 60,
                position: "relative",
              }}
              title={count > 0
                ? `${count} deliver${count === 1 ? "y" : "ies"} on ${h.monthShort} ${h.dateNum}`
                : `${h.monthShort} ${h.dateNum} — no deliveries`}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, color: h.isToday ? "var(--accent)" : "var(--text-muted)", letterSpacing: "0.04em" }}>
                {h.weekdayLetter}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800, color: h.isToday ? "var(--accent)" : "var(--text-primary)", lineHeight: 1 }}>
                {h.dateNum}
              </span>
              {h.isMonthFirst && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em", marginTop: 1 }}>
                  {h.monthShort}
                </span>
              )}
              {/* Delivery dots — stacked vertically, max 4 + overflow */}
              {count > 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, marginTop: 3 }}>
                  {items.slice(0, 4).map((d) => {
                    const status = (d.status || "").toLowerCase();
                    const color = status.includes("late") || status.includes("delay")
                      ? "var(--status-error)"
                      : status.includes("ready") || status.includes("on-site") || status.includes("onsite")
                        ? "var(--status-success)"
                        : "var(--accent)";
                    return <span key={d.id} style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />;
                  })}
                  {count > 4 && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, color: hasLate ? "var(--status-error)" : "var(--text-muted)", marginTop: 1 }}>
                      +{count - 4}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Popover — list of deliveries for the selected day */}
      {selectedDay !== null && byDay[selectedDay]?.length > 0 && (
        <div style={{ borderTop: "1px solid var(--divider)", padding: "10px 14px", background: "var(--bg-surface)", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              {(() => {
                const h = dayHeaders[selectedDay];
                return `${h.monthShort} ${h.dateNum} · ${byDay[selectedDay].length} deliver${byDay[selectedDay].length === 1 ? "y" : "ies"}`;
              })()}
            </span>
            <button
              onClick={() => setSelectedDay(null)}
              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10 }}
            >
              ✕ Close
            </button>
          </div>
          {byDay[selectedDay].map((d) => {
            const status = (d.status || "").toLowerCase();
            const accent = status.includes("late") || status.includes("delay")
              ? "var(--status-error)"
              : status.includes("ready") || status.includes("on-site") || status.includes("onsite")
                ? "var(--status-success)"
                : "var(--accent)";
            const projectName = projectMap[d.project_id] || "(unknown project)";
            return (
              <div
                key={d.id}
                onClick={() => onOpenDelivery?.(d)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 10px",
                  background: "var(--bg-surface-low)",
                  border: "1px solid var(--border-default)",
                  borderLeft: `3px solid ${accent}`,
                  borderRadius: 3,
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.borderLeftColor = accent; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.borderLeftColor = accent; }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: accent, minWidth: 70, whiteSpace: "nowrap" }}>
                  {d.po_number || "(no PO)"}
                </span>
                <span
                  onClick={(e) => { e.stopPropagation(); if (d.project_id) onOpenProject?.(d.project_id); }}
                  style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", textDecoration: "underline", textDecorationColor: "transparent", transition: "text-decoration-color 0.1s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.textDecorationColor = "var(--accent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.textDecorationColor = "transparent"; }}
                >
                  {projectName}
                </span>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {d.description || d.vendor || "—"}
                </span>
                {d.weight_tons && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-secondary)" }}>
                    {Number(d.weight_tons).toFixed(1)}T
                  </span>
                )}
                {d.pieces && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                    {d.pieces} pcs
                  </span>
                )}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: accent, padding: "2px 8px", borderRadius: 3, background: `color-mix(in srgb, ${accent} 12%, transparent)`, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                  {d.status || "Scheduled"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
