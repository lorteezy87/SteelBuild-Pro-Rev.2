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
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { PHASES, PHASE_COLORS } from "@/utils/phases";
import ReportShell from "./ReportShell";
import ReportTable from "./ReportTable";
import { FilterBar, SearchInput, ToggleGroup } from "./ReportFilters";
import { exportTableCSV, formatDate } from "./utils";
import { mono, body } from "./constants";

const SUPPORTED_PHASES = new Set(PHASES);

const WINDOWS = [
  { key: "30", label: "Last 30 days" },
  { key: "60", label: "Last 60 days" },
  { key: "90", label: "Last 90 days" },
  { key: "all", label: "All time" },
];

export default function TasksCompleted() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [windowDays, setWindowDays] = useState("30");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["schedule-tasks-all"],
    queryFn: () => base44.entities.ScheduleTask.list(),
  });

  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const rows = useMemo(() => {
    const now = new Date();
    const windowMs = windowDays === "all" ? Infinity : Number(windowDays) * 86400000;
    return tasks
      .filter((t) => t.status === "Complete")
      .map((t) => {
        const proj = projectsById.get(t.project_id);
        const completedAt = t.end_date || t.updated_at || t.created_at;
        return {
          id: t.id,
          taskName: t.task_name || "Untitled",
          projectId: t.project_id,
          projectName: proj?.name || "—",
          projectNumber: proj?.project_number || "",
          phase: t.phase || "",
          type: t.task_type || "Task",
          completedAt,
          assignedTo: t.assigned_to || "",
        };
      })
      .filter((r) => {
        if (!r.completedAt) return windowDays === "all";
        const diff = now - new Date(r.completedAt);
        return diff >= 0 && diff <= windowMs;
      });
  }, [tasks, projectsById, windowDays]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      r.taskName.toLowerCase().includes(q) ||
      r.projectName.toLowerCase().includes(q) ||
      r.assignedTo.toLowerCase().includes(q)
    );
  }, [rows, search]);

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
