import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, GitBranch, Route, ShieldAlert, Sparkles, Target, TrendingUp, Users, Zap } from "lucide-react";
import { Button } from "@/components/design-system";
import { formatDateShort } from "@/components/shared/formatters";
import {
  daysFromToday, taskName, phaseOf, dependencyCount, taskDate, shiftedByDays,
} from "@/components/schedule/rivetBriefHelpers";
import { buildBrief } from "@/components/schedule/rivetBriefEngine";
import { ScheduleAiRiskCard } from "@/components/schedule/scheduleAiRiskCard";
import {
  shellStyle, toggleButtonStyle, collapsedMetricsStyle, headerStyle, titleWrapStyle, avatarStyle,
  eyebrowStyle, titleStyle, riskPillStyle, gridStyle, metricStyle, recommendationStyle, phasePanelStyle,
  nearTermStyle, recoveryPanelStyle, morningPlanStyle, handoffPanelStyle, handoffGridStyle, handoffHeadingStyle,
  linkButtonStyle, criticalPanelStyle, dependencyPanelStyle, variancePanelStyle, ownershipPanelStyle, miniLabelStyle,
  copyStyle, phaseRowStyle, recoveryRowStyle, morningPlanRowStyle, criticalTaskStyle, logicTaskStyle, varianceTaskStyle,
  ownershipTaskStyle, varianceDaysStyle, handoffTaskStyle, dateChipStyle, taskRowStyle, taskNameStyle, taskMetaStyle, emptyStyle,
} from "@/components/schedule/rivetBriefStyles";

const RIVET_COLLAPSED_KEY = "steelbuild:schedule-brief-collapsed";

export default function ScheduleRivetBrief({ tasks = [], project, phaseFilter, onSetPhaseFilter, onSetView, onSetGanttFocus }) {
  const [copyState, setCopyState] = useState("idle");
  const brief = useMemo(() => buildBrief(tasks), [tasks]);
  const primaryPhase = brief.phaseRows[0]?.phase || null;
  const healthTone = brief.riskScore >= 70 ? "var(--status-error)" : brief.riskScore >= 35 ? "var(--status-warning)" : "var(--status-success)";

  // Collapsible state — default COLLAPSED (data-first for enterprise schedulers)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem(RIVET_COLLAPSED_KEY);
      // Default to collapsed if no stored preference
      return stored === null ? true : stored === "true";
    } catch { return true; }
  });
  const contentRef = useRef(null);
  const [contentHeight, setContentHeight] = useState(0);

  // Measure content height for smooth CSS transition
  useEffect(() => {
    if (contentRef.current) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContentHeight(entry.contentRect.height);
        }
      });
      observer.observe(contentRef.current);
      // Initial measurement
      setContentHeight(contentRef.current.scrollHeight);
      return () => observer.disconnect();
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(RIVET_COLLAPSED_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  // Data-driven recommendation — references actual task names, phases, and counts
  const recommendation = (() => {
    const topPhase = brief.phaseRows[0]?.phase;
    const topPhaseSuffix = topPhase ? ` — most pressure is in ${topPhase}.` : ".";

    if (brief.delayed.length) {
      const first = taskName(brief.delayed[0]);
      const phaseMix = [...new Set(brief.delayed.map(t => phaseOf(t)))].join(", ");
      return `${brief.delayed.length} task${brief.delayed.length === 1 ? " is" : "s are"} flagged delayed across ${phaseMix}. Start with '${first}', check its predecessor chain, and verify downstream release or delivery dates are still achievable${topPhaseSuffix}`;
    }
    if (brief.overdue.length) {
      const first = taskName(brief.overdue[0]);
      const worstLag = brief.overdue.reduce((max, t) => {
        const lag = daysFromToday(t.end_date);
        return lag != null && lag < 0 ? Math.max(max, Math.abs(lag)) : max;
      }, 0);
      return `${brief.overdue.length} task${brief.overdue.length === 1 ? " is" : "s are"} past due (worst: ${worstLag}d). Start with '${first}' — confirm whether the work is actually done and status needs updating, or if the finish date needs to be pushed and downstream teams notified${topPhaseSuffix}`;
    }
    if (brief.stalled.length) {
      const first = taskName(brief.stalled[0]);
      return `${brief.stalled.length} task${brief.stalled.length === 1 ? " has" : "s have"} a past start date but 0% progress. Check '${first}' first — is the work blocked, waiting on a predecessor, or was it actually started but not updated?${topPhaseSuffix}`;
    }
    if (brief.tbd.length) {
      const tbdPct = brief.openTasks.length ? Math.round((brief.tbd.length / brief.openTasks.length) * 100) : 0;
      return `${brief.tbd.length} open task${brief.tbd.length === 1 ? "" : "s"} (${tbdPct}% of open work) still need dates. Focus on tasks that gate detailing approvals, fabrication starts, or delivery releases — those downstream dependencies can't plan without upstream dates${topPhaseSuffix}`;
    }
    if (brief.shiftedTasks.length) {
      const maxShift = brief.shiftedTasks.reduce((max, t) => Math.max(max, shiftedByDays(brief.effectiveDates[t.id])), 0);
      return `No delayed or overdue work, but ${brief.shiftedTasks.length} task${brief.shiftedTasks.length === 1 ? " has" : "s have"} drifted up to ${maxShift}d from stored dates due to predecessor cascade. Review whether stored dates should be re-baselined or if dependency logic needs correction.`;
    }
    if (brief.logicGaps.length) {
      return `Schedule dates look clean. ${brief.logicGaps.length} task${brief.logicGaps.length === 1 ? "" : "s"} still lack predecessor or successor links — tighten logic before the next coordination meeting so critical-path movement is visible.`;
    }
    return `No major recovery pattern is visible across ${brief.openTasks.length} open tasks. Use the 14-day handoff panel to keep the next six weeks clean and confirm owner accountability.`;
  })();

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

  const focusFilter = (filter) => {
    onSetGanttFocus?.({ filter });
  };

  const focusTask = (task, filter) => {
    onSetGanttFocus?.({
      filter,
      taskId: task?.id,
      taskName: taskName(task),
    });
  };

  return (
    <section style={shellStyle}>
      <div style={headerStyle}>
        <div style={titleWrapStyle}>
          <span style={avatarStyle}><Sparkles size={15} /></span>
          <div>
            <div style={eyebrowStyle}>Rivet Schedule Brief</div>
            <div style={titleStyle}>{project?.name || "Selected Project"}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={riskPillStyle(healthTone)}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: healthTone, boxShadow: `0 0 12px ${healthTone}` }} />
            {brief.riskScore}% pressure
          </div>
          {collapsed && (
            <span style={collapsedMetricsStyle}>
              <span style={{ color: brief.delayed.length ? "var(--status-error)" : "var(--text-muted)" }}>{brief.delayed.length} delayed</span>
              <span style={{ color: brief.overdue.length ? "var(--status-warning)" : "var(--text-muted)" }}>{brief.overdue.length} overdue</span>
              <span style={{ color: brief.critical.length ? "var(--status-warning)" : "var(--text-muted)" }}>{brief.critical.length} critical</span>
            </span>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            style={toggleButtonStyle}
            title={collapsed ? "Expand Rivet brief" : "Collapse Rivet brief"}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand schedule brief" : "Collapse schedule brief"}
          >
            <ChevronDown
              size={14}
              style={{
                transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
                transition: "transform 0.25s ease",
              }}
            />
          </button>
        </div>
      </div>

      <div
        style={{
          maxHeight: collapsed ? 0 : (contentHeight || 4000),
          overflow: "hidden",
          transition: "max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
          opacity: collapsed ? 0 : 1,
          transitionProperty: "max-height, opacity",
          transitionDuration: "0.35s, 0.25s",
          transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1), ease",
        }}
      >
      <div ref={contentRef} style={{ ...gridStyle, paddingTop: 12 }}>
        <ScheduleAiRiskCard insight={brief.aiNarrative} />

        <Metric icon={AlertTriangle} label="Delayed" value={brief.delayed.length} tone={brief.delayed.length ? "var(--status-error)" : "var(--status-success)"} />
        <Metric icon={CalendarClock} label="Overdue" value={brief.overdue.length} tone={brief.overdue.length ? "var(--status-warning)" : "var(--status-success)"} />
        <Metric icon={Target} label="TBD Dates" value={brief.tbd.length} tone={brief.tbd.length ? "var(--status-info)" : "var(--status-success)"} />
        <Metric icon={GitBranch} label="Logic Gaps" value={brief.logicGaps.length} tone={brief.logicGaps.length ? "var(--status-warning)" : "var(--status-success)"} />
        <Metric icon={ShieldAlert} label="Critical" value={brief.critical.length} tone={brief.critical.length ? "var(--status-warning)" : "var(--status-success)"} />
        <Metric icon={Route} label="14-Day" value={brief.handoffCount} tone={brief.handoffCount ? "var(--status-info)" : "var(--status-success)"} />
        <Metric icon={TrendingUp} label="Variance" value={brief.shiftedTasks.length} tone={brief.shiftedTasks.length ? "var(--status-warning)" : "var(--status-success)"} />
        <Metric icon={Users} label="No Owner" value={brief.unassignedTasks.length} tone={brief.unassignedTasks.length ? "var(--status-error)" : "var(--status-success)"} />
        <Metric icon={Zap} label="Stalled" value={brief.stalled.length} tone={brief.stalled.length ? "var(--status-error)" : "var(--status-success)"} />

        <div style={recommendationStyle}>
          <div style={miniLabelStyle}>Rivet read</div>
          <p style={copyStyle}>{recommendation}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            {brief.overdue.length > 0 && (
              <Button size="sm" variant="secondary" icon="alert" onClick={() => focusFilter("overdue")}>
                Show Overdue
              </Button>
            )}
            {brief.critical.length > 0 && (
              <Button size="sm" variant="secondary" icon="arrow" onClick={() => focusFilter("critical")}>
                Show Critical
              </Button>
            )}
            {brief.logicGaps.length > 0 && (
              <Button size="sm" variant="secondary" icon="link" onClick={() => focusFilter("logic")}>
                Show Logic
              </Button>
            )}
            {brief.shiftedTasks.length > 0 && (
              <Button size="sm" variant="secondary" icon="alert" onClick={() => focusFilter("shifted")}>
                Show Variance
              </Button>
            )}
            {brief.unassignedTasks.length > 0 && (
              <Button size="sm" variant="secondary" icon="filter" onClick={() => focusFilter("unassigned")}>
                Show No Owner
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
            <Button size="sm" variant="secondary" icon="filter" onClick={() => focusFilter("lookahead")}>
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
            <button type="button" onClick={() => focusFilter("lookahead")} style={linkButtonStyle}>
              Open in Gantt
            </button>
          </div>
          <div style={handoffGridStyle}>
            <div>
              <div style={handoffHeadingStyle}>Active now</div>
              <div style={{ display: "grid", gap: 7, marginTop: 8 }}>
                {brief.activeNow.length ? brief.activeNow.map((task) => (
                  <button key={task.id || taskName(task)} type="button" onClick={() => focusTask(task, "lookahead")} style={handoffTaskStyle}>
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
                  <button key={task.id || taskName(task)} type="button" onClick={() => focusTask(task, "lookahead")} style={handoffTaskStyle}>
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
                  <button key={task.id || taskName(task)} type="button" onClick={() => focusTask(task, "lookahead")} style={handoffTaskStyle}>
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
          <div style={miniLabelStyle}>Rivet recovery queue</div>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {brief.recoveryActions.length ? brief.recoveryActions.map((action, index) => (
              <button
                key={action.key}
                type="button"
                onClick={() => focusFilter(action.filter)}
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
                <button key={task.id || taskName(task)} type="button" onClick={() => focusTask(task, "shifted")} style={varianceTaskStyle}>
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

        <div style={ownershipPanelStyle}>
          <div style={miniLabelStyle}>Ownership watch</div>
          <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
            {brief.unassignedTasks.length ? brief.unassignedTasks.slice(0, 5).map((task) => (
              <button key={task.id || taskName(task)} type="button" onClick={() => focusTask(task, "unassigned")} style={ownershipTaskStyle}>
                <Users size={12} color="var(--status-error)" />
                <span style={{ minWidth: 0 }}>
                  <span style={taskNameStyle}>{taskName(task)}</span>
                  <span style={taskMetaStyle}>{phaseOf(task)} / {task.status || "No status"} / {taskDate(task) ? formatDateShort(taskDate(task)) : "TBD"}</span>
                </span>
              </button>
            )) : (
              <div style={emptyStyle}>No unassigned open work found.</div>
            )}
          </div>
        </div>

        <div style={criticalPanelStyle}>
          <div style={miniLabelStyle}>Critical path watch</div>
          <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
            {brief.nextCritical.length ? brief.nextCritical.map((task) => (
              <button key={task.id || taskName(task)} type="button" onClick={() => focusTask(task, "critical")} style={criticalTaskStyle}>
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
              <button key={task.id || taskName(task)} type="button" onClick={() => focusTask(task, "logic")} style={logicTaskStyle}>
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
              <button key={task.id || taskName(task)} type="button" onClick={() => focusTask(task, "all")} style={taskRowStyle}>
                <Route size={12} color="var(--status-info)" />
                <span style={{ minWidth: 0 }}>
                  <span style={taskNameStyle}>{taskName(task)}</span>
                  <span style={taskMetaStyle}>{phaseOf(task)} / {task.status || "No status"} / {task.end_date ? formatDateShort(task.end_date) : "TBD"}</span>
                </span>
              </button>
            )) : (
              <div style={emptyStyle}>No tasks dated in the next six weeks.</div>
            )}
          </div>
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

