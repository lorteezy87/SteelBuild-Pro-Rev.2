/**
 * PortfolioGantt.jsx — high-level, all-projects timeline.
 *
 * One bar per project (start_date → target_completion_date), colored by
 * phase, with a health dot and a hatched forecast-slip overlay when the
 * forecast completion runs past the target. This is a portfolio-level
 * overview — it does NOT require an active project and reads the full
 * project list straight from ProjectContext (no extra query).
 *
 * Projects missing a start or target date are surfaced as "unscheduled"
 * rather than hidden or given invented dates (see CLAUDE.md schedule rules).
 */

import React, { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { CommandBar, KpiTile } from "@/components/design-system";
import { PhoenixPanel } from "@/components/shared/PhoenixPanel";
import { createPageUrl } from "@/utils";
import { GANTT_PHASE_HEX, GANTT_TODAY_HEX } from "@/lib/ganttTheme";

const ROW_H = 38;
const HEADER_H = 46;
const LEFT_W = 300;

const ZOOM = {
  quarter: { pxPerDay: 2.4, label: "Quarter" },
  month:   { pxPerDay: 6,   label: "Month" },
};

const HEALTH_HEX = {
  "On Track": "var(--success)",
  "Watch":    "var(--warning)",
  "At Risk":  "var(--danger)",
};

const NEUTRAL_PHASE_HEX = "#64748B";

// ── Local-midnight date math (mirrors GanttChart so the today line and
// bar offsets agree with the rest of the app's date handling) ──────────
function toLocalMidnight(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const [y, m, d] = value.trim().split("-").map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  const dt = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (isNaN(dt)) return null;
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function daysBetween(a, b) {
  const d1 = toLocalMidnight(a);
  const d2 = toLocalMidnight(b);
  if (!d1 || !d2) return 0;
  return Math.round((d2.getTime() - d1.getTime()) / 86400000);
}

function addDays(date, days) {
  const d = toLocalMidnight(date) || new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function fmtShort(value) {
  const d = toLocalMidnight(value);
  if (!d) return "TBD";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

function phaseHex(phase) {
  return GANTT_PHASE_HEX[phase] || NEUTRAL_PHASE_HEX;
}

// Build month or quarter header segments across [minDate, maxDate].
function buildHeaderSegments(minDate, maxDate, pxPerDay, mode) {
  const segments = [];
  if (!minDate || !maxDate) return segments;
  let cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const end = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);

  if (mode === "quarter") {
    // Snap cursor back to the start of its quarter.
    cursor = new Date(cursor.getFullYear(), Math.floor(cursor.getMonth() / 3) * 3, 1);
    while (cursor <= end) {
      const qStart = new Date(cursor);
      const qEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 3, 1);
      const fromDays = Math.max(0, daysBetween(minDate, qStart));
      const toDays = Math.min(daysBetween(minDate, maxDate) + 1, daysBetween(minDate, qEnd));
      const widthDays = toDays - fromDays;
      if (widthDays > 0) {
        const q = Math.floor(qStart.getMonth() / 3) + 1;
        segments.push({
          key: `${qStart.getFullYear()}-Q${q}`,
          label: `Q${q} '${String(qStart.getFullYear()).slice(2)}`,
          width: widthDays * pxPerDay,
        });
      }
      cursor = qEnd;
    }
    return segments;
  }

  while (cursor <= end) {
    const mStart = new Date(cursor);
    const mEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const fromDays = Math.max(0, daysBetween(minDate, mStart));
    const toDays = Math.min(daysBetween(minDate, maxDate) + 1, daysBetween(minDate, mEnd));
    const widthDays = toDays - fromDays;
    if (widthDays > 0) {
      segments.push({
        key: `${mStart.getFullYear()}-${mStart.getMonth()}`,
        label: mStart.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        width: widthDays * pxPerDay,
      });
    }
    cursor = mEnd;
  }
  return segments;
}

export default function PortfolioGantt() {
  const { projects = [], setActiveProject, loading, projectLoadError } = useProjectContext();
  const navigate = useNavigate();
  const scrollRef = useRef(null);

  const [zoom, setZoom] = useState("quarter");
  const [healthFilter, setHealthFilter] = useState("all");

  // Normalize each project into a render row with parsed span dates.
  const rows = useMemo(() => {
    return projects.map((p) => {
      const start = toLocalMidnight(p.start_date);
      const target = toLocalMidnight(p.target_completion_date);
      const forecast = toLocalMidnight(p.forecast_completion_date);
      const scheduled = !!(start && target && target >= start);
      return {
        id: p.id,
        name: p.name || "Untitled Project",
        number: p.project_number || "",
        phase: p.phase || "—",
        health: p.health_status || "On Track",
        start,
        target,
        forecast: forecast && target && forecast > target ? forecast : null,
        scheduled,
      };
    });
  }, [projects]);

  const filteredRows = useMemo(() => {
    const base = healthFilter === "all" ? rows : rows.filter((r) => r.health === healthFilter);
    // Scheduled first (by start date), then unscheduled (by name).
    const scheduled = base.filter((r) => r.scheduled)
      .sort((a, b) => a.start - b.start);
    const unscheduled = base.filter((r) => !r.scheduled)
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...scheduled, ...unscheduled];
  }, [rows, healthFilter]);

  const scheduledRows = useMemo(() => filteredRows.filter((r) => r.scheduled), [filteredRows]);

  const { minDate, maxDate } = useMemo(() => {
    const dates = [];
    scheduledRows.forEach((r) => {
      if (r.start) dates.push(r.start);
      if (r.target) dates.push(r.target);
      if (r.forecast) dates.push(r.forecast);
    });
    if (dates.length === 0) {
      const today = new Date();
      return { minDate: addDays(today, -30), maxDate: addDays(today, 180) };
    }
    return {
      minDate: addDays(new Date(Math.min(...dates)), -15),
      maxDate: addDays(new Date(Math.max(...dates)), 30),
    };
  }, [scheduledRows]);

  const { pxPerDay } = ZOOM[zoom];
  const totalDays = Math.max(1, daysBetween(minDate, maxDate) + 1);
  const timelineWidth = totalDays * pxPerDay;
  const headerSegments = useMemo(
    () => buildHeaderSegments(minDate, maxDate, pxPerDay, zoom),
    [minDate, maxDate, pxPerDay, zoom],
  );

  const todayOffset = daysBetween(minDate, new Date()) * pxPerDay;
  const todayVisible = todayOffset > 0 && todayOffset < timelineWidth;

  // Scroll the timeline so "today" sits near the left on first paint / zoom.
  useEffect(() => {
    if (scrollRef.current && todayVisible) {
      scrollRef.current.scrollLeft = Math.max(0, todayOffset - 160);
    }
  }, [todayOffset, todayVisible, zoom]);

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.phase !== "Closeout").length;
    const atRisk = rows.filter((r) => r.health === "At Risk").length;
    const unscheduled = rows.filter((r) => !r.scheduled).length;
    return { total, active, atRisk, unscheduled };
  }, [rows]);

  const openProjectSchedule = (row) => {
    const project = projects.find((p) => p.id === row.id);
    if (!project) return;
    setActiveProject(project);
    navigate(createPageUrl("GanttChart"));
  };

  return (
    <div>
      <CommandBar
        eyebrow="PORTFOLIO"
        title="Portfolio Schedule"
        count={scheduledRows.length}
        unit={` / ${filteredRows.length} PROJECTS`}
        subtitle="All projects on one timeline · start → target completion"
      >
        <div style={{ display: "flex", gap: 6 }}>
          {["all", "On Track", "Watch", "At Risk"].map((h) => (
            <button
              key={h}
              onClick={() => setHealthFilter(healthFilter === h ? "all" : h)}
              style={{
                padding: "6px 10px",
                border: `1px solid ${healthFilter === h ? "var(--accent)" : "var(--border-default)"}`,
                borderRadius: 6,
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.06em",
                color: healthFilter === h ? "var(--accent)" : "var(--text-secondary)",
                background: healthFilter === h ? "var(--accent-muted)" : "transparent",
              }}
            >
              {h === "all" ? "ALL" : h.toUpperCase()}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", border: "1px solid var(--border-default)", borderRadius: 6, overflow: "hidden" }}>
          {Object.entries(ZOOM).map(([key, { label }]) => (
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
        <KpiTile compact label="Projects" value={stats.total} color="var(--accent)" />
        <KpiTile compact label="Active" value={stats.active} color="var(--info)" />
        <KpiTile compact label="At Risk" value={stats.atRisk} color="var(--status-error)" />
        <KpiTile compact label="Unscheduled" value={stats.unscheduled} color="var(--text-muted)" />
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 10, padding: "0 4px" }}>
        {Object.entries(GANTT_PHASE_HEX).map(([phase, hex]) => (
          <div key={phase} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 16, height: 6, borderRadius: 3, background: hex }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)" }}>{phase}</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 16, height: 6, borderRadius: "0 3px 3px 0", background: "repeating-linear-gradient(45deg, rgba(239,68,68,0.3), rgba(239,68,68,0.3) 2px, transparent 2px, transparent 4px)", border: "1px dashed rgba(239,68,68,0.5)" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)" }}>Forecast slip</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 2, height: 12, background: GANTT_TODAY_HEX }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)" }}>Today</span>
        </div>
      </div>

      <PhoenixPanel style={{ position: "relative" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>Loading projects…</div>
        ) : projectLoadError ? (
          <div style={{ textAlign: "center", padding: 48, color: "var(--status-error)", fontFamily: "var(--font-mono)" }}>{projectLoadError}</div>
        ) : filteredRows.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {rows.length === 0 ? "No projects yet." : "No projects match this filter."}
          </div>
        ) : (
          <div style={{ display: "flex", overflow: "hidden" }}>
            {/* ── Left: project list ── */}
            <div style={{ width: LEFT_W, flexShrink: 0, borderRight: "1px solid var(--sbd-gantt-grid-strong, var(--border-strong))" }}>
              <div style={{ height: HEADER_H, display: "flex", alignItems: "center", padding: "0 12px", background: "var(--sbd-gantt-header, var(--bg-surface-low))", borderBottom: "1px solid var(--sbd-gantt-grid-strong, var(--border-strong))" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700 }}>Project</span>
              </div>
              {filteredRows.map((row) => (
                <div
                  key={row.id}
                  onClick={() => openProjectSchedule(row)}
                  title={`Open ${row.name} schedule`}
                  style={{
                    height: ROW_H,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "0 12px",
                    borderBottom: "1px solid var(--hover-bg)",
                    borderLeft: `3px solid ${phaseHex(row.phase)}`,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: HEALTH_HEX[row.health] || "var(--text-muted)", flexShrink: 0 }} title={row.health} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</div>
                  </div>
                  {row.number && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", flexShrink: 0 }}>{row.number}</span>
                  )}
                </div>
              ))}
            </div>

            {/* ── Right: timeline ── */}
            <div ref={scrollRef} style={{ flex: 1, overflowX: "auto", overflowY: "hidden", position: "relative" }}>
              <div style={{ width: timelineWidth, minWidth: "100%" }}>
                {/* header */}
                <div style={{ height: HEADER_H, display: "flex", alignItems: "center", background: "var(--sbd-gantt-header, var(--bg-surface-low))", borderBottom: "1px solid var(--accent-border, var(--border-strong))", position: "sticky", top: 0, zIndex: 5 }}>
                  {headerSegments.map((seg) => (
                    <div key={seg.key} style={{ width: seg.width, flexShrink: 0, padding: "0 6px", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.06em", borderRight: "1px solid var(--divider, var(--border-default))", whiteSpace: "nowrap", overflow: "hidden" }}>
                      {seg.label}
                    </div>
                  ))}
                </div>

                {/* rows + bars */}
                <div style={{ position: "relative" }}>
                  {todayVisible && (
                    <div style={{ position: "absolute", top: 0, left: todayOffset, width: 2, height: filteredRows.length * ROW_H, background: GANTT_TODAY_HEX, zIndex: 3, pointerEvents: "none" }} />
                  )}
                  {filteredRows.map((row) => {
                    if (!row.scheduled) {
                      return (
                        <div key={row.id} style={{ height: ROW_H, display: "flex", alignItems: "center", paddingLeft: 8, borderBottom: "1px solid var(--hover-bg)" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", fontStyle: "italic" }}>Unscheduled — no start / target dates</span>
                        </div>
                      );
                    }
                    const left = daysBetween(minDate, row.start) * pxPerDay;
                    const width = Math.max(pxPerDay, (daysBetween(row.start, row.target) + 1) * pxPerDay);
                    const hex = phaseHex(row.phase);
                    const slipLeft = left + width;
                    const slipWidth = row.forecast ? daysBetween(row.target, row.forecast) * pxPerDay : 0;
                    const labelFits = width > 90;
                    return (
                      <div
                        key={row.id}
                        onClick={() => openProjectSchedule(row)}
                        title={`${row.name} · ${fmtShort(row.start)} → ${fmtShort(row.target)}${row.forecast ? ` (forecast ${fmtShort(row.forecast)})` : ""}`}
                        style={{ height: ROW_H, position: "relative", borderBottom: "1px solid var(--hover-bg)", cursor: "pointer" }}
                      >
                        <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", left, width, height: 18, borderRadius: 4, background: hex, opacity: 0.9, display: "flex", alignItems: "center", overflow: "hidden" }}>
                          {labelFits && (
                            <span style={{ marginLeft: 6, fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>
                              {fmtShort(row.start)} – {fmtShort(row.target)}
                            </span>
                          )}
                        </div>
                        {row.forecast && slipWidth > 0 && (
                          <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", left: slipLeft, width: slipWidth, height: 18, borderRadius: "0 4px 4px 0", background: "repeating-linear-gradient(45deg, rgba(239,68,68,0.18), rgba(239,68,68,0.18) 3px, transparent 3px, transparent 6px)", border: "1px dashed rgba(239,68,68,0.45)", borderLeft: "none", pointerEvents: "none" }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </PhoenixPanel>
    </div>
  );
}
