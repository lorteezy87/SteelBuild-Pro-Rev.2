import { useMemo } from "react";
import { HelpCircle, Clock, FileWarning, AlertTriangle, Gauge, DollarSign, CalendarClock } from "lucide-react";
import "@/styles/command.css";
import {
  PageHero, KpiStrip, DecisionPanel, Pill, statusTone, priorityTone,
  FilterBar, DataTable, useCommandSkin,
} from "@/components/command";
import type { Column, KpiCellDef } from "@/components/command";
import { buildRfiSummary } from "./rfiControlCenter.derive";
import type { RfiRecord } from "./rfiControlCenter.derive";
import { daysOpen, isOverdue } from "./utils";

const DISCIPLINES = ["All", "Structural", "Connections", "Misc Metals", "Anchor Bolts"];

function fmtMoney(n: number): string { return n ? `$${n.toLocaleString()}` : "$0"; }

function dueCell(rfi: RfiRecord) {
  if (!rfi.date_required) return <span className="cmd-row__meta">No due date</span>;
  if (isOverdue(rfi)) return <span className="cmd-overdue">{rfi.date_required} · overdue</span>;
  return <span>{rfi.date_required}</span>;
}

/** Cost/Schedule impact badge derived from the real impact flags. */
function impactCell(rfi: RfiRecord) {
  const parts: string[] = [];
  if (rfi.cost_impact) parts.push("Cost");
  if (rfi.schedule_impact) parts.push("Schedule");
  return parts.length ? <Pill tone="warn">{parts.join(" + ")}</Pill> : <span className="cmd-row__meta">None</span>;
}

/** Reveal the full table below the summary panels when a panel's "View all" fires. */
function scrollToTable() {
  document.querySelector(".rfi-cc .cmd-table-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export interface RfiControlCenterProps {
  projectName: string;
  rfis: RfiRecord[];
  filtered: RfiRecord[];
  search: string;
  onSearch: (v: string) => void;
  disciplineFilter: string;
  onDisciplineChange: (v: string) => void;
  onFilterChange: (v: string) => void;
  onOpenRfi: (rfi: RfiRecord) => void;
  onExport: () => void;
  onCreate?: (() => void) | null;
  /** Project-level context for the hero stat cards (real, from the project record). */
  projectHealth?: string | null;
  percentComplete?: number | null;
  /** Wide jobsite photo for the hero band. */
  photoSrc?: string;
}

export default function RfiControlCenter(props: RfiControlCenterProps) {
  const {
    projectName, rfis, filtered, search, onSearch, disciplineFilter, onDisciplineChange,
    onFilterChange, onOpenRfi, onExport, onCreate, projectHealth, percentComplete, photoSrc,
  } = props;
  useCommandSkin();
  const s = useMemo(() => buildRfiSummary(rfis), [rfis]);

  const heroStats = [
    { value: projectHealth || "—", label: "Project Health" },
    { value: percentComplete != null ? `${Math.round(percentComplete)}%` : "—", label: "Complete" },
  ];
  const chips = [
    { label: `${s.total} Total` },
    { label: `${s.open} Open`, tone: "good" as const },
    { label: `${s.overdue} Overdue` },
  ];

  const kpiCells: KpiCellDef[] = [
    { label: "Need Action", value: s.needAction, sublabel: "RFIs", tone: "warn", Icon: HelpCircle },
    { label: "Overdue", value: s.overdue, sublabel: "RFIs", tone: s.overdue ? "danger" : "neutral", Icon: Clock },
    { label: "Incomplete", value: s.incomplete, sublabel: "RFIs", tone: s.incomplete ? "danger" : "neutral", Icon: FileWarning },
    { label: "Critical", value: s.critical, sublabel: "RFIs", tone: s.critical ? "danger" : "neutral", Icon: AlertTriangle },
    { label: "Response Rate", value: `${s.responseRate}%`, sublabel: "answered/closed", tone: "good", Icon: Gauge },
    { label: "Cost Exposure", value: fmtMoney(s.costExposure), sublabel: "active impact", tone: s.costExposure ? "warn" : "neutral", Icon: DollarSign },
    { label: "Schedule Impact", value: `${s.scheduleExposure}d`, sublabel: "active impact", tone: s.scheduleExposure ? "warn" : "info", Icon: CalendarClock },
  ];

  const columns: Column<RfiRecord>[] = [
    { key: "num", header: "RFI #", render: (r) => <span className="cmd-row__num">{r.rfi_number || "—"}</span> },
    { key: "subject", header: "Subject", render: (r) => r.title || "Untitled RFI" },
    { key: "discipline", header: "Discipline", render: (r) => r.discipline || "—" },
    { key: "status", header: "Status", render: (r) => <Pill tone={statusTone(r.status)}>{r.status || "Open"}</Pill> },
    { key: "priority", header: "Priority", render: (r) => <Pill tone={priorityTone(r.priority)}>{r.priority || "—"}</Pill> },
    { key: "bic", header: "Ball in Court", render: (r) => r.ball_in_court || "Contractor" },
    { key: "age", header: "Age", align: "right", render: (r) => `${daysOpen(r)}d` },
    { key: "due", header: "Response Due", render: dueCell },
    { key: "impact", header: "Impact", render: impactCell },
    { key: "cost", header: "Cost Exposure", align: "right", render: (r) => (r.cost_impact && r.cost_impact_amount ? fmtMoney(Number(r.cost_impact_amount)) : "—") },
  ];

  return (
    <div className="rfi-cc">
      <PageHero
        Icon={HelpCircle}
        title="RFI Control Center"
        subtitle="Track, manage, and resolve RFIs to keep steel fabrication and field work on track."
        projectName={projectName}
        chips={chips}
        stats={heroStats}
        photoSrc={photoSrc}
      />

      <KpiStrip cells={kpiCells} />

      <div className="cmd-panels">
        <DecisionPanel title="RFI Work Queue" onViewAll={() => { onFilterChange("open"); scrollToTable(); }}>
          {s.workQueue.map((r) => (
            <div className="cmd-row is-clickable" key={r.id} onClick={() => onOpenRfi(r)}>
              <div>
                <div className="cmd-row__num">{r.rfi_number || "RFI"}</div>
                <div className="cmd-row__meta">{r.title || "Untitled RFI"}</div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Pill tone={priorityTone(r.priority)}>{r.priority || "—"}</Pill>
                <span className="cmd-row__meta">{daysOpen(r)}d</span>
              </div>
            </div>
          ))}
          {s.workQueue.length === 0 ? <div className="cmd-row__meta">Nothing in the queue.</div> : null}
        </DecisionPanel>

        <DecisionPanel title="Ball-in-Court" onViewAll={scrollToTable}>
          {s.ballInCourt.map((b) => (
            <div className="cmd-row" key={b.company}>
              <div className="cmd-row__num">{b.company}</div>
              <div className="cmd-row__meta">{b.count} open · oldest {b.oldestNumber} · avg {b.avgAgeDays}d</div>
            </div>
          ))}
          {s.ballInCourt.length === 0 ? <div className="cmd-row__meta">No open RFIs.</div> : null}
        </DecisionPanel>

        <DecisionPanel title="Highest-Risk RFIs" onViewAll={scrollToTable}>
          {s.riskQueue.map((r) => (
            <div className="cmd-row is-clickable" key={r.id} onClick={() => onOpenRfi(r)}>
              <div>
                <div className="cmd-row__num">{r.rfi_number || "RFI"}</div>
                <div className="cmd-row__meta">{r.ball_in_court || "Contractor"}</div>
              </div>
              <Pill tone={isOverdue(r) ? "danger" : "neutral"}>{isOverdue(r) ? "Late" : `${daysOpen(r)}d`}</Pill>
            </div>
          ))}
          {s.riskQueue.length === 0 ? <div className="cmd-row__meta">No active RFIs.</div> : null}
        </DecisionPanel>
      </div>

      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search RFI number, title, drawing, question, or answer"
        onExport={onExport}
        primaryLabel="New RFI"
        onPrimary={onCreate || null}
        filters={
          <>
            {DISCIPLINES.map((d) => (
              <button key={d} type="button" className={`cmd-chip-btn${disciplineFilter === d ? " is-active" : ""}`} onClick={() => onDisciplineChange(d)}>{d}</button>
            ))}
          </>
        }
      />

      <DataTable columns={columns} rows={filtered} onRowClick={onOpenRfi} emptyMessage="No RFIs match your filters." />
    </div>
  );
}
