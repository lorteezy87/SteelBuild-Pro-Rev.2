/**
 * Planner.jsx — Personal Planner (Motion-style), Phase 1 (read-only).
 *
 * "What should I personally work on this week, across every job?" Rides on
 * action_items (cross-project, assignable) — NOT schedule_tasks (the formal
 * CPM/Gantt). Two read-only tabs for P1: Plan (auto-scheduled week grid) and
 * Tasks (my open work grouped by project). Board + write-back land in P2,
 * AI in P3/P4.
 *
 * Gated behind the `planner_enabled` feature flag (ship dark).
 * Uses the SteelBuild Dark token system (CLAUDE.md §25) — the source spec's
 * "Iron Forge / Safety Orange" maps onto the existing --accent / --accent-orange
 * tokens rather than introducing a competing palette.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { EmptyState } from "@/components/design-system";
import { useFlag } from "@/hooks/useFeatureFlag";
import { computeSchedule } from "@/lib/planner/autoSchedule";
import { useMyTasks, useMyMeetings, useWorkSettings } from "@/lib/planner/usePlannerData";

const PRIORITY_COLOR = {
  Critical: "var(--danger)",
  High: "var(--accent-orange)",
  Medium: "var(--accent)",
  Low: "var(--text-muted)",
};

const DOW_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dowOf(isoDate) {
  return new Date(`${isoDate}T00:00:00`).getDay();
}

function fmtDeadline(deadline) {
  if (!deadline) return "No deadline";
  return deadline;
}

export default function Planner() {
  const plannerEnabled = useFlag("planner_enabled");
  const [tab, setTab] = useState("plan");

  const { data: tasks = [], isLoading: tasksLoading } = useMyTasks();
  const { data: meetings = [] } = useMyMeetings();
  const { data: settings } = useWorkSettings();
  const { data: projects = [] } = useQuery({
    queryKey: ["planner", "projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 60_000,
  });

  const projectName = useMemo(() => {
    const map = new Map();
    for (const p of projects) map.set(p.id, p.name || p.project_name || "Untitled project");
    return map;
  }, [projects]);

  const taskById = useMemo(() => {
    const map = new Map();
    for (const t of tasks) map.set(t.id, t);
    return map;
  }, [tasks]);

  const schedule = useMemo(() => {
    if (!settings) return null;
    return computeSchedule(tasks, settings, meetings);
  }, [tasks, settings, meetings]);

  if (!plannerEnabled) {
    return (
      <div style={{ padding: 24 }}>
        <EmptyState
          title="Planner not enabled"
          message="The Personal Planner is shipping dark. Enable the planner_enabled feature flag to turn it on."
        />
      </div>
    );
  }

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: "var(--text-primary)", fontFamily: "var(--font-heading, inherit)" }}>
            My Planner
          </h1>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            What to work on this week, across every project — auto-scheduled from your open action items.
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[
            ["plan", "Plan"],
            ["tasks", "Tasks"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                background: tab === key ? "var(--accent)" : "transparent",
                color: tab === key ? "var(--bg-base)" : "var(--text-secondary)",
                border: `1px solid ${tab === key ? "var(--accent)" : "var(--border)"}`,
                borderRadius: "var(--radius-btn)",
                padding: "6px 14px",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tasksLoading && (
        <div style={{ color: "var(--text-muted)", fontSize: 13, padding: 12 }}>Loading your work…</div>
      )}

      {!tasksLoading && tasks.length === 0 && (
        <EmptyState
          title="No tasks assigned to you yet"
          message="Action items become part of your plan once they're assigned to you. Assign yourself a task to see it scheduled here."
        />
      )}

      {!tasksLoading && tasks.length > 0 && tab === "plan" && schedule && (
        <PlanGrid schedule={schedule} taskById={taskById} />
      )}

      {!tasksLoading && tasks.length > 0 && tab === "tasks" && (
        <TaskList tasks={tasks} projectName={projectName} schedule={schedule} />
      )}
    </div>
  );
}

/** Week grid: workday columns × work-hour rows, cells filled by the scheduler. */
function PlanGrid({ schedule, taskById }) {
  const { days, hours, slotAssignments, meetingSlots } = schedule;
  const workdayDays = days.filter((d) => {
    // Only show columns that actually have a slot or meeting (keeps the grid to
    // the work week the scheduler used).
    return hours.some(
      (h) => slotAssignments.has(`${d}|${h}`) || meetingSlots.has(`${d}|${h}`),
    ) || true; // keep all 7 for orientation; scheduler already skipped non-workdays
  });

  return (
    <div style={{ overflowX: "auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `64px repeat(${workdayDays.length}, minmax(120px, 1fr))`,
          gap: 1,
          background: "var(--border)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)",
          overflow: "hidden",
          minWidth: 640,
        }}
      >
        {/* Header row */}
        <div style={{ background: "var(--bg-surface)", padding: "8px 6px", fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          HOUR
        </div>
        {workdayDays.map((d) => (
          <div key={d} style={{ background: "var(--bg-surface)", padding: "8px 6px", fontSize: 11, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
            {DOW_LABEL[dowOf(d)]} <span style={{ color: "var(--text-muted)" }}>{d.slice(5)}</span>
          </div>
        ))}

        {/* Hour rows */}
        {hours.map((h) => (
          <Row key={h} hour={h} days={workdayDays} slotAssignments={slotAssignments} meetingSlots={meetingSlots} taskById={taskById} />
        ))}
      </div>
    </div>
  );
}

function Row({ hour, days, slotAssignments, meetingSlots, taskById }) {
  return (
    <>
      <div style={{ background: "var(--bg-card)", padding: "10px 6px", fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
        {String(hour).padStart(2, "0")}:00
      </div>
      {days.map((d) => {
        const key = `${d}|${hour}`;
        const meeting = meetingSlots.get(key);
        const taskId = slotAssignments.get(key);
        const task = taskId ? taskById.get(taskId) : null;
        let content = null;
        let bg = "var(--bg-card)";
        let bar = "transparent";
        if (meeting) {
          content = meeting.title;
          bg = "var(--bg-elevated)";
          bar = "var(--text-muted)";
        } else if (task) {
          content = task.title;
          bg = "var(--bg-elevated)";
          bar = PRIORITY_COLOR[task.priority] || "var(--accent)";
        }
        return (
          <div key={key} style={{ background: bg, padding: "6px 6px 6px 8px", minHeight: 30, borderLeft: `2px solid ${bar}` }}>
            {content && (
              <div style={{ fontSize: 11, color: "var(--text-primary)", lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={content}>
                {meeting && <span style={{ color: "var(--text-muted)", marginRight: 4 }}>◷</span>}
                {content}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/** My open work grouped by project, with the scheduler's late/unscheduled flag. */
function TaskList({ tasks, projectName, schedule }) {
  const flags = schedule?.taskFlags;
  const groups = useMemo(() => {
    const map = new Map();
    for (const t of tasks) {
      const key = t.projectId || "—";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    return [...map.entries()];
  }, [tasks]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {groups.map(([projectId, items]) => (
        <div key={projectId}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
            {projectName.get(projectId) || "Unassigned project"}
            <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>{items.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {items.map((t) => {
              const flag = flags?.get(t.id);
              return (
                <div
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderLeft: `3px solid ${PRIORITY_COLOR[t.priority] || "var(--accent)"}`,
                    borderRadius: "var(--radius-card)",
                    padding: "8px 12px",
                  }}
                >
                  <span style={{ flex: 1, fontSize: 13, color: "var(--text-primary)" }}>{t.title}</span>
                  <span style={{ fontSize: 10, color: PRIORITY_COLOR[t.priority], fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>
                    {t.priority}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    {t.estimatedHours}h
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", minWidth: 90, textAlign: "right" }}>
                    {fmtDeadline(t.deadline)}
                  </span>
                  {flag === "late" && (
                    <span style={{ fontSize: 9, color: "var(--danger)", fontFamily: "var(--font-mono)", fontWeight: 700 }}>LATE</span>
                  )}
                  {flag === "unscheduled" && (
                    <span style={{ fontSize: 9, color: "var(--accent-orange)", fontFamily: "var(--font-mono)", fontWeight: 700 }}>UNSCHEDULED</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
