import { useMemo, useRef } from "react";
import type { ComponentType, PropsWithChildren, ReactNode } from "react";
import { HelpCircle, Clock, FileWarning, AlertTriangle, Gauge, DollarSign, CalendarClock } from "lucide-react";
import "@/styles/command.css";
import {
  PageHero, KpiStrip, DecisionPanel, Pill, priorityTone, useCommandSkin,
} from "@/components/command";
import type { KpiCellDef } from "@/components/command";
import { buildRfiSummary } from "./rfiControlCenter.derive";
import type { RfiRecord } from "./rfiControlCenter.derive";
import { daysOpen, isOverdue } from "./utils";
import RfiInsightsStrip from "./RfiInsightsStrip";
import RfiFilterToolbar from "./RfiFilterToolbar";
import AgendaPanel from "./AgendaPanel";
import RfiTable from "./RfiTable";

type AnyProps = PropsWithChildren<Record<string, unknown>>;
const RfiInsightsStripView = RfiInsightsStrip as unknown as ComponentType<AnyProps>;
const RfiFilterToolbarView = RfiFilterToolbar as unknown as ComponentType<AnyProps>;
const AgendaPanelView = AgendaPanel as unknown as ComponentType<AnyProps>;
const RfiTableView = RfiTable as unknown as ComponentType<AnyProps>;

type RfiAgenda = {
  total: number;
  counts?: {
    overdue?: number;
    blocking?: number;
    dueSoon?: number;
    awaiting?: number;
  };
  items?: unknown[];
  groups?: Record<string, unknown[]>;
};

/** Canonical RFI presentation shell. RFIs.jsx remains the data and mutation authority. */
export interface RfiControlCenterProps {
  projectName: string;
  rfis: RfiRecord[];
  filtered: RfiRecord[];
  search: string;
  onSearch: (v: string) => void;
  filter?: string;
  onFilterChange?: (v: string) => void;
  disciplineFilter: string;
  onDisciplineChange: (v: string) => void;
  onClearFilters?: () => void;
  density?: string;
  onDensityChange?: (v: string) => void;
  seqFilter?: unknown;
  onSeqFilter?: (v: unknown) => void;
  agendaOpen?: boolean;
  onToggleAgenda?: () => void;
  agenda?: RfiAgenda;
  agendaUrgent?: number;
  insightsCollapsed?: boolean;
  onToggleInsights?: () => void;
  onOpenRfi: (rfi: RfiRecord) => void;
  onExport: () => void;
  onImport?: (() => void) | null;
  onCreate?: (() => void) | null;
  /** Project-level context for the hero stat cards (real, from the project record). */
  projectHealth?: string | null;
  percentComplete?: number | null;
  /** Wide jobsite photo for the hero band. */
  photoSrc?: string;
  /** Bulk selection (drives the register checkbox column + parent bulk actions). */
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: (checked: boolean) => void;
  listTruncationNotice?: ReactNode;
  bulkActions?: ReactNode;
  bulkEditModal?: ReactNode;
  modals?: ReactNode;
}

function fmtMoney(n: number): string { return n ? `$${n.toLocaleString()}` : "$0"; }

export default function RfiControlCenter(props: RfiControlCenterProps) {
  const {
    projectName,
    rfis,
    filtered,
    search,
    onSearch,
    filter = "all",
    onFilterChange = () => {},
    disciplineFilter,
    onDisciplineChange,
    onClearFilters = () => {},
    density = "normal",
    onDensityChange = () => {},
    seqFilter = null,
    onSeqFilter = () => {},
    agendaOpen = false,
    onToggleAgenda = () => {},
    agenda = { total: 0, counts: {}, items: [], groups: {} },
    agendaUrgent = 0,
    insightsCollapsed,
    onToggleInsights = () => {},
    onOpenRfi,
    onExport,
    onImport,
    onCreate,
    projectHealth,
    percentComplete,
    photoSrc,
    selectedIds = new Set<string>(),
    onToggleSelect = () => {},
    onToggleAll = () => {},
    listTruncationNotice,
    bulkActions,
    bulkEditModal,
    modals,
  } = props;
  const bodyRef = useRef<HTMLDivElement | null>(null);
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

  const scrollToBody = () => {
    bodyRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="rfi-cc">
      {listTruncationNotice}

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
        <DecisionPanel title="RFI Work Queue" onViewAll={() => { onFilterChange("open"); scrollToBody(); }}>
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

        <DecisionPanel title="Ball-in-Court" onViewAll={scrollToBody}>
          {s.ballInCourt.map((b) => (
            <div className="cmd-row" key={b.company}>
              <div className="cmd-row__num">{b.company}</div>
              <div className="cmd-row__meta">{b.count} open · oldest {b.oldestNumber} · avg {b.avgAgeDays}d</div>
            </div>
          ))}
          {s.ballInCourt.length === 0 ? <div className="cmd-row__meta">No open RFIs.</div> : null}
        </DecisionPanel>

        <DecisionPanel title="Highest-Risk RFIs" onViewAll={scrollToBody}>
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

      <div ref={bodyRef} className="rfi-cc-body">
        {insightsCollapsed !== undefined ? (
          <RfiInsightsStripView
            rfis={rfis}
            collapsed={insightsCollapsed}
            onToggleCollapsed={onToggleInsights}
          />
        ) : null}

        <div className="rfi-register-pin">
          <RfiFilterToolbarView
            search={search}
            onSearch={onSearch}
            filter={filter}
            onFilterChange={onFilterChange}
            disciplineFilter={disciplineFilter}
            onDisciplineChange={onDisciplineChange}
            density={density}
            onDensityChange={onDensityChange}
            rfis={rfis}
            seqFilter={seqFilter}
            onSeqFilter={onSeqFilter}
            agendaOpen={agendaOpen}
            onToggleAgenda={onToggleAgenda}
            agenda={agenda}
            agendaUrgent={agendaUrgent}
            filteredCount={filtered.length}
            totalCount={rfis.length}
            onClearFilters={onClearFilters}
            onImport={onImport}
            onExport={onExport}
            onCreate={onCreate}
          />
        </div>

        {agendaOpen ? (
          <AgendaPanelView
            agenda={agenda}
            onOpenRfi={onOpenRfi}
            onClose={onToggleAgenda}
          />
        ) : null}

        <RfiTableView
          rows={filtered}
          totalCount={rfis.length}
          selectedIds={selectedIds}
          onToggleAll={onToggleAll}
          onToggleSelect={onToggleSelect}
          onOpen={onOpenRfi}
        />

        {bulkActions}
        {bulkEditModal}
        {modals}
      </div>
    </div>
  );
}
