import { useEffect, useMemo, useRef } from "react";
import StatusBadgeRaw from "@/components/shared/StatusBadge";
import { formatDate } from "@/components/shared/formatters";
import { GANTT_TODAY_HEX } from "@/lib/ganttTheme";
import { formatLocalDate } from "@/utils/dates";
import {
  PHASE_COLORS, STATUS_COLORS, ROW_HEIGHT, HEADER_HEIGHT, TASK_LIST_WIDTH, ZOOM_LEVELS,
  toLocalMidnight, getDaysBetween, isWeekend, isToday, getMonthLabel,
} from "./format";

// StatusBadge is a still-.jsx component; cast at the boundary.
const StatusBadge = StatusBadgeRaw as any;

export function TaskList({ tasks, selectedId, onSelect, onHover, hoveredId, collapsedPhases, onTogglePhase, smartMode, cutId, dependencyPickSourceId }) {
  return (
    <div style={{ width: TASK_LIST_WIDTH, flexShrink: 0, borderRight: "1px solid var(--bg-surface-high)", overflow: "hidden" }}>
      <div style={{ height: HEADER_HEIGHT, display: "grid", gridTemplateColumns: "1fr 70px 70px 60px", alignItems: "center", padding: "0 12px", gap: 4, background: "var(--sbd-gantt-header)", borderBottom: "1px solid var(--sbd-gantt-grid-strong)" }}>
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
                    ? formatLocalDate(task.planned_start, "en-US", { month: "short", day: "numeric" })
                    : "—"}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)", fontWeight: 600 }}>
                  {task.planned_end
                    ? formatLocalDate(task.planned_end, "en-US", { month: "short", day: "numeric" })
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
                {task.planned_start ? formatLocalDate(task.planned_start, "en-US", { month: "short", day: "numeric" }) : "—"}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                {task.planned_end ? formatLocalDate(task.planned_end, "en-US", { month: "short", day: "numeric" }) : "—"}
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

export function Timeline({ tasks, selectedId, hoveredId, onHover, zoom, dateRange, smartMode }) {
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
    const today = new Date(); today.setHours(0, 0, 0, 0);
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
        <div style={{ height: HEADER_HEIGHT, position: "sticky", top: 0, zIndex: 5, background: "var(--sbd-gantt-header)" }}>
          <div style={{ display: "flex", height: 24, borderBottom: "1px solid var(--divider)" }}>
            {monthHeaders.map((h, i) => (
              <div key={i} style={{ width: h.width, padding: "0 6px", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.08em", display: "flex", alignItems: "center", borderRight: "1px solid var(--divider)" }}>{h.label}</div>
            ))}
          </div>
          <div style={{ display: "flex", height: HEADER_HEIGHT - 24, borderBottom: "1px solid var(--accent-border)" }}>
            {days.map((d, i) => (
              <div key={i} style={{ width: pxPerDay, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: pxPerDay >= 20 ? 7 : 0, color: isToday(d) ? GANTT_TODAY_HEX : "var(--text-muted)", fontWeight: isToday(d) ? 700 : 400, borderRight: "1px solid var(--sbd-gantt-grid)" }}>
                {pxPerDay >= 20 ? d.getDate() : ""}
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: "relative" }}>
          {days.map((d, i) => isWeekend(d) ? <div key={`we-${i}`} style={{ position: "absolute", top: 0, left: i * pxPerDay, width: pxPerDay, height: totalHeight, background: "var(--hover-bg)", pointerEvents: "none" }} /> : null)}
          {todayLine > 0 && todayLine < timelineWidth && (
            <div style={{ position: "absolute", top: 0, left: todayLine, width: 2, height: totalHeight, background: `linear-gradient(180deg, ${GANTT_TODAY_HEX}, rgba(255,107,0,0.06))`, zIndex: 3, pointerEvents: "none" }} />
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

export function DetailPanel({ task, onClose }) {
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
