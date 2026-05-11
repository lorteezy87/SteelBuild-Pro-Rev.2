import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, GitBranch, Route, ShieldAlert, Sparkles, Target, TrendingUp, Zap } from "lucide-react";
import { computeEffectiveDates } from "@/services/scheduleCascade";
import { PHASES } from "@/utils/phases";
import { Button } from "@/components/design-system";
import { formatDateShort } from "@/components/shared/formatters";

const CLOSED_STATUSES = ["complete", "completed", "closed", "cancelled", "canceled"];

function dateValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isOpenTask(task) {
  const status = String(task?.status || "").toLowerCase();
  return !CLOSED_STATUSES.some((closed) => status.includes(closed));
}

function daysFromToday(value) {
  const parsed = dateValue(value);
  if (!parsed) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  return Math.round((parsed - today) / 86400000);
}

function taskName(task) {
  return task?.task_name || task?.name || task?.title || "Unnamed task";
}

function phaseOf(task) {
  return PHASES.includes(task?.phase) ? task.phase : "Unassigned";
}

function dependencyIds(task) {
  const raw = task?.dependencies || task?.predecessors || task?.predecessor_ids;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return raw.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function dependencyCount(task) {
  return dependencyIds(task).length;
}

function taskMetadata(task) {
  if (!task?.metadata) return {};
  if (typeof task.metadata === "object") return task.metadata;
  if (typeof task.metadata === "string") {
    try {
      const parsed = JSON.parse(task.metadata);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function isCriticalTask(task) {
  const metadata = taskMetadata(task);
  return Boolean(metadata.is_critical || metadata.critical_path || task?.is_critical || task?.critical_path);
}

function progressValue(task) {
  const value = Number(task?.percent_complete);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

function taskDate(task) {
  return task?.end_date || task?.start_date || task?.target_date || null;
}

function formatBriefTask(task) {
  const date = taskDate(task);
  return `${taskName(task)} (${phaseOf(task)} / ${task?.status || "No status"} / ${date ? formatDateShort(date) : "TBD"})`;
}

function daysBetween(task, field, min, max) {
  const days = daysFromToday(task?.[field]);
  return days != null && days >= min && days <= max;
}

function shiftedByDays(effective) {
  const value = Number(effective?.shiftedBy);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function buildBrief(tasks) {
  const openTasks = tasks.filter(isOpenTask);
  const effectiveDates = computeEffectiveDates(tasks);
  const delayed = openTasks.filter((task) => String(task.status || "").toLowerCase().includes("delay"));
  const tbd = openTasks.filter((task) => !task.start_date || !task.end_date);
  const critical = openTasks.filter(isCriticalTask);
  const overdue = openTasks.filter((task) => {
    const days = daysFromToday(task.end_date);
    return days != null && days < 0;
  });
  const stalled = openTasks.filter((task) => {
    const startDelta = daysFromToday(task.start_date);
    return startDelta != null && startDelta < 0 && progressValue(task) === 0 && !String(task.status || "").toLowerCase().includes("complete");
  });
  const nearTerm = openTasks
    .map((task) => ({ task, days: daysFromToday(task.start_date || task.end_date) }))
    .filter((entry) => entry.days != null && entry.days >= 0 && entry.days <= 42)
    .sort((a, b) => a.days - b.days)
    .slice(0, 6)
    .map((entry) => entry.task);
  const startsSoon = openTasks
    .filter((task) => daysBetween(task, "start_date", 0, 14))
    .sort((a, b) => daysFromToday(a.start_date) - daysFromToday(b.start_date))
    .slice(0, 5);
  const dueSoon = openTasks
    .filter((task) => daysBetween(task, "end_date", 0, 14))
    .sort((a, b) => daysFromToday(a.end_date) - daysFromToday(b.end_date))
    .slice(0, 5);
  const activeNow = openTasks
    .filter((task) => {
      const startDays = daysFromToday(task.start_date);
      const endDays = daysFromToday(task.end_date);
      return startDays != null && endDays != null && startDays <= 0 && endDays >= 0;
    })
    .sort((a, b) => daysFromToday(a.end_date) - daysFromToday(b.end_date))
    .slice(0, 5);
  const handoffCount = new Set([...startsSoon, ...dueSoon, ...activeNow].map((task) => task.id || taskName(task))).size;
  const shiftedTasks = openTasks
    .filter((task) => effectiveDates[task.id]?.shifted)
    .sort((a, b) => shiftedByDays(effectiveDates[b.id]) - shiftedByDays(effectiveDates[a.id]))
    .slice(0, 8);
  const totalShiftDays = openTasks.reduce((sum, task) => sum + shiftedByDays(effectiveDates[task.id]), 0);
  const successorCountById = openTasks.reduce((acc, task) => {
    dependencyIds(task).forEach((predId) => {
      const key = String(predId);
      acc[key] = (acc[key] || 0) + 1;
    });
    return acc;
  }, {});
  const logicGaps = openTasks
    .filter((task) => {
      if (task.is_summary || task._hasChildren) return false;
      const predecessorCount = dependencyCount(task);
      const successorCount = successorCountById[String(task.id)] || 0;
      return predecessorCount === 0 || successorCount === 0;
    })
    .slice(0, 8);
  const unlinked = openTasks.filter((task) => dependencyCount(task) === 0 && !task.parent_task_id && !task.is_summary);
  const nextCritical = critical
    .map((task) => ({ task, days: daysFromToday(taskDate(task)) }))
    .sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999))
    .slice(0, 5)
    .map((entry) => entry.task);

  const phaseRows = PHASES.map((phase) => {
    const phaseTasks = openTasks.filter((task) => task.phase === phase);
    return {
      phase,
      open: phaseTasks.length,
      delayed: phaseTasks.filter((task) => delayed.includes(task)).length,
      overdue: phaseTasks.filter((task) => overdue.includes(task)).length,
      tbd: phaseTasks.filter((task) => tbd.includes(task)).length,
      critical: phaseTasks.filter((task) => critical.includes(task)).length,
    };
  }).filter((row) => row.open > 0 || row.delayed > 0 || row.overdue > 0 || row.tbd > 0)
    .sort((a, b) => (b.delayed * 5 + b.overdue * 4 + b.critical * 3 + b.tbd) - (a.delayed * 5 + a.overdue * 4 + a.critical * 3 + a.tbd))
    .slice(0, 4);

  const recoveryActions = [
    overdue.length ? {
      key: "overdue",
      title: "Clean up overdue finish dates",
      detail: `${overdue.length} open task${overdue.length === 1 ? "" : "s"} finish before today. Confirm status or reset dates before downstream reviews depend on bad data.`,
      filter: "overdue",
      tone: "var(--status-error)",
    } : null,
    critical.length ? {
      key: "critical",
      title: "Walk the critical path",
      detail: `${critical.length} task${critical.length === 1 ? "" : "s"} are marked critical. Start with the earliest open critical item and verify predecessor logic.`,
      filter: "critical",
      tone: "var(--status-warning)",
    } : null,
    stalled.length ? {
      key: "stalled",
      title: "Resolve stalled starts",
      detail: `${stalled.length} task${stalled.length === 1 ? "" : "s"} started in the past but still show 0%. Decide whether work is blocked, late, or status is stale.`,
      filter: "stalled",
      tone: "var(--status-warning)",
    } : null,
    handoffCount ? {
      key: "lookahead",
      title: "Review the 14-day handoff",
      detail: `${handoffCount} open task${handoffCount === 1 ? "" : "s"} start, finish, or span the next two weeks. Confirm crews, releases, blockers, and date logic before the weekly coordination meeting.`,
      filter: "lookahead",
      tone: "var(--status-info)",
    } : null,
    shiftedTasks.length ? {
      key: "shifted",
      title: "Review cascade variance",
      detail: `${shiftedTasks.length} open task${shiftedTasks.length === 1 ? "" : "s"} moved from stored dates because predecessor logic pushed the effective schedule. Confirm whether the stored dates should be updated or the dependency should change.`,
      filter: "shifted",
      tone: "var(--status-warning)",
    } : null,
    logicGaps.length ? {
      key: "logic",
      title: "Tighten schedule logic",
      detail: `${logicGaps.length} open task${logicGaps.length === 1 ? "" : "s"} have missing predecessor or successor context. Review whether each is a true project start/end or needs dependency links.`,
      filter: "logic",
      tone: "var(--status-warning)",
    } : null,
    tbd.length ? {
      key: "tbd",
      title: "Convert TBD dates",
      detail: `${tbd.length} open task${tbd.length === 1 ? "" : "s"} still need start/finish dates. GanttPro-style schedules need unknown dates visible, but they should be burned down.`,
      filter: "tbd",
      tone: "var(--status-info)",
    } : null,
    unlinked.length ? {
      key: "unlinked",
      title: "Add missing logic links",
      detail: `${unlinked.length} root-level task${unlinked.length === 1 ? "" : "s"} have no predecessor/successor logic. Add links where work truly depends on drawing, release, fabrication, or delivery gates.`,
      filter: "unlinked",
      tone: "var(--text-secondary)",
    } : null,
  ].filter(Boolean).slice(0, 4);

  const riskScore = Math.min(100, Math.round(
    delayed.length * 16
    + overdue.length * 12
    + critical.length * 7
    + stalled.length * 6
    + tbd.length * 5
    + Math.min(20, shiftedTasks.length * 4)
    + Math.min(18, logicGaps.length * 3)
    + Math.min(20, unlinked.length * 2)
  ));

  const morningPlan = [
    recoveryActions[0] ? `1. ${recoveryActions[0].title}: ${recoveryActions[0].detail}` : null,
    nextCritical[0] ? `2. Critical path check: confirm ${formatBriefTask(nextCritical[0])}.` : null,
    startsSoon[0] ? `3. Start handoff: verify ${formatBriefTask(startsSoon[0])}.` : null,
    dueSoon[0] ? `4. Finish handoff: confirm closeout path for ${formatBriefTask(dueSoon[0])}.` : null,
    shiftedTasks.length ? `5. Variance review: inspect ${shiftedTasks.length} open task${shiftedTasks.length === 1 ? "" : "s"} shifted by dependency cascade before publishing schedule dates.` : null,
    logicGaps.length ? `6. Logic cleanup: review ${logicGaps.length} open task${logicGaps.length === 1 ? "" : "s"} missing predecessor or successor context.` : null,
  ].filter(Boolean);

  const clipboardText = [
    `Brena Schedule Brief - ${new Date().toLocaleDateString()}`,
    `Project: ${tasks[0]?.project_name || "Selected Project"}`,
    `Pressure: ${riskScore}%`,
    `Open: ${openTasks.length}`,
    `Delayed: ${delayed.length}`,
    `Overdue: ${overdue.length}`,
    `Critical: ${critical.length}`,
    `TBD Dates: ${tbd.length}`,
    `14-Day Handoff: ${handoffCount}`,
    `Cascade Variance: ${shiftedTasks.length} tasks / ${totalShiftDays} total days`,
    `Logic Gaps: ${logicGaps.length}`,
    "",
    "Recommended morning plan:",
    ...(morningPlan.length ? morningPlan : ["No recovery action is currently recommended."]),
    "",
    "14-day handoff - starting:",
    ...(startsSoon.length ? startsSoon.map((task, index) => `${index + 1}. ${formatBriefTask(task)}`) : ["No open tasks start in the next 14 days."]),
    "",
    "14-day handoff - due:",
    ...(dueSoon.length ? dueSoon.map((task, index) => `${index + 1}. ${formatBriefTask(task)}`) : ["No open tasks finish in the next 14 days."]),
    "",
    "14-day handoff - active now:",
    ...(activeNow.length ? activeNow.map((task, index) => `${index + 1}. ${formatBriefTask(task)}`) : ["No open tasks are currently spanning today."]),
    "",
    "Dependency logic gaps:",
    ...(logicGaps.length ? logicGaps.map((task, index) => `${index + 1}. ${formatBriefTask(task)} - pred ${dependencyCount(task)}, succ ${successorCountById[String(task.id)] || 0}`) : ["No open dependency logic gaps found."]),
    "",
    "Cascade variance:",
    ...(shiftedTasks.length ? shiftedTasks.map((task, index) => {
      const effective = effectiveDates[task.id];
      return `${index + 1}. ${formatBriefTask(task)} - stored ${formatDateShort(task.start_date)} to ${formatDateShort(task.end_date)}, effective ${formatDateShort(effective.start)} to ${formatDateShort(effective.end)}, +${shiftedByDays(effective)}d`;
    }) : ["No dependency cascade variance found."]),
    "",
    "Upcoming critical path watch:",
    ...(nextCritical.length ? nextCritical.map((task, index) => `${index + 1}. ${formatBriefTask(task)}`) : ["No open critical path tasks are marked."]),
  ].join("\n");

  return { openTasks, delayed, tbd, overdue, critical, stalled, nearTerm, startsSoon, dueSoon, activeNow, handoffCount, shiftedTasks, effectiveDates, totalShiftDays, logicGaps, successorCountById, unlinked, nextCritical, phaseRows, recoveryActions, morningPlan, clipboardText, riskScore };
}

export default function ScheduleBrenaBrief({ tasks = [], project, phaseFilter, onSetPhaseFilter, onSetView, onSetGanttFocus }) {
  const [copyState, setCopyState] = useState("idle");
  const brief = useMemo(() => buildBrief(tasks), [tasks]);
  const primaryPhase = brief.phaseRows[0]?.phase || null;
  const healthTone = brief.riskScore >= 70 ? "var(--status-error)" : brief.riskScore >= 35 ? "var(--status-warning)" : "var(--status-success)";

  const recommendation = brief.delayed.length
    ? "Start with delayed tasks, then check their predecessors and downstream release dates."
    : brief.overdue.length
      ? "Start with overdue finish dates and confirm whether the dates are wrong or the work is actually late."
      : brief.tbd.length
        ? "Start by replacing TBD dates on open work that affects release, fabrication, delivery, or erection."
        : "No major recovery pattern is visible. Use the lookahead to keep the next six weeks clean.";

  const copyMorningBrief = async () => {
    const text = brief.clipboardText.replace("Project: Selected Project", `Project: ${project?.name || "Selected Project"}`);
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1600);
    } catch {
      setCopyState("failed");
      setTimeout(() => setCopyState("idle"), 1600);
    }
  };

  return (
    <section style={shellStyle}>
      <div style={headerStyle}>
        <div style={titleWrapStyle}>
          <span style={avatarStyle}><Sparkles size={15} /></span>
          <div>
            <div style={eyebrowStyle}>Brena Schedule Brief</div>
            <div style={titleStyle}>{project?.name || "Selected Project"}</div>
          </div>
        </div>
        <div style={riskPillStyle(healthTone)}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: healthTone, boxShadow: `0 0 12px ${healthTone}` }} />
          {brief.riskScore}% pressure
        </div>
      </div>

      <div style={gridStyle}>
        <Metric icon={AlertTriangle} label="Delayed" value={brief.delayed.length} tone={brief.delayed.length ? "var(--status-error)" : "var(--status-success)"} />
        <Metric icon={CalendarClock} label="Overdue" value={brief.overdue.length} tone={brief.overdue.length ? "var(--status-warning)" : "var(--status-success)"} />
        <Metric icon={Target} label="TBD Dates" value={brief.tbd.length} tone={brief.tbd.length ? "var(--status-info)" : "var(--status-success)"} />
        <Metric icon={GitBranch} label="Logic Gaps" value={brief.logicGaps.length} tone={brief.logicGaps.length ? "var(--status-warning)" : "var(--status-success)"} />
        <Metric icon={ShieldAlert} label="Critical" value={brief.critical.length} tone={brief.critical.length ? "var(--status-warning)" : "var(--status-success)"} />
        <Metric icon={Route} label="14-Day" value={brief.handoffCount} tone={brief.handoffCount ? "var(--status-info)" : "var(--status-success)"} />
        <Metric icon={TrendingUp} label="Variance" value={brief.shiftedTasks.length} tone={brief.shiftedTasks.length ? "var(--status-warning)" : "var(--status-success)"} />
        <Metric icon={Zap} label="Stalled" value={brief.stalled.length} tone={brief.stalled.length ? "var(--status-error)" : "var(--status-success)"} />

        <div style={recommendationStyle}>
          <div style={miniLabelStyle}>Brena read</div>
          <p style={copyStyle}>{recommendation}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            {brief.overdue.length > 0 && (
              <Button size="sm" variant="secondary" icon="alert" onClick={() => onSetGanttFocus?.("overdue")}>
                Show Overdue
              </Button>
            )}
            {brief.critical.length > 0 && (
              <Button size="sm" variant="secondary" icon="arrow" onClick={() => onSetGanttFocus?.("critical")}>
                Show Critical
              </Button>
            )}
            {brief.logicGaps.length > 0 && (
              <Button size="sm" variant="secondary" icon="link" onClick={() => onSetGanttFocus?.("logic")}>
                Show Logic
              </Button>
            )}
            {brief.shiftedTasks.length > 0 && (
              <Button size="sm" variant="secondary" icon="alert" onClick={() => onSetGanttFocus?.("shifted")}>
                Show Variance
              </Button>
            )}
            {primaryPhase && (
              <Button
                size="sm"
                variant={phaseFilter === primaryPhase ? "primary" : "secondary"}
                icon="filter"
                onClick={() => onSetPhaseFilter?.(primaryPhase)}
              >
                Focus {primaryPhase}
              </Button>
            )}
            <Button size="sm" variant="secondary" icon="calendar" onClick={() => onSetView?.("lookahead")}>
              6-Week Lookahead
            </Button>
            <Button size="sm" variant="secondary" icon="filter" onClick={() => onSetGanttFocus?.("lookahead")}>
              Show 14-Day
            </Button>
            <Button size="sm" variant="outline" icon="arrow-up-right" onClick={() => onSetView?.("gantt")}>
              Gantt
            </Button>
            <Button size="sm" variant="outline" icon="download" onClick={copyMorningBrief}>
              {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy Failed" : "Copy Brief"}
            </Button>
          </div>
        </div>

        <div style={phasePanelStyle}>
          <div style={miniLabelStyle}>Phase pressure</div>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {brief.phaseRows.length ? brief.phaseRows.map((row) => (
              <button
                key={row.phase}
                type="button"
                onClick={() => onSetPhaseFilter?.(row.phase)}
                style={phaseRowStyle(phaseFilter === row.phase)}
              >
                <span style={{ color: "var(--text-primary)", fontWeight: 900 }}>{row.phase}</span>
                <span>{row.open} open</span>
                <span style={{ color: row.critical ? "var(--status-warning)" : "var(--text-muted)" }}>{row.critical} critical</span>
                <span style={{ color: row.delayed ? "var(--status-error)" : "var(--text-muted)" }}>{row.delayed} delayed</span>
                <span style={{ color: row.tbd ? "var(--status-info)" : "var(--text-muted)" }}>{row.tbd} TBD</span>
              </button>
            )) : (
              <div style={emptyStyle}>No open phase pressure.</div>
            )}
          </div>
        </div>

        <div style={morningPlanStyle}>
          <div style={miniLabelStyle}>Morning planning brief</div>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {brief.morningPlan.length ? brief.morningPlan.map((line, index) => (
              <div key={line} style={morningPlanRowStyle}>
                <span className="sbd-num" style={{ color: index === 0 ? "var(--status-warning)" : "var(--accent)", fontSize: 11, fontWeight: 900 }}>{String(index + 1).padStart(2, "0")}</span>
                <span>{line.replace(/^\d+\.\s*/, "")}</span>
              </div>
            )) : (
              <div style={emptyStyle}>No recovery action is currently recommended.</div>
            )}
          </div>
        </div>

        <div style={handoffPanelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <div style={miniLabelStyle}>14-day handoff</div>
            <button type="button" onClick={() => onSetGanttFocus?.("lookahead")} style={linkButtonStyle}>
              Open in Gantt
            </button>
          </div>
          <div style={handoffGridStyle}>
            <div>
              <div style={handoffHeadingStyle}>Active now</div>
              <div style={{ display: "grid", gap: 7, marginTop: 8 }}>
                {brief.activeNow.length ? brief.activeNow.map((task) => (
                  <button key={task.id || taskName(task)} type="button" onClick={() => onSetGanttFocus?.("lookahead")} style={handoffTaskStyle}>
                    <span style={dateChipStyle}>{task.end_date ? formatDateShort(task.end_date) : "TBD"}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={taskNameStyle}>{taskName(task)}</span>
                      <span style={taskMetaStyle}>{phaseOf(task)} / {task.status || "No status"}</span>
                    </span>
                  </button>
                )) : (
                  <div style={emptyStyle}>No open tasks currently span today.</div>
                )}
              </div>
            </div>
            <div>
              <div style={handoffHeadingStyle}>Starting</div>
              <div style={{ display: "grid", gap: 7, marginTop: 8 }}>
                {brief.startsSoon.length ? brief.startsSoon.map((task) => (
                  <button key={task.id || taskName(task)} type="button" onClick={() => onSetGanttFocus?.("lookahead")} style={handoffTaskStyle}>
                    <span style={dateChipStyle}>{task.start_date ? formatDateShort(task.start_date) : "TBD"}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={taskNameStyle}>{taskName(task)}</span>
                      <span style={taskMetaStyle}>{phaseOf(task)} / {task.status || "No status"}</span>
                    </span>
                  </button>
                )) : (
                  <div style={emptyStyle}>No open tasks start in the next 14 days.</div>
                )}
              </div>
            </div>
            <div>
              <div style={handoffHeadingStyle}>Due</div>
              <div style={{ display: "grid", gap: 7, marginTop: 8 }}>
                {brief.dueSoon.length ? brief.dueSoon.map((task) => (
                  <button key={task.id || taskName(task)} type="button" onClick={() => onSetGanttFocus?.("lookahead")} style={handoffTaskStyle}>
                    <span style={dateChipStyle}>{task.end_date ? formatDateShort(task.end_date) : "TBD"}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={taskNameStyle}>{taskName(task)}</span>
                      <span style={taskMetaStyle}>{phaseOf(task)} / {task.status || "No status"}</span>
                    </span>
                  </button>
                )) : (
                  <div style={emptyStyle}>No open tasks finish in the next 14 days.</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={recoveryPanelStyle}>
          <div style={miniLabelStyle}>Brena recovery queue</div>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {brief.recoveryActions.length ? brief.recoveryActions.map((action, index) => (
              <button
                key={action.key}
                type="button"
                onClick={() => onSetGanttFocus?.(action.filter)}
                style={recoveryRowStyle(action.tone)}
              >
                <span className="sbd-num" style={{ color: action.tone, fontSize: 12, fontWeight: 900 }}>{String(index + 1).padStart(2, "0")}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", color: "var(--text-primary)", fontWeight: 900 }}>{action.title}</span>
                  <span style={{ display: "block", marginTop: 3, color: "var(--text-secondary)", lineHeight: 1.35, textTransform: "none", letterSpacing: 0 }}>{action.detail}</span>
                </span>
                <span style={{ color: "var(--accent)", whiteSpace: "nowrap" }}>Open</span>
              </button>
            )) : (
              <div style={emptyStyle}>No recovery action is currently recommended.</div>
            )}
          </div>
        </div>

        <div style={variancePanelStyle}>
          <div style={miniLabelStyle}>Cascade variance review</div>
          <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
            {brief.shiftedTasks.length ? brief.shiftedTasks.slice(0, 5).map((task) => {
              const effective = brief.effectiveDates[task.id];
              return (
                <button key={task.id || taskName(task)} type="button" onClick={() => onSetGanttFocus?.("shifted")} style={varianceTaskStyle}>
                  <span style={varianceDaysStyle}>+{shiftedByDays(effective)}d</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={taskNameStyle}>{taskName(task)}</span>
                    <span style={taskMetaStyle}>
                      Stored {task.start_date ? formatDateShort(task.start_date) : "TBD"} to {task.end_date ? formatDateShort(task.end_date) : "TBD"} / effective {effective?.start ? formatDateShort(effective.start) : "TBD"} to {effective?.end ? formatDateShort(effective.end) : "TBD"}
                    </span>
                  </span>
                </button>
              );
            }) : (
              <div style={emptyStyle}>No dependency cascade variance found.</div>
            )}
          </div>
        </div>

        <div style={criticalPanelStyle}>
          <div style={miniLabelStyle}>Critical path watch</div>
          <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
            {brief.nextCritical.length ? brief.nextCritical.map((task) => (
              <button key={task.id || taskName(task)} type="button" onClick={() => onSetGanttFocus?.("critical")} style={criticalTaskStyle}>
                <CheckCircle2 size={12} color="var(--status-warning)" />
                <span style={{ minWidth: 0 }}>
                  <span style={taskNameStyle}>{taskName(task)}</span>
                  <span style={taskMetaStyle}>{phaseOf(task)} / {task.status || "No status"} / {taskDate(task) ? formatDateShort(taskDate(task)) : "TBD"}</span>
                </span>
              </button>
            )) : (
              <div style={emptyStyle}>No open critical path tasks are marked yet.</div>
            )}
          </div>
        </div>

        <div style={dependencyPanelStyle}>
          <div style={miniLabelStyle}>Dependency logic watch</div>
          <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
            {brief.logicGaps.length ? brief.logicGaps.slice(0, 5).map((task) => (
              <button key={task.id || taskName(task)} type="button" onClick={() => onSetGanttFocus?.("logic")} style={logicTaskStyle}>
                <GitBranch size={12} color="var(--status-warning)" />
                <span style={{ minWidth: 0 }}>
                  <span style={taskNameStyle}>{taskName(task)}</span>
                  <span style={taskMetaStyle}>
                    {phaseOf(task)} / pred {dependencyCount(task)} / succ {brief.successorCountById[String(task.id)] || 0}
                  </span>
                </span>
              </button>
            )) : (
              <div style={emptyStyle}>No open dependency logic gaps found.</div>
            )}
          </div>
        </div>

        <div style={nearTermStyle}>
          <div style={miniLabelStyle}>Next visible tasks</div>
          <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
            {brief.nearTerm.length ? brief.nearTerm.map((task) => (
              <div key={task.id || taskName(task)} style={taskRowStyle}>
                <Route size={12} color="var(--status-info)" />
                <span style={{ minWidth: 0 }}>
                  <span style={taskNameStyle}>{taskName(task)}</span>
                  <span style={taskMetaStyle}>{phaseOf(task)} / {task.status || "No status"} / {task.end_date ? formatDateShort(task.end_date) : "TBD"}</span>
                </span>
              </div>
            )) : (
              <div style={emptyStyle}>No tasks dated in the next six weeks.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ icon: Icon, label, value, tone }) {
  return (
    <div style={metricStyle(tone)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span style={miniLabelStyle}>{label}</span>
        <Icon size={14} color={tone} />
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 900, color: tone, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

const shellStyle = {
  flexShrink: 0,
  margin: "0 24px 12px",
  border: "1px solid color-mix(in srgb, var(--border-default) 84%, white 16%)",
  borderRadius: 18,
  background: "linear-gradient(135deg, rgba(3, 8, 18, 0.96), rgba(8, 18, 32, 0.94))",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.055), 0 18px 42px rgba(0,0,0,0.28)",
  padding: 14,
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  marginBottom: 12,
};

const titleWrapStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
};

const avatarStyle = {
  width: 34,
  height: 34,
  borderRadius: 12,
  display: "grid",
  placeItems: "center",
  color: "#04111d",
  background: "linear-gradient(135deg, var(--status-info), color-mix(in srgb, var(--status-info) 70%, white 30%))",
  boxShadow: "0 0 18px color-mix(in srgb, var(--status-info) 40%, transparent)",
  flexShrink: 0,
};

const eyebrowStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--status-info)",
};

const titleStyle = {
  fontFamily: "var(--font-display)",
  fontSize: 18,
  fontWeight: 900,
  color: "var(--text-primary)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

function riskPillStyle(tone) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    height: 30,
    padding: "0 11px",
    borderRadius: 999,
    border: `1px solid color-mix(in srgb, ${tone} 45%, transparent)`,
    background: `color-mix(in srgb, ${tone} 12%, var(--bg-surface-high))`,
    color: tone,
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: "0.10em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };
}

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(104px, 1fr))",
  gap: 10,
  alignItems: "stretch",
};

function metricStyle(tone) {
  return {
    minHeight: 104,
    border: `1px solid color-mix(in srgb, ${tone} 28%, var(--border-default))`,
    borderRadius: 14,
    background: `linear-gradient(145deg, color-mix(in srgb, ${tone} 10%, rgba(255,255,255,0.035)), rgba(255,255,255,0.025))`,
    padding: 12,
    display: "grid",
    alignContent: "space-between",
  };
}

const recommendationStyle = {
  gridColumn: "span 3",
  border: "1px solid var(--border-default)",
  borderRadius: 14,
  background: "rgba(255,255,255,0.03)",
  padding: 12,
};

const phasePanelStyle = {
  gridColumn: "span 3",
  border: "1px solid var(--border-default)",
  borderRadius: 14,
  background: "rgba(255,255,255,0.03)",
  padding: 12,
};

const nearTermStyle = {
  gridColumn: "span 3",
  border: "1px solid var(--border-default)",
  borderRadius: 14,
  background: "rgba(255,255,255,0.025)",
  padding: 12,
};

const recoveryPanelStyle = {
  gridColumn: "span 3",
  border: "1px solid color-mix(in srgb, var(--status-info) 24%, var(--border-default))",
  borderRadius: 14,
  background: "linear-gradient(145deg, rgba(34,211,238,0.055), rgba(255,255,255,0.025))",
  padding: 12,
};

const morningPlanStyle = {
  gridColumn: "span 3",
  border: "1px solid color-mix(in srgb, var(--accent) 24%, var(--border-default))",
  borderRadius: 14,
  background: "linear-gradient(145deg, rgba(86,176,255,0.06), rgba(255,255,255,0.025))",
  padding: 12,
};

const handoffPanelStyle = {
  gridColumn: "span 6",
  border: "1px solid color-mix(in srgb, var(--status-info) 30%, var(--border-default))",
  borderRadius: 14,
  background: "linear-gradient(135deg, rgba(34,211,238,0.07), rgba(255,255,255,0.026))",
  padding: 12,
};

const handoffGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
  marginTop: 10,
};

const handoffHeadingStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: "0.11em",
  textTransform: "uppercase",
  color: "var(--status-info)",
};

const linkButtonStyle = {
  border: "1px solid var(--accent-border)",
  borderRadius: 999,
  background: "var(--accent-muted)",
  color: "var(--accent)",
  padding: "5px 9px",
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  cursor: "pointer",
};

const criticalPanelStyle = {
  gridColumn: "span 3",
  border: "1px solid color-mix(in srgb, var(--status-warning) 24%, var(--border-default))",
  borderRadius: 14,
  background: "linear-gradient(145deg, rgba(245,158,11,0.055), rgba(255,255,255,0.025))",
  padding: 12,
};

const dependencyPanelStyle = {
  gridColumn: "span 3",
  border: "1px solid color-mix(in srgb, var(--status-warning) 24%, var(--border-default))",
  borderRadius: 14,
  background: "linear-gradient(145deg, rgba(245,158,11,0.05), rgba(255,255,255,0.025))",
  padding: 12,
};

const variancePanelStyle = {
  gridColumn: "span 3",
  border: "1px solid color-mix(in srgb, var(--status-warning) 28%, var(--border-default))",
  borderRadius: 14,
  background: "linear-gradient(145deg, rgba(245,158,11,0.06), rgba(255,255,255,0.025))",
  padding: 12,
};

const miniLabelStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

const copyStyle = {
  margin: "7px 0 0",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  lineHeight: 1.45,
  color: "var(--text-secondary)",
};

function phaseRowStyle(active) {
  return {
    width: "100%",
    border: `1px solid ${active ? "var(--accent-border)" : "var(--border-default)"}`,
    borderRadius: 10,
    background: active ? "var(--accent-muted)" : "rgba(255,255,255,0.025)",
    color: "var(--text-muted)",
    padding: "8px 9px",
    display: "grid",
    gridTemplateColumns: "minmax(90px, 1fr) auto auto auto auto",
    gap: 8,
    alignItems: "center",
    textAlign: "left",
    cursor: "pointer",
    fontFamily: "var(--font-mono)",
    fontSize: 8,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  };
}

function recoveryRowStyle(tone) {
  return {
    width: "100%",
    border: `1px solid color-mix(in srgb, ${tone} 26%, var(--border-default))`,
    borderRadius: 12,
    background: `linear-gradient(135deg, color-mix(in srgb, ${tone} 8%, transparent), rgba(255,255,255,0.025))`,
    color: "var(--text-muted)",
    padding: "9px 10px",
    display: "grid",
    gridTemplateColumns: "24px minmax(0, 1fr) auto",
    gap: 9,
    alignItems: "start",
    textAlign: "left",
    cursor: "pointer",
    fontFamily: "var(--font-mono)",
    fontSize: 8,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  };
}

const morningPlanRowStyle = {
  display: "grid",
  gridTemplateColumns: "24px minmax(0, 1fr)",
  gap: 9,
  alignItems: "start",
  border: "1px solid var(--border-default)",
  borderRadius: 11,
  background: "rgba(255,255,255,0.025)",
  color: "var(--text-secondary)",
  padding: "8px 10px",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  lineHeight: 1.35,
};

const criticalTaskStyle = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "14px minmax(0, 1fr)",
  gap: 8,
  alignItems: "start",
  border: "1px solid var(--border-default)",
  borderRadius: 10,
  background: "rgba(255,255,255,0.025)",
  padding: "8px 9px",
  textAlign: "left",
  cursor: "pointer",
};

const logicTaskStyle = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "14px minmax(0, 1fr)",
  gap: 8,
  alignItems: "start",
  border: "1px solid color-mix(in srgb, var(--status-warning) 24%, var(--border-default))",
  borderRadius: 10,
  background: "rgba(245,158,11,0.045)",
  padding: "8px 9px",
  textAlign: "left",
  cursor: "pointer",
};

const varianceTaskStyle = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "42px minmax(0, 1fr)",
  gap: 8,
  alignItems: "start",
  border: "1px solid color-mix(in srgb, var(--status-warning) 24%, var(--border-default))",
  borderRadius: 10,
  background: "rgba(245,158,11,0.045)",
  padding: "8px 9px",
  textAlign: "left",
  cursor: "pointer",
};

const varianceDaysStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 22,
  borderRadius: 8,
  border: "1px solid color-mix(in srgb, var(--status-warning) 38%, var(--border-default))",
  background: "rgba(245,158,11,0.10)",
  color: "var(--status-warning)",
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const handoffTaskStyle = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "58px minmax(0, 1fr)",
  gap: 9,
  alignItems: "start",
  border: "1px solid var(--border-default)",
  borderRadius: 10,
  background: "rgba(255,255,255,0.026)",
  padding: "8px 9px",
  textAlign: "left",
  cursor: "pointer",
};

const dateChipStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 22,
  borderRadius: 8,
  border: "1px solid color-mix(in srgb, var(--status-info) 32%, var(--border-default))",
  background: "rgba(34,211,238,0.08)",
  color: "var(--status-info)",
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const taskRowStyle = {
  display: "grid",
  gridTemplateColumns: "14px minmax(0, 1fr)",
  gap: 8,
  alignItems: "start",
  borderTop: "1px solid var(--border-default)",
  paddingTop: 7,
};

const taskNameStyle = {
  display: "block",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  fontWeight: 900,
  color: "var(--text-primary)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const taskMetaStyle = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  color: "var(--text-muted)",
  marginTop: 2,
};

const emptyStyle = {
  fontFamily: "var(--font-body)",
  fontSize: 12,
  color: "var(--text-muted)",
};
