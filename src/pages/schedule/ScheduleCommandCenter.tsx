/**
 * ScheduleCommandCenter — presentation-only wrapper.
 *
 * Renders the Command UI kit chrome (hero + KPI strip + 3 decision panels +
 * filter bar) ABOVE the existing schedule body, which is passed as `children`.
 *
 * This component is WRITE-ONLY for chrome. It owns no state, fires no
 * mutations, and does not touch ScheduleGantt, reparentTasks, or any
 * schedule data logic. All data/state/mutations stay in Schedule.tsx.
 */
import { useMemo, type ReactNode } from "react";
import { CalendarRange } from "lucide-react";
import "@/styles/command.css";
import {
  PageHero,
  KpiStrip,
  DecisionPanel,
  FilterBar,
  useCommandSkin,
  Pill,
} from "@/components/command";
import type { KpiCellDef } from "@/components/command";
import { buildScheduleSummary } from "./scheduleCommandCenter.derive";
import type { TaskRecord, ScheduleSummary } from "./scheduleCommandCenter.derive";
import { parseDateUTC } from "@/components/schedule/scheduleDateUtils";

// ---------------------------------------------------------------------------
// Date formatting — uses TBD for null per CLAUDE.md §22
// ---------------------------------------------------------------------------

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "TBD";
  const d = parseDateUTC(dateStr);
  if (!d) return "TBD";
  return d.toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    timeZone: "UTC",
  });
}

// ---------------------------------------------------------------------------
// Phase chip labels for the filter bar
// ---------------------------------------------------------------------------

const PHASE_LABELS = [
  "Pre-Construction",
  "Detailing",
  "Procurement",
  "Fabrication",
  "Delivery",
  "Installation",
  "Closeout",
];

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
  /** Search string for the filter bar. */
  search: string;
  onSearch: (v: string) => void;
  /** Currently active phase filter key (or "all"). */
  phaseFilter: string;
  onPhaseFilter: (phase: string) => void;
  /** Open the add-task modal. */
  onAddTask: () => void;
  /** Open/select a task for detail (used by decision panel rows). */
  onOpenTask: (task: TaskRecord) => void;
  /** Scroll the existing schedule body into view. */
  onViewAll?: () => void;
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
    search,
    onSearch,
    phaseFilter,
    onPhaseFilter,
    onAddTask,
    onOpenTask,
    onViewAll,
    projectHealth,
    pctComplete,
    children,
  } = props;

  useCommandSkin();

  // Compute summary from tasks if not pre-computed by caller.
  // Memoised so the caller doesn't have to worry about reference stability.
  const computedSummary = useMemo(
    () => (summaryProp ? summaryProp : buildScheduleSummary(tasks)),
    [tasks, summaryProp],
  );
  const s = computedSummary;

  // ── Hero chips ────────────────────────────────────────────────────────────
  const chips = [
    { label: `${s.total} Tasks` },
    { label: `${s.critical} Critical`, tone: s.critical ? ("danger" as const) : undefined },
    { label: `${s.tbd} TBD`, tone: s.tbd ? ("warn" as const) : undefined },
  ];

  // ── Hero stats ────────────────────────────────────────────────────────────
  const heroStats = [
    { value: `${pctComplete !== undefined ? pctComplete : s.pctComplete}%`, label: "Complete" },
    { value: projectHealth || "—", label: "Project Health" },
  ];

  // ── KPI strip ─────────────────────────────────────────────────────────────
  const kpiCells: KpiCellDef[] = [
    {
      label: "Critical Path",
      value: s.critical,
      sublabel: "tasks",
      tone: s.critical ? "danger" : "neutral",
    },
    {
      label: "Activities",
      value: s.activities,
      sublabel: "leaf tasks",
      tone: "neutral",
    },
    {
      label: "At Risk",
      value: s.atRisk,
      sublabel: "open",
      tone: s.atRisk ? "danger" : "neutral",
    },
    {
      label: "Overdue",
      value: s.overdue,
      sublabel: "tasks",
      tone: s.overdue ? "danger" : "neutral",
    },
    {
      label: "In Lookahead",
      value: s.inLookahead,
      sublabel: "14 days",
      tone: "info",
    },
    {
      label: "% Complete",
      value: `${s.pctComplete}%`,
      sublabel: "activities",
      tone: s.pctComplete >= 75 ? "good" : s.pctComplete >= 40 ? "warn" : "neutral",
    },
    {
      label: "TBD / Unscheduled",
      value: s.tbd,
      sublabel: "tasks",
      tone: s.tbd ? "warn" : "neutral",
    },
    {
      label: "Milestones",
      value: s.milestones,
      sublabel: "total",
      tone: "neutral",
    },
  ];

  // ── Scroll helper ─────────────────────────────────────────────────────────
  function scrollToBody() {
    if (onViewAll) {
      onViewAll();
      return;
    }
    document.querySelector(".sched-cc__body")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="sched-cc">
      <PageHero
        Icon={CalendarRange}
        title="Schedule Command"
        subtitle="Project lifecycle — Pre-Construction through Closeout"
        projectName={projectName}
        chips={chips}
        stats={heroStats}
      />

      <KpiStrip cells={kpiCells} />

      <div className="cmd-panels">
        {/* Panel 1 — 14-Day Look-Ahead */}
        <DecisionPanel title="14-Day Look-Ahead" onViewAll={scrollToBody}>
          {s.lookaheadQueue.length === 0 ? (
            <div className="cmd-row__meta">No tasks scheduled in the next 14 days.</div>
          ) : (
            s.lookaheadQueue.map((t) => (
              <div
                className="cmd-row is-clickable"
                key={t.id ?? t.task_name}
                onClick={() => onOpenTask(t)}
              >
                <div>
                  <div className="cmd-row__num">{t.task_name || "Untitled task"}</div>
                  <div className="cmd-row__meta">
                    {t.phase || "—"}
                    {" · "}
                    {fmtDate(t.start_date)} – {fmtDate(t.end_date)}
                  </div>
                </div>
                {(t.resource_names || t.assigned_to) ? (
                  <span className="cmd-row__meta" style={{ whiteSpace: "nowrap" }}>
                    {String(t.resource_names || t.assigned_to || "").split(",")[0].trim()}
                  </span>
                ) : (
                  <Pill tone="warn">Unassigned</Pill>
                )}
              </div>
            ))
          )}
        </DecisionPanel>

        {/* Panel 2 — Milestone Tracker */}
        <DecisionPanel title="Milestone Tracker" onViewAll={scrollToBody}>
          {s.milestoneQueue.length === 0 ? (
            <div className="cmd-row__meta">No milestones found.</div>
          ) : (
            s.milestoneQueue.map((t) => (
              <div
                className="cmd-row is-clickable"
                key={t.id ?? t.task_name}
                onClick={() => onOpenTask(t)}
              >
                <div>
                  <div className="cmd-row__num">{t.task_name || "Untitled milestone"}</div>
                  <div className="cmd-row__meta">
                    {t.wbs_code ? `${t.wbs_code} · ` : ""}
                    {fmtDate(t.start_date)}
                  </div>
                </div>
                <Pill tone={t.status === "Complete" ? "good" : "neutral"}>
                  {t.status || "Not Started"}
                </Pill>
              </div>
            ))
          )}
        </DecisionPanel>

        {/* Panel 3 — Schedule Risk */}
        <DecisionPanel title="Schedule Risk" onViewAll={scrollToBody}>
          {s.riskQueue.length === 0 ? (
            <div className="cmd-row__meta">No significant schedule risks detected.</div>
          ) : (
            s.riskQueue.map((t) => {
              // Derive a concise risk reason for display
              const reasons: string[] = [];
              const endD = parseDateUTC(t.end_date);
              const now = new Date();
              now.setUTCHours(0, 0, 0, 0);
              if (endD && endD < now) reasons.push("Overdue");
              if (!t.end_date && !t.start_date) reasons.push("TBD dates");
              if (t.priority === "Critical") reasons.push("Critical priority");
              if (t.blockers && String(t.blockers).trim()) reasons.push("Blocked");
              if (!t.resource_names && !t.assigned_to) reasons.push("Unassigned");

              return (
                <div
                  className="cmd-row is-clickable"
                  key={t.id ?? t.task_name}
                  onClick={() => onOpenTask(t)}
                >
                  <div>
                    <div className="cmd-row__num">{t.task_name || "Untitled task"}</div>
                    <div className="cmd-row__meta">
                      {reasons.length ? reasons.join(" · ") : "Flagged"}
                    </div>
                  </div>
                  <Pill tone={reasons.includes("Overdue") ? "danger" : "warn"}>
                    {reasons[0] || "Risk"}
                  </Pill>
                </div>
              );
            })
          )}
        </DecisionPanel>
      </div>

      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search tasks, phases, WBS, resources…"
        primaryLabel="Add Task"
        onPrimary={onAddTask}
        filters={
          <>
            <button
              type="button"
              className={`cmd-chip-btn${phaseFilter === "all" ? " is-active" : ""}`}
              onClick={() => onPhaseFilter("all")}
            >
              All Phases
            </button>
            {PHASE_LABELS.map((ph) => (
              <button
                key={ph}
                type="button"
                className={`cmd-chip-btn${phaseFilter === ph ? " is-active" : ""}`}
                onClick={() => onPhaseFilter(ph)}
              >
                {ph}
              </button>
            ))}
          </>
        }
      />

      {/* The existing schedule body: view tabs + Gantt/lookahead/list switch */}
      <div className="sched-cc__body">
        {children}
      </div>
    </div>
  );
}
