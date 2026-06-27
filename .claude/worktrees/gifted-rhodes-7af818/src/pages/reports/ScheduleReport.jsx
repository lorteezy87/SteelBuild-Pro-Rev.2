/**
 * Schedule — flat sortable table of every schedule_task across every
 * project. Columns:
 *   project | wbs | task | phase | start | end | status | assignee
 *
 * Phase chips validate against PHASES from utils/phases.js.
 *
 * (The page-route name is "Schedule" but the file is ScheduleReport.jsx
 * to avoid colliding with the existing /Schedule top-level page.)
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
import { exportTableCSV, formatDate } from "./utils";
import { mono, body } from "./constants";

const SUPPORTED_PHASES = new Set(PHASES);

const STATUSES = [
  { key: "all", label: "All statuses" },
  { key: "Not Started", label: "Not Started" },
  { key: "In Progress", label: "In Progress" },
  { key: "Complete", label: "Complete" },
  { key: "Delayed", label: "Delayed" },
  { key: "On Hold", label: "On Hold" },
];

const TYPES = [
  { key: "all", label: "All types" },
  { key: "Task", label: "Task" },
  { key: "Milestone", label: "Milestone" },
  { key: "Submittal", label: "Submittal" },
  { key: "Fabrication", label: "Fabrication" },
  { key: "Delivery", label: "Delivery" },
  { key: "Install", label: "Install" },
];

export default function ScheduleReport() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["schedule-tasks-all"],
    queryFn: () => base44.entities.ScheduleTask.list(),
  });

  const projectsById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  );

  const rows = useMemo(() => {
    return tasks.map((t) => {
      const proj = projectsById.get(t.project_id);
      return {
        id: t.id,
        taskName: t.task_name || "Untitled task",
        projectId: t.project_id,
        projectName: proj?.name || "—",
        projectNumber: proj?.project_number || "",
        wbs: t.wbs_code || "",
        phase: t.phase || "",
        startDate: t.start_date || null,
        endDate: t.end_date || null,
        status: t.status || "Not Started",
        assignee: t.assigned_to || "",
        taskType: t.task_type || "",
      };
    });
  }, [tasks, projectsById]);

  const filtered = useMemo(() => {
    let out = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(
        (r) =>
          r.taskName.toLowerCase().includes(q) ||
          r.projectName.toLowerCase().includes(q) ||
          r.wbs.toLowerCase().includes(q) ||
          r.assignee.toLowerCase().includes(q)
      );
    }
    if (phaseFilter !== "all") out = out.filter((r) => r.phase === phaseFilter);
    if (statusFilter !== "all")
      out = out.filter((r) => r.status === statusFilter);
    if (typeFilter !== "all")
      out = out.filter((r) => r.taskType === typeFilter);
    return out;
  }, [rows, search, phaseFilter, statusFilter, typeFilter]);

  const columns = useMemo(
    () => [
      {
        key: "projectName",
        label: "Project",
        width: "minmax(160px, 1.4fr)",
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
        key: "wbs",
        label: "WBS",
        width: "90px",
        render: (r) => (
          <span
            style={{
              ...mono,
              fontSize: 10,
              color: "var(--text-secondary)",
            }}
          >
            {r.wbs || "—"}
          </span>
        ),
      },
      {
        key: "taskName",
        label: "Task",
        width: "minmax(220px, 2fr)",
        render: (r) => (
          <div
            style={{
              ...body,
              fontSize: 12,
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {r.taskType === "Milestone" && (
              <span style={{ color: "var(--accent)" }}>◆</span>
            )}
            {r.taskName}
          </div>
        ),
      },
      {
        key: "phase",
        label: "Phase",
        width: "minmax(120px, 1fr)",
        render: (r) => {
          const isCanonical = SUPPORTED_PHASES.has(r.phase);
          const color = isCanonical
            ? PHASE_COLORS[r.phase]
            : "var(--text-muted)";
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
        label: "Start",
        width: "100px",
        render: (r) => formatDate(r.startDate),
        csvValue: (r) => r.startDate || "",
      },
      {
        key: "endDate",
        label: "End",
        width: "100px",
        render: (r) => formatDate(r.endDate),
        csvValue: (r) => r.endDate || "",
      },
      {
        key: "status",
        label: "Status",
        width: "110px",
        render: (r) => (
          <span
            style={{
              ...mono,
              fontSize: 10,
              color:
                r.status === "Complete"
                  ? "var(--status-success)"
                  : r.status === "In Progress"
                    ? "var(--accent)"
                    : r.status === "Delayed"
                      ? "var(--status-error)"
                      : "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {r.status}
          </span>
        ),
      },
      {
        key: "assignee",
        label: "Assignee",
        width: "minmax(110px, 1fr)",
        render: (r) => r.assignee || "—",
      },
    ],
    [navigate]
  );

  return (
    <ReportShell
      title="Schedule"
      count={filtered.length}
      unit=" · TASKS"
      subtitle={`${tasks.length} tasks total · filtered ${filtered.length}`}
      onExportCSV={() =>
        exportTableCSV({
          filename: "schedule",
          columns,
          rows: filtered,
          summary: {
            "Tasks": filtered.length,
            "Generated": new Date().toLocaleString(),
          },
        })
      }
      filters={
        <FilterBar>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search task, project, WBS, assignee..."
          />
          <SelectFilter
            label="Phase"
            value={phaseFilter}
            onChange={setPhaseFilter}
            options={[
              { key: "all", label: "All phases" },
              ...PHASES.map((p) => ({ key: p, label: p })),
            ]}
          />
          <SelectFilter
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUSES}
          />
          <SelectFilter
            label="Type"
            value={typeFilter}
            onChange={setTypeFilter}
            options={TYPES}
          />
        </FilterBar>
      }
    >
      <ReportTable
        columns={columns}
        rows={filtered}
        initialSort={{ key: "startDate", dir: "asc" }}
        emptyText={
          tasks.length === 0
            ? "No schedule tasks yet."
            : "No tasks match the current filters."
        }
        minWidth={1200}
      />
    </ReportShell>
  );
}
