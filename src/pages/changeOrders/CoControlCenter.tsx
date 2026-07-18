/**
 * CoControlCenter — canonical presentation layer for the Change Orders page.
 *
 * Composition:
 *   PageHero  →  KpiStrip (8 cells)  →  3 DecisionPanels  →  FilterBar  →  DataTable
 *
 * All data flows in from ChangeOrders.jsx (the shell owns queries/mutations).
 * This component is purely presentational — no network, no mutations.
 */
import { useMemo } from "react";
import {
  FileSignature,
  CheckCircle2,
  DollarSign,
  Clock,
  TrendingUp,
  AlertTriangle,
  CalendarClock,
  Link2,
  FileEdit,
} from "lucide-react";
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
import { buildCoSummary, coStatusTone } from "./coControlCenter.derive";
import type { CoRecord } from "./coControlCenter.derive";
import { formatCurrency, formatCurrencyShort } from "@/components/shared/formatters";

// Status chips shown in FilterBar
const STATUS_FILTERS = [
  "All",
  "Draft",
  "Submitted",
  "Under Review",
  "Approved",
  "Rejected",
  "Void",
] as const;

/** Scroll the full DataTable into view when a panel "View all" fires. */
function scrollToTable() {
  document.querySelector(".co-cc .cmd-table-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export interface CoControlCenterProps {
  projectName: string;
  cos: CoRecord[];
  filtered: CoRecord[];
  search: string;
  onSearch: (v: string) => void;
  statusFilter: string;
  onFilterChange: (v: string) => void;
  onOpenCo: (co: CoRecord) => void;
  onExport: () => void;
  onImport?: (() => void) | null;
  onCreate?: (() => void) | null;
  projectHealth?: string | null;
  percentComplete?: number | null;
  /** Pre-computed from the project record — used for hero stats. */
  baseContract: number;
  revisedContract: number;
  /** Bulk selection */
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: (checked: boolean) => void;
}

export default function CoControlCenter(props: CoControlCenterProps) {
  const {
    projectName,
    cos,
    filtered,
    search,
    onSearch,
    statusFilter,
    onFilterChange,
    onOpenCo,
    onExport,
    onImport,
    onCreate,
    projectHealth,
    percentComplete,
    baseContract,
    revisedContract,
    selectedIds,
    onToggleSelect,
    onToggleAll,
  } = props;

  useCommandSkin();
  const s = useMemo(() => buildCoSummary(cos), [cos]);

  // ── Hero ──────────────────────────────────────────────────────────────────
  const heroStats = [
    { value: formatCurrencyShort(revisedContract), label: "Revised Contract" },
    { value: formatCurrencyShort(baseContract),    label: "Base Contract" },
  ];
  const chips = [
    { label: `${s.total} Total` },
    { label: `${s.approved} Approved`, tone: "good" as const },
    { label: `${s.pending} Pending` },
  ];

  // ── KPI strip ─────────────────────────────────────────────────────────────
  const kpiCells: KpiCellDef[] = [
    { label: "Approved",         value: s.approved,                               sublabel: "COs",          tone: "good",                                         Icon: CheckCircle2 },
    { label: "Approved Value",   value: formatCurrencyShort(s.totalApproved),     sublabel: "executed",     tone: s.totalApproved > 0 ? "good" : "neutral",        Icon: DollarSign   },
    { label: "Pending Review",   value: s.pending,                                sublabel: "COs",          tone: s.pending > 0 ? "warn" : "neutral",              Icon: Clock        },
    { label: "Pending Value",    value: formatCurrencyShort(s.totalPending),      sublabel: "at owner",     tone: s.totalPending > 0 ? "warn" : "neutral",         Icon: TrendingUp   },
    { label: "Draft",            value: s.draft,                                  sublabel: "COs",          tone: "neutral",                                       Icon: FileEdit     },
    { label: "At-Risk Value",    value: formatCurrencyShort(s.atRiskValue),       sublabel: "pending + draft", tone: s.atRiskValue > 0 ? "warn" : "neutral",      Icon: AlertTriangle },
    { label: "Schedule Exposure",value: `${s.scheduleDays}d`,                    sublabel: "active impact", tone: s.scheduleDays > 0 ? "warn" : "neutral",        Icon: CalendarClock },
    { label: "Linked to RFI",    value: s.rfiLinked,                              sublabel: "COs",          tone: s.rfiLinked > 0 ? "info" : "neutral",            Icon: Link2        },
  ];

  // ── DataTable columns ─────────────────────────────────────────────────────
  const selectable = !!(selectedIds && onToggleSelect && onToggleAll);
  const allSelected = selectable && filtered.length > 0 && filtered.every((co) => selectedIds!.has(co.id || ""));

  const columns: Column<CoRecord>[] = [
    ...(selectable
      ? ([{
          key: "sel",
          header: (
            <input
              type="checkbox"
              className="cmd-check"
              checked={allSelected}
              onChange={(e) => onToggleAll!(e.target.checked)}
              aria-label="Select all COs"
            />
          ),
          render: (c: CoRecord) => (
            <input
              type="checkbox"
              className="cmd-check"
              checked={selectedIds!.has(c.id || "")}
              onClick={(e) => e.stopPropagation()}
              onChange={() => onToggleSelect!(c.id || "")}
              aria-label="Select CO"
            />
          ),
        }] as Column<CoRecord>[])
      : []),
    {
      key: "num",
      header: "CO #",
      render: (c) => <span className="cmd-row__num">{c.co_number || "—"}</span>,
    },
    {
      key: "title",
      header: "Title",
      render: (c) => (
        <div>
          <div>{c.title || "—"}</div>
          {c.reason_code ? (
            <div className="cmd-row__meta">{c.reason_code}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (c) => <Pill tone={coStatusTone(c.status)}>{c.status || "Draft"}</Pill>,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (c) => {
        const amt = Number(c.co_amount) || 0;
        const isDeduct = amt < 0;
        return (
          <span style={{ color: isDeduct ? "var(--status-error)" : undefined, fontVariantNumeric: "tabular-nums" }}>
            {amt === 0 ? "—" : formatCurrency(amt, 0)}
          </span>
        );
      },
    },
    {
      key: "sched",
      header: "Sched Impact",
      align: "right",
      render: (c) => {
        const days = Number(c.schedule_impact_days) || 0;
        return (
          <span style={{ color: days > 0 ? "var(--status-warning)" : undefined }}>
            {days > 0 ? `+${days}d` : "—"}
          </span>
        );
      },
    },
    {
      key: "submitted",
      header: "Submitted",
      render: (c) => <span className="cmd-row__meta">{c.submitted_date || "—"}</span>,
    },
    {
      key: "approved",
      header: "Approved",
      render: (c) => (
        <span style={{ color: c.approved_date ? "var(--status-success)" : undefined }} className={!c.approved_date ? "cmd-row__meta" : undefined}>
          {c.approved_date || "—"}
        </span>
      ),
    },
    {
      key: "approvedBy",
      header: "Approved By",
      render: (c) => <span className="cmd-row__meta">{c.approved_by || "—"}</span>,
    },
  ];

  return (
    <div className="co-cc">
      <PageHero
        Icon={FileSignature}
        title="Change Order Control"
        subtitle="Manage contract exposure from draft pricing through approval with cost, schedule impact, and review status visible at a glance."
        projectName={projectName}
        chips={chips}
        photoSrc={photoFor("ChangeOrders") ?? undefined}
        stats={heroStats}
      />

      <KpiStrip cells={kpiCells} />

      <div className="cmd-panels">
        {/* Panel 1: CO Work Queue — oldest pending COs needing action */}
        <DecisionPanel
          title="CO Work Queue"
          onViewAll={() => { onFilterChange("Submitted"); scrollToTable(); }}
        >
          {s.workQueue.map((c) => (
            <div className="cmd-row is-clickable" key={c.id} onClick={() => onOpenCo(c)}>
              <div>
                <div className="cmd-row__num">{c.co_number || "CO"}</div>
                <div className="cmd-row__meta">{c.title || "—"}</div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Pill tone={coStatusTone(c.status)}>{c.status || "Draft"}</Pill>
                <span className="cmd-row__meta">{formatCurrencyShort(Number(c.co_amount) || 0)}</span>
              </div>
            </div>
          ))}
          {s.workQueue.length === 0 ? (
            <div className="cmd-row__meta">No pending COs — queue is clear.</div>
          ) : null}
        </DecisionPanel>

        {/* Panel 2: Needs Decision — Under Review (or Submitted fallback) */}
        <DecisionPanel
          title="Needs Decision"
          onViewAll={() => { onFilterChange("Under Review"); scrollToTable(); }}
        >
          {s.decisionQueue.map((c) => (
            <div className="cmd-row is-clickable" key={c.id} onClick={() => onOpenCo(c)}>
              <div>
                <div className="cmd-row__num">{c.co_number || "CO"}</div>
                <div className="cmd-row__meta">{c.title || "—"}</div>
              </div>
              <span className="cmd-row__meta">{formatCurrencyShort(Number(c.co_amount) || 0)}</span>
            </div>
          ))}
          {s.decisionQueue.length === 0 ? (
            <div className="cmd-row__meta">No COs awaiting decision.</div>
          ) : null}
        </DecisionPanel>

        {/* Panel 3: Risk & Exposure — hottest by amount × schedule */}
        <DecisionPanel
          title="Risk & Exposure"
          onViewAll={scrollToTable}
        >
          {s.riskQueue.map((c) => {
            const days = Number(c.schedule_impact_days) || 0;
            return (
              <div className="cmd-row is-clickable" key={c.id} onClick={() => onOpenCo(c)}>
                <div>
                  <div className="cmd-row__num">{c.co_number || "CO"}</div>
                  <div className="cmd-row__meta">{c.title || "—"}</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Pill tone={coStatusTone(c.status)}>{c.status || "Draft"}</Pill>
                  {days > 0 ? (
                    <span className="cmd-row__meta" style={{ color: "var(--status-warning)" }}>+{days}d</span>
                  ) : null}
                </div>
              </div>
            );
          })}
          {s.riskQueue.length === 0 ? (
            <div className="cmd-row__meta">No active risk exposure.</div>
          ) : null}
        </DecisionPanel>
      </div>

      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search CO #, title, description, or reason code"
        onImport={onImport}
        onExport={onExport}
        primaryLabel="New CO"
        onPrimary={onCreate || null}
        filters={
          <>
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                type="button"
                className={`cmd-chip-btn${statusFilter === s || (s === "All" && statusFilter === "all") ? " is-active" : ""}`}
                onClick={() => onFilterChange(s === "All" ? "all" : s)}
              >
                {s}
              </button>
            ))}
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={filtered}
        onRowClick={onOpenCo}
        emptyMessage="No change orders match your filters."
      />
    </div>
  );
}
