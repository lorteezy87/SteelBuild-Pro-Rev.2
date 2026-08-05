/**
 * Upcoming Key Activities — schedule_tasks starting in the next 14 days.
 *
 * Different lens from "Upcoming Milestones": broader scope (Install,
 * Fab, Submittal, Task), grouped by project. Sorted by start_date asc
 * within each project group.
 */

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { entities } from "@/api/supabaseClient";
import { createPageUrl } from "@/utils";
import { PHASES, PHASE_COLORS } from "@/utils/phases";
import ReportShell from "./ReportShell";
import { FilterBar, SelectFilter } from "./ReportFilters";
import { formatDate } from "./utils";
import { mono, body, CARD } from "./constants";
import { isSummaryTask, buildParentIdSet } from "@/lib/schedule/summaryTasks";

const SUPPORTED_PHASES = new Set(PHASES);

const WINDOWS = [
  { key: "7", label: "Next 7 days" },
  { key: "14", label: "Next 14 days" },
  { key: "30", label: "Next 30 days" },
];

export default function UpcomingKeyActivities() {
  const navigate = useNavigate();
  const [windowDays, setWindowDays] = useState("14");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["schedule-tasks-all"],
    queryFn: () => entities.ScheduleTask.list(),
  });

  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const grouped = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const windowEnd = new Date(today.getTime() + Number(windowDays) * 86400000);
    // Summary/parent rows are not real "activities" — they only span their
    // children, which are listed individually. Exclude them so the list shows
    // actionable leaf work, not redundant parent buckets.
    const parentIds = buildParentIdSet(tasks);
    const m = {};
    tasks.forEach((t) => {
      if (!t.start_date) return;
      if (isSummaryTask(t, parentIds)) return;
      const d = new Date(t.start_date);
      if (d < today || d > windowEnd) return;
      if (t.status === "Complete" || t.status === "Cancelled") return;
      const proj = projectsById.get(t.project_id);
      const key = t.project_id || "_unknown";
      if (!m[key]) {
        m[key] = {
          project: proj,
          projectId: t.project_id,
          projectName: proj?.name || "—",
          projectNumber: proj?.project_number || "",
          tasks: [],
        };
      }
      m[key].tasks.push({
        id: t.id,
        taskName: t.task_name || "Untitled",
        type: t.task_type || "Task",
        phase: t.phase || "",
        startDate: t.start_date,
        endDate: t.end_date,
        status: t.status || "Not Started",
        daysOut: Math.round((d - today) / 86400000),
      });
    });
    Object.values(m).forEach((g) => g.tasks.sort((a, b) => new Date(a.startDate) - new Date(b.startDate)));
    return Object.values(m).sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [tasks, projectsById, windowDays]);

  const totalActivities = grouped.reduce((s, g) => s + g.tasks.length, 0);

  return (
    <ReportShell
      title="Upcoming Key Activities"
      count={totalActivities}
      unit=" · ACTIVITIES"
      subtitle={`Schedule tasks starting in the ${WINDOWS.find((w) => w.key === windowDays)?.label.toLowerCase()}, grouped by project.`}
      filters={
        <FilterBar>
          <SelectFilter
            label="Window"
            value={windowDays}
            onChange={setWindowDays}
            options={WINDOWS}
          />
        </FilterBar>
      }
    >
      {grouped.length === 0 ? (
        <div style={{ ...CARD, padding: 48, textAlign: "center", ...mono, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          No activities starting in the selected window.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {grouped.map((g) => (
            <div key={g.projectId || "_unknown"} style={{ ...CARD, padding: 0 }}>
              <button
                onClick={() => g.projectId && navigate(createPageUrl("Projects") + `?id=${g.projectId}`)}
                style={{ background: "transparent", border: "none", textAlign: "left", cursor: g.projectId ? "pointer" : "default", padding: "12px 16px", borderBottom: "1px solid var(--divider)", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}
              >
                <div>
                  <div style={{ ...body, fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{g.projectName}</div>
                  {g.projectNumber && <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{g.projectNumber}</div>}
                </div>
                <div style={{ ...mono, fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>{g.tasks.length}</div>
              </button>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {g.tasks.map((t) => {
                  const phaseColor = SUPPORTED_PHASES.has(t.phase) ? PHASE_COLORS[t.phase] : "var(--text-muted)";
                  const daysColor = t.daysOut <= 3 ? "var(--status-error)" : t.daysOut <= 7 ? "var(--status-warning)" : "var(--text-secondary)";
                  return (
                    <div
                      key={t.id}
                      style={{ display: "grid", gridTemplateColumns: "minmax(220px, 2fr) 100px minmax(120px, 1fr) 110px 90px", gap: 12, padding: "10px 16px", borderTop: "1px solid var(--divider)", alignItems: "center" }}
                    >
                      <div style={{ ...body, fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.taskName}
                      </div>
                      <span style={{ ...mono, fontSize: 10, color: "var(--text-secondary)" }}>{t.type}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, ...mono, fontSize: 10, color: "var(--text-secondary)" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: phaseColor }} />
                        {t.phase || "—"}
                      </span>
                      <span style={{ ...mono, color: "var(--text-primary)", fontSize: 11 }}>{formatDate(t.startDate)}</span>
                      <span style={{ ...mono, color: daysColor, fontSize: 11, fontWeight: 700, textAlign: "right" }}>
                        {t.daysOut === 0 ? "Today" : `${t.daysOut}d`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </ReportShell>
  );
}
