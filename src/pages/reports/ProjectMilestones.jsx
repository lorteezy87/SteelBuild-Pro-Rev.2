/**
 * Project Milestones — schedule_tasks where task_type='Milestone',
 * grouped by project, sorted by start_date ascending.
 *
 * Different lens from "Upcoming Milestones": this report shows ALL
 * milestones (past, present, future), with a project filter and an
 * optional "hide completed" toggle. Click a row to navigate to the
 * project page (drawer opens via existing project ScheduleTab logic).
 */

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { PHASES, PHASE_COLORS } from "@/utils/phases";
import ReportShell from "./ReportShell";
import ReportTable from "./ReportTable";
import { FilterBar, SearchInput, SelectFilter, ToggleGroup } from "./ReportFilters";
import { exportTableCSV, formatDate } from "./utils";
import { mono, body } from "./constants";

const SUPPORTED_PHASES = new Set(PHASES);

const STATUS_OPTIONS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open Only" },
  { key: "complete", label: "Completed" },
];

export default function ProjectMilestones() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("open");

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
    return tasks
      .filter((t) => t.task_type === "Milestone" || t.is_milestone === true)
      .map((t) => {
        const proj = projectsById.get(t.project_id);
        return {
          id: t.id,
          taskName: t.task_name || "Untitled milestone",
          projectId: t.project_id,
          projectName: proj?.name || "—",
          projectNumber: proj?.project_number || "",
          phase: t.phase || "",
          startDate: t.start_date,
          endDate: t.end_date,
          status: t.status || "Not Started",
        };
      })
      .sort((a, b) => {
        const byProj = a.projectName.localeCompare(b.projectName);
        if (byProj !== 0) return byProj;
        const da = a.startDate ? new Date(a.startDate).getTime() : Infinity;
        const db = b.startDate ? new Date(b.startDate).getTime() : Infinity;
        return da - db;
      });
  }, [tasks, projectsById]);

  const filtered = useMemo(() => {
    let out = rows;
    if (projectFilter !== "all") out = out.filter((r) => r.projectId === projectFilter);
    if (statusFilter === "open") out = out.filter((r) => r.status !== "Complete" && r.status !== "Cancelled");
    if (statusFilter === "complete") out = out.filter((r) => r.status === "Complete");
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((r) =>
        r.taskName.toLowerCase().includes(q) ||
        r.projectName.toLowerCase().includes(q) ||
        r.projectNumber.toLowerCase().includes(q)
      );
    }
    return out;
  }, [rows, search, projectFilter, statusFilter]);

  const columns = useMemo(() => [
    {
      key: "projectName",
      label: "Project",
      width: "minmax(180px, 1.5fr)",
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
      label: "Milestone",
      width: "minmax(220px, 2fr)",
      render: (r) => (
        <span style={{ ...body, fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, ...mono, fontSize: 10, color: "var(--text-secondary)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
            {r.phase || "—"}
          </span>
        );
      },
    },
    {
      key: "startDate",
      label: "Date",
      width: "110px",
      render: (r) => <span style={{ ...mono, color: "var(--text-primary)" }}>{formatDate(r.startDate)}</span>,
      csvValue: (r) => r.startDate || "",
    },
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
        return (
          <span style={{ ...mono, fontSize: 10, color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {r.status}
          </span>
        );
      },
    },
  ], []);

  return (
    <ReportShell
      title="Project Milestones"
      count={filtered.length}
      unit=" · MILESTONES"
      subtitle="All schedule milestones across the portfolio, grouped by project."
      onExportCSV={() => exportTableCSV({
        filename: "project_milestones",
        columns,
        rows: filtered,
        summary: { "Milestones": filtered.length, "Generated": new Date().toLocaleString() },
      })}
      filters={
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search milestones, projects..." />
          <SelectFilter
            label="Project"
            value={projectFilter}
            onChange={setProjectFilter}
            options={[
              { key: "all", label: "All projects" },
              ...projects.map((p) => ({ key: p.id, label: p.project_number ? `${p.project_number} — ${p.name}` : p.name })),
            ]}
          />
          <ToggleGroup options={STATUS_OPTIONS} active={statusFilter} onChange={setStatusFilter} />
        </FilterBar>
      }
    >
      <ReportTable
        columns={columns}
        rows={filtered}
        initialSort={{ key: "startDate", dir: "asc" }}
        emptyText="No milestones match the current filters."
        minWidth={1000}
        onRowClick={(r) => navigate(createPageUrl("Projects") + `?id=${r.projectId}`)}
      />
    </ReportShell>
  );
}
