/**
 * DeliveryControlCenter — canonical presentation for the Deliveries page.
 * The container (Deliveries.tsx) owns all data, mutations, permissions, and
 * state. This file composes the logistics workflows purely from props.
 *
 * Layout: PageHero → KpiStrip → 3 DecisionPanels → FilterBar (with view toggle
 * inline) → body (Register DataTable | Dispatch slot | Schedule slot).
 *
 * Custom CSS needed centrally (noted inline):
 *   .dlv-cc-view-toggle — the 3-button Register/Dispatch/Schedule tab strip
 */

import { useMemo, type CSSProperties, type ReactNode } from "react";
import "@/styles/command.css";
import {
  AttentionQueue,
  OperationalSummary,
  PageHeader,
  Pill,
  FilterBar,
  DataTable,
  useCommandSkin,
} from "@/components/command";
import type { AttentionItem, Column } from "@/components/command";
import { Download, Plus, Upload } from "lucide-react";
import { buildDeliveryPanels, deliveryStatusTone } from "./deliveryControlCenter.derive";
import { formatDate, formatTons } from "./format";
import { deliveryStyles } from "./styles";
import type { DeliveryMetrics, DeliveryRecord } from "./types";

// ---------------------------------------------------------------------------
// Inline styles for custom elements
// (coordinator: these belong in command.css once stable)
// ---------------------------------------------------------------------------

/**
 * View toggle strip — sits just above the body, below the FilterBar.
 * Uses command-skin tokens so the light default and dark remap stay aligned.
 */
const viewToggleWrapStyle: CSSProperties = {
  display: "flex",
  gap: 0,
  border: "1px solid var(--cmd-border)",
  borderRadius: 6,
  overflow: "hidden",
  background: "var(--cmd-surface)",
  marginBottom: 12,
  width: "fit-content",
};

const viewToggleBtnBase: CSSProperties = {
  padding: "6px 16px",
  fontSize: 13,
  fontWeight: 500,
  color: "var(--cmd-text)",
  background: "transparent",
  border: "none",
  borderRight: "1px solid var(--cmd-border)",
  cursor: "pointer",
  transition: "background 0.12s",
  whiteSpace: "nowrap",
};

const viewToggleBtnLast: CSSProperties = {
  ...viewToggleBtnBase,
  borderRight: "none",
};

const viewToggleActiveStyle: CSSProperties = {
  background: "var(--cmd-text)",
  color: "var(--cmd-surface)",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DeliveryControlCenterProps {
  projectName: string;
  projectId?: string | null;
  projectOptions?: Array<{ id: string; name?: string | null; project_name?: string | null }>;
  onProjectChange?: (value: string) => void;
  deliveries: DeliveryRecord[];
  filtered: DeliveryRecord[];
  metrics: DeliveryMetrics;
  search: string;
  onSearch: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  /** Schedule filter chip value — matches SCHEDULE_FILTERS ids */
  scheduleFilter: string;
  onScheduleFilterChange: (v: string) => void;
  /** Risk filter chip value — matches RISK_FILTERS ids */
  riskFilter: string;
  onRiskFilterChange: (v: string) => void;
  /** "register" | "dispatch" | "schedule" */
  view: string;
  onViewChange: (v: string) => void;
  onOpenDelivery: (delivery: DeliveryRecord) => void;
  onExport: () => void;
  onImport?: (() => void) | null;
  onImportList?: (() => void) | null;
  onCreate?: (() => void) | null;
  onClearFilters?: (() => void) | null;
  sequenceFilter?: ReactNode;
  truncationNotice?: ReactNode;
  receivingPanel?: ReactNode;
  projectHealth?: string | null;
  percentComplete?: number | null;
  /** Bulk selection */
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: (checked: boolean) => void;
  /** Pre-rendered DispatchBoard element (from container; avoids importing it here) */
  dispatchBoard: ReactNode;
  /** Pre-rendered ScheduleView element (from container; avoids importing it here) */
  scheduleView: ReactNode;
}

// ---------------------------------------------------------------------------
// Schedule filter chips config
// ---------------------------------------------------------------------------

const SCHEDULE_CHIPS = [
  { id: "all", label: "All Loads" },
  { id: "late", label: "Late" },
  { id: "today", label: "Today" },
  { id: "week", label: "7 Days" },
  { id: "ready", label: "Ready" },
  { id: "unscheduled", label: "No Date" },
  { id: "longLead", label: "Long Lead" },
];

const RISK_CHIPS = [
  { id: "all", label: "All Risk" },
  { id: "high", label: "Exceptions" },
  { id: "medium", label: "Warnings" },
  { id: "clear", label: "Clear" },
];

const VIEW_OPTIONS = [
  { id: "register", label: "Register" },
  { id: "dispatch", label: "Dispatch" },
  { id: "schedule", label: "Schedule" },
];

// ---------------------------------------------------------------------------
// Helper: date cell with overdue highlight
// ---------------------------------------------------------------------------

function scheduledCell(delivery: DeliveryRecord) {
  const signals = delivery._signals;
  if (!signals?.scheduledDate) return <span style={{ color: "var(--cmd-text-muted)" }}>TBD</span>;
  if (signals.overdue) {
    return <span style={{ color: "var(--status-error)", fontWeight: 600 }}>{formatDate(delivery.scheduled_date)} · late</span>;
  }
  if (signals.dueToday) {
    return <span style={{ color: "var(--status-warning)", fontWeight: 600 }}>{formatDate(delivery.scheduled_date)} · today</span>;
  }
  return <span>{formatDate(delivery.scheduled_date)}</span>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DeliveryControlCenter(props: DeliveryControlCenterProps) {
  const {
    projectName,
    projectId,
    projectOptions = [],
    onProjectChange,
    filtered,
    metrics,
    search,
    onSearch,
    statusFilter,
    onStatusFilterChange,
    scheduleFilter,
    onScheduleFilterChange,
    riskFilter,
    onRiskFilterChange,
    view,
    onViewChange,
    onOpenDelivery,
    onExport,
    onImport,
    onImportList,
    onCreate,
    onClearFilters,
    sequenceFilter,
    truncationNotice,
    receivingPanel,
    projectHealth,
    percentComplete,
    selectedIds,
    onToggleSelect,
    onToggleAll,
    dispatchBoard,
    scheduleView,
  } = props;

  useCommandSkin();

  const panels = useMemo(() => buildDeliveryPanels(metrics), [metrics]);
  const selectable = !!(selectedIds && onToggleSelect && onToggleAll);
  const allSelected = selectable && filtered.length > 0 && selectedIds!.size === filtered.length;

  const attentionItems = useMemo<AttentionItem[]>(() => {
    const candidates = [
      ...metrics.overdue,
      ...metrics.exceptions,
      ...metrics.unscheduled,
    ];
    const unique = new Map<string, DeliveryRecord>();
    for (const delivery of candidates) {
      const key = delivery.id || String(delivery.delivery_title || delivery.load_number || delivery.delivery_number || unique.size);
      if (!unique.has(key)) unique.set(key, delivery);
    }

    return [...unique.values()].slice(0, 12).map((delivery) => {
      const signals = delivery._signals;
      const flags = signals?.flags || [];
      const load = delivery.delivery_title || delivery.load_number || delivery.delivery_number || "Load";
      const risk = signals?.overdue
        ? "Load is overdue"
        : signals?.unscheduled
          ? "Scheduled date unknown"
          : flags.length
            ? flags.map((flag) => flag.label).slice(0, 2).join(" · ")
            : "Delivery exception";

      return {
        id: delivery.id || String(load),
        issue: `${load} · ${signals?.status || delivery.status || "Status unknown"}`,
        deadline: delivery.required_date || delivery.scheduled_date || null,
        risk,
        owner: delivery.carrier || null,
        nextAction: signals?.unscheduled
          ? "Set load date"
          : signals?.overdue
            ? "Recover delivery plan"
            : "Clear delivery exception",
        tone: signals?.risk === "high" || signals?.overdue ? "danger" : "warn",
        onOpen: () => onOpenDelivery(delivery),
      };
    });
  }, [metrics.exceptions, metrics.overdue, metrics.unscheduled, onOpenDelivery]);

  const operationalMetrics = [
    { label: "Open Loads", value: metrics.openCount, sublabel: "active", tone: metrics.openCount ? "info" as const : "good" as const },
    { label: "Due Today", value: metrics.dueToday.length, sublabel: "loads", tone: metrics.dueToday.length ? "warn" as const : "neutral" as const },
    { label: "Overdue", value: metrics.overdue.length, sublabel: "loads", tone: metrics.overdue.length ? "danger" as const : "good" as const },
    { label: "Exceptions", value: metrics.exceptions.length, sublabel: "flagged", tone: metrics.exceptions.length ? "danger" as const : "good" as const },
    { label: "Unscheduled Loads", value: metrics.unscheduled.length, sublabel: "date unknown", tone: metrics.unscheduled.length ? "warn" as const : "good" as const },
    { label: "Ready to Receive", value: metrics.readyToReceive.length, sublabel: "loads", tone: metrics.readyToReceive.length ? "good" as const : "neutral" as const },
    { label: "Open Pieces", value: metrics.totalOpenPieces.toLocaleString(), sublabel: `${formatTons(metrics.totalOpenTons)} open`, tone: "neutral" as const },
  ];

  // ---------------------------------------------------------------------------
  // Register DataTable columns
  // ---------------------------------------------------------------------------

  const columns: Column<DeliveryRecord>[] = [
    ...(selectable
      ? ([{
          key: "sel",
          header: (
            <input
              type="checkbox"
              className="cmd-check"
              checked={allSelected}
              onChange={(event) => onToggleAll!(event.target.checked)}
              aria-label="Select all deliveries"
            />
          ),
          render: (delivery: DeliveryRecord) => (
            <input
              type="checkbox"
              className="cmd-check"
              checked={selectedIds!.has(delivery.id || "")}
              onClick={(event) => event.stopPropagation()}
              onChange={() => onToggleSelect!(delivery.id || "")}
              aria-label="Select delivery"
            />
          ),
        }] as Column<DeliveryRecord>[])
      : []),
    {
      key: "load",
      header: "Load",
      grid: "minmax(105px, 1fr)",
      render: (delivery) => (
        <div>
          <div className="cmd-row__num">
            {delivery.delivery_title || delivery.load_number || delivery.delivery_number || "Load"}
          </div>
          <div className="cmd-row__meta">{delivery.vendor || delivery.po_number ? [delivery.vendor, delivery.po_number ? `PO ${delivery.po_number}` : null].filter(Boolean).join(" · ") : "Vendor / PO unknown"}</div>
        </div>
      ),
    },
    {
      key: "package",
      header: "WP / Seq",
      grid: "minmax(105px, .9fr)",
      render: (delivery) => (
        <div>
          <div>{delivery.work_package_id || "WP unknown"}</div>
          <div className="cmd-row__meta">{delivery.sequence_number ? `Seq ${delivery.sequence_number}` : "Sequence unknown"}</div>
        </div>
      ),
    },
    {
      key: "quantity",
      header: "Pieces / Tons",
      align: "right",
      grid: "minmax(95px, .8fr)",
      render: (delivery) => (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
          <div>{delivery.pieces != null ? `${delivery.pieces} pcs` : "Pieces unknown"}</div>
          <div className="cmd-row__meta">{delivery.weight_tons != null ? formatTons(delivery.weight_tons) : "Tons unknown"}</div>
        </div>
      ),
    },
    {
      key: "readiness",
      header: "Readiness",
      grid: "minmax(110px, .9fr)",
      render: (delivery) => {
        const signals = delivery._signals;
        if (!signals) return <span className="cmd-row__meta">Unknown</span>;
        return (
          <div>
            <Pill tone={signals.fabReady ? "good" : signals.risk === "high" ? "danger" : "warn"}>
              {signals.readinessScore}% ready
            </Pill>
            <div className="cmd-row__meta">{signals.fabReady ? "Fab ready" : "Readiness open"}</div>
          </div>
        );
      },
    },
    {
      key: "carrier",
      header: "Carrier",
      grid: "minmax(115px, .9fr)",
      render: (delivery) => delivery.carrier || <span className="cmd-row__meta">Carrier unknown</span>,
    },
    {
      key: "required",
      header: "Required On Site",
      grid: "minmax(110px, .9fr)",
      render: (delivery) => delivery.required_date
        ? <span>{formatDate(delivery.required_date)}</span>
        : <span className="cmd-row__meta">Unknown</span>,
    },
    {
      key: "scheduled",
      header: "Ship / Scheduled",
      grid: "minmax(125px, 1fr)",
      render: (delivery) => {
        const plannedShip = delivery.expected_ship_date || delivery.scheduled_date;
        if (!plannedShip) return <span className="cmd-row__meta">Unknown</span>;
        return scheduledCell({ ...delivery, scheduled_date: plannedShip });
      },
    },
    {
      key: "status",
      header: "Status",
      grid: "minmax(105px, .85fr)",
      render: (delivery) => (
        <Pill tone={deliveryStatusTone(delivery._signals?.status || delivery.status)}>
          {delivery._signals?.status || delivery.status || "Scheduled"}
        </Pill>
      ),
    },
    {
      key: "receiving",
      header: "Receiving",
      grid: "minmax(115px, .95fr)",
      render: (delivery) => delivery.receiving_location || <span className="cmd-row__meta">Location unknown</span>,
    },
  ];

  // ---------------------------------------------------------------------------
  // Scroll to body helper
  // ---------------------------------------------------------------------------

  function scrollToBody() {
    document.querySelector(".dlv-cc .cmd-table-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="dlv-cc sbp-command-page">
      <style>{deliveryStyles}</style>

      <PageHeader
        eyebrow={`${projectName} / Logistics`}
        title="Delivery Control"
        subtitle="Load readiness, ship dates, receiving, and field-facing delivery exceptions."
        meta={[
          projectHealth ? `Project health: ${projectHealth}` : "Project health: unknown",
          percentComplete != null ? `${Math.round(percentComplete)}% project complete` : null,
          `${metrics.totalCount} loads`,
          `${metrics.totalOpenPieces.toLocaleString()} open pieces`,
        ].filter(Boolean).join(" · ")}
        actions={(
          <>
            {onImport ? (
              <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onImport}>
                <Upload size={14} /> Import Ticket
              </button>
            ) : null}
            {onImportList ? (
              <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onImportList}>
                <Upload size={14} /> Shipping List
              </button>
            ) : null}
            <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onExport}>
              <Download size={14} /> Export
            </button>
            {onCreate ? (
              <button type="button" className="cmd-btn cmd-btn--primary" onClick={onCreate}>
                <Plus size={14} /> Schedule Load
              </button>
            ) : null}
          </>
        )}
      />

      {receivingPanel}

      <OperationalSummary metrics={operationalMetrics} ariaLabel="Delivery operational summary" />

      <AttentionQueue
        title="Load Attention"
        items={attentionItems}
        emptyMessage="No late, unscheduled, or flagged delivery loads."
      />

      <div className="sbp-work-grid">
        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head">
            <h2>Next Loads</h2>
            <button type="button" className="cmd-btn cmd-btn--ghost" onClick={() => { onScheduleFilterChange("all"); scrollToBody(); }}>
              View register
            </button>
          </div>
          <div>
            {panels.workQueue.length === 0 ? (
              <div className="sbp-attention__empty">No upcoming loads.</div>
            ) : panels.workQueue.map((delivery) => (
              <button
                type="button"
                className="cmd-row is-clickable"
                key={delivery.id}
                onClick={() => onOpenDelivery(delivery)}
                style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }}
              >
                <div>
                  <div className="cmd-row__num">{delivery.delivery_title || delivery.load_number || delivery.delivery_number || "Load"}</div>
                  <div className="cmd-row__meta">
                    {delivery.work_package_id || "WP unknown"} · {formatDate(delivery.scheduled_date)}
                  </div>
                </div>
                <Pill tone={deliveryStatusTone(delivery._signals?.status || delivery.status)}>
                  {delivery._signals?.status || delivery.status || "Scheduled"}
                </Pill>
              </button>
            ))}
          </div>
        </section>

        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head">
            <h2>Receiving Queue</h2>
            <button type="button" className="cmd-btn cmd-btn--ghost" onClick={() => { onScheduleFilterChange("ready"); scrollToBody(); }}>
              Ready loads
            </button>
          </div>
          <div>
            {panels.receivingQueue.length === 0 ? (
              <div className="sbp-attention__empty">No loads ready to receive.</div>
            ) : panels.receivingQueue.map((delivery) => (
              <button
                type="button"
                className="cmd-row is-clickable"
                key={delivery.id}
                onClick={() => onOpenDelivery(delivery)}
                style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }}
              >
                <div>
                  <div className="cmd-row__num">{delivery.delivery_title || delivery.load_number || "Load"}</div>
                  <div className="cmd-row__meta">
                    {delivery.receiving_location || "Receiving location unknown"} · {formatTons(delivery.weight_tons)}
                  </div>
                </div>
                <Pill tone={deliveryStatusTone(delivery._signals?.status || delivery.status)}>
                  {delivery._signals?.status || "In Transit"}
                </Pill>
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* FilterBar with schedule + risk chips */}
      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search vendor, PO, load, carrier, truck, work package..."
        secondaryActions={
          onClearFilters ? (
            <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onClearFilters}>
              Clear Filters
            </button>
          ) : null
        }
        filters={
          <>
            {!projectId && onProjectChange && (
              <label className="cmd-filterbar__select" aria-label="Project">
                <select value="" onChange={(event) => onProjectChange(event.target.value)}>
                  <option value="">All Projects</option>
                  {projectOptions.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name || project.project_name || project.id}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              className={`cmd-chip-btn${statusFilter === "all" ? " is-active" : ""}`}
              onClick={() => onStatusFilterChange("all")}
            >
              All Status
            </button>
            {metrics.statusRollup.map((status) => (
              <button
                key={status.status}
                type="button"
                className={`cmd-chip-btn${statusFilter === status.status ? " is-active" : ""}`}
                onClick={() => onStatusFilterChange(statusFilter === status.status ? "all" : status.status)}
              >
                {status.status} ({status.count})
              </button>
            ))}
            {SCHEDULE_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={`cmd-chip-btn${scheduleFilter === chip.id ? " is-active" : ""}`}
                onClick={() => onScheduleFilterChange(chip.id)}
              >
                {chip.label}
              </button>
            ))}
                    <span style={{ display: "inline-block", width: 1, height: 18, background: "var(--cmd-border)", margin: "0 4px", verticalAlign: "middle" }} />
            {RISK_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={`cmd-chip-btn${riskFilter === chip.id ? " is-active" : ""}`}
                onClick={() => onRiskFilterChange(chip.id)}
              >
                {chip.label}
              </button>
            ))}
          </>
        }
      />

      {truncationNotice}
      {sequenceFilter}

      {/* View toggle — Register / Dispatch / Schedule */}
      {/*
       * Keep the view tabs local to this shell so Register, Dispatch, and
       * Schedule remain distinct supported delivery workflows:
       *   .dlv-cc-view-toggle { display:flex; width:fit-content; border:1px solid #e4e8ee; border-radius:6px; overflow:hidden; background:#fff; margin-bottom:12px; }
       *   .dlv-cc-view-toggle button { padding:6px 16px; font-size:13px; font-weight:500; color:#1b2430; background:transparent; border:none; border-right:1px solid #e4e8ee; cursor:pointer; }
       *   .dlv-cc-view-toggle button:last-child { border-right:none; }
       *   .dlv-cc-view-toggle button.is-active { background:#1b2430; color:#fff; }
       */}
      <div style={viewToggleWrapStyle} className="dlv-cc-view-toggle" role="tablist" aria-label="Delivery view">
        {VIEW_OPTIONS.map((opt, idx) => {
          const isLast = idx === VIEW_OPTIONS.length - 1;
          const isActive = view === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              style={{
                ...(isLast ? viewToggleBtnLast : viewToggleBtnBase),
                ...(isActive ? viewToggleActiveStyle : {}),
              }}
              onClick={() => onViewChange(opt.id)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Body — driven by view */}
      {view === "register" && (
        <DataTable
          columns={columns}
          rows={filtered}
          onRowClick={onOpenDelivery}
          emptyMessage="No deliveries match your filters."
        />
      )}
      {view === "dispatch" && dispatchBoard}
      {view === "schedule" && scheduleView}
    </div>
  );
}
