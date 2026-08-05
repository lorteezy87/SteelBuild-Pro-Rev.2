/**
 * Tasks Completed — schedule_tasks where status='Complete', filtered by
 * recency (30 / 60 / 90 / all-time).
 *
 * Completion date is derived from `end_date` (the canonical "this task
 * is done as of" date in schedule_tasks). Falls back to `updated_at`
 * if end_date is missing.
 */

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { entities } from "@/api/supabaseClient";
import { createPageUrl } from "@/utils";
import { PHASES, PHASE_COLORS } from "@/utils/phases";
import ReportShell from "./ReportShell";
import ReportTable from "./ReportTable";
import { FilterBar, SearchInput, ToggleGroup } from "./ReportFilters";
import { exportTableCSV, formatDate } from "./utils";
import { mono, body } from "./constants";
import {
  buildCompletedTaskRows,
  filterCompletedTaskRows,
  COMPLETED_WINDOWS as WINDOWS,
} from "./tasksCompletedHelpers";

const SUPPORTED_PHASES = new Set(PHASES);

export default function TasksCompleted() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [windowDays, setWindowDays] = useState("30");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["schedule-tasks-all"],
    queryFn: () => entities.ScheduleTask.list(),
  });

  const projectsById = useMemo(() => buildIdMap(projects), [projects]);

  const rows = useMemo(
    () => buildCompletedTaskRows(tasks, projectsById, windowDays),
    [tasks, projectsById, windowDays],
  );

  const filtered = useMemo(
    () => filterCompletedTaskRows(rows, search),
    [rows, search],
  );

  const columns = useMemo(() => [
    {
      key: "projectName",
      label: "Project",
      width: "minmax(180px, 1.4fr)",
      render: (r) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis" }}>{r.projectName}</div>
          {r.projectNumber && <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{r.projectNumber}</div>}
        </div>
      ),
    },
    {
      key: "taskName",
      label: "Task",
      width: "minmax(220px, 2fr)",
      render: (r) => (
        <span style={{ ...body, fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          ✓ {r.taskName}
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
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, ...mono, fontSize: 10, color: "var(--text-secondary)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
            {r.phase || "—"}
          </span>
        );
      },
    },
    { key: "type", label: "Type", width: "100px", render: (r) => <span style={{ ...mono, fontSize: 10, color: "var(--text-secondary)" }}>{r.type}</span> },
    {
      key: "completedAt",
      label: "Completed",
      width: "110px",
      render: (r) => <span style={{ ...mono, color: "var(--status-success)" }}>{formatDate(r.completedAt)}</span>,
      csvValue: (r) => r.completedAt || "",
    },
    { key: "assignedTo", label: "Assignee", width: "minmax(120px, 1fr)" },
  ], []);

  return (
    <ReportShell
      title="Tasks Completed"
      count={filtered.length}
      unit=" · TASKS"
      subtitle={`Schedule tasks marked complete · ${WINDOWS.find((w) => w.key === windowDays)?.label.toLowerCase()}`}
      onExportCSV={() => exportTableCSV({
        filename: "tasks_completed",
        columns,
        rows: filtered,
        summary: { "Window": WINDOWS.find((w) => w.key === windowDays)?.label, "Tasks": filtered.length, "Generated": new Date().toLocaleString() },
      })}
      filters={
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search completed tasks..." />
          <ToggleGroup options={WINDOWS} active={windowDays} onChange={setWindowDays} />
        </FilterBar>
      }
    >
      <ReportTable
        columns={columns}
        rows={filtered}
        initialSort={{ key: "completedAt", dir: "desc" }}
        emptyText="No completed tasks in the selected window."
        minWidth={1100}
        onRowClick={(r) => navigate(createPageUrl("Projects") + `?id=${r.projectId}`)}
      />
    </ReportShell>
  );
}
