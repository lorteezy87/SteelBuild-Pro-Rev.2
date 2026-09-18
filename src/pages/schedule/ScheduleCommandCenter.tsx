/**
 * ScheduleCommandCenter — canonical Schedule page shell.
 *
 * Renders the Command UI kit chrome (hero + KPI strip + 3 decision panels +
 * schedule actions) ABOVE the existing schedule body, which is passed as
 * `children`.
 *
 * This component is WRITE-ONLY for chrome. It owns no state, fires no
 * mutations, and does not touch ScheduleGantt, reparentTasks, or any
 * schedule data logic. All data/state/mutations stay in Schedule.tsx.
 */
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { CalendarDays, Download, FileSpreadsheet, ListPlus, Plus, Sparkles, Upload } from "lucide-react";
import "@/styles/command.css";
import {
  AttentionQueue,
  OperationalSummary,
  PageHeader,
  useCommandSkin,
  Pill,
} from "@/components/command";
import type { TaskRecord, ScheduleSummary } from "./scheduleCommandCenter.derive";
import type { AttentionItem } from "@/components/command";
import {
  buildScheduleKpiCells,
  buildScheduleRiskReasons,
  formatScheduleDate,
} from "./scheduleCommandCenter.presentation";
import { useScheduleCommandSummary } from "./useScheduleCommandSummary";

function activateDecisionRow(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.currentTarget.click();
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ScheduleCommandCenterProps {
  /** Project name for the hero eyebrow. */
  projectName: string;
  /** All raw tasks. Used to compute summary if `summary` is not passed. */
  tasks: TaskRecord[];
  /** Pre-computed summary. If omitted, computed from `tasks` via useMemo. */
  summary?: ScheduleSummary;
  /** Open the add-task modal. */
  onAddTask: () => void;
  /** Open the bulk add-tasks modal. */
  onBulkAdd: () => void;
  /** Open the WBS Builder modal. */
  onWbsBuilder: () => void;
  /** Open the hidden Microsoft Project XML file input. */
  onImportMpp: () => void;
  /** Open the CSV import preview modal. */
  onImportCsv: () => void;
  importing: boolean;
  /** Export the effective schedule to calendar format. */
  onExportIcs: () => void;
  /** Export the visible Gantt to PDF. */
  onExportPdf: () => void;
  exportingPdf: boolean;
  projectAvailable: boolean;
  hasTasks: boolean;
  view: string;
  fileInput?: ReactNode;
  /** Open/select a task for detail (used by decision panel rows). */
  onOpenTask: (task: TaskRecord) => void;
  /** Project health_status string — shown in hero stat card. */
  projectHealth?: string | null;
  /** Overall schedule percent complete for hero stat. */
  pctComplete?: number;
  /** The existing schedule body: view tabs + Gantt/lookahead/list. */
  children: ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ScheduleCommandCenter(props: ScheduleCommandCenterProps) {
  const {
    projectName,
    tasks,
    summary: summaryProp,
    onAddTask,
    onBulkAdd,
    onWbsBuilder,
    onImportMpp,
    onImportCsv,
    importing,
    onExportIcs,
    onExportPdf,
    exportingPdf,
    projectAvailable,
    hasTasks,
    view,
    fileInput,
    onOpenTask,
    projectHealth,
    pctComplete,
    children,
  } = props;

  useCommandSkin();

  // Compute summary from tasks if not pre-computed by caller.
  // Memoised so the caller doesn't have to worry about reference stability.
  const computedSummary = useScheduleCommandSummary(tasks, summaryProp);
  const s = computedSummary;

  const operationalMetrics = buildScheduleKpiCells(s).map((cell) => ({
    label: cell.label,
    value: cell.value,
    sublabel: cell.sublabel,
    tone: cell.tone,
  }));

  const attentionItems: AttentionItem[] = s.riskQueue.map((task) => {
    const reasons = buildScheduleRiskReasons(task);
    const owner = String(task.resource_names || task.assigned_to || "").split(",")[0]?.trim() || null;
    return {
      id: String(task.id || task.task_name || "schedule-risk"),
      issue: task.task_name || "Untitled schedule task",
      deadline: task.end_date || task.start_date || null,
      risk: reasons.length ? reasons.join(" · ") : "Schedule risk",
      owner,
      nextAction: reasons.includes("Blocked")
        ? "Clear blocker"
        : reasons.includes("Unassigned")
          ? "Assign owner"
          : reasons.includes("Overdue")
            ? "Recover schedule"
            : "Review execution plan",
      tone: reasons.includes("Overdue") || reasons.includes("Blocked") ? "danger" : "warn",
      onOpen: () => onOpenTask(task),
    };
  });

  // ── Scroll helper ─────────────────────────────────────────────────────────
  const bodyRef = useRef<HTMLDivElement | null>(null);
  function scrollToBody() {
    bodyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="sched-cc sbp-command-page">
      <PageHeader
        eyebrow={`${projectName} / Schedule`}
        title="Schedule Control"
        subtitle="Near-term execution, milestones, constraints, ownership, and project lifecycle."
        meta={[
          projectHealth ? `Project health: ${projectHealth}` : "Project health: unknown",
          `${pctComplete !== undefined ? pctComplete : s.pctComplete}% complete`,
          `${s.activities} activities`,
          `${s.inLookahead} in 14-day lookahead`,
        ].join(" · ")}
      />

      <OperationalSummary metrics={operationalMetrics} ariaLabel="Schedule operational summary" />

      <AttentionQueue
        title="Schedule Attention"
        items={attentionItems}
        emptyMessage="No significant schedule risks detected."
      />

      <div className="sbp-work-grid">
        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head">
            <h2>14-Day Lookahead</h2>
            <button type="button" className="cmd-btn cmd-btn--ghost" onClick={scrollToBody}>View schedule</button>
          </div>
          <div>
            {s.lookaheadQueue.length === 0 ? (
              <div className="sbp-attention__empty">No tasks scheduled in the next 14 days.</div>
            ) : s.lookaheadQueue.map((task) => (
              <div
                className="cmd-row is-clickable"
                role="button"
                tabIndex={0}
                onKeyDown={activateDecisionRow}
                key={task.id ?? task.task_name}
                onClick={() => onOpenTask(task)}
              >
                <div>
                  <div className="cmd-row__num">{task.task_name || "Untitled task"}</div>
                  <div className="cmd-row__meta">
                    {task.phase || "—"} · {formatScheduleDate(task.start_date)} – {formatScheduleDate(task.end_date)}
                  </div>
                </div>
                {(task.resource_names || task.assigned_to) ? (
                  <span className="cmd-row__meta" style={{ whiteSpace: "nowrap" }}>
                    {String(task.resource_names || task.assigned_to || "").split(",")[0].trim()}
                  </span>
                ) : (
                  <Pill tone="warn">Unassigned</Pill>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head">
            <h2>Milestones</h2>
            <button type="button" className="cmd-btn cmd-btn--ghost" onClick={scrollToBody}>View schedule</button>
          </div>
          <div>
            {s.milestoneQueue.length === 0 ? (
              <div className="sbp-attention__empty">No milestones found.</div>
            ) : s.milestoneQueue.map((task) => (
              <div
                className="cmd-row is-clickable"
                role="button"
                tabIndex={0}
                onKeyDown={activateDecisionRow}
                key={task.id ?? task.task_name}
                onClick={() => onOpenTask(task)}
              >
                <div>
                  <div className="cmd-row__num">{task.task_name || "Untitled milestone"}</div>
                  <div className="cmd-row__meta">
                    {task.wbs_code ? `${task.wbs_code} · ` : ""}{formatScheduleDate(task.start_date)}
                  </div>
                </div>
                <Pill tone={task.status === "Complete" ? "good" : "neutral"}>
                  {task.status || "Not Started"}
                </Pill>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="sched-cc__actionbar" role="toolbar" aria-label="Schedule actions">
        <div
          className="sched-cc__action-group"
          aria-label="Import and export actions"
          style={{ display: "flex", gap: 6, alignItems: "center", paddingRight: 10, borderRight: "1px solid var(--divider)", marginRight: 4 }}
        >
          <button
            type="button"
            className="cmd-btn cmd-btn--ghost"
            disabled={!projectAvailable || importing}
            onClick={onImportMpp}
            title="Import Microsoft Project XML"
          >
            <Upload size={14} /> {importing ? "Importing..." : "Import MS Project"}
          </button>
          <button
            type="button"
            className="cmd-btn cmd-btn--ghost"
            disabled={!projectAvailable || importing}
            onClick={onImportCsv}
            title="Import schedule tasks from CSV (MS Project, P6, or Excel)"
          >
            <FileSpreadsheet size={14} /> Import CSV
          </button>
          <button
            type="button"
            className="cmd-btn cmd-btn--ghost"
            disabled={!projectAvailable || !hasTasks}
            onClick={onExportIcs}
            title="Download .ics for Outlook, Teams, or Google Calendar"
          >
            <CalendarDays size={14} /> Export ICS
          </button>
          <button
            type="button"
            className="cmd-btn cmd-btn--ghost"
            disabled={!projectAvailable || !hasTasks || view !== "gantt" || exportingPdf}
            onClick={onExportPdf}
            title={view !== "gantt" ? "Switch to the Gantt view to export" : "Export the Gantt chart as a PDF for distribution"}
          >
            <Download size={14} /> {exportingPdf ? "Exporting..." : "Export PDF"}
          </button>
        </div>
        <div className="sched-cc__action-group" aria-label="Task actions" style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            type="button"
            className="cmd-btn cmd-btn--ghost"
            disabled={!projectAvailable}
            onClick={onWbsBuilder}
            title="Generate a WBS from a short scope-of-work description"
          >
            <Sparkles size={14} /> WBS Builder
          </button>
          <button
            type="button"
            className="cmd-btn cmd-btn--ghost"
            disabled={!projectAvailable}
            onClick={onBulkAdd}
            title="Bulk add schedule tasks"
          >
            <ListPlus size={14} /> Bulk Add
          </button>
          <button
            type="button"
            className="cmd-btn cmd-btn--primary"
            disabled={!projectAvailable}
            onClick={onAddTask}
            title="Add a schedule task"
          >
            <Plus size={14} /> Add Task
          </button>
        </div>
        {fileInput}
      </div>

      {/* The existing schedule body: view tabs + Gantt/lookahead/list switch */}
      <div ref={bodyRef} className="sched-cc__body">
        {children}
      </div>
    </div>
  );
}
