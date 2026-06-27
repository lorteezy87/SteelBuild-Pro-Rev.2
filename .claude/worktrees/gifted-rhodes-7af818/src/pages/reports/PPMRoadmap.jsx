/**
 * PPM Roadmap — portfolio-level timeline, one band per project.
 *
 * Higher level than Roadmap: each project renders as a single band on
 * a shared timeline (start_date → target_completion_date), colored by
 * its current phase. Designed for executive review.
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
import { mono, body, CARD, PROJECT_HEALTH_COLORS } from "./constants";

const SUPPORTED_PHASES = new Set(PHASES);
const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 36;
const LEFT_GUTTER = 220;
const RIGHT_GUTTER = 16;
const BAR_HEIGHT = 18;

function quartersBetween(start, end) {
  const out = [];
  const d = new Date(start.getFullYear(), Math.floor(start.getMonth() / 3) * 3, 1);
  while (d <= end) {
    out.push(new Date(d));
    d.setMonth(d.getMonth() + 3);
  }
  return out;
}

export default function PPMRoadmap() {
  const navigate = useNavigate();
  const [phaseFilter, setPhaseFilter] = useState("all");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
  });

  const validProjects = useMemo(() => {
    return projects
      .filter((p) => p.start_date && p.target_completion_date)
      .filter((p) => phaseFilter === "all" || p.phase === phaseFilter)
      .map((p) => ({
        ...p,
        startTs: new Date(p.start_date).getTime(),
        endTs: new Date(p.target_completion_date).getTime(),
      }))
      .sort((a, b) => a.startTs - b.startTs);
  }, [projects, phaseFilter]);

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (validProjects.length === 0) return { rangeStart: null, rangeEnd: null };
    return {
      rangeStart: new Date(Math.min(...validProjects.map((p) => p.startTs))),
      rangeEnd: new Date(Math.max(...validProjects.map((p) => p.endTs))),
    };
  }, [validProjects]);

  const quarters = useMemo(() => {
    if (!rangeStart || !rangeEnd) return [];
    return quartersBetween(rangeStart, rangeEnd);
  }, [rangeStart, rangeEnd]);

  const chartW = Math.max(900, quarters.length * 90 + LEFT_GUTTER + RIGHT_GUTTER);
  const innerW = chartW - LEFT_GUTTER - RIGHT_GUTTER;
  const totalMs = rangeStart && rangeEnd ? rangeEnd - rangeStart : 0;
  const xFor = (ts) => {
    if (!totalMs) return LEFT_GUTTER;
    return LEFT_GUTTER + ((ts - rangeStart.getTime()) / totalMs) * innerW;
  };

  const totalH = HEADER_HEIGHT + validProjects.length * ROW_HEIGHT + 12;

  return (
    <ReportShell
      title="PPM Roadmap"
      count={validProjects.length}
      unit=" · PROJECTS"
      subtitle={rangeStart && rangeEnd ? `${formatDate(rangeStart)} — ${formatDate(rangeEnd)}` : "Portfolio timeline."}
      filters={
        <FilterBar>
          <SelectFilter
            label="Phase"
            value={phaseFilter}
            onChange={setPhaseFilter}
            options={[{ key: "all", label: "All phases" }, ...PHASES.map((p) => ({ key: p, label: p }))]}
          />
        </FilterBar>
      }
    >
      {validProjects.length === 0 ? (
        <div style={{ ...CARD, padding: 48, textAlign: "center", ...mono, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          No projects with start + target dates in this view.
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

            {/* Today line */}
            {rangeStart && rangeEnd && Date.now() >= rangeStart.getTime() && Date.now() <= rangeEnd.getTime() && (
              <line x1={xFor(Date.now())} y1={HEADER_HEIGHT} x2={xFor(Date.now())} y2={totalH} stroke="var(--accent)" strokeWidth={1.5} opacity={0.6} />
            )}

            {validProjects.map((p, i) => {
              const rowY = HEADER_HEIGHT + i * ROW_HEIGHT;
              const x1 = xFor(p.startTs);
              const x2 = xFor(p.endTs);
              const w = Math.max(6, x2 - x1);
              const phaseColor = SUPPORTED_PHASES.has(p.phase) ? PHASE_COLORS[p.phase] : "var(--text-muted)";
              const healthColor = PROJECT_HEALTH_COLORS[p.health_status] || "var(--text-muted)";
              return (
                <g key={p.id} style={{ cursor: "pointer" }} onClick={() => navigate(createPageUrl("Projects") + `?id=${p.id}`)}>
                  <line x1={0} y1={rowY} x2={chartW} y2={rowY} stroke="var(--divider)" />
                  <text x={12} y={rowY + ROW_HEIGHT / 2 - 4} style={{ ...mono, fontSize: 10, fill: "var(--text-primary)", fontWeight: 700 }}>
                    {p.project_number || ""}
                  </text>
                  <text x={12} y={rowY + ROW_HEIGHT / 2 + 9} style={{ ...body, fontSize: 11, fill: "var(--text-secondary)" }}>
                    {(p.name || "").length > 24 ? (p.name || "").slice(0, 24) + "…" : (p.name || "—")}
                  </text>
                  <rect
                    x={x1}
                    y={rowY + (ROW_HEIGHT - BAR_HEIGHT) / 2}
                    width={w}
                    height={BAR_HEIGHT}
                    rx={3}
                    fill={phaseColor}
                    opacity={0.85}
                  >
                    <title>{`${p.name} (${p.phase || "—"}) ${formatDate(p.start_date)} → ${formatDate(p.target_completion_date)}`}</title>
                  </rect>
                  {/* Health dot prefix on the bar */}
                  <circle cx={x1 + 8} cy={rowY + ROW_HEIGHT / 2} r={3} fill={healthColor} stroke="var(--bg-surface)" strokeWidth={1} />
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
