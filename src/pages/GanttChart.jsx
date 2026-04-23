import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useProjectContext } from "../components/shared/useProjectContext";
import { PhoenixPanel } from "../components/shared/PhoenixPanel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "../components/shared/StatusBadge";
import { formatDate } from "../components/shared/formatters";
import { PHASES, derivePhase, groupByPhase } from "../utils/phases";
import { CommandBar, KpiTile } from "@/components/design-system";
import GanttContextMenu from "../components/gantt/GanttContextMenu";
import { createPageUrl } from "@/utils";

const PHASE_COLORS = {
  "Pre-Construction": { bar: "linear-gradient(90deg, var(--accent), #4DA8D8)", solid: "var(--accent)", bg: "rgba(0,229,255,0.10)" },
  Detailing:          { bar: "linear-gradient(90deg, var(--secondary), #2ABFAC)", solid: "var(--secondary)", bg: "rgba(68,226,205,0.10)" },
  Procurement:        { bar: "linear-gradient(90deg, var(--secondary), #2ABFAC)", solid: "var(--secondary)", bg: "rgba(68,226,205,0.12)" },
  Fabrication:        { bar: "linear-gradient(90deg, var(--status-warning), var(--status-warning))", solid: "var(--status-warning)", bg: "rgba(245,158,11,0.10)" },
  Delivery:           { bar: "linear-gradient(90deg, var(--accent), #4DA8D8)", solid: "var(--accent)",  bg: "rgba(0,229,255,0.10)" },
  Installation:       { bar: "linear-gradient(90deg, var(--success), #4AE176)",  solid: "#4AE176",  bg: "rgba(74,225,118,0.10)" },
  Closeout:           { bar: "linear-gradient(90deg, #909095, #6B6F78)",  solid: "#909095",  bg: "rgba(144,144,149,0.10)" },
};

const STATUS_COLORS = {
"Not Started": "var(--text-muted)",
"In Progress": "var(--accent)",
"Complete":    "var(--status-success)",
"Delayed":     "var(--status-error)",
};

const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 52;
const TASK_LIST_WIDTH = 360;

const ZOOM_LEVELS = {
  day:   { pxPerDay: 40, label: "Day" },
  week:  { pxPerDay: 20, label: "Week" },
  month: { pxPerDay: 6,  label: "Month" },
};

// Day math inside the Gantt grid. Previously mixed setUTCHours (in
// getDaysBetween) with getFullYear/getMonth/getDate (in isToday), so in
// non-UTC timezones the "today" vertical line and the date-range start
// drifted by a day from what the task rows were rendering. All math now
// runs against LOCAL midnight to match the rest of the app (urgencyEngine,
// todayView, UpcomingWindows — see src/lib/dateMath.js).
function toLocalMidnight(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const [y, m, dd] = value.trim().split("-").map(Number);
    return new Date(y, m - 1, dd, 0, 0, 0, 0);
  }
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (isNaN(d)) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDaysBetween(d1, d2) {
  const a = toLocalMidnight(d1);
  const b = toLocalMidnight(d2);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function addDays(date, days) {
  const d = toLocalMidnight(date) || new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function isWeekend(d) { const day = d.getDay(); return day === 0 || day === 6; }
function isToday(d) {
  const a = toLocalMidnight(d);
  const b = toLocalMidnight(new Date());
  return !!a && !!b && a.getTime() === b.getTime();
}
function getMonthLabel(d) { return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }); }

function TaskList({ tasks, selectedId, onSelect, onHover, hoveredId, collapsedPhases, onTogglePhase, smartMode, cutId, dependencyPickSourceId }) {
  return (
    <div style={{ width: TASK_LIST_WIDTH, flexShrink: 0, borderRight: "1px solid var(--bg-surface-high)", overflow: "hidden" }}>
      <div style={{ height: HEADER_HEIGHT, display: "grid", gridTemplateColumns: "1fr 70px 70px 60px", alignItems: "center", padding: "0 12px", gap: 4, background: "var(--bg-surface-low)", borderBottom: "1px solid var(--accent-border)" }}>
        {["Activity", "Start", "End", "Status"].map(h => (
          <span key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700 }}>{h}</span>
        ))}
      </div>
      <div style={{ overflowY: "auto", maxHeight: "calc(100vh - 300px)" }}>
        {tasks.map(task => {
          if (task.isSummary) {
            const phase = PHASE_COLORS[task.phase] || PHASE_COLORS.Fabrication;
            const isCollapsed = collapsedPhases.has(task.phase);
            return (
              <div
                key={task.id}
                data-gantt-phase={task.phase}
                onClick={() => onTogglePhase(task.phase)}
                style={{
                  height: ROW_HEIGHT,
                  display: "grid",
                  gridTemplateColumns: "1fr 70px 70px 60px",
                  alignItems: "center",
                  padding: "0 12px",
                  gap: 4,
                  borderBottom: `1px solid ${phase.solid}22`,
                  background: `${phase.solid}0D`,
                  borderLeft: `3px solid ${phase.solid}`,
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: phase.solid, transition: "transform 0.15s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", display: "inline-block", lineHeight: 1 }}>▾</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: phase.solid }}>{task.phase}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginLeft: 4 }}>{task.childCount} items</span>
                  {task.delayed > 0 && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--status-error)", background: "var(--danger-muted)", padding: "1px 5px", borderRadius: 2 }}>
                      {task.delayed} DELAYED
                    </span>
                  )}
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)", fontWeight: 600 }}>
                  {task.planned_start
                    ? new Date(task.planned_start + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
                    : "—"}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)", fontWeight: 600 }}>
                  {task.planned_end
                    ? new Date(task.planned_end + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
                    : "—"}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: phase.solid, fontWeight: 700 }}>{task.avgPct}%</span>
              </div>
            );
          }
          const isActive = task.id === selectedId;
          const isHovered = task.id === hoveredId;
          const phase = PHASE_COLORS[task.phase] || PHASE_COLORS.Fabrication;
          const depth = Math.max(0, Math.min(3, Number(task.depth) || 0));
          const isCut = cutId === task.id;
          const isPickSource = dependencyPickSourceId === task.id;
          return (
            <div
              key={task.id}
              data-gantt-task-id={task.id}
              onClick={() => onSelect(task.id)}
              onMouseEnter={() => onHover(task.id)}
              onMouseLeave={() => onHover(null)}
              style={{
                height: ROW_HEIGHT,
                display: "grid",
                gridTemplateColumns: "1fr 70px 70px 60px",
                alignItems: "center",
                padding: "0 12px",
                paddingLeft: 28 + depth * 16,
                gap: 4,
                borderBottom: "1px solid var(--hover-bg)",
                borderLeft: isPickSource
                  ? `3px solid var(--status-warning)`
                  : isActive
                  ? `3px solid ${phase.solid}`
                  : "3px solid transparent",
                background: isActive ? phase.bg : isHovered ? "var(--hover-bg)" : "transparent",
                cursor: "pointer",
                transition: "background 0.1s",
                opacity: isCut ? 0.45 : 1,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                {depth > 0 && (
                  <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10, lineHeight: 1 }}>↳</span>
                )}
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: phase.solid, flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.activity}</span>
                {smartMode && (task.status === "Blocked" || task.status === "Delayed" || task.constraints) && (
                  <span
                    title={task.constraints ? `Constraint: ${task.constraints}` : task.status === "Blocked" ? "Constraint: Blocked by RFI" : "Constraint: Schedule delay detected"}
                    style={{ flexShrink: 0, fontSize: 11, color: "var(--status-warning)", cursor: "help", lineHeight: 1 }}
                  >&#9888;</span>
                )}
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                {task.planned_start ? new Date(task.planned_start + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "—"}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                {task.planned_end ? new Date(task.planned_end + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "—"}
              </span>
              <div style={{ display: "flex", alignItems: "center" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLORS[task.status] || "var(--text-muted)" }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Timeline({ tasks, selectedId, hoveredId, onHover, zoom, dateRange, smartMode }) {
  const scrollRef = useRef(null);
  const { minDate, maxDate } = dateRange;
  const { pxPerDay } = ZOOM_LEVELS[zoom];

  const rowIndex = useMemo(() => {
    const map = new Map();
    tasks.forEach((t, i) => map.set(t.id, i));
    return map;
  }, [tasks]);

  const days = useMemo(() => {
    const result = [];
    let d = new Date(minDate);
    while (d <= maxDate) { result.push(new Date(d)); d.setDate(d.getDate() + 1); }
    return result;
  }, [minDate, maxDate]);

  const timelineWidth = days.length * pxPerDay;

  const monthHeaders = useMemo(() => {
    const headers = [];
    let currentMonth = "";
    days.forEach((d, i) => { const label = getMonthLabel(d); if (label !== currentMonth) { headers.push({ label, startIdx: i }); currentMonth = label; } });
    return headers.map((h, i) => { const end = i + 1 < headers.length ? headers[i + 1].startIdx : days.length; return { ...h, width: (end - h.startIdx) * pxPerDay }; });
  }, [days, pxPerDay]);

  useEffect(() => {
    if (scrollRef.current && days.length > 0) {
      const todayIdx = days.findIndex(d => isToday(d));
      if (todayIdx >= 0) scrollRef.current.scrollLeft = Math.max(0, todayIdx * pxPerDay - 200);
    }
  }, [days, pxPerDay]);

  const getBarPosition = (task) => {
    const start = task.planned_start || task.forecast_start;
    const end = task.planned_end || task.forecast_end;
    if (!start || !end) return null;
    const daysFromStart = getDaysBetween(minDate, toLocalMidnight(start));
    const duration = getDaysBetween(toLocalMidnight(start), toLocalMidnight(end)) + 1;
    return { left: daysFromStart * pxPerDay, width: Math.max(pxPerDay, duration * pxPerDay) };
  };

  const getForecastOverlay = (task) => {
    if (!task.forecast_end || !task.planned_end || task.forecast_end <= task.planned_end) return null;
    const daysFromStart = getDaysBetween(minDate, toLocalMidnight(task.planned_end));
    const duration = getDaysBetween(toLocalMidnight(task.planned_end), toLocalMidnight(task.forecast_end));
    if (duration <= 0) return null;
    return { left: daysFromStart * pxPerDay, width: duration * pxPerDay };
  };

  const getAnchorForTask = (task) => {
    if (!task || task.isSummary) return null;
    const pos = getBarPosition(task);
    const idx = rowIndex.get(task.id);
    if (!pos || idx === undefined) return null;
    return {
      startX: pos.left,
      endX: pos.left + pos.width,
      y: idx * ROW_HEIGHT + ROW_HEIGHT / 2,
    };
  };

  const getSmartDelay = (task) => {
    if (!smartMode || task.isSummary) return null;
    const start = task.planned_start || task.forecast_start;
    const end = task.planned_end || task.forecast_end;
    if (!start || !end) return null;
    const startDate = toLocalMidnight(start);
    const endDate = toLocalMidnight(end);
    if (!startDate || !endDate) return null;
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const totalDuration = getDaysBetween(startDate, endDate);
    if (totalDuration <= 0) return null;
    const elapsed = getDaysBetween(startDate, today);
    if (elapsed <= 0) return null;
    const expectedProgress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
    const pct = Number(task.percent_complete) || 0;
    const gap = expectedProgress - pct;
    if (gap <= 10) return null;
    const delayDays = Math.max(1, Math.round((gap / 100) * totalDuration));
    const barPos = getBarPosition(task);
    if (!barPos) return null;
    return { delayDays, ghostLeft: barPos.left + barPos.width, ghostWidth: delayDays * pxPerDay, gap: Math.round(gap) };
  };

  const todayLine = getDaysBetween(minDate, new Date()) * pxPerDay;
  const totalHeight = tasks.length * ROW_HEIGHT;

  return (
    <div ref={scrollRef} style={{ flex: 1, overflowX: "auto", overflowY: "hidden", position: "relative" }}>
      <div style={{ width: timelineWidth, minHeight: "100%" }}>
        <div style={{ height: HEADER_HEIGHT, position: "sticky", top: 0, zIndex: 5, background: "var(--bg-surface-low)" }}>
          <div style={{ display: "flex", height: 24, borderBottom: "1px solid var(--divider)" }}>
            {monthHeaders.map((h, i) => (
              <div key={i} style={{ width: h.width, padding: "0 6px", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.08em", display: "flex", alignItems: "center", borderRight: "1px solid var(--divider)" }}>{h.label}</div>
            ))}
          </div>
          <div style={{ display: "flex", height: HEADER_HEIGHT - 24, borderBottom: "1px solid var(--accent-border)" }}>
            {days.map((d, i) => (
              <div key={i} style={{ width: pxPerDay, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: pxPerDay >= 20 ? 7 : 0, color: isToday(d) ? "var(--accent)" : isWeekend(d) ? "var(--text-muted)" : "var(--text-muted)", fontWeight: isToday(d) ? 700 : 400, borderRight: "1px solid var(--hover-bg)" }}>
                {pxPerDay >= 20 ? d.getDate() : ""}
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: "relative" }}>
          {days.map((d, i) => isWeekend(d) ? <div key={`we-${i}`} style={{ position: "absolute", top: 0, left: i * pxPerDay, width: pxPerDay, height: totalHeight, background: "var(--hover-bg)", pointerEvents: "none" }} /> : null)}
          {todayLine > 0 && todayLine < timelineWidth && (
            <div style={{ position: "absolute", top: 0, left: todayLine, width: 2, height: totalHeight, background: "linear-gradient(180deg, var(--accent), rgba(0,229,255,0.06))", zIndex: 3, pointerEvents: "none" }} />
          )}

          {tasks.map((task) => {
            if (task.isSummary) {
              const pos = getBarPosition(task);
              const phase = PHASE_COLORS[task.phase] || PHASE_COLORS.Fabrication;
              if (!pos) {
                return <div key={task.id} data-gantt-phase={task.phase} style={{ height: ROW_HEIGHT, borderBottom: "1px solid var(--hover-bg)", background: `${phase.solid}08` }} />;
              }
              return (
                <div key={task.id} data-gantt-phase={task.phase} style={{ height: ROW_HEIGHT, position: "relative", borderBottom: `1px solid ${phase.solid}22`, background: `${phase.solid}08` }}>
                  <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", left: pos.left, width: pos.width, height: 8, background: phase.solid, opacity: 0.55 }} />
                  <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", left: pos.left, width: 3, height: 20, background: phase.solid, opacity: 0.80 }} />
                  <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", left: pos.left + pos.width - 3, width: 3, height: 20, background: phase.solid, opacity: 0.80 }} />
                </div>
              );
            }
            const pos = getBarPosition(task);
            if (!pos) return <div key={task.id} style={{ height: ROW_HEIGHT, borderBottom: "1px solid var(--hover-bg)" }} />;
            const phase = PHASE_COLORS[task.phase] || PHASE_COLORS.Fabrication;
            const isActive = task.id === selectedId;
            const isHov = task.id === hoveredId;
            const pct = Number(task.percent_complete) || 0;
            const forecastOverlay = getForecastOverlay(task);

            return (
              <div
                key={task.id}
                data-gantt-task-id={task.id}
                onMouseEnter={() => onHover(task.id)}
                onMouseLeave={() => onHover(null)}
                style={{ height: ROW_HEIGHT, position: "relative", borderBottom: "1px solid var(--hover-bg)", background: isActive ? phase.bg : isHov ? "var(--hover-bg)" : "transparent" }}>
                <div style={{ position: "absolute", top: 10, left: pos.left, width: pos.width, height: 20, borderRadius: 4, background: task.status === "Complete" ? "var(--status-success)" : phase.bar, opacity: isActive || isHov ? 1 : 0.85, boxShadow: isActive ? `0 0 12px ${phase.solid}44` : "none", transition: "opacity 0.15s, box-shadow 0.15s", overflow: "hidden" }}>
                  {pct > 0 && pct < 100 && <div style={{ position: "absolute", top: 0, left: 0, width: `${pct}%`, height: "100%", background: "var(--border-strong)", borderRight: "2px solid var(--text-muted)" }} />}
                  {pos.width > 50 && <span style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", fontFamily: "var(--font-mono)", fontSize: 8, color: "#fff", fontWeight: 600, whiteSpace: "nowrap", textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>{pct > 0 ? `${pct}%` : ""} {pos.width > 100 ? task.activity : ""}</span>}
                </div>
                {forecastOverlay && <div style={{ position: "absolute", top: 10, left: forecastOverlay.left, width: forecastOverlay.width, height: 20, borderRadius: "0 4px 4px 0", background: "repeating-linear-gradient(45deg, rgba(255,61,61,0.15), rgba(255,61,61,0.15) 3px, transparent 3px, transparent 6px)", border: "1px dashed rgba(255,61,61,0.40)", borderLeft: "none" }} />}
                {task.constraints && <div style={{ position: "absolute", top: 6, left: pos.left + pos.width + 4, width: 14, height: 14, borderRadius: "50%", background: "var(--status-warning)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 800, color: "#111" }} title={task.constraints}>!</div>}
                {(() => {
                  const delay = getSmartDelay(task);
                  if (!delay) return null;
                  return (
                    <>
                      {/* Ghost predicted delay bar */}
                      <div style={{
                        position: "absolute",
                        top: 10,
                        left: delay.ghostLeft,
                        width: Math.max(delay.ghostWidth, 20),
                        height: 20,
                        borderRadius: "0 4px 4px 0",
                        background: "repeating-linear-gradient(45deg, transparent, transparent 4px, var(--status-error) 4px, var(--status-error) 5px)",
                        opacity: 0.3,
                        border: "1px dashed var(--status-error)",
                        borderLeft: "none",
                        pointerEvents: "none",
                      }} />
                      {/* Ghost bar delay label (outside opacity container) */}
                      <span style={{
                        position: "absolute",
                        top: 14,
                        left: delay.ghostLeft + Math.max(delay.ghostWidth, 20) - 4,
                        transform: "translateX(-100%)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 8,
                        fontWeight: 700,
                        color: "var(--status-error)",
                        whiteSpace: "nowrap",
                        pointerEvents: "none",
                      }}>+{delay.delayDays}d</span>
                      {/* Float risk label */}
                      <div style={{
                        position: "absolute",
                        top: -2,
                        left: delay.ghostLeft + 2,
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                        pointerEvents: "none",
                      }}>
                        <span style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 8,
                          fontWeight: 700,
                          color: "var(--status-error)",
                          background: "rgba(255,61,61,0.10)",
                          padding: "1px 5px",
                          borderRadius: 3,
                          whiteSpace: "nowrap",
                          lineHeight: "12px",
                        }}>+{delay.delayDays}d FLOAT RISK</span>
                        <span style={{
                          fontSize: 6,
                          color: "var(--status-error)",
                          lineHeight: 1,
                          marginTop: 2,
                        }}>&#9660;</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            );
          })}

          {/* Dependency lines */}
          <svg
            width={timelineWidth}
            height={totalHeight}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              pointerEvents: "none",
              overflow: "visible",
              zIndex: 2,
            }}
          >
            <defs>
              <marker id="gantt-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="var(--text-muted)" />
              </marker>
            </defs>
            {tasks.map((task) => {
              if (task.isSummary || !task.dependencies || task.dependencies.length === 0) return null;
              const target = getAnchorForTask(task);
              if (!target) return null;
              return task.dependencies.map((depId) => {
                const depTask = tasks.find((t) => t.id === depId);
                const source = getAnchorForTask(depTask);
                if (!source) return null;
                const midX = (source.endX + target.startX) / 2;
                return (
                  <path
                    key={`${depId}-${task.id}`}
                    d={`M ${source.endX} ${source.y} H ${midX} V ${target.y} H ${target.startX}`}
                    stroke="var(--text-muted)"
                    strokeWidth="1.2"
                    fill="none"
                    markerEnd="url(#gantt-arrow)"
                  />
                );
              });
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

function DetailPanel({ task, onClose }) {
  if (!task) return null;
  const phase = PHASE_COLORS[task.phase] || PHASE_COLORS.Fabrication;
  const isSlipping = task.forecast_end && task.planned_end && task.forecast_end > task.planned_end;
  const slipDays = isSlipping ? getDaysBetween(new Date(task.planned_end), new Date(task.forecast_end)) : 0;

  return (
    <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 320, background: "var(--bg-surface-low)", borderLeft: `3px solid ${phase.solid}`, padding: 20, overflowY: "auto", zIndex: 10, boxShadow: "-8px 0 32px rgba(0,0,0,0.5)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{task.activity}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: phase.solid, letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 3 }}>{task.phase} • {task.crew || "No Crew"}</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 18 }}>×</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        {[
          { label: "Planned Start", value: formatDate(task.planned_start) },
          { label: "Planned End", value: formatDate(task.planned_end) },
          { label: "Forecast Start", value: formatDate(task.forecast_start) },
          { label: "Forecast End", value: formatDate(task.forecast_end), warn: isSlipping },
        ].map(({ label, value, warn }) => (
          <div key={label}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: warn ? "var(--status-error-bright)" : "var(--text-primary)", fontWeight: warn ? 700 : 500 }}>{value}</div>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 6 }}>Progress</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--bg-surface-high)", overflow: "hidden" }}>
            <div style={{ width: `${task.percent_complete || 0}%`, height: "100%", borderRadius: 4, background: phase.bar, transition: "width 0.3s" }} />
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: phase.solid }}>{task.percent_complete || 0}%</span>
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 6 }}>Status</div>
        <StatusBadge status={task.status} />
      </div>
      {isSlipping && (
        <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(255,23,68,0.08)", border: "1px solid rgba(255,23,68,0.25)", marginBottom: 16 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--status-error)", marginBottom: 3 }}>⚠ SCHEDULE SLIPPAGE</div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--status-error)" }}>Forecast end is {slipDays} day{slipDays !== 1 ? "s" : ""} past planned completion.</div>
        </div>
      )}
      {task.constraints && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 6 }}>Constraints</div>
          <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(255,179,0,0.06)", border: "1px solid rgba(255,179,0,0.20)", fontFamily: "var(--font-body)", fontSize: 11, color: "rgba(255,179,0,0.85)" }}>{task.constraints}</div>
        </div>
      )}
    </div>
  );
}

export default function GanttChart() {
  const { activeProject } = useProjectContext();
  const qc = useQueryClient();
  const [zoom, setZoom] = useState("week");
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showDetail, setShowDetail] = useState(false);
  const [collapsedPhases, setCollapsedPhases] = useState(new Set());
  const [smartMode, setSmartMode] = useState(true);
  const [menu, setMenu] = useState(null); // { x, y, task }
  const [clipboard, setClipboard] = useState(null); // { mode: "cut"|"copy", task }
  const [dependencyPick, setDependencyPick] = useState(null); // { sourceId }
  const [parentPick, setParentPick]           = useState(null); // { childId } — "Make a subtask" pick mode

  const { data: rawItems = [], isLoading } = useQuery({
    queryKey: ["lookahead-gantt", activeProject?.id],
    queryFn: () => activeProject?.id
      ? base44.entities.LookAhead.filter({ project_id: activeProject.id }, "-created_at")
      : [],
    enabled: !!activeProject?.id,
  });

  // Lift parent_id / dependencies out of metadata for downstream rendering.
  const items = useMemo(() => (rawItems || []).map((t) => ({
    ...t,
    parent_id: t.parent_id ?? t.metadata?.parent_id ?? null,
    dependencies: Array.isArray(t.dependencies)
      ? t.dependencies
      : Array.isArray(t.metadata?.dependencies)
      ? t.metadata.dependencies
      : [],
  })), [rawItems]);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["lookahead-gantt", activeProject?.id] });
    qc.invalidateQueries({ queryKey: ["lookahead", activeProject?.id] });
  }, [qc, activeProject?.id]);

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.LookAhead.update(id, data),
    onSuccess: invalidate,
    onError: (e) => toast.error(`Update failed: ${e?.message || "Unknown error"}`),
  });
  const createMut = useMutation({
    mutationFn: (d) => base44.entities.LookAhead.create(d),
    onSuccess: invalidate,
    onError: (e) => toast.error(`Create failed: ${e?.message || "Unknown error"}`),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.LookAhead.delete(id),
    onSuccess: invalidate,
    onError: (e) => toast.error(`Delete failed: ${e?.message || "Unknown error"}`),
  });

  const patchMeta = useCallback((task, patch) => {
    const nextMeta = { ...(task.metadata || {}), ...patch };
    return updateMut.mutateAsync({ id: task.id, data: { metadata: nextMeta } });
  }, [updateMut]);

  const displayRows = useMemo(() => {
    const base = items.filter(i => {
      if (phaseFilter !== "all" && derivePhase(i) !== phaseFilter) return false;
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      return true;
    });

    // Compute depth via parent chain; children nest under their parent.
    const byId = new Map(base.map((t) => [t.id, t]));
    const depthFor = (t, seen = new Set()) => {
      if (!t?.parent_id || seen.has(t.id)) return 0;
      seen.add(t.id);
      const parent = byId.get(t.parent_id);
      if (!parent) return 0;
      return 1 + depthFor(parent, seen);
    };

    const groups = groupByPhase(base);
    const rows = [];
    for (const phase of PHASES) {
      const tasks = groups[phase];
      if (!tasks || tasks.length === 0) continue;

      const starts = tasks.map(t => t.planned_start || t.forecast_start).filter(Boolean);
      const ends = tasks.map(t => t.planned_end || t.forecast_end).filter(Boolean);
      const summaryStart = starts.length > 0 ? starts.reduce((a, b) => (a < b ? a : b)) : null;
      const summaryEnd = ends.length > 0 ? ends.reduce((a, b) => (a > b ? a : b)) : null;

      const complete = tasks.filter(t => t.status === "Complete").length;
      const delayed = tasks.filter(t => t.status === "Delayed").length;
      const avgPct = Math.round(tasks.reduce((s, t) => s + (Number(t.percent_complete) || 0), 0) / tasks.length);

      rows.push({
        id: `summary-${phase}`,
        isSummary: true,
        phase,
        activity: phase.toUpperCase(),
        planned_start: summaryStart,
        planned_end: summaryEnd,
        childCount: tasks.length,
        complete,
        delayed,
        avgPct,
      });

      // Order: parents first, then children indented below. Preserve
      // relative created-at order otherwise.
      const byParent = new Map();
      for (const t of tasks) {
        const key = t.parent_id && byId.has(t.parent_id) ? t.parent_id : "__root__";
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key).push(t);
      }
      const emit = (list) => {
        for (const t of list) {
          rows.push({ ...t, isSummary: false, depth: depthFor(t) });
          const kids = byParent.get(t.id);
          if (kids?.length) emit(kids);
        }
      };
      emit(byParent.get("__root__") || []);
    }
    return rows;
  }, [items, phaseFilter, statusFilter]);

  const filteredTasks = useMemo(() => displayRows.filter(r => !r.isSummary), [displayRows]);

  const visibleRows = useMemo(() => {
    return displayRows.filter(row => {
      if (row.isSummary) return true;
      return !collapsedPhases.has(derivePhase(row));
    });
  }, [displayRows, collapsedPhases]);

  const dateRange = useMemo(() => {
    const dates = [];
    filteredTasks.forEach(t => {
      if (t.planned_start)  { const d = toLocalMidnight(t.planned_start);  if (d) dates.push(d); }
      if (t.planned_end)    { const d = toLocalMidnight(t.planned_end);    if (d) dates.push(d); }
      if (t.forecast_start) { const d = toLocalMidnight(t.forecast_start); if (d) dates.push(d); }
      if (t.forecast_end)   { const d = toLocalMidnight(t.forecast_end);   if (d) dates.push(d); }
    });
    if (dates.length === 0) { const today = new Date(); return { minDate: addDays(today, -7), maxDate: addDays(today, 21) }; }
    return { minDate: addDays(new Date(Math.min(...dates)), -3), maxDate: addDays(new Date(Math.max(...dates)), 7) };
  }, [filteredTasks]);

  const selectedTask = filteredTasks.find(t => t.id === selectedId);

  const stats = useMemo(() => {
    const total = filteredTasks.length;
    return {
      total,
      complete: filteredTasks.filter(t => t.status === "Complete").length,
      delayed: filteredTasks.filter(t => t.status === "Delayed").length,
      slipping: filteredTasks.filter(t => t.forecast_end && t.planned_end && t.forecast_end > t.planned_end).length,
      avgProgress: total > 0 ? Math.round(filteredTasks.reduce((s, t) => s + (Number(t.percent_complete) || 0), 0) / total) : 0,
    };
  }, [filteredTasks]);

  const togglePhase = (phase) => {
    setCollapsedPhases(prev => {
      const next = new Set(prev);
      next.has(phase) ? next.delete(phase) : next.add(phase);
      return next;
    });
  };

  // ── Context menu actions ──────────────────────────────────────────────
  const openDetails = useCallback((task) => {
    setSelectedId(task.id);
    setShowDetail(true);
  }, []);

  // "Make a subtask" now uses an explicit pick-parent mode (like
  // dependency picking). Click any task next → THAT becomes the parent.
  // This replaced a silent "auto-pick the task above" that confused users
  // when the auto-pick landed on the wrong row.
  const makeSubtask = useCallback((task) => {
    setParentPick({ childId: task.id });
    toast.info("Click the parent task to nest under · Esc to cancel");
  }, []);

  const completeParentPick = useCallback(async (parentTask) => {
    if (!parentPick) return;
    const child = items.find((t) => t.id === parentPick.childId);
    setParentPick(null);
    if (!child) return;
    if (child.id === parentTask.id) {
      toast.error("Can't nest a task under itself");
      return;
    }
    // Reject cycles — walk up parent chain of prospective parent.
    const byId = new Map(items.map((t) => [t.id, t]));
    let cursor = parentTask;
    const visited = new Set();
    while (cursor) {
      if (cursor.id === child.id) {
        toast.error("That task is already a descendant of this one");
        return;
      }
      if (visited.has(cursor.id)) break;
      visited.add(cursor.id);
      cursor = cursor.parent_id ? byId.get(cursor.parent_id) : null;
    }
    try {
      await patchMeta(child, { parent_id: parentTask.id });
      toast.success(`"${child.activity}" nested under "${parentTask.activity}"`);
    } catch (err) {
      toast.error(`Could not nest: ${err.message}`);
    }
  }, [parentPick, items, patchMeta]);

  const promoteSubtask = useCallback((task) => {
    if (!task.parent_id) { toast.info("Not a subtask"); return; }
    patchMeta(task, { parent_id: null }).then(() => toast.success("Promoted"));
  }, [patchMeta]);

  const cutTask = useCallback((task) => {
    setClipboard({ mode: "cut", task });
    toast.info(`Cut: ${task.activity}`);
  }, []);

  const copyTask = useCallback((task) => {
    setClipboard({ mode: "copy", task });
    toast.success(`Copied: ${task.activity}`);
  }, []);

  const pasteTask = useCallback(async (targetTask) => {
    if (!clipboard?.task) return;
    const src = clipboard.task;
    // Strip server-managed fields; keep phase/dates/etc.
    const {
      id, created_at, updated_at, created_date, updated_date,
      ...rest
    } = src;
    const newRecord = {
      ...rest,
      activity: clipboard.mode === "copy" ? `${src.activity} (copy)` : src.activity,
      // Paste below targetTask: nest under same parent when applicable.
      metadata: {
        ...(src.metadata || {}),
        parent_id: targetTask?.parent_id ?? src.metadata?.parent_id ?? null,
      },
    };
    try {
      await createMut.mutateAsync(newRecord);
      if (clipboard.mode === "cut") {
        await deleteMut.mutateAsync(src.id);
      }
      toast.success("Pasted");
      setClipboard(null);
    } catch { /* errors handled in mutations */ }
  }, [clipboard, createMut, deleteMut]);

  const insertTaskAbove = useCallback(async (task) => {
    const newRecord = {
      project_id: task.project_id,
      project_name: task.project_name,
      activity: "New Activity",
      phase: task.phase || derivePhase(task),
      crew: "",
      planned_start: task.planned_start || null,
      planned_end: task.planned_end || null,
      forecast_start: null,
      forecast_end: null,
      percent_complete: 0,
      status: "Not Started",
      constraints: "",
      metadata: { parent_id: task.parent_id || null },
    };
    try {
      const created = await createMut.mutateAsync(newRecord);
      toast.success("Task inserted");
      if (created?.id) {
        setSelectedId(created.id);
        setShowDetail(true);
      }
    } catch { /* handled */ }
  }, [createMut]);

  const deleteTask = useCallback(async (task) => {
    if (!window.confirm(`Delete "${task.activity}"? This cannot be undone.`)) return;
    try {
      await deleteMut.mutateAsync(task.id);
      if (selectedId === task.id) { setSelectedId(null); setShowDetail(false); }
      toast.success("Deleted");
    } catch { /* handled */ }
  }, [deleteMut, selectedId]);

  const copyLink = useCallback(async (task) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}${createPageUrl("GanttChart")}?task=${task.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Clipboard unavailable");
    }
  }, []);

  const startAddDependency = useCallback((task) => {
    setDependencyPick({ sourceId: task.id });
    toast.info("Click the predecessor task to add dependency (Esc to cancel)");
  }, []);

  const completeDependencyPick = useCallback(async (targetTask) => {
    if (!dependencyPick) return;
    const source = items.find((t) => t.id === dependencyPick.sourceId);
    setDependencyPick(null);
    if (!source) return;
    if (targetTask.id === source.id) { toast.error("Cannot depend on itself"); return; }
    const currentDeps = Array.isArray(source.dependencies) ? source.dependencies : [];
    if (currentDeps.includes(targetTask.id)) { toast.info("Dependency already exists"); return; }
    await patchMeta(source, { dependencies: [...currentDeps, targetTask.id] });
    toast.success(`Added dependency: ${targetTask.activity} → ${source.activity}`);
  }, [dependencyPick, items, patchMeta]);

  const removeDependencies = useCallback(async (task) => {
    if (!task.dependencies?.length) { toast.info("No dependencies to remove"); return; }
    await patchMeta(task, { dependencies: [] });
    toast.success("Dependencies cleared");
  }, [patchMeta]);

  const completeTask = useCallback(async (task) => {
    try {
      await updateMut.mutateAsync({
        id: task.id,
        data: { status: "Complete", percent_complete: 100 },
      });
      toast.success("Task marked complete");
    } catch { /* handled */ }
  }, [updateMut]);

  // Cancel dependency pick via Esc
  useEffect(() => {
    // Escape cancels any active pick mode.
    if (!dependencyPick && !parentPick) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (dependencyPick) setDependencyPick(null);
        if (parentPick)     setParentPick(null);
        toast.info("Cancelled");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dependencyPick, parentPick]);

  // Document-level contextmenu listener scoped to the Gantt container.
  // Walks up from event.target to find the row via data-gantt-task-id or
  // data-gantt-phase. This is immune to event-bubbling quirks inside
  // scroll containers and overlapping SVG layers.
  //
  // Registered with capture:true so nothing higher in the tree (custom
  // blockers, ad-block extensions, design-system wrappers) can swallow
  // it before we see the event.
  const ganttRootRef = useRef(null);
  useEffect(() => {
    const onCtx = (ev) => {
      const root = ganttRootRef.current;
      if (!root || !(ev.target instanceof Element)) return;
      if (!root.contains(ev.target)) return;

      const taskEl = ev.target.closest("[data-gantt-task-id]");
      const phaseEl = !taskEl ? ev.target.closest("[data-gantt-phase]") : null;
      if (!taskEl && !phaseEl) return;

      ev.preventDefault();
      ev.stopPropagation();

      if (taskEl) {
        const id = taskEl.getAttribute("data-gantt-task-id");
        const task = items.find((t) => t.id === id);
        if (!task) {
          // Task data isn't loaded yet for this id — surface instead of
          // silently dropping so users aren't left wondering why nothing
          // happened after a right-click.
          toast.info("Task data still loading — try again in a moment.");
          return;
        }
        setMenu({ x: ev.clientX, y: ev.clientY, task });
        return;
      }
      const phase = phaseEl.getAttribute("data-gantt-phase");
      setMenu({ x: ev.clientX, y: ev.clientY, phase });
    };
    document.addEventListener("contextmenu", onCtx, true);
    return () => document.removeEventListener("contextmenu", onCtx, true);
  }, [items]);

  // Phase-level actions for summary (parent) row right-click.
  const addTaskToPhase = useCallback(async (phase) => {
    const newRecord = {
      project_id: activeProject.id,
      project_name: activeProject.project_name || activeProject.name || "",
      activity: "New Activity",
      phase,
      crew: "",
      planned_start: null,
      planned_end: null,
      forecast_start: null,
      forecast_end: null,
      percent_complete: 0,
      status: "Not Started",
      constraints: "",
    };
    try {
      const created = await createMut.mutateAsync(newRecord);
      toast.success(`Added task to ${phase}`);
      if (created?.id) { setSelectedId(created.id); setShowDetail(true); }
    } catch { /* handled */ }
  }, [activeProject, createMut]);

  const collapseOtherPhases = useCallback((phase) => {
    setCollapsedPhases(new Set(PHASES.filter((p) => p !== phase)));
  }, []);

  const expandAllPhases = useCallback(() => setCollapsedPhases(new Set()), []);

  const completeAllInPhase = useCallback(async (phase) => {
    const tasks = items.filter((t) => derivePhase(t) === phase && t.status !== "Complete");
    if (tasks.length === 0) { toast.info("No open tasks in this phase"); return; }
    if (!window.confirm(`Mark all ${tasks.length} open tasks in ${phase} as Complete?`)) return;
    let ok = 0;
    for (const t of tasks) {
      try {
        await updateMut.mutateAsync({ id: t.id, data: { status: "Complete", percent_complete: 100 } });
        ok += 1;
      } catch { /* skip */ }
    }
    toast.success(`Completed ${ok} / ${tasks.length} in ${phase}`);
  }, [items, updateMut]);

  const handleRowClick = useCallback((id) => {
    // Intercept clicks while a pick mode is active.
    if (dependencyPick) {
      const t = items.find((x) => x.id === id);
      if (t) completeDependencyPick(t);
      return;
    }
    if (parentPick) {
      const t = items.find((x) => x.id === id);
      if (t) completeParentPick(t);
      return;
    }
    setSelectedId(id === selectedId ? null : id);
    setShowDetail(id !== selectedId);
  }, [dependencyPick, parentPick, items, completeDependencyPick, completeParentPick, selectedId]);

  const menuItems = useMemo(() => {
    // Phase (parent) row right-click
    if (menu?.phase && !menu?.task) {
      const p = menu.phase;
      const isCollapsed = collapsedPhases.has(p);
      return [
        { label: `Add task to ${p}`, icon: "＋", onClick: () => addTaskToPhase(p) },
        { type: "sep" },
        {
          label: isCollapsed ? "Expand phase" : "Collapse phase",
          icon: isCollapsed ? "▾" : "▸",
          onClick: () => togglePhase(p),
        },
        { label: "Collapse other phases", icon: "⇔", onClick: () => collapseOtherPhases(p) },
        { label: "Expand all phases", icon: "⇳", onClick: expandAllPhases },
        { type: "sep" },
        { label: "Complete all in phase", icon: "✓", onClick: () => completeAllInPhase(p) },
      ];
    }
    // Task row right-click
    if (!menu?.task) return [];
    const t = menu.task;
    const hasClipboard = !!clipboard?.task;
    const hasDeps = Array.isArray(t.dependencies) && t.dependencies.length > 0;
    return [
      { label: "Open Task Details", icon: "🔍", onClick: () => openDetails(t) },
      { type: "sep" },
      { label: "Make a subtask", icon: "↳", onClick: () => makeSubtask(t), disabled: !!t.parent_id },
      { label: "Promote Subtask", icon: "↰", onClick: () => promoteSubtask(t), disabled: !t.parent_id },
      { type: "sep" },
      { label: "Cut Task", icon: "✂", onClick: () => cutTask(t) },
      { label: "Copy Task", icon: "⧉", onClick: () => copyTask(t) },
      { label: "Paste Task", icon: "⎘", onClick: () => pasteTask(t), disabled: !hasClipboard },
      { label: "Insert Task Above", icon: "＋", onClick: () => insertTaskAbove(t) },
      { type: "sep" },
      { label: "Add dependency", icon: "→", onClick: () => startAddDependency(t) },
      { label: "Remove dependencies", icon: "⊘", onClick: () => removeDependencies(t), disabled: !hasDeps },
      { type: "sep" },
      { label: "Complete task", icon: "✓", onClick: () => completeTask(t), disabled: t.status === "Complete" },
      { label: "Copy link to task", icon: "🔗", onClick: () => copyLink(t) },
      { type: "sep" },
      { label: "Delete Task", icon: "🗑", danger: true, onClick: () => deleteTask(t) },
    ];
  }, [menu, clipboard, collapsedPhases, addTaskToPhase, togglePhase, collapseOtherPhases, expandAllPhases, completeAllInPhase, openDetails, makeSubtask, promoteSubtask, cutTask, copyTask, pasteTask, insertTaskAbove, startAddDependency, removeDependencies, completeTask, copyLink, deleteTask]);

  if (!activeProject?.id) return (
    <div style={{ textAlign: "center", padding: "80px 24px" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>Select a project to view Gantt Chart</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>Use the project selector in the top right.</div>
    </div>
  );

  const activePhaseCount = Object.values(groupByPhase(filteredTasks)).filter(g => g.length > 0).length;

  return (
    <div ref={ganttRootRef}>
      <CommandBar
        eyebrow={activeProject?.project_name || "SCHEDULE"}
        title="Gantt Chart"
        count={filteredTasks.length}
        unit={` · ${activePhaseCount} PHASES`}
        subtitle="Look-ahead lifecycle · Pre-Construction → Closeout"
      >
        <Select value={phaseFilter} onValueChange={setPhaseFilter}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Phase" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Phases</SelectItem>
            {PHASES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {["Not Started", "In Progress", "Complete", "Delayed"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <button
          onClick={() => setSmartMode(!smartMode)}
          style={{
            padding: "6px 12px",
            border: smartMode ? "1px solid var(--accent)" : "1px solid var(--border-default)",
            borderRadius: 6,
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: smartMode ? "var(--accent)" : "var(--text-secondary)",
            background: smartMode ? "var(--accent-muted)" : "transparent",
            display: "flex",
            alignItems: "center",
            gap: 4,
            transition: "all 0.15s",
          }}
        >
          <span style={{ fontSize: 11, lineHeight: 1 }}>{smartMode ? "\u2728" : "\u2606"}</span>
          SMART
        </button>
        <div style={{ display: "flex", border: "1px solid var(--border-default)", borderRadius: 6, overflow: "hidden" }}>
          {Object.entries(ZOOM_LEVELS).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => setZoom(key)}
              style={{
                padding: "6px 12px",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: zoom === key ? "var(--accent)" : "var(--text-secondary)",
                background: zoom === key ? "var(--accent-muted)" : "transparent",
              }}
            >
              {label.toUpperCase()}
            </button>
          ))}
        </div>
      </CommandBar>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 }}>
        <KpiTile
          compact
          label="Activities"
          value={stats.total}
          color="var(--accent)"
          active={phaseFilter === "all" && statusFilter === "all"}
          onClick={() => { setPhaseFilter("all"); setStatusFilter("all"); }}
        />
        <KpiTile
          compact
          label="Complete"
          value={stats.complete}
          color="var(--status-success)"
          active={statusFilter === "Complete"}
          onClick={() => setStatusFilter(statusFilter === "Complete" ? "all" : "Complete")}
        />
        <KpiTile
          compact
          label="Delayed"
          value={stats.delayed}
          color="var(--status-error)"
          active={statusFilter === "Delayed"}
          onClick={() => setStatusFilter(statusFilter === "Delayed" ? "all" : "Delayed")}
        />
        <KpiTile
          compact
          label="Slipping"
          value={stats.slipping}
          color="var(--status-warning)"
        />
        <KpiTile
          compact
          label="Avg Progress"
          value={`${stats.avgProgress}%`}
          color="var(--phase-fabrication)"
        />
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 10, padding: "0 4px" }}>
        {Object.entries(PHASE_COLORS).map(([phase, c]) => (
          <div key={phase} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 16, height: 6, borderRadius: 3, background: c.bar }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)" }}>{phase}</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 16, height: 6, borderRadius: 3, background: "repeating-linear-gradient(45deg, rgba(255,61,61,0.3), rgba(255,61,61,0.3) 2px, transparent 2px, transparent 4px)", border: "1px dashed rgba(255,61,61,0.4)" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)" }}>Slippage</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 2, height: 12, background: "var(--accent)" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)" }}>Today</span>
        </div>
        {smartMode && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 16, height: 6, borderRadius: "0 3px 3px 0", background: "repeating-linear-gradient(45deg, transparent, transparent 4px, var(--status-error) 4px, var(--status-error) 5px)", opacity: 0.3, border: "1px dashed var(--status-error)" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)" }}>AI Predicted Delay</span>
          </div>
        )}
      </div>

      <PhoenixPanel style={{ position: "relative" }}>
        {isLoading ? (
          <div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>Loading...</div>
        ) : filteredTasks.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>No look-ahead items found. Add activities from the Look-Ahead Schedule page.</div>
        ) : (
          <div style={{ display: "flex", overflow: "hidden" }}>
            <TaskList
              tasks={visibleRows}
              selectedId={selectedId}
              onSelect={handleRowClick}
              onHover={setHoveredId}
              hoveredId={hoveredId}
              collapsedPhases={collapsedPhases}
              onTogglePhase={togglePhase}
              smartMode={smartMode}
              cutId={clipboard?.mode === "cut" ? clipboard?.task?.id : null}
              dependencyPickSourceId={dependencyPick?.sourceId || parentPick?.childId || null}
            />
            <Timeline
              tasks={visibleRows}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onHover={setHoveredId}
              zoom={zoom}
              dateRange={dateRange}
              smartMode={smartMode}
            />
            {showDetail && selectedTask && <DetailPanel task={selectedTask} onClose={() => { setShowDetail(false); setSelectedId(null); }} />}
          </div>
        )}
      </PhoenixPanel>

      {dependencyPick && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--status-warning)",
            color: "#111",
            padding: "8px 16px",
            borderRadius: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            boxShadow: "0 6px 24px rgba(0,0,0,0.45)",
            zIndex: 900,
          }}
        >
          DEPENDENCY PICK MODE — click the predecessor task · Esc to cancel
        </div>
      )}

      {parentPick && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--accent)",
            color: "#fff",
            padding: "8px 16px",
            borderRadius: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            boxShadow: "0 6px 24px rgba(0,0,0,0.45)",
            zIndex: 900,
          }}
        >
          ↳ SUBTASK PICK MODE — click the task that will become the parent · Esc to cancel
        </div>
      )}

      {menu && (
        <GanttContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
