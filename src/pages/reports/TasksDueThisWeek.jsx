/**
 * Tasks Due This Week — schedule_tasks where end_date is in the next
 * 7 days AND status !== 'Complete'. Sorted ascending by due date so
 * the most urgent rows surface at the top.
 *
 * Includes a small KPI strip:
 *   - tasks due in 7 days
 *   - tasks already overdue (end_date < today, status !== Complete)
 *   - critical-priority tasks in the window
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
import KPICard from "./KPICard";
import { exportTableCSV, formatDate } from "./utils";
import { mono, body } from "./constants";

const SUPPORTED_PHASES = new Set(PHASES);

export default function TasksDueThisWeek() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("week"); // "week" | "overdue" | "both"

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

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);
  const weekEnd = useMemo(
    () => new Date(today.getTime() + 7 * 86400000),
    [today]
  );

  const enriched = useMemo(() => {
    return tasks
      .filter((t) => t.end_date && t.status !== "Complete")
      .map((t) => {
        const proj = projectsById.get(t.project_id);
        const due = new Date(t.end_date);
        const overdue = due < today;
        const inWeek = !overdue && due <= weekEnd;
        return {
          id: t.id,
          taskName: t.task_name || "Untitled task",
          projectId: t.project_id,
          projectName: proj?.name || "—",
          projectNumber: proj?.project_number || "",
          phase: t.phase || "",
          startDate: t.start_date,
          endDate: t.end_date,
          status: t.status || "Not Started",
          assignee: t.assigned_to || "",
          priority: t.priority || "",
          taskType: t.task_type || "",
          due,
          overdue,
          inWeek,
        };
      });
  }, [tasks, projectsById, today, weekEnd]);

  const scoped = useMemo(() => {
    if (scope === "week") return enriched.filter((r) => r.inWeek);
    if (scope === "overdue") return enriched.filter((r) => r.overdue);
    return enriched.filter((r) => r.inWeek || r.overdue);
  }, [enriched, scope]);

  const filtered = useMemo(() => {
    let out = scoped;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(
        (r) =>
          r.taskName.toLowerCase().includes(q) ||
          r.projectName.toLowerCase().includes(q) ||
          r.assignee.toLowerCase().includes(q)
      );
    }
    return [...out].sort((a, b) => a.due - b.due);
  }, [scoped, search]);

  const dueInWeekCount = enriched.filter((r) => r.inWeek).length;
  const overdueCount = enriched.filter((r) => r.overdue).length;
  const criticalCount = enriched.filter(
    (r) => (r.inWeek || r.overdue) && r.priority === "Critical"
  ).length;

  const columns = useMemo(
    () => [
      {
        key: "endDate",
        label: "Due",
        width: "100px",
        render: (r) => (
          <span
            style={{
              ...mono,
              color: r.overdue ? "var(--status-error)" : "var(--text-primary)",
              fontWeight: 700,
            }}
          >
            {formatDate(r.endDate)}
          </span>
        ),
        csvValue: (r) => r.endDate,
        sortValue: (r) => r.due.getTime(),
      },
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
        key: "taskName",
        label: "Task",
        width: "minmax(240px, 2fr)",
        render: (r) => (
          <div
            style={{
              ...body,
              fontSize: 12,
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
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
        key: "assignee",
        label: "Assignee",
        width: "minmax(110px, 1fr)",
        render: (r) => (
          <span style={{ ...body, fontSize: 12 }}>{r.assignee || "—"}</span>
        ),
      },
      {
        key: "priority",
        label: "Priority",
        width: "90px",
        render: (r) => (
          <span
            style={{
              ...mono,
              fontSize: 10,
              color:
                r.priority === "Critical"
                  ? "var(--status-error)"
                  : r.priority === "High"
                    ? "var(--status-warning)"
                    : "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {r.priority || "—"}
          </span>
        ),
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
                r.status === "In Progress"
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
    ],
    [navigate]
  );

  return (
    <ReportShell
      title="Tasks Due This Week"
      count={filtered.length}
      unit=" · TASKS"
      subtitle={`Window: ${formatDate(today)} → ${formatDate(weekEnd)}`}
      onExportCSV={() =>
        exportTableCSV({
          filename: "tasks_due_this_week",
          columns,
          rows: filtered,
          summary: {
            "Tasks": filtered.length,
            "Due in 7 days": dueInWeekCount,
            "Overdue": overdueCount,
            "Critical": criticalCount,
            "Generated": new Date().toLocaleString(),
          },
        })
      }
      filters={
        <FilterBar>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search task, project, assignee..."
          />
          <ToggleGroup
            options={[
              { key: "week", label: "Due this week" },
              { key: "overdue", label: "Overdue" },
              { key: "both", label: "Both" },
            ]}
            active={scope}
            onChange={setScope}
          />
        </FilterBar>
      }
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        <KPICard
          label="Due in 7 days"
          value={dueInWeekCount}
          detail="Open tasks ending this week"
          borderColor="var(--accent)"
        />
        <KPICard
          label="Overdue"
          value={overdueCount}
          detail="End date passed, not Complete"
          borderColor="var(--status-error)"
          badge={overdueCount > 0 ? "past due" : null}
        />
        <KPICard
          label="Critical priority"
          value={criticalCount}
          detail="In the window above"
          borderColor="var(--status-warning)"
        />
      </div>

      <ReportTable
        columns={columns}
        rows={filtered}
        initialSort={{ key: "endDate", dir: "asc" }}
        emptyText="Nothing due in the selected window."
        minWidth={1100}
      />
    </ReportShell>
  );
}
