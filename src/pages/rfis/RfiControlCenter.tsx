import { useMemo, useRef } from "react";
import type { ComponentType, PropsWithChildren, ReactNode } from "react";
import "@/styles/command.css";
import {
  AttentionQueue,
  OperationalSummary,
  PageHeader,
  StatusBadge,
  useCommandSkin,
} from "@/components/command";
import type { AttentionItem, OperationalMetric } from "@/components/command";
import {
  buildRfiSummary,
  rfiOperationalSignals,
  riskScore,
} from "./rfiControlCenter.derive";
import type { RfiRecord } from "./rfiControlCenter.derive";
import type { OperationalHealthResult } from "@/lib/projectHealth";
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

export interface RfiControlCenterProps {
  contextMode?: "project" | "portfolio";
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
  projectHealth?: string | null;
  operationalHealth?: OperationalHealthResult | null;
  percentComplete?: number | null;
  portfolioProjectCount?: number;
  portfolioAtRiskCount?: number;
  loadError?: string | null;
  onRetryLoad?: (() => void) | null;
  photoSrc?: string;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: (checked: boolean) => void;
  listTruncationNotice?: ReactNode;
  bulkActions?: ReactNode;
  bulkEditModal?: ReactNode;
  modals?: ReactNode;
}

function fmtMoney(n: number): string {
  return n ? `$${n.toLocaleString()}` : "$0";
}

function fmtDate(value?: string | null): string {
  if (!value) return "Unknown";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function attentionFromRfi(rfi: RfiRecord, onOpen: () => void): AttentionItem | null {
  const signals = rfiOperationalSignals(rfi);
  const actionable =
    signals.overdue ||
    signals.dueSoon ||
    signals.blockingDetailing ||
    signals.blockingFab ||
    signals.fieldImpact ||
    signals.unansweredExternal ||
    signals.downstreamAction;

  if (!actionable) return null;

  let risk = "Needs review";
  let nextAction = "Review RFI";
  let tone: AttentionItem["tone"] = "warn";

  if (signals.blockingFab) {
    risk = "Fabrication / release";
    nextAction = rfi.status === "Answered" ? "Apply answer to fab hold" : "Resolve fab blocker";
    tone = "danger";
  } else if (signals.blockingDetailing) {
    risk = "Detailing / IFC";
    nextAction = rfi.status === "Answered" ? "Issue required drawing revision" : "Resolve detailing blocker";
    tone = "danger";
  } else if (signals.fieldImpact) {
    risk = "Field / erection";
    nextAction = rfi.status === "Answered" ? "Apply answer and notify field" : "Obtain field-impact response";
    tone = "warn";
  } else if (signals.overdue) {
    risk = "Overdue response";
    nextAction = "Escalate ball in court";
    tone = "danger";
  } else if (signals.unansweredExternal) {
    risk = "External response";
    nextAction = "Obtain response";
    tone = "warn";
  } else if (signals.downstreamAction) {
    risk = "Answered · follow-up open";
    nextAction = "Apply answer downstream";
    tone = "info";
  } else if (signals.dueSoon) {
    risk = "Due within 3 days";
    nextAction = "Confirm response path";
    tone = "warn";
  }

  return {
    id: rfi.id || rfi.rfi_number || rfi.title || String(Math.random()),
    issue: `${rfi.rfi_number || "RFI"} · ${rfi.title || "Untitled RFI"}`,
    deadline: rfi.date_required ? fmtDate(rfi.date_required) : null,
    risk,
    owner: rfi.ball_in_court || "Unassigned",
    nextAction,
    tone,
    onOpen,
  };
}

export default function RfiControlCenter(props: RfiControlCenterProps) {
  const {
    projectName,
    contextMode = "project",
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
    operationalHealth,
    percentComplete,
    portfolioProjectCount = 0,
    portfolioAtRiskCount = 0,
    loadError,
    onRetryLoad,
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
  const summary = useMemo(() => buildRfiSummary(rfis), [rfis]);

  const attentionItems = useMemo(
    () =>
      [...rfis]
        .sort((a, b) => riskScore(b) - riskScore(a))
        .map((rfi) => attentionFromRfi(rfi, () => onOpenRfi(rfi)))
        .filter((item): item is AttentionItem => item !== null)
        .slice(0, 10),
    [rfis, onOpenRfi],
  );

  if (loadError) {
    return (
      <div className="rfi-cc sbp-command-page" role="alert">
        <section className="sbp-work-panel" style={{ padding: 24, textAlign: "center" }}>
          <strong>Couldn’t load RFIs</strong>
          <div className="cmd-row__meta" style={{ marginTop: 8 }}>{loadError}</div>
          {onRetryLoad ? (
            <button type="button" className="cmd-btn cmd-btn--primary" onClick={onRetryLoad} style={{ marginTop: 16 }}>
              Retry
            </button>
          ) : null}
        </section>
      </div>
    );
  }

  const metrics: OperationalMetric[] = [
    { label: "Open RFIs", value: summary.open, sublabel: `${summary.total} total`, tone: summary.open ? "warn" : "good" },
    { label: "Overdue", value: summary.overdue, sublabel: "response required", tone: summary.overdue ? "danger" : "good" },
    { label: "Due ≤3 Days", value: summary.dueSoon, sublabel: "near-term decisions", tone: summary.dueSoon ? "warn" : "neutral" },
    { label: "Incomplete", value: summary.incomplete, sublabel: "another round required", tone: summary.incomplete ? "danger" : "neutral" },
    { label: "Cost Exposure", value: fmtMoney(summary.costExposure), sublabel: "active RFIs", tone: summary.costExposure ? "warn" : "neutral" },
    { label: "Schedule Impact", value: `${summary.scheduleExposure}d`, sublabel: "active RFIs", tone: summary.scheduleExposure ? "warn" : "neutral" },
    { label: "Response Rate", value: `${summary.responseRate}%`, sublabel: "answered / closed", tone: summary.responseRate >= 80 ? "good" : "neutral" },
  ];

  const headerMeta = contextMode === "portfolio"
    ? `${portfolioProjectCount} active projects · ${portfolioAtRiskCount} at risk`
    : [
        operationalHealth ? `Operational health: ${operationalHealth.label}${operationalHealth.partial ? "*" : ""}` : null,
        percentComplete != null ? `${Math.round(percentComplete)}% complete` : null,
      ].filter(Boolean).join(" · ");

  return (
    <div className="rfi-cc sbp-command-page">
      {listTruncationNotice}

      <PageHeader
        eyebrow={contextMode === "portfolio" ? "Portfolio / RFIs" : `${projectName} / RFIs`}
        title="RFI Control Center"
        subtitle="Manage response ownership, required dates, production blockers, and downstream work."
        meta={headerMeta || undefined}
        actions={(
          <>
            {onImport ? <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onImport}>Import</button> : null}
            <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onExport}>Export</button>
            {onCreate ? <button type="button" className="cmd-btn cmd-btn--primary" onClick={onCreate}>New RFI</button> : null}
          </>
        )}
      />

      <OperationalSummary metrics={metrics} ariaLabel="RFI operational summary" />

      <AttentionQueue
        title="RFI Work Queue"
        items={attentionItems}
        emptyMessage="No RFI currently requires management attention."
      />

      <div className="sbp-work-grid">
        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head"><h2>Ball in Court</h2></div>
          <div>
            {summary.ballInCourt.map((row) => (
              <div className="cmd-row" key={row.company}>
                <div>
                  <div className="cmd-row__num">{row.company}</div>
                  <div className="cmd-row__meta">Oldest {row.oldestNumber} · avg {row.avgAgeDays}d</div>
                </div>
                <StatusBadge label={`${row.count} open`} tone={row.avgAgeDays > 14 ? "warning" : "neutral"} />
              </div>
            ))}
            {summary.ballInCourt.length === 0 ? <div className="sbp-attention__empty">No open RFIs.</div> : null}
          </div>
        </section>

        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head"><h2>Control Notes</h2></div>
          <div style={{ padding: 12 }}>
            <div className="cmd-row__meta">
              Answered RFIs remain visible when drawing, fabrication, field, schedule, or commercial follow-up is still recorded.
            </div>
            <div className="cmd-row__meta" style={{ marginTop: 10 }}>
              Missing required dates remain unknown rather than being treated as on-time.
            </div>
          </div>
        </section>
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
          <AgendaPanelView agenda={agenda} onOpenRfi={onOpenRfi} onClose={onToggleAgenda} />
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
