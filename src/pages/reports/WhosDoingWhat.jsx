/**
 * Who's Doing What — schedule_tasks currently In Progress, grouped by
 * assignee (`assigned_to`).
 *
 * One card per person, showing their active task list with project,
 * phase, end date. Designed for the Monday morning "where are we?"
 * standup.
 */

import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { entities } from "@/api/supabaseClient";
import { createPageUrl } from "@/utils";
import { PHASES, PHASE_COLORS } from "@/utils/phases";
import ReportShell from "./ReportShell";
import { formatDate, formatPercent } from "./utils";
import { mono, body, CARD } from "./constants";
import {
  countActiveTasks,
  groupInProgressByAssignee,
} from "./whosDoingWhatHelpers";

const SUPPORTED_PHASES = new Set(PHASES);

export default function WhosDoingWhat() {
  const navigate = useNavigate();

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["schedule-tasks-all"],
    queryFn: () => entities.ScheduleTask.list(),
  });

  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const grouped = useMemo(
    () => groupInProgressByAssignee({ tasks, projectsById }),
    [tasks, projectsById],
  );

  const totalActive = countActiveTasks(grouped);

  return (
    <ReportShell
      title="Who's Doing What"
      count={grouped.length}
      unit=" · PEOPLE"
      subtitle={`${totalActive} tasks currently in progress across the portfolio.`}
    >
      {grouped.length === 0 ? (
        <div style={{ ...CARD, padding: 48, textAlign: "center", ...mono, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          No tasks in progress right now.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
          {grouped.map(({ name, items }) => (
            <div key={name} style={{ ...CARD, padding: 0, display: "flex", flexDirection: "column", gap: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid var(--divider)" }}>
                <div style={{ ...body, fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{name}</div>
                <div style={{ ...mono, fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>{items.length}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {items.map((it) => {
                  const phaseColor = SUPPORTED_PHASES.has(it.phase) ? PHASE_COLORS[it.phase] : "var(--text-muted)";
                  return (
                    <button
                      key={it.id}
                      onClick={() => navigate(createPageUrl("Projects") + `?id=${it.projectId}`)}
                      style={{
                        background: "transparent",
                        border: "none",
                        textAlign: "left",
                        cursor: "pointer",
                        padding: "10px 14px",
                        borderTop: "1px solid var(--divider)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-row-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div style={{ ...body, fontSize: 12, color: "var(--text-primary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {it.taskName}
                      </div>
                      <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {it.projectNumber ? `${it.projectNumber} · ` : ""}{it.projectName}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, ...mono, fontSize: 9, color: "var(--text-secondary)" }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: phaseColor }} />
                          {it.phase || "—"}
                        </span>
                        <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>
                          {it.pct ? `${formatPercent(it.pct, 0)} · ` : ""}{formatDate(it.endDate)}
                        </span>
                      </div>
                    </button>
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
