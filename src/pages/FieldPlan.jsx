import React, { useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { useProjectContext } from "../components/shared/ProjectContext";
import { CommandBar, KpiTile, Button } from "@/components/design-system";
import { PhoenixPanel } from "../components/shared/PhoenixPanel";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { toast } from "sonner";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import { daysUntil, toLocalMidnight, startOfToday } from "@/lib/dateMath";
import { downloadIcs, scheduleTaskToEvent } from "@/lib/icsExport";

/**
 * FieldPlan — short-interval planning board.
 *
 * A field-first, crew-grouped, blocker-aware view of the next 7/14/21
 * days. This is what a PM shows at Monday morning's crew meeting and
 * what a foreman flips open on a phone at the jobsite.
 *
 * Rows = crews. Columns = days. Cells = tasks scheduled for that
 * (crew, day). Each task card carries inline blocker chips (RFI /
 * submittal / delivery) so the foreman sees "can I start this?" at a
 * glance without drilling in.
 *
 * Printable layout (print stylesheet inline below) so the plan can be
 * tacked to the jobsite trailer wall.
 */

const HORIZON_OPTIONS = [
  { days: 7,  label: "7-DAY"  },
  { days: 14, label: "14-DAY" },
  { days: 21, label: "21-DAY" },
];

const UNASSIGNED_CREW = "__unassigned";

export default function FieldPlan() {
  const { activeProject } = useProjectContext();
  const projectId = activeProject?.id;
  const [horizonDays, setHorizonDays] = useState(14);
  const [onlyBlocked, setOnlyBlocked] = useState(false);

  // ── Data ───────────────────────────────────────────────────────────
  const {
    data: tasks = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["field-plan-tasks", projectId, horizonDays],
    queryFn: async () => {
      if (!projectId) return [];
      const end = new Date();
      end.setDate(end.getDate() + horizonDays);
      return entities.ScheduleTask.filter({
        project_id: projectId,
        "end_date.gte": startOfToday().toISOString().slice(0, 10),
        "start_date.lte": end.toISOString().slice(0, 10),
      }, "start_date");
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const { data: rfis = [] } = useQuery({
    queryKey: ["field-plan-rfis", projectId],
    queryFn: () => projectId ? entities.RFI.filter({ project_id: projectId, status: ["Open", "Submitted", "Under Review"] }) : [],
    enabled: !!projectId,
  });

  const { data: submittals = [] } = useQuery({
    queryKey: ["field-plan-submittals", projectId],
    queryFn: () => projectId ? entities.Submittal.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
  });

  const { data: deliveries = [] } = useQuery({
    queryKey: ["field-plan-deliveries", projectId],
    queryFn: () => projectId ? entities.Delivery.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
  });

  // ── Blocker lookup: resolve task.blockers entries into display chips ─
  const blockerResolvers = useMemo(() => {
    const rfiById = new Map(rfis.map((r) => [r.id, r]));
    const submById = new Map(submittals.map((s) => [s.id, s]));
    const delById = new Map(deliveries.map((d) => [d.id, d]));

    const resolve = (b) => {
      if (!b || !b.id) return null;
      if (b.type === "rfi") {
        const r = rfiById.get(b.id);
        if (!r) return null;
        const open = r.status !== "Closed" && r.status !== "Answered";
        return {
          type: "RFI",
          label: `${r.rfi_number || "RFI"} · ${r.title || ""}`.slice(0, 60),
          severity: open ? "danger" : "ok",
          resolved: !open,
        };
      }
      if (b.type === "submittal") {
        const s = submById.get(b.id);
        if (!s) return null;
        const approved = s.status === "Approved" || s.status === "Approved as Noted";
        return {
          type: "SUB",
          label: `${s.submittal_number || "SUB"} · ${s.title || ""}`.slice(0, 60),
          severity: approved ? "ok" : "warn",
          resolved: approved,
        };
      }
      if (b.type === "delivery") {
        const d = delById.get(b.id);
        if (!d) return null;
        const delivered = d.status === "Delivered";
        return {
          type: "DEL",
          label: `${d.po_number || "Delivery"} · ${d.vendor || ""}`.slice(0, 60),
          severity: delivered ? "ok" : "warn",
          resolved: delivered,
        };
      }
      return null;
    };
    return resolve;
  }, [rfis, submittals, deliveries]);

  // ── Build day columns (today → today + horizonDays-1) ─────────────
  const days = useMemo(() => {
    const out = [];
    const base = startOfToday();
    for (let i = 0; i < horizonDays; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      out.push({ iso, date: d, label, weekday: d.getDay() });
    }
    return out;
  }, [horizonDays]);

  // ── Group tasks by crew → by day ───────────────────────────────────
  const { crews, cellMap, stats } = useMemo(() => {
    const crewMap = new Map();
    const cellMap = new Map(); // key: `${crew}|${dayIso}` → array of tasks
    let total = 0;
    let blocked = 0;
    let dueThisWeek = 0;
    let completed = 0;

    for (const t of tasks) {
      const crewKey = t.crew_id || UNASSIGNED_CREW;
      const crewName = t.crew_name || "Unassigned";
      if (!crewMap.has(crewKey)) crewMap.set(crewKey, crewName);

      // Figure out which day(s) this task falls on. A task's occurrence
      // days in the horizon are its start/end intersection with [today, today+horizon].
      const start = t.start_date ? toLocalMidnight(t.start_date) : null;
      const end   = t.end_date   ? toLocalMidnight(t.end_date)   : start;
      if (!start || !end) continue;

      const chips = Array.isArray(t.blockers)
        ? t.blockers.map(blockerResolvers).filter(Boolean)
        : [];
      const isBlocked = chips.some((c) => !c.resolved);
      if (isBlocked) blocked += 1;
      if (t.status === "Complete") completed += 1;
      total += 1;

      for (const day of days) {
        const d = toLocalMidnight(day.iso);
        if (!d) continue;
        if (d >= start && d <= end) {
          const key = `${crewKey}|${day.iso}`;
          if (!cellMap.has(key)) cellMap.set(key, []);
          cellMap.get(key).push({ ...t, _chips: chips, _isBlocked: isBlocked });
          // "This week" = within 7 days
          if (daysUntil(day.iso) >= 0 && daysUntil(day.iso) < 7) dueThisWeek += 1;
        }
      }
    }

    const crews = [...crewMap.entries()].map(([key, name]) => ({ key, name }))
      .sort((a, b) => {
        if (a.key === UNASSIGNED_CREW) return 1;
        if (b.key === UNASSIGNED_CREW) return -1;
        return a.name.localeCompare(b.name);
      });
    return { crews, cellMap, stats: { total, blocked, dueThisWeek, completed } };
  }, [tasks, blockerResolvers, days]);

  // ── Export the visible plan to calendar ────────────────────────────
  const exportIcs = useCallback(() => {
    if (!projectId || tasks.length === 0) { toast.info("Nothing to export."); return; }
    const events = tasks
      .map((t) => scheduleTaskToEvent(t, activeProject?.project_number || ""))
      .filter(Boolean);
    downloadIcs({
      filename: `field-plan-${activeProject?.project_number || projectId}-${horizonDays}d.ics`,
      calendarName: `${activeProject?.project_name || "Project"} — ${horizonDays}-day Field Plan`,
      events,
    });
    toast.success(`Exported ${events.length} tasks to calendar`);
  }, [projectId, tasks, activeProject, horizonDays]);

  const printPlan = useCallback(() => { window.print(); }, []);

  // ── Render ─────────────────────────────────────────────────────────
  if (!projectId) return (
    <div className="sb-dashboard-reference-page" style={{ textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>
        Select a project to view the Field Plan
      </div>
    </div>
  );

  const visibleCrews = onlyBlocked
    ? crews.filter((c) => days.some((d) => (cellMap.get(`${c.key}|${d.iso}`) || []).some((t) => t._isBlocked)))
    : crews;

  return (
    <div className="sb-dashboard-reference-page fieldplan-root" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <CommandBar
        eyebrow={`${activeProject?.project_name || "PROJECT"} · FIELD PLAN`}
        title={`${horizonDays}-Day Field Plan`}
        count={stats.total}
        unit=" TASKS"
        subtitle={stats.blocked > 0
          ? `${stats.blocked} blocked · ${stats.dueThisWeek} this week · ${stats.completed} complete`
          : `${stats.dueThisWeek} this week · ${stats.completed} complete · no blockers`}
      >
        <div style={{ display: "flex", border: "1px solid var(--border-default)", borderRadius: 6, overflow: "hidden" }}>
          {HORIZON_OPTIONS.map((o) => (
            <button
              key={o.days}
              onClick={() => setHorizonDays(o.days)}
              style={{
                padding: "6px 12px", border: "none", cursor: "pointer",
                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                color: horizonDays === o.days ? "var(--accent)" : "var(--text-secondary)",
                background: horizonDays === o.days ? "var(--accent-muted)" : "transparent",
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setOnlyBlocked((v) => !v)}
          title="Show only crews with blocked tasks"
          style={{
            padding: "6px 12px", borderRadius: 6,
            border: onlyBlocked ? "1px solid var(--status-error)" : "1px solid var(--border-default)",
            background: onlyBlocked ? "var(--danger-muted)" : "transparent",
            color: onlyBlocked ? "var(--status-error)" : "var(--text-secondary)",
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer",
          }}
        >
          {onlyBlocked ? "BLOCKED ONLY" : "ALL CREWS"}
        </button>
        <button onClick={exportIcs} style={toolBtn}>📅 EXPORT .ICS</button>
        <button onClick={printPlan} style={toolBtn}>🖨 PRINT</button>
      </CommandBar>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <KpiTile compact label="Tasks in Window" value={stats.total} color="var(--accent)" />
        <KpiTile compact label="Blocked" value={stats.blocked} color="var(--status-error)" />
        <KpiTile compact label="This Week" value={stats.dueThisWeek} color="var(--status-warning)" />
        <KpiTile compact label="Complete" value={stats.completed} color="var(--status-success)" />
        <KpiTile compact label="Crews" value={crews.length} color="var(--phase-fab)" />
      </div>

      <PhoenixPanel>
        {isLoading ? (
          <div style={{ padding: 16 }}>
            <LoadingSkeleton variant="table" rows={6} />
          </div>
        ) : isError ? (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px 24px",
            gap: 12,
          }}>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>
              Couldn’t load field plan
            </p>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", margin: 0, textAlign: "center", maxWidth: 320 }}>
              {toUserErrorMessage(error, "Something went wrong. Try again.")}
            </p>
            <Button variant="outline" onClick={() => refetch()}>Retry</Button>
          </div>
        ) : tasks.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            No tasks in the next {horizonDays} days. Try a longer horizon, or assign tasks on the Schedule page.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="sbd-table" style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", minWidth: Math.max(900, 140 + days.length * 180) }}>
              <thead>
                <tr>
                  <th style={{ ...headerCellStyle, position: "sticky", left: 0, zIndex: 2, background: "var(--bg-sidebar)", minWidth: 140 }}>
                    CREW
                  </th>
                  {days.map((d) => (
                    <th key={d.iso} style={{
                      ...headerCellStyle,
                      minWidth: 180,
                      background: d.weekday === 0 || d.weekday === 6 ? "var(--bg-surface-high)" : "var(--bg-sidebar)",
                    }}>
                      {d.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleCrews.map((crew) => (
                  <tr key={crew.key}>
                    <td style={{
                      ...crewCellStyle,
                      position: "sticky", left: 0, zIndex: 1,
                      background: "var(--bg-surface-low)",
                      borderLeft: `3px solid ${crew.key === UNASSIGNED_CREW ? "var(--text-muted)" : "var(--accent)"}`,
                    }}>
                      {crew.name}
                    </td>
                    {days.map((d) => {
                      const items = cellMap.get(`${crew.key}|${d.iso}`) || [];
                      const isWeekend = d.weekday === 0 || d.weekday === 6;
                      return (
                        <td key={d.iso} style={{
                          ...dayCellStyle,
                          background: isWeekend ? "rgba(2,6,23,0.015)" : "transparent",
                        }}>
                          {items.length === 0 ? (
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-disabled)" }}>—</span>
                          ) : items.map((t) => <TaskCard key={t.id} task={t} />)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PhoenixPanel>

      {/* Print stylesheet — white card-style layout, no sidebar, landscape */}
      <style>{`
        @media print {
          body { background: white !important; }
          .sidebar, .nav, .command-bar-actions, button { display: none !important; }
          .fieldplan-root { padding: 12px !important; }
          table { font-size: 9px !important; }
          th, td { border: 1px solid var(--border-strong) !important; }
        }
      `}</style>
    </div>
  );
}

// ── Cards + styles ────────────────────────────────────────────────────

function TaskCard({ task }) {
  const complete = task.status === "Complete";
  const blocked = task._isBlocked;
  const borderColor = complete
    ? "var(--status-success)"
    : blocked
    ? "var(--status-error)"
    : task.status === "In Progress"
    ? "var(--accent)"
    : "var(--border-strong)";

  return (
    <div
      title={task.notes || task.task_name}
      style={{
        padding: "6px 8px",
        borderRadius: 6,
        border: `1px solid var(--border-default)`,
        borderLeft: `3px solid ${borderColor}`,
        background: complete ? "var(--success-muted)" : "var(--bg-surface)",
        marginBottom: 4,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{
        fontFamily: "var(--font-body)",
        fontSize: 11,
        fontWeight: 600,
        color: complete ? "var(--text-muted)" : "var(--text-primary)",
        textDecoration: complete ? "line-through" : "none",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {task.task_name || "Untitled"}
      </div>
      {task.phase && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2 }}>
          {task.phase}{task.percent_complete ? ` · ${task.percent_complete}%` : ""}
        </div>
      )}
      {task._chips && task._chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 5 }}>
          {task._chips.slice(0, 3).map((chip, i) => (
            <BlockerChip key={i} chip={chip} />
          ))}
          {task._chips.length > 3 && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
              +{task._chips.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function BlockerChip({ chip }) {
  const color =
    chip.severity === "danger" ? "var(--status-error)"
    : chip.severity === "warn" ? "var(--status-warning)"
    : "var(--status-success)";
  const bg =
    chip.severity === "danger" ? "var(--danger-muted)"
    : chip.severity === "warn" ? "var(--warning-muted)"
    : "var(--success-muted)";
  return (
    <span
      title={chip.label}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: "0.05em",
        padding: "1px 5px",
        borderRadius: 3,
        color,
        background: bg,
        border: `1px solid ${color}`,
        whiteSpace: "nowrap",
        textDecoration: chip.resolved ? "line-through" : "none",
        opacity: chip.resolved ? 0.6 : 1,
        maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis",
      }}
    >
      {chip.type}
    </span>
  );
}

const headerCellStyle = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--accent-border)",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-primary)",
  textAlign: "left",
};

const crewCellStyle = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--divider)",
  borderRight: "1px solid var(--divider)",
  fontFamily: "var(--font-display)",
  fontSize: 12,
  fontWeight: 700,
  color: "var(--text-primary)",
  verticalAlign: "top",
};

const dayCellStyle = {
  padding: "6px 8px",
  borderBottom: "1px solid var(--divider)",
  borderRight: "1px solid var(--divider)",
  verticalAlign: "top",
  minHeight: 80,
};

const toolBtn = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid var(--border-default)",
  background: "transparent",
  color: "var(--text-secondary)",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  cursor: "pointer",
};
