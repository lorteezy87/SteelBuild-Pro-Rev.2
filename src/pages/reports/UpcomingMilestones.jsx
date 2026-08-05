/**
 * Upcoming Milestones — schedule_tasks where task_type = 'Milestone' and
 * start_date falls in the next N days (default 60).
 *
 * Grouped by project, sorted ascending. Each row shows project, task
 * name, phase, due date, days-out, and status. Phase is validated
 * against PHASES from utils/phases.js.
 */

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { entities } from "@/api/supabaseClient";
import { createPageUrl } from "@/utils";
import { PHASES, PHASE_COLORS } from "@/utils/phases";
import ReportShell from "./ReportShell";
import ReportTable from "./ReportTable";
import { FilterBar, SelectFilter, SearchInput } from "./ReportFilters";
import { exportTableCSV, formatDate } from "./utils";
import { mono, body } from "./constants";
import {
  buildUpcomingMilestoneRows,
  filterUpcomingMilestoneRows,
} from "./upcomingMilestonesHelpers";

const SUPPORTED_PHASES = new Set(PHASES);
const WINDOWS = [
  { key: "30", label: "Next 30 days" },
  { key: "60", label: "Next 60 days" },
  { key: "90", label: "Next 90 days" },
  { key: "180", label: "Next 180 days" },
];

export default function UpcomingMilestones() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [windowDays, setWindowDays] = useState("60");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["schedule-tasks-all"],
    queryFn: () => entities.ScheduleTask.list(),
  });

  const projectsById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  );

  const rows = useMemo(
    () =>
      buildUpcomingMilestoneRows({
        tasks,
        projectsById,
        windowDays,
      }),
    [tasks, projectsById, windowDays],
  );

  const filtered = useMemo(
    () => filterUpcomingMilestoneRows(rows, search),
    [rows, search],
  );

  const columns = useMemo(
    () => [
      {
        key: "projectName",
        label: "Project",
        width: "minmax(180px, 1.5fr)",
        render: (r) => (
          <div style={{ minWidth: 0 }}>
            <div
              onClick={() =>
                navigate(createPageUrl("Projects") + `?id=${r.projectId}`)
              }
              style={{
                fontWeight: 600,
                color: "var(--text-primary)",
                cursor: "pointer",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {r.projectName}
            </div>
            {r.projectNumber && (
              <div
                style={{
                  ...mono,
                  fontSize: 9,
                  color: "var(--text-muted)",
                  marginTop: 2,
                }}
              >
                {r.projectNumber}
              </div>
            )}
          </div>
        ),
      },
      {
        key: "taskName",
        label: "Milestone",
        width: "minmax(220px, 2fr)",
        render: (r) => (
          <span
            style={{
              ...body,
              fontSize: 12,
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            ◆ {r.taskName}
          </span>
        ),
      },
      {
        key: "phase",
        label: "Phase",
        width: "minmax(120px, 1fr)",
        render: (r) => {
          const isCanonical = SUPPORTED_PHASES.has(r.phase);
          const color = isCanonical ? PHASE_COLORS[r.phase] : "var(--text-muted)";
          return (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                ...mono,
                fontSize: 10,
                color: "var(--text-secondary)",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: color,
                }}
              />
              {r.phase || "—"}
            </span>
          );
        },
      },
      {
        key: "startDate",
        label: "Date",
        width: "110px",
        render: (r) => (
          <span style={{ ...mono, color: "var(--text-primary)" }}>
            {formatDate(r.startDate)}
          </span>
        ),
        csvValue: (r) => r.startDate,
      },
      {
        key: "daysOut",
        label: "Days Out",
        width: "100px",
        align: "right",
        render: (r) => {
          const color =
            r.daysOut <= 7
              ? "var(--status-error)"
              : r.daysOut <= 21
                ? "var(--status-warning)"
                : "var(--text-secondary)";
          return (
            <span style={{ ...mono, color, fontWeight: 700 }}>
              {r.daysOut}d
            </span>
          );
        },
      },
      {
        key: "status",
        label: "Status",
        width: "120px",
        render: (r) => (
          <span
            style={{
              ...mono,
              fontSize: 10,
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {r.status}
          </span>
        ),
      },
    ],
    [navigate]
  );

  return (
    <ReportShell
      title="Upcoming Milestones"
      count={filtered.length}
      unit=" · MILESTONES"
      subtitle={`Schedule milestones starting in the ${
        WINDOWS.find((w) => w.key === windowDays)?.label.toLowerCase() ||
        "selected window"
      }`}
      onExportCSV={() =>
        exportTableCSV({
          filename: "upcoming_milestones",
          columns,
          rows: filtered,
          summary: {
            "Window": WINDOWS.find((w) => w.key === windowDays)?.label,
            "Milestones": filtered.length,
            "Generated": new Date().toLocaleString(),
          },
        })
      }
      filters={
        <FilterBar>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search milestones, projects..."
          />
          <SelectFilter
            label="Window"
            value={windowDays}
            onChange={setWindowDays}
            options={WINDOWS}
          />
        </FilterBar>
      }
    >
      <ReportTable
        columns={columns}
        rows={filtered}
        initialSort={{ key: "startDate", dir: "asc" }}
        emptyText="No milestones in the selected window."
        minWidth={1000}
      />
    </ReportShell>
  );
}
