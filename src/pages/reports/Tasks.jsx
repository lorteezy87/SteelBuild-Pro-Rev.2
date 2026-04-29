/**
 * Tasks — flat schedule_tasks list across the entire portfolio.
 *
 * Generic but useful: filter by project / phase / type / status,
 * search by name. Designed as the workhorse "where is X" report.
 */

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { PHASES, PHASE_COLORS } from "@/utils/phases";
import ReportShell from "./ReportShell";
import ReportTable from "./ReportTable";
import { FilterBar, SearchInput, SelectFilter } from "./ReportFilters";
import { exportTableCSV, formatDate, formatPercent } from "./utils";
import { mono, body } from "./constants";

const SUPPORTED_PHASES = new Set(PHASES);

// Live `schedule_tasks.task_type` values: Task / Submittal / Install /
// Fabrication / Milestone / Delivery. The earlier dropdown also offered
// Procurement / Detailing / Closeout, none of which exist on real rows
// — selecting them returned 0 results, which read like a bug.
const TASK_TYPES = ["Task", "Milestone", "Submittal", "Fabrication", "Install", "Delivery"];
const STATUSES = ["Not Started", "In Progress", "Complete", "Delayed", "On Hold", "Cancelled"];

export default function Tasks() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

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
    return tasks.map((t) => {
      const proj = projectsById.get(t.project_id);
      return {
        id: t.id,
        taskName: t.task_name || "Untitled task",
        projectId: t.project_id,
        projectName: proj?.name || "—",
        projectNumber: proj?.project_number || "",
        phase: t.phase || "",
        type: t.task_type || "Task",
        status: t.status || "Not Started",
        startDate: t.start_date,
        endDate: t.end_date,
        pct: Number(t.percent_complete) || 0,
        assignedTo: t.assigned_to || "",
      };
    });
  }, [tasks, projectsById]);

  const filtered = useMemo(() => {
    let out = rows;
    if (projectFilter !== "all") out = out.filter((r) => r.projectId === projectFilter);
    if (phaseFilter !== "all") out = out.filter((r) => r.phase === phaseFilter);
    if (typeFilter !== "all") out = out.filter((r) => r.type === typeFilter);
    if (statusFilter !== "all") out = out.filter((r) => r.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((r) =>
        r.taskName.toLowerCase().includes(q) ||
        r.projectName.toLowerCase().includes(q) ||
        r.assignedTo.toLowerCase().includes(q)
      );
    }
    return out;
  }, [rows, search, projectFilter, phaseFilter, typeFilter, statusFilter]);

  const columns = useMemo(() => [
    {
      key: "projectName",
      label: "Project",
      width: "minmax(160px, 1.4fr)",
      render: (r) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis" }}>{r.projectName}</div>
          {r.projectNumber && (
            <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{r.projectNumber}</div>
          )}
        </div>
      ),
    },
    {
      key: "taskName",
      label: "Task",
      width: "minmax(220px, 2fr)",
      render: (r) => (
        <span style={{ ...body, fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {r.taskName}
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
      key: "status",
      label: "Status",
      width: "120px",
      render: (r) => {
        const color =
          r.status === "Complete" ? "var(--status-success)" :
          r.status === "Delayed" ? "var(--status-error)" :
          r.status === "In Progress" ? "var(--accent)" :
          "var(--text-secondary)";
        return <span style={{ ...mono, fontSize: 10, color, textTransform: "uppercase", letterSpacing: "0.06em" }}>{r.status}</span>;
      },
    },
    { key: "startDate", label: "Start", width: "100px", render: (r) => formatDate(r.startDate), csvValue: (r) => r.startDate || "" },
    { key: "endDate", label: "End", width: "100px", render: (r) => formatDate(r.endDate), csvValue: (r) => r.endDate || "" },
    {
      key: "pct",
      label: "%",
      width: "70px",
      align: "right",
      render: (r) => <span style={{ ...mono, color: r.pct >= 100 ? "var(--status-success)" : "var(--text-secondary)" }}>{formatPercent(r.pct, 0)}</span>,
    },
    { key: "assignedTo", label: "Assignee", width: "minmax(120px, 1fr)" },
  ], []);

  return (
    <ReportShell
      title="Tasks"
      count={filtered.length}
      unit=" · TASKS"
      subtitle="Every schedule task across the portfolio. Use filters to slice."
      onExportCSV={() => exportTableCSV({
        filename: "tasks",
        columns,
        rows: filtered,
        summary: { "Tasks": filtered.length, "Generated": new Date().toLocaleString() },
      })}
      filters={
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search tasks, projects, assignees..." />
          <SelectFilter
            label="Project"
            value={projectFilter}
            onChange={setProjectFilter}
            options={[
              { key: "all", label: "All projects" },
              ...projects.map((p) => ({ key: p.id, label: p.project_number ? `${p.project_number} — ${p.name}` : p.name })),
            ]}
          />
          <SelectFilter
            label="Phase"
            value={phaseFilter}
            onChange={setPhaseFilter}
            options={[{ key: "all", label: "All phases" }, ...PHASES.map((p) => ({ key: p, label: p }))]}
          />
          <SelectFilter
            label="Type"
            value={typeFilter}
            onChange={setTypeFilter}
            options={[{ key: "all", label: "All types" }, ...TASK_TYPES.map((t) => ({ key: t, label: t }))]}
          />
          <SelectFilter
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[{ key: "all", label: "All" }, ...STATUSES.map((s) => ({ key: s, label: s }))]}
          />
        </FilterBar>
      }
    >
      <ReportTable
        columns={columns}
        rows={filtered}
        initialSort={{ key: "startDate", dir: "asc" }}
        emptyText={tasks.length === 0 ? "No schedule tasks yet." : "No tasks match the current filters."}
        minWidth={1300}
        onRowClick={(r) => navigate(createPageUrl("Projects") + `?id=${r.projectId}`)}
      />
    </ReportShell>
  );
}
