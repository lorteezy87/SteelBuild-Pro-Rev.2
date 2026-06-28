/**
 * DeliveryControlCenter — presentation-only command UI skin for the Deliveries page.
 * Gated behind the `command_ui` feature flag; the container (Deliveries.tsx) owns
 * all data, mutations, and state. This file composes purely from props.
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
  PageHero,
  KpiStrip,
  DecisionPanel,
  Pill,
  FilterBar,
  DataTable,
  useCommandSkin,
} from "@/components/command";
import type { Column, KpiCellDef } from "@/components/command";
import {
  Truck,
  PackageCheck,
  Clock3,
  AlertTriangle,
  CheckCircle2,
  CalendarClock,
  Package,
} from "lucide-react";
import { buildDeliveryPanels, deliveryStatusTone } from "./deliveryControlCenter.derive";
import { formatDate, formatTons } from "./format";
import type { DeliveryMetrics, DeliveryRecord } from "./types";

// ---------------------------------------------------------------------------
// Inline styles for custom elements
// (coordinator: these belong in command.css once stable)
// ---------------------------------------------------------------------------

/**
 * View toggle strip — sits just above the body, below the FilterBar.
 * Light card surface: #fff bg, #e4e8ee border, #1b2430 text.
 */
const viewToggleWrapStyle: CSSProperties = {
  display: "flex",
  gap: 0,
  border: "1px solid #e4e8ee",
  borderRadius: 6,
  overflow: "hidden",
  background: "#fff",
  marginBottom: 12,
  width: "fit-content",
};

const viewToggleBtnBase: CSSProperties = {
  padding: "6px 16px",
  fontSize: 13,
  fontWeight: 500,
  color: "#1b2430",
  background: "transparent",
  border: "none",
  borderRight: "1px solid #e4e8ee",
  cursor: "pointer",
  transition: "background 0.12s",
  whiteSpace: "nowrap",
};

const viewToggleBtnLast: CSSProperties = {
  ...viewToggleBtnBase,
  borderRight: "none",
};

const viewToggleActiveStyle: CSSProperties = {
  background: "#1b2430",
  color: "#fff",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DeliveryControlCenterProps {
  projectName: string;
  deliveries: DeliveryRecord[];
  filtered: DeliveryRecord[];
  metrics: DeliveryMetrics;
  search: string;
  onSearch: (v: string) => void;
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
  onCreate?: (() => void) | null;
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
  if (!signals?.scheduledDate) return <span style={{ color: "#9ca3af" }}>TBD</span>;
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
    filtered,
    metrics,
    search,
    onSearch,
    scheduleFilter,
    onScheduleFilterChange,
    riskFilter,
    onRiskFilterChange,
    view,
    onViewChange,
    onOpenDelivery,
    onExport,
    onImport,
    onCreate,
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

  // ---------------------------------------------------------------------------
  // Hero
  // ---------------------------------------------------------------------------

  const heroStats = [
    { value: projectHealth || "—", label: "Project Health" },
    { value: percentComplete != null ? `${Math.round(percentComplete)}%` : "—", label: "Complete" },
  ];

  const heroChips = [
    { label: `${metrics.totalCount} Loads` },
    { label: `${metrics.openCount} Open`, tone: "good" as const },
    { label: `${metrics.exceptions.length} Exceptions`, tone: metrics.exceptions.length ? "danger" as const : "neutral" as const },
  ];

  // ---------------------------------------------------------------------------
  // KPI strip (7 cells)
  // ---------------------------------------------------------------------------

  const kpiCells: KpiCellDef[] = [
    { label: "Open Loads", value: metrics.openCount, sublabel: "active", tone: "info", Icon: PackageCheck },
    { label: "Due Today", value: metrics.dueToday.length, sublabel: "loads", tone: metrics.dueToday.length ? "warn" : "neutral", Icon: Clock3 },
    { label: "Overdue", value: metrics.overdue.length, sublabel: "loads", tone: metrics.overdue.length ? "danger" : "neutral", Icon: AlertTriangle },
    { label: "Exceptions", value: metrics.exceptions.length, sublabel: "flagged", tone: metrics.exceptions.length ? "danger" : "neutral", Icon: AlertTriangle },
    { label: "Ready to Receive", value: metrics.readyToReceive.length, sublabel: "loads", tone: "good", Icon: CheckCircle2 },
    { label: "Long Lead Open", value: metrics.longLeadOpen.length, sublabel: "items", tone: metrics.longLeadOpen.length ? "warn" : "neutral", Icon: CalendarClock },
    { label: "Total Pieces", value: metrics.totalOpenPieces.toLocaleString(), sublabel: "open", tone: "neutral", Icon: Package },
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
              onChange={(e) => onToggleAll!(e.target.checked)}
              aria-label="Select all deliveries"
            />
          ),
          render: (d: DeliveryRecord) => (
            <input
              type="checkbox"
              className="cmd-check"
              checked={selectedIds!.has(d.id || "")}
              onClick={(e) => e.stopPropagation()}
              onChange={() => onToggleSelect!(d.id || "")}
              aria-label="Select delivery"
            />
          ),
        }] as Column<DeliveryRecord>[])
      : []),
    {
      key: "load",
      header: "Load",
      render: (d) => (
        <div>
          <span className="cmd-row__num">{d.delivery_title || d.load_number || d.delivery_number || "—"}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (d) => <Pill tone={deliveryStatusTone(d._signals?.status || d.status)}>{d._signals?.status || d.status || "Scheduled"}</Pill>,
    },
    {
      key: "vendor",
      header: "Vendor / PO",
      render: (d) => (
        <div>
          <div>{d.vendor || "—"}</div>
          {d.po_number && <div className="cmd-row__meta">PO {d.po_number}</div>}
        </div>
      ),
    },
    {
      key: "scheduled",
      header: "Scheduled",
      render: scheduledCell,
    },
    {
      key: "required",
      header: "Need By",
      render: (d) => <span>{formatDate(d.required_date)}</span>,
    },
    {
      key: "weight",
      header: "Tons / Pcs",
      align: "right" as const,
      render: (d) => (
        <span style={{ fontFamily: "var(--font-mono)" }}>
          {formatTons(d.weight_tons)} / {d.pieces ? String(d.pieces) : "—"}
        </span>
      ),
    },
    {
      key: "carrier",
      header: "Carrier",
      render: (d) => d.carrier || <span className="cmd-row__meta">—</span>,
    },
    {
      key: "location",
      header: "Receiving",
      render: (d) => d.receiving_location || <span className="cmd-row__meta">—</span>,
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
    <div className="dlv-cc">
      <PageHero
        Icon={Truck}
        title="Deliveries"
        subtitle="Plan load-out, spot late trucks, confirm receiving, and keep field-ready steel visible before it turns into a site constraint."
        projectName={projectName}
        chips={heroChips}
        stats={heroStats}
      />

      <KpiStrip cells={kpiCells} />

      <div className="cmd-panels">
        <DecisionPanel
          title="Next Loads"
          onViewAll={() => { onScheduleFilterChange("all"); scrollToBody(); }}
        >
          {panels.workQueue.length === 0
            ? <div className="cmd-row__meta">No upcoming loads.</div>
            : panels.workQueue.map((d) => (
              <div className="cmd-row is-clickable" key={d.id} onClick={() => onOpenDelivery(d)}>
                <div>
                  <div className="cmd-row__num">{d.delivery_title || d.load_number || d.delivery_number || d.vendor || "Load"}</div>
                  <div className="cmd-row__meta">{d.vendor || "—"} · {formatDate(d.scheduled_date)}</div>
                </div>
                <Pill tone={deliveryStatusTone(d._signals?.status || d.status)}>
                  {d._signals?.status || d.status || "Scheduled"}
                </Pill>
              </div>
            ))
          }
        </DecisionPanel>

        <DecisionPanel
          title="Receiving"
          onViewAll={() => { onScheduleFilterChange("ready"); scrollToBody(); }}
        >
          {panels.receivingQueue.length === 0
            ? <div className="cmd-row__meta">No loads ready to receive.</div>
            : panels.receivingQueue.map((d) => (
              <div className="cmd-row is-clickable" key={d.id} onClick={() => onOpenDelivery(d)}>
                <div>
                  <div className="cmd-row__num">{d.delivery_title || d.load_number || d.vendor || "Load"}</div>
                  <div className="cmd-row__meta">{d.receiving_location || "—"} · {formatTons(d.weight_tons)}</div>
                </div>
                <Pill tone={deliveryStatusTone(d._signals?.status || d.status)}>
                  {d._signals?.status || "In Transit"}
                </Pill>
              </div>
            ))
          }
        </DecisionPanel>

        <DecisionPanel
          title="Exceptions & Flags"
          onViewAll={() => { onRiskFilterChange("high"); scrollToBody(); }}
        >
          {panels.exceptionQueue.length === 0
            ? <div className="cmd-row__meta">No exceptions — loads look clear.</div>
            : panels.exceptionQueue.map((d) => {
                const flags = d._signals?.flags || [];
                const topFlag = flags[0];
                return (
                  <div className="cmd-row is-clickable" key={d.id} onClick={() => onOpenDelivery(d)}>
                    <div>
                      <div className="cmd-row__num">{d.delivery_title || d.load_number || d.vendor || "Load"}</div>
                      {topFlag && <div className="cmd-row__meta">{topFlag.label}</div>}
                      {flags.length > 1 && <div className="cmd-row__meta">+{flags.length - 1} more</div>}
                    </div>
                    <Pill tone={d._signals?.risk === "high" ? "danger" : "warn"}>
                      {d._signals?.risk === "high" ? "Exception" : "Warning"}
                    </Pill>
                  </div>
                );
              })
          }
        </DecisionPanel>
      </div>

      {/* FilterBar with schedule + risk chips */}
      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search vendor, PO, load, carrier, truck, work package..."
        onImport={onImport}
        onExport={onExport}
        primaryLabel="Schedule Load"
        onPrimary={onCreate || null}
        filters={
          <>
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
            <span style={{ display: "inline-block", width: 1, height: 18, background: "#e4e8ee", margin: "0 4px", verticalAlign: "middle" }} />
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

      {/* View toggle — Register / Dispatch / Schedule */}
      {/*
       * Coordinator CSS note: extract these inline styles to command.css as:
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
