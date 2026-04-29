/**
 * Team Dashboard — counts of open tasks / RFIs / action items per
 * `assigned_to` (free-text name).
 *
 * Top KPI strip + per-person card grid. A person's open queue is:
 *   - open schedule_tasks (status not Complete/Cancelled)
 *   - open rfis (status not Closed)
 *   - open action_items (status not Complete/Cancelled)
 */

import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { isRfiOpen, isActionItemOpen } from "@/lib/entityPredicates";
import ReportShell from "./ReportShell";
import { exportTableCSV } from "./utils";
import { mono, body, CARD, CARD_TITLE } from "./constants";

// Schedule tasks have their own status enum (Not Started / In Progress
// / Complete / Delayed / On Hold / Cancelled) — they're not in the
// shared entity predicates because RFIs/COs/WPs/actions live in their
// own slice of the schema. Defining locally keeps the open-task rule
// next to its caller.
const isOpenTask = (t) => t?.status !== "Complete" && t?.status !== "Cancelled";

export default function TeamDashboard() {
  const { data: tasks = [] } = useQuery({
    queryKey: ["schedule-tasks-all"],
    queryFn: () => base44.entities.ScheduleTask.list(),
  });
  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis-all"],
    queryFn: () => base44.entities.RFI.list(),
  });
  const { data: actionItems = [] } = useQuery({
    queryKey: ["action-items-all"],
    queryFn: () => base44.entities.ActionItem.list(),
  });

  const people = useMemo(() => {
    const m = {};
    const ensure = (name) => {
      if (!m[name]) m[name] = { name, tasks: 0, rfis: 0, actions: 0 };
      return m[name];
    };
    tasks.filter(isOpenTask).forEach((t) => {
      const a = (t.assigned_to || "").trim();
      if (a) ensure(a).tasks += 1;
    });
    rfis.filter(isRfiOpen).forEach((r) => {
      const a = (r.assigned_to || r.ball_in_court || "").trim();
      if (a) ensure(a).rfis += 1;
    });
    actionItems.filter(isActionItemOpen).forEach((it) => {
      const a = (it.assigned_to || "").trim();
      if (a) ensure(a).actions += 1;
    });
    Object.values(m).forEach((p) => { p.total = p.tasks + p.rfis + p.actions; });
    return Object.values(m).sort((a, b) => b.total - a.total);
  }, [tasks, rfis, actionItems]);

  const totalOpenTasks = tasks.filter(isOpenTask).length;
  const totalOpenRFIs = rfis.filter(isRfiOpen).length;
  const totalOpenActions = actionItems.filter(isActionItemOpen).length;

  const tableColumns = [
    { key: "name", label: "Assignee" },
    { key: "tasks", label: "Tasks" },
    { key: "rfis", label: "RFIs" },
    { key: "actions", label: "Actions" },
    { key: "total", label: "Total" },
  ];

  return (
    <ReportShell
      title="Team Dashboard"
      count={people.length}
      unit=" · ASSIGNEES"
      subtitle="Open work assigned per person across tasks, RFIs, and action items."
      onExportCSV={() => exportTableCSV({
        filename: "team_dashboard",
        columns: tableColumns,
        rows: people.map((p) => ({ id: p.name, ...p })),
        summary: { "Open Tasks": totalOpenTasks, "Open RFIs": totalOpenRFIs, "Open Actions": totalOpenActions, "Generated": new Date().toLocaleString() },
      })}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <div style={{ ...CARD }}>
          <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>Open tasks</div>
          <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginTop: 6 }}>{totalOpenTasks}</div>
        </div>
        <div style={{ ...CARD }}>
          <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>Open rfis</div>
          <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginTop: 6 }}>{totalOpenRFIs}</div>
        </div>
        <div style={{ ...CARD }}>
          <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>Open actions</div>
          <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginTop: 6 }}>{totalOpenActions}</div>
        </div>
        <div style={{ ...CARD }}>
          <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>People</div>
          <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: "var(--accent)", marginTop: 6 }}>{people.length}</div>
        </div>
      </div>

      {people.length === 0 ? (
        <div style={{ ...CARD, padding: 48, textAlign: "center", ...mono, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          No open work assigned to anyone.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {people.map((p) => (
            <div key={p.name} style={{ ...CARD, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ ...body, fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{p.name}</div>
                <div style={{ ...mono, fontSize: 18, fontWeight: 700, color: "var(--accent)" }}>{p.total}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, paddingTop: 6, borderTop: "1px solid var(--divider)" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{p.tasks}</span>
                  <span style={{ ...mono, fontSize: 8, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Tasks</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{p.rfis}</span>
                  <span style={{ ...mono, fontSize: 8, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>RFIs</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{p.actions}</span>
                  <span style={{ ...mono, fontSize: 8, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Actions</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </ReportShell>
  );
}
