/**
 * Roadmap — phase-level swim lanes per project, year view.
 *
 * Each project is one row; each phase renders as a colored band whose
 * extent is determined by the date range of all schedule_tasks of that
 * phase. Quarters render as column headers.
 *
 * If a phase has no tasks for a given project, no band renders.
 */

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { PHASES, PHASE_COLORS } from "@/utils/phases";
import ReportShell from "./ReportShell";
import { FilterBar, SelectFilter } from "./ReportFilters";
import { formatDate } from "./utils";
import { mono, body, CARD } from "./constants";

const ROW_HEIGHT = 48;
const HEADER_HEIGHT = 36;
const LEFT_GUTTER = 220;
const RIGHT_GUTTER = 16;
const BAND_HEIGHT = 14;

function quartersBetween(start, end) {
  const out = [];
  const d = new Date(start.getFullYear(), Math.floor(start.getMonth() / 3) * 3, 1);
  while (d <= end) {
    out.push(new Date(d));
    d.setMonth(d.getMonth() + 3);
  }
  return out;
}

function yearOptions(allDates) {
  const years = new Set();
  allDates.forEach((d) => {
    if (d) years.add(new Date(d).getFullYear());
  });
  return Array.from(years).sort();
}

export default function Roadmap() {
  const navigate = useNavigate();
  const [yearFilter, setYearFilter] = useState("auto");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["schedule-tasks-all"],
    queryFn: () => base44.entities.ScheduleTask.list(),
  });

  // Compute per-project, per-phase date ranges
  const phaseRangesByProject = useMemo(() => {
    const m = {};
    tasks.forEach((t) => {
      if (!t.start_date || !t.end_date || !t.project_id || !PHASES.includes(t.phase)) return;
      m[t.project_id] = m[t.project_id] || {};
      const cur = m[t.project_id][t.phase];
      const s = new Date(t.start_date).getTime();
      const e = new Date(t.end_date).getTime();
      if (!cur) m[t.project_id][t.phase] = { start: s, end: e };
      else {
        if (s < cur.start) cur.start = s;
        if (e > cur.end) cur.end = e;
      }
    });
    return m;
  }, [tasks]);

  const allDates = useMemo(() => {
    const ds = [];
    Object.values(phaseRangesByProject).forEach((phases) => {
      Object.values(phases).forEach((r) => { ds.push(r.start); ds.push(r.end); });
    });
    return ds;
  }, [phaseRangesByProject]);

  const years = useMemo(() => yearOptions(allDates), [allDates]);

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (yearFilter !== "auto") {
      const y = Number(yearFilter);
      return { rangeStart: new Date(y, 0, 1), rangeEnd: new Date(y, 11, 31) };
    }
    if (allDates.length === 0) return { rangeStart: null, rangeEnd: null };
    return {
      rangeStart: new Date(Math.min(...allDates)),
      rangeEnd: new Date(Math.max(...allDates)),
    };
  }, [yearFilter, allDates]);

  const quarters = useMemo(() => {
    if (!rangeStart || !rangeEnd) return [];
    return quartersBetween(rangeStart, rangeEnd);
  }, [rangeStart, rangeEnd]);

  const visibleProjects = useMemo(() => {
    return projects.filter((p) => phaseRangesByProject[p.id]);
  }, [projects, phaseRangesByProject]);

  const chartW = Math.max(900, quarters.length * 90 + LEFT_GUTTER + RIGHT_GUTTER);
  const innerW = chartW - LEFT_GUTTER - RIGHT_GUTTER;
  const totalMs = rangeStart && rangeEnd ? rangeEnd - rangeStart : 0;
  const xFor = (ts) => {
    if (!totalMs) return LEFT_GUTTER;
    const clamped = Math.max(rangeStart.getTime(), Math.min(rangeEnd.getTime(), ts));
    return LEFT_GUTTER + ((clamped - rangeStart.getTime()) / totalMs) * innerW;
  };

  const totalH = HEADER_HEIGHT + visibleProjects.length * ROW_HEIGHT;

  return (
    <ReportShell
      title="Roadmap"
      count={visibleProjects.length}
      unit=" · PROJECTS"
      subtitle={rangeStart && rangeEnd ? `${formatDate(rangeStart)} — ${formatDate(rangeEnd)}` : "Phase swim lanes by project."}
      filters={
        <FilterBar>
          <SelectFilter
            label="Year"
            value={yearFilter}
            onChange={setYearFilter}
            options={[
              { key: "auto", label: "Auto-fit" },
              ...years.map((y) => ({ key: String(y), label: String(y) })),
            ]}
          />
        </FilterBar>
      }
    >
      {visibleProjects.length === 0 ? (
        <div style={{ ...CARD, padding: 48, textAlign: "center", ...mono, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          No phase data yet — add scheduled tasks with phases to populate this roadmap.
        </div>
      ) : (
        <div style={{ ...CARD, padding: 0, overflow: "auto" }}>
          <svg width={chartW} height={totalH} style={{ display: "block", minWidth: chartW }}>
            {/* Quarter headers + gridlines */}
            {quarters.map((q, i) => {
              const x = xFor(q.getTime());
              const qNum = Math.floor(q.getMonth() / 3) + 1;
              return (
                <g key={i}>
                  <line x1={x} y1={HEADER_HEIGHT} x2={x} y2={totalH} stroke="var(--divider)" strokeDasharray="2 3" opacity={0.6} />
                  <text x={x + 6} y={HEADER_HEIGHT - 12} style={{ ...mono, fontSize: 9, fill: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.08em" }}>
                    Q{qNum}
                  </text>
                  <text x={x + 6} y={HEADER_HEIGHT - 2} style={{ ...mono, fontSize: 9, fill: "var(--text-muted)" }}>
                    {q.getFullYear()}
                  </text>
                </g>
              );
            })}

            {visibleProjects.map((p, i) => {
              const rowY = HEADER_HEIGHT + i * ROW_HEIGHT;
              const phaseRanges = phaseRangesByProject[p.id] || {};
              return (
                <g key={p.id} style={{ cursor: "pointer" }} onClick={() => navigate(createPageUrl("Projects") + `?id=${p.id}`)}>
                  <line x1={0} y1={rowY} x2={chartW} y2={rowY} stroke="var(--divider)" />
                  <text x={12} y={rowY + ROW_HEIGHT / 2 - 4} style={{ ...mono, fontSize: 10, fill: "var(--text-primary)", fontWeight: 700 }}>
                    {p.project_number || ""}
                  </text>
                  <text x={12} y={rowY + ROW_HEIGHT / 2 + 9} style={{ ...body, fontSize: 11, fill: "var(--text-secondary)" }}>
                    {(p.name || "").length > 24 ? (p.name || "").slice(0, 24) + "…" : (p.name || "—")}
                  </text>
                  {PHASES.map((phase, idx) => {
                    const r = phaseRanges[phase];
                    if (!r) return null;
                    const x1 = xFor(r.start);
                    const x2 = xFor(r.end);
                    const w = Math.max(6, x2 - x1);
                    // Stack phases vertically inside the row to reduce overlap
                    const bandY = rowY + 6 + (idx % 2) * (BAND_HEIGHT + 2);
                    return (
                      <rect
                        key={phase}
                        x={x1}
                        y={bandY}
                        width={w}
                        height={BAND_HEIGHT}
                        rx={3}
                        fill={PHASE_COLORS[phase]}
                        opacity={0.85}
                      >
                        <title>{`${phase}: ${formatDate(new Date(r.start))} → ${formatDate(new Date(r.end))}`}</title>
                      </rect>
                    );
                  })}
                </g>
              );
            })}
          </svg>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", padding: "10px 16px", borderTop: "1px solid var(--divider)" }}>
            {PHASES.map((phase) => (
              <span key={phase} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: PHASE_COLORS[phase] }} />
                <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>{phase}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </ReportShell>
  );
}
