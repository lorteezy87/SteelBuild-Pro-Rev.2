/**
 * Timeline — horizontal band chart of schedule_tasks across time,
 * grouped by phase swimlane.
 *
 * Implementation: a single SVG with one horizontal lane per phase.
 * Each task renders as a colored bar positioned left/width based on
 * start_date / end_date, scaled across the auto-detected time window
 * (earliest task start → latest task end). Read-only.
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

const LANE_HEIGHT = 36;
const BAR_HEIGHT = 18;
const HEADER_HEIGHT = 32;
const LEFT_GUTTER = 120;
const RIGHT_GUTTER = 16;

function monthsBetween(start, end) {
  const months = [];
  const d = new Date(start.getFullYear(), start.getMonth(), 1);
  while (d <= end) {
    months.push(new Date(d));
    d.setMonth(d.getMonth() + 1);
  }
  return months;
}

export default function Timeline() {
  const navigate = useNavigate();
  const [projectFilter, setProjectFilter] = useState("all");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["schedule-tasks-all"],
    queryFn: () => base44.entities.ScheduleTask.list(),
  });

  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (!t.start_date || !t.end_date) return false;
      if (projectFilter !== "all" && t.project_id !== projectFilter) return false;
      return PHASES.includes(t.phase);
    });
  }, [tasks, projectFilter]);

  const { minDate, maxDate } = useMemo(() => {
    if (filteredTasks.length === 0) return { minDate: null, maxDate: null };
    let mn = Infinity;
    let mx = -Infinity;
    filteredTasks.forEach((t) => {
      const s = new Date(t.start_date).getTime();
      const e = new Date(t.end_date).getTime();
      if (s < mn) mn = s;
      if (e > mx) mx = e;
    });
    return { minDate: new Date(mn), maxDate: new Date(mx) };
  }, [filteredTasks]);

  const months = useMemo(() => {
    if (!minDate || !maxDate) return [];
    return monthsBetween(minDate, maxDate);
  }, [minDate, maxDate]);

  const totalMs = minDate && maxDate ? maxDate - minDate : 0;
  const chartW = Math.max(800, months.length * 60);
  const innerW = chartW - LEFT_GUTTER - RIGHT_GUTTER;
  const xFor = (date) => {
    if (!totalMs) return LEFT_GUTTER;
    const t = new Date(date).getTime();
    return LEFT_GUTTER + ((t - minDate.getTime()) / totalMs) * innerW;
  };

  const tasksByPhase = useMemo(() => {
    const m = {};
    PHASES.forEach((p) => { m[p] = []; });
    filteredTasks.forEach((t) => { if (m[t.phase]) m[t.phase].push(t); });
    return m;
  }, [filteredTasks]);

  const totalH = HEADER_HEIGHT + PHASES.length * LANE_HEIGHT;

  return (
    <ReportShell
      title="Timeline"
      count={filteredTasks.length}
      unit=" · TASKS"
      subtitle={minDate && maxDate ? `${formatDate(minDate)} — ${formatDate(maxDate)}` : "Pick a project to scope the timeline."}
      filters={
        <FilterBar>
          <SelectFilter
            label="Project"
            value={projectFilter}
            onChange={setProjectFilter}
            options={[
              { key: "all", label: "All projects" },
              ...projects.map((p) => ({ key: p.id, label: p.project_number ? `${p.project_number} — ${p.name}` : p.name })),
            ]}
          />
        </FilterBar>
      }
    >
      {filteredTasks.length === 0 ? (
        <div style={{ ...CARD, padding: 48, textAlign: "center", ...mono, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          No scheduled tasks with start/end dates in the selected scope.
        </div>
      ) : (
        <div style={{ ...CARD, padding: 0, overflow: "auto" }}>
          <svg width={chartW} height={totalH} style={{ display: "block", minWidth: chartW }}>
            {/* Month gridlines + labels */}
            {months.map((m, i) => {
              const x = xFor(m);
              return (
                <g key={i}>
                  <line x1={x} y1={HEADER_HEIGHT} x2={x} y2={totalH} stroke="var(--divider)" strokeDasharray="2 3" opacity={0.6} />
                  <text x={x + 4} y={HEADER_HEIGHT - 8} style={{ ...mono, fontSize: 9, fill: "var(--text-muted)" }}>
                    {m.toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
                  </text>
                </g>
              );
            })}

            {/* Lanes */}
            {PHASES.map((phase, i) => {
              const laneY = HEADER_HEIGHT + i * LANE_HEIGHT;
              const phaseColor = PHASE_COLORS[phase];
              return (
                <g key={phase}>
                  <line x1={0} y1={laneY} x2={chartW} y2={laneY} stroke="var(--divider)" />
                  <text x={12} y={laneY + LANE_HEIGHT / 2 + 3} style={{ ...mono, fontSize: 10, fill: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {phase}
                  </text>
                  {(tasksByPhase[phase] || []).map((t) => {
                    const x1 = xFor(t.start_date);
                    const x2 = xFor(t.end_date);
                    const w = Math.max(4, x2 - x1);
                    const proj = projectsById.get(t.project_id);
                    const color = phaseColor;
                    return (
                      <g key={t.id} style={{ cursor: "pointer" }} onClick={() => navigate(createPageUrl("Projects") + `?id=${t.project_id}`)}>
                        <rect
                          x={x1}
                          y={laneY + (LANE_HEIGHT - BAR_HEIGHT) / 2}
                          width={w}
                          height={BAR_HEIGHT}
                          rx={3}
                          fill={color}
                          opacity={t.status === "Complete" ? 0.45 : 0.85}
                        >
                          <title>{`${proj?.project_number || ""} ${t.task_name} (${formatDate(t.start_date)} → ${formatDate(t.end_date)})`}</title>
                        </rect>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>

          {/* Legend */}
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
