/**
 * Project Status (Gantt) — one bar per project across a shared timeline.
 *
 * Bars span `project.start_date → project.target_completion_date` and
 * are colored by `health_status` (On Track / Watch / At Risk / On Hold).
 * Today is marked with a vertical accent line. Click a bar to drill
 * into the project.
 *
 * NOTE: We don't reuse `<ScheduleGantt>` for this report — that
 * component is built for project-scoped schedule_tasks rows (with
 * phases, dependencies, percent-complete on each task). Here we want
 * one row per project across the portfolio, which is a structurally
 * different shape. A purpose-built renderer is ~80 lines and avoids
 * mangling ScheduleGantt's contract.
 */

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { entities } from "@/api/supabaseClient";
import { createPageUrl } from "@/utils";
import ReportShell from "./ReportShell";
import { FilterBar, SelectFilter, SearchInput } from "./ReportFilters";
import { exportTableCSV, formatDate } from "./utils";
import { mono, body, CARD, PROJECT_HEALTH_COLORS } from "./constants";
import { GANTT_TODAY_HEX } from "@/lib/ganttTheme";
import {
  mapProjectsToGanttRows,
  filterGanttRows,
  computeGanttWindow,
  buildMonthTicks,
  computeTodayPct,
  computeGanttBarLayout,
} from "./projectStatusGanttHelpers";

const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 40;
const LEFT_LABEL_W = 260;
const MIN_TIMELINE_W = 520;

function GanttRow({ row, from, to, onClick }) {
  const layout = computeGanttBarLayout(row, from, to);
  if (!layout) {
    return (
      <div
        style={{
          height: ROW_HEIGHT,
          borderBottom: "1px solid var(--divider)",
          display: "flex",
          alignItems: "center",
          paddingLeft: 12,
          ...mono,
          fontSize: 9,
          color: "var(--text-muted)",
        }}
      >
        Missing dates
      </div>
    );
  }
  const { leftPct, widthPct } = layout;
  const color = PROJECT_HEALTH_COLORS[row.health] || "var(--text-muted)";

  return (
    <div
      onClick={onClick}
      style={{
        position: "relative",
        height: ROW_HEIGHT,
        borderBottom: "1px solid var(--divider)",
        cursor: "pointer",
          background: "var(--sbd-gantt-row)",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--bg-row-hover)")
      }
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      title={`${row.name}\n${formatDate(row.start)} → ${formatDate(row.end)}\n${row.health || "no health"}`}
    >
      <div
        style={{
          position: "absolute",
          left: `${leftPct}%`,
          width: `${Math.max(0.5, widthPct)}%`,
          top: "50%",
          transform: "translateY(-50%)",
          height: 16,
          background: `color-mix(in srgb, ${color} 75%, transparent)`,
          border: `1px solid ${color}`,
          borderRadius: 3,
          minWidth: 4,
          display: "flex",
          alignItems: "center",
          paddingLeft: 6,
          overflow: "hidden",
        }}
      >
        <span
          style={{
            ...mono,
            fontSize: 9,
            color: "var(--accent-text)",
            fontWeight: 700,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {row.number}
        </span>
      </div>
    </div>
  );
}

export default function ProjectStatusGantt() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState("all");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
  });

  const allRows = useMemo(
    () => mapProjectsToGanttRows(projects),
    [projects],
  );

  const filtered = useMemo(
    () => filterGanttRows(allRows, { search, healthFilter }),
    [allRows, search, healthFilter],
  );

  // Compute timeline window from the filtered rows that actually have dates.
  const datedRows = filtered.filter((r) => r.start && r.end);
  const { from, to } = useMemo(
    () => computeGanttWindow(datedRows),
    [datedRows],
  );

  const ticks = useMemo(() => buildMonthTicks(from, to), [from, to]);
  const todayPct = computeTodayPct(from, to);

  const handleExportCSV = () => {
    exportTableCSV({
      filename: "project_status_gantt",
      columns: [
        { key: "number", label: "Project #" },
        { key: "name", label: "Name" },
        { key: "health", label: "Health" },
        { key: "phase", label: "Phase" },
        {
          key: "start",
          label: "Start",
          csvValue: (r) => (r.start ? r.start.toISOString().slice(0, 10) : ""),
        },
        {
          key: "end",
          label: "Target Completion",
          csvValue: (r) => (r.end ? r.end.toISOString().slice(0, 10) : ""),
        },
      ],
      rows: filtered,
      summary: {
        "Projects": filtered.length,
        "Window": `${formatDate(from)} → ${formatDate(to)}`,
        "Generated": new Date().toLocaleString(),
      },
    });
  };

  return (
    <ReportShell
      title="Project Status (Gantt)"
      count={filtered.length}
      unit=" · PROJECTS"
      subtitle={`${formatDate(from)} → ${formatDate(to)} · bars colored by health`}
      onExportCSV={handleExportCSV}
      filters={
        <FilterBar>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by project name or number..."
          />
          <SelectFilter
            label="Health"
            value={healthFilter}
            onChange={setHealthFilter}
            options={[
              { key: "all", label: "All" },
              { key: "On Track", label: "On Track" },
              { key: "Watch", label: "Watch" },
              { key: "At Risk", label: "At Risk" },
              { key: "On Hold", label: "On Hold" },
            ]}
          />
        </FilterBar>
      }
    >
      <Legend />

      {filtered.length === 0 ? (
        <div
          style={{
            ...CARD,
            padding: "48px 16px",
            textAlign: "center",
            ...mono,
            fontSize: 10,
            color: "var(--text-muted)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          {projects.length === 0
            ? "No projects yet."
            : "No projects match the current filters."}
        </div>
      ) : (
        <div style={{ ...CARD, padding: 0, overflow: "hidden", background: "var(--sbd-gantt-panel)" }}>
          <div style={{ overflowX: "auto" }}>
            <div style={{ display: "flex", minWidth: LEFT_LABEL_W + MIN_TIMELINE_W }}>
              {/* Left labels column */}
              <div
                style={{
                  width: LEFT_LABEL_W,
                  flexShrink: 0,
                  borderRight: "1px solid var(--divider)",
                }}
              >
                <div
                  style={{
                    height: HEADER_HEIGHT,
                    borderBottom: "1px solid var(--divider)",
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: 12,
                    background: "var(--sbd-gantt-header)",
                    ...mono,
                    fontSize: 8,
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                  }}
                >
                  Project
                </div>
                {filtered.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      height: ROW_HEIGHT,
                      borderBottom: "1px solid var(--divider)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      paddingLeft: 12,
                      paddingRight: 8,
                      cursor: "pointer",
                      minWidth: 0,
                    }}
                    onClick={() =>
                      navigate(createPageUrl("Projects") + `?id=${r.id}`)
                    }
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background =
                        "var(--bg-row-hover)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background:
                          PROJECT_HEALTH_COLORS[r.health] ||
                          "var(--text-muted)",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        ...body,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {r.name}
                    </span>
                  </div>
                ))}
              </div>

              {/* Timeline */}
              <div
                style={{
                  flex: 1,
                  position: "relative",
                  minWidth: MIN_TIMELINE_W,
                }}
              >
                {/* Header with month ticks */}
                <div
                  style={{
                    height: HEADER_HEIGHT,
                    position: "relative",
                    borderBottom: "1px solid var(--divider)",
                    background: "var(--sbd-gantt-header)",
                  }}
                >
                  {ticks.map((t, i) => (
                    <div
                      key={i}
                      style={{
                        position: "absolute",
                        left: `${t.fraction * 100}%`,
                        top: 0,
                        bottom: 0,
                        borderLeft: "1px solid var(--divider)",
                        paddingLeft: 4,
                        display: "flex",
                        alignItems: "center",
                        ...mono,
                        fontSize: 8,
                        color: "var(--text-muted)",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}
                    >
                      {t.label}
                    </div>
                  ))}
                </div>

                {/* Body */}
                <div style={{ position: "relative" }}>
                  {/* Background grid */}
                  {ticks.map((t, i) => (
                    <div
                      key={`grid-${i}`}
                      style={{
                        position: "absolute",
                        left: `${t.fraction * 100}%`,
                        top: 0,
                        bottom: 0,
                        borderLeft: "1px dashed var(--sbd-gantt-grid)",
                        opacity: 0.5,
                      }}
                    />
                  ))}
                  {/* Today marker */}
                  {todayPct !== null && (
                    <div
                      style={{
                        position: "absolute",
                        left: `${todayPct}%`,
                        top: 0,
                        bottom: 0,
                        borderLeft: `2px solid ${GANTT_TODAY_HEX}`,
                        boxShadow: "0 0 10px color-mix(in srgb, var(--sbd-gantt-today) 35%, transparent)",
                        zIndex: 3,
                      }}
                    />
                  )}
                  {filtered.map((r) => (
                    <GanttRow
                      key={r.id}
                      row={r}
                      from={from}
                      to={to}
                      onClick={() =>
                        navigate(createPageUrl("Projects") + `?id=${r.id}`)
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </ReportShell>
  );
}

function Legend() {
  const items = [
    { label: "On Track", color: PROJECT_HEALTH_COLORS["On Track"] },
    { label: "Watch", color: PROJECT_HEALTH_COLORS["Watch"] },
    { label: "At Risk", color: PROJECT_HEALTH_COLORS["At Risk"] },
    { label: "On Hold", color: PROJECT_HEALTH_COLORS["On Hold"] },
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <span
        style={{
          ...mono,
          fontSize: 8,
          color: "var(--text-muted)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontWeight: 700,
        }}
      >
        Health
      </span>
      {items.map((it) => (
        <span
          key={it.label}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            ...mono,
            fontSize: 9,
            color: "var(--text-secondary)",
          }}
        >
          <span
            style={{
              width: 14,
              height: 8,
              background: it.color,
              borderRadius: 2,
            }}
          />
          {it.label}
        </span>
      ))}
      <span
        style={{
          marginLeft: 8,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          ...mono,
          fontSize: 9,
          color: "var(--text-secondary)",
        }}
      >
        <span
          style={{
            width: 2,
            height: 14,
            background: GANTT_TODAY_HEX,
          }}
        />
        Today
      </span>
    </div>
  );
}
