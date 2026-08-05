/**
 * Field Hub Control Center — canonical Field Hub overview.
 *
 * Data is supplied by the parent (FieldHub.jsx) which already owns the
 * React Query subscriptions. This component is presentation-only + useMemo;
 * register navigation remains owned by the parent.
 *
 * Panel layout:
 *   1. PageHero — icon HardHat, project name + chips
 *   2. KpiStrip — 5 KPIs from real sources
 *   3. 3 × DecisionPanel — Today in the Field / Open Issues / Site Coordination
 *   4. FilterBar — search + type chips + "Log Field Activity" primary action
 *   5. DataTable — flat activity feed (all sources merged)
 */
import { useMemo } from "react";
import { HardHat, Users, AlertTriangle, ClipboardCheck, ShieldAlert, Wrench, Flame } from "lucide-react";
import "@/styles/command.css";
import {
  PageHero,
  KpiStrip,
  DecisionPanel,
  Pill,
  FilterBar,
  DataTable,
  useCommandSkin,
} from "@/components/command";
import type { Column, KpiCellDef } from "@/components/command";
import { photoFor } from "@/config/launcherConfig";
import { FIELD_PHASES } from "@/lib/field/fieldPhase";
import PhaseBadge from "@/components/field/PhaseBadge";
import { buildFieldHubSummary } from "./fieldHubControlCenter.derive";
import type {
  DailyLogRecord,
  InspectionRecord,
  SafetyIncidentRecord,
  PunchlistItemRecord,
  ScheduleTaskRef,
  FieldActivityRow,
  SiteCoordRow,
  InspectionQueueRow,
} from "./fieldHubControlCenter.derive";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_CHIPS = ["All", "Daily Log", "Inspection", "Safety", "Punchlist"];
const PHASE_CHIPS = ["All", ...FIELD_PHASES];

/** Today ISO string (local) for overdue comparisons in cells. */
function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Tone for a type pill in the table. */
function typeTone(type: string) {
  if (type === "Safety") return "danger" as const;
  if (type === "Inspection") return "info" as const;
  if (type === "Punchlist") return "warn" as const;
  return "neutral" as const;
}

/** Tone for priority. */
function fieldPriorityTone(priority: string) {
  if (priority === "Critical" || priority === "High") return "danger" as const;
  if (priority === "Medium") return "warn" as const;
  return "neutral" as const;
}

/** Tone for status. */
function fieldStatusTone(status: string) {
  if (["Closed", "Completed", "Complete"].includes(status)) return "good" as const;
  if (["Open", "Scheduled", "In Progress"].includes(status)) return "info" as const;
  return "neutral" as const;
}

/** Render "2026-06-28" → "Jun 28" for compact display. */
function fmtDate(iso: string | null): string {
  if (!iso || iso === "—") return "—";
  try {
    const [, m, d] = iso.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[Number(m) - 1]} ${Number(d)}`;
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Prop types
// ---------------------------------------------------------------------------

export interface FieldHubControlCenterProps {
  projectName: string;
  logs: DailyLogRecord[];
  inspections: InspectionRecord[];
  incidents: SafetyIncidentRecord[];
  punchlistItems: PunchlistItemRecord[];
  /** schedule_tasks — resolves the real phase behind each daily log. */
  scheduleTasks?: ScheduleTaskRef[];
  search: string;
  onSearch: (v: string) => void;
  typeFilter: string;
  onTypeFilterChange: (v: string) => void;
  phaseFilter: string;
  onPhaseFilterChange: (v: string) => void;
  onLogActivity: (() => void) | null;
  /** Open a punchlist item by id. */
  onOpenPunchlist?: ((id: string) => void) | null;
  /** Open an inspection by id. */
  onOpenInspection?: ((id: string) => void) | null;
  /** Open a safety incident by id. */
  onOpenIncident?: ((id: string) => void) | null;
  /** Open a daily log by id. */
  onOpenDailyLog?: ((id: string) => void) | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FieldHubControlCenter(props: FieldHubControlCenterProps) {
  const {
    projectName,
    logs,
    inspections,
    incidents,
    punchlistItems,
    scheduleTasks,
    search,
    onSearch,
    typeFilter,
    onTypeFilterChange,
    phaseFilter,
    onPhaseFilterChange,
    onLogActivity,
    onOpenPunchlist,
    onOpenInspection,
    onOpenIncident,
    onOpenDailyLog,
  } = props;

  useCommandSkin();

  const s = useMemo(
    () => buildFieldHubSummary(logs, inspections, incidents, punchlistItems, scheduleTasks),
    [logs, inspections, incidents, punchlistItems, scheduleTasks],
  );

  // ── Hero chips ────────────────────────────────────────────────────────────
  const chips = [
    { label: `${logs.length} Daily Logs` },
    { label: `${s.openFieldIssues} Open Issues`, tone: s.openFieldIssues > 0 ? ("warn" as const) : ("neutral" as const) },
    { label: `${s.openSafetyObs} Safety Obs`, tone: s.openSafetyObs > 0 ? ("danger" as const) : ("neutral" as const) },
  ];

  // ── KPI strip ─────────────────────────────────────────────────────────────
  const kpiCells: KpiCellDef[] = [
    {
      label: "Workforce Today",
      value: s.workforceToday,
      sublabel: "on site",
      tone: s.workforceToday > 0 ? "good" : "neutral",
      Icon: Users,
    },
    {
      label: "Open Field Issues",
      value: s.openFieldIssues,
      sublabel: "punchlist",
      tone: s.openFieldIssues > 0 ? "warn" : "neutral",
      Icon: AlertTriangle,
    },
    {
      label: "Inspections Due",
      value: s.inspectionsDue,
      sublabel: "scheduled",
      tone: s.inspectionsDue > 0 ? "info" : "neutral",
      Icon: ClipboardCheck,
    },
    {
      label: "Safety Observations",
      value: s.openSafetyObs,
      sublabel: "open",
      tone: s.openSafetyObs > 0 ? "danger" : "neutral",
      Icon: ShieldAlert,
    },
    {
      label: "Equipment Logs Today",
      // SUBSTITUTED: derived from daily_logs.equipment_used (no equipment table)
      value: s.equipmentLogsToday,
      sublabel: "logs w/ equip.",
      tone: "neutral",
      Icon: Wrench,
    },
  ];

  // ── Filtered activity rows ─────────────────────────────────────────────────
  const filtered: FieldActivityRow[] = useMemo(() => {
    let rows = s.activityRows;
    if (typeFilter && typeFilter !== "All") {
      rows = rows.filter((r) => r.type === typeFilter);
    }
    if (phaseFilter && phaseFilter !== "All") {
      rows = rows.filter((r) => r.phase === phaseFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.activity.toLowerCase().includes(q) ||
          r.location.toLowerCase().includes(q) ||
          r.reportedBy.toLowerCase().includes(q) ||
          r.type.toLowerCase().includes(q) ||
          (r.phase ?? "").toLowerCase().includes(q),
      );
    }
    return rows;
  }, [s.activityRows, typeFilter, phaseFilter, search]);

  // ── Row click dispatcher ───────────────────────────────────────────────────
  // Every row type must be represented here — a missing branch reads to the
  // user as "this item can't be opened".
  const OPENERS: Record<string, ((id: string) => void) | null | undefined> = {
    Punchlist: onOpenPunchlist,
    Inspection: onOpenInspection,
    Safety: onOpenIncident,
    "Daily Log": onOpenDailyLog,
  };

  function handleRowClick(row: FieldActivityRow) {
    OPENERS[row.type]?.(row.id);
  }

  // ── Table columns ──────────────────────────────────────────────────────────
  const columns: Column<FieldActivityRow>[] = [
    {
      key: "time",
      header: "Date",
      render: (r) => (
        <span
          style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          {fmtDate(r.time)}
        </span>
      ),
    },
    {
      key: "activity",
      header: "Activity",
      render: (r) => <span style={{ fontWeight: 500 }}>{r.activity}</span>,
    },
    {
      key: "type",
      header: "Type",
      render: (r) => <Pill tone={typeTone(r.type)}>{r.type}</Pill>,
    },
    {
      key: "phase",
      header: "Phase",
      render: (r) => <PhaseBadge phase={r.phase} source={r.phaseSource} />,
    },
    {
      key: "location",
      header: "Location",
      render: (r) => <span className="cmd-row__meta">{r.location}</span>,
    },
    {
      key: "priority",
      header: "Priority",
      render: (r) => (
        <Pill tone={fieldPriorityTone(r.priority)}>{r.priority}</Pill>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <Pill tone={fieldStatusTone(r.status)}>{r.status}</Pill>,
    },
    {
      key: "reportedBy",
      header: "Reported By",
      render: (r) => <span className="cmd-row__meta">{r.reportedBy}</span>,
    },
  ];

  // ── Scroll helper ──────────────────────────────────────────────────────────
  function scrollToTable() {
    document.querySelector(".field-hub-cc .cmd-table-wrap")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  const today = todayLocal();

  return (
    <div className="field-hub-cc">
      <PageHero
        Icon={HardHat}
        title="Field Hub"
        subtitle="Real-time field visibility across crews, issues, inspections, and site activities."
        projectName={projectName}
        chips={chips}
        photoSrc={photoFor("FieldHub") ?? undefined}
      />

      <KpiStrip cells={kpiCells} />

      <div className="cmd-panels">
        {/* Panel 1 — Today in the Field */}
        <DecisionPanel
          title="Today in the Field"
          onViewAll={() => {
            onTypeFilterChange("Punchlist");
            scrollToTable();
          }}
        >
          {s.todayQueue.length === 0 ? (
            <div className="cmd-row__meta">No open field issues.</div>
          ) : (
            s.todayQueue.map((item: SiteCoordRow) => (
              <div
                className="cmd-row is-clickable"
                key={item.id}
                onClick={() => onOpenPunchlist?.(item.id)}
              >
                <div>
                  <div
                    style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}
                  >
                    {item.label}
                  </div>
                  <div className="cmd-row__meta">{item.location} · {item.assignedTo}</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Pill tone={fieldPriorityTone(item.priority)}>{item.priority}</Pill>
                  {item.dueDate && item.dueDate < today ? (
                    <span style={{ fontSize: 11, color: "var(--status-error, #FF3B3B)" }}>
                      overdue
                    </span>
                  ) : item.dueDate ? (
                    <span className="cmd-row__meta">{fmtDate(item.dueDate)}</span>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </DecisionPanel>

        {/* Panel 2 — Open Issues (upcoming inspections) */}
        <DecisionPanel
          title="Open Issues"
          onViewAll={() => {
            onTypeFilterChange("Inspection");
            scrollToTable();
          }}
        >
          {s.inspectionQueue.length === 0 ? (
            <div className="cmd-row__meta">No upcoming inspections.</div>
          ) : (
            s.inspectionQueue.map((insp: InspectionQueueRow) => {
              const overdue = insp.daysUntilDue !== null && insp.daysUntilDue < 0;
              const soon = !overdue && insp.daysUntilDue !== null && insp.daysUntilDue <= 2;
              return (
                <div
                  className="cmd-row is-clickable"
                  key={insp.id}
                  onClick={() => onOpenInspection?.(insp.id)}
                >
                  <div>
                    <div
                      style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}
                    >
                      {insp.label}
                    </div>
                    <div className="cmd-row__meta">
                      {insp.inspector} · {fmtDate(insp.dueDate)}
                    </div>
                  </div>
                  <Pill tone={overdue ? "danger" : soon ? "warn" : "info"}>
                    {overdue
                      ? "Overdue"
                      : insp.daysUntilDue === 0
                      ? "Today"
                      : insp.daysUntilDue !== null
                      ? `${insp.daysUntilDue}d`
                      : insp.status}
                  </Pill>
                </div>
              );
            })
          )}
        </DecisionPanel>

        {/* Panel 3 — Site Coordination (open safety + overdue punchlist) */}
        <DecisionPanel
          title="Site Coordination"
          onViewAll={scrollToTable}
        >
          {s.coordinationQueue.length === 0 ? (
            <div className="cmd-row__meta">No open safety or overdue items.</div>
          ) : (
            s.coordinationQueue.map((item: SiteCoordRow) => (
              <div
                className="cmd-row is-clickable"
                key={item.id}
                onClick={() => {
                  if (item.type === "safety") onOpenIncident?.(item.id);
                  else onOpenPunchlist?.(item.id);
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {item.type === "safety" ? (
                      <Flame
                        size={13}
                        style={{ color: "var(--status-error, #FF3B3B)", flexShrink: 0 }}
                      />
                    ) : null}
                    <span
                      style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}
                    >
                      {item.label}
                    </span>
                  </div>
                  <div className="cmd-row__meta">{item.location} · {item.assignedTo}</div>
                </div>
                <Pill tone={fieldPriorityTone(item.priority)}>{item.priority}</Pill>
              </div>
            ))
          )}
        </DecisionPanel>
      </div>

      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search activities, locations, crew, or inspectors"
        onExport={undefined}
        onImport={null}
        primaryLabel="Log Field Activity"
        onPrimary={onLogActivity}
        filters={
          <>
            {TYPE_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                className={`cmd-chip-btn${typeFilter === chip ? " is-active" : ""}`}
                onClick={() => onTypeFilterChange(chip)}
              >
                {chip}
              </button>
            ))}
            <span className="field-hub-cc__chip-sep" aria-hidden="true" />
            {PHASE_CHIPS.map((chip) => (
              <button
                key={`phase-${chip}`}
                type="button"
                className={`cmd-chip-btn${phaseFilter === chip ? " is-active" : ""}`}
                onClick={() => onPhaseFilterChange(chip)}
                title={chip === "All" ? "All phases" : `Only ${chip} activities`}
              >
                {chip === "All" ? "All Phases" : chip}
              </button>
            ))}
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={filtered}
        onRowClick={handleRowClick}
        emptyMessage="No field activities match your filters."
      />

      <style>{`
        .field-hub-cc__chip-sep {
          display: inline-block;
          width: 1px;
          height: 18px;
          margin: 0 4px;
          background: var(--border-default);
          vertical-align: middle;
        }
      `}</style>
    </div>
  );
}
