import { useMemo } from "react";
import { AlertTriangle, CalendarClock, GitBranch, Route, Sparkles, Target } from "lucide-react";
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

function dependencyCount(task) {
  const raw = task?.dependencies || task?.predecessors || task?.predecessor_ids;
  if (!raw) return 0;
  if (Array.isArray(raw)) return raw.length;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return raw.split(",").filter(Boolean).length;
    }
  }
  return 0;
}

function buildBrief(tasks) {
  const openTasks = tasks.filter(isOpenTask);
  const delayed = openTasks.filter((task) => String(task.status || "").toLowerCase().includes("delay"));
  const tbd = openTasks.filter((task) => !task.start_date || !task.end_date);
  const overdue = openTasks.filter((task) => {
    const days = daysFromToday(task.end_date);
    return days != null && days < 0;
  });
  const nearTerm = openTasks
    .map((task) => ({ task, days: daysFromToday(task.start_date || task.end_date) }))
    .filter((entry) => entry.days != null && entry.days >= 0 && entry.days <= 42)
    .sort((a, b) => a.days - b.days)
    .slice(0, 6)
    .map((entry) => entry.task);
  const unlinked = openTasks.filter((task) => dependencyCount(task) === 0 && !task.parent_task_id && !task.is_summary);

  const phaseRows = PHASES.map((phase) => {
    const phaseTasks = openTasks.filter((task) => task.phase === phase);
    return {
      phase,
      open: phaseTasks.length,
      delayed: phaseTasks.filter((task) => delayed.includes(task)).length,
      overdue: phaseTasks.filter((task) => overdue.includes(task)).length,
      tbd: phaseTasks.filter((task) => tbd.includes(task)).length,
    };
  }).filter((row) => row.open > 0 || row.delayed > 0 || row.overdue > 0 || row.tbd > 0)
    .sort((a, b) => (b.delayed * 4 + b.overdue * 3 + b.tbd) - (a.delayed * 4 + a.overdue * 3 + a.tbd))
    .slice(0, 4);

  const riskScore = Math.min(100, Math.round(
    delayed.length * 16
    + overdue.length * 12
    + tbd.length * 5
    + Math.min(20, unlinked.length * 2)
  ));

  return { openTasks, delayed, tbd, overdue, nearTerm, unlinked, phaseRows, riskScore };
}

export default function ScheduleBrenaBrief({ tasks = [], project, phaseFilter, onSetPhaseFilter, onSetView }) {
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
        <Metric icon={GitBranch} label="Unlinked" value={brief.unlinked.length} tone={brief.unlinked.length ? "var(--text-secondary)" : "var(--status-success)"} />

        <div style={recommendationStyle}>
          <div style={miniLabelStyle}>Brena read</div>
          <p style={copyStyle}>{recommendation}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
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
            <Button size="sm" variant="outline" icon="arrow-up-right" onClick={() => onSetView?.("gantt")}>
              Gantt
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
                <span style={{ color: row.delayed ? "var(--status-error)" : "var(--text-muted)" }}>{row.delayed} delayed</span>
                <span style={{ color: row.tbd ? "var(--status-info)" : "var(--text-muted)" }}>{row.tbd} TBD</span>
              </button>
            )) : (
              <div style={emptyStyle}>No open phase pressure.</div>
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
  gridTemplateColumns: "repeat(4, minmax(120px, 0.55fr)) minmax(280px, 1.2fr) minmax(280px, 1fr)",
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
  gridRow: "span 2",
  border: "1px solid var(--border-default)",
  borderRadius: 14,
  background: "rgba(255,255,255,0.03)",
  padding: 12,
};

const phasePanelStyle = {
  gridRow: "span 2",
  border: "1px solid var(--border-default)",
  borderRadius: 14,
  background: "rgba(255,255,255,0.03)",
  padding: 12,
};

const nearTermStyle = {
  gridColumn: "1 / 5",
  border: "1px solid var(--border-default)",
  borderRadius: 14,
  background: "rgba(255,255,255,0.025)",
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
    gridTemplateColumns: "minmax(90px, 1fr) auto auto auto",
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
