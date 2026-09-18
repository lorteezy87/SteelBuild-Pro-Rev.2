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
import { Download, Plus, Trash2, Upload } from "lucide-react";
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
  onDeleteCo?: ((co: CoRecord) => void) | null;
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
    onDeleteCo,
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

  const operationalMetrics = [
    { label: "Approved", value: s.approved, sublabel: formatCurrencyShort(s.totalApproved), tone: s.approved ? "good" as const : "neutral" as const },
    { label: "Pending Review", value: s.pending, sublabel: formatCurrencyShort(s.totalPending), tone: s.pending ? "warn" as const : "good" as const },
    { label: "Draft", value: s.draft, sublabel: "pricing not submitted", tone: s.draft ? "neutral" as const : "good" as const },
    { label: "At-Risk Value", value: formatCurrencyShort(s.atRiskValue), sublabel: "pending + draft", tone: s.atRiskValue ? "warn" as const : "good" as const },
    { label: "Schedule Exposure", value: `${s.scheduleDays}d`, sublabel: "active impact", tone: s.scheduleDays ? "warn" as const : "neutral" as const },
    { label: "RFI Linked", value: s.rfiLinked, sublabel: "change orders", tone: s.rfiLinked ? "info" as const : "neutral" as const },
    { label: "Base Contract", value: formatCurrencyShort(baseContract), sublabel: "original", tone: "neutral" as const },
    { label: "Revised Contract", value: formatCurrencyShort(revisedContract), sublabel: "approved COs included", tone: "neutral" as const },
  ];

  const attentionItems: AttentionItem[] = (() => {
    const seen = new Set<string>();
    const source = [...s.workQueue, ...s.riskQueue];
    const items: AttentionItem[] = [];
    for (const co of source) {
      const id = String(co.id || co.co_number || co.title || items.length);
      if (seen.has(id)) continue;
      seen.add(id);
      const amount = Number(co.co_amount) || 0;
      const days = Number(co.schedule_impact_days) || 0;
      const risk = [
        co.status === "Under Review" ? "Owner / GC decision pending" : null,
        co.status === "Submitted" ? "Submitted · awaiting response" : null,
        days > 0 ? `+${days}d schedule exposure` : null,
        amount ? formatCurrencyShort(amount) : null,
      ].filter(Boolean).join(" · ") || "Commercial follow-up";
      items.push({
        id,
        issue: `${co.co_number || "CO"} · ${co.title || "Untitled change"}`,
        deadline: co.submitted_date || null,
        risk,
        owner: co.status === "Under Review" || co.status === "Submitted" ? "External review" : null,
        nextAction: co.status === "Draft" ? "Complete pricing and submit" : "Advance commercial decision",
        tone: days > 0 || Math.abs(amount) >= 25000 ? "danger" : "warn",
        onOpen: () => onOpenCo(co),
      });
    }
    return items.slice(0, 10);
  })();

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
    ...(onDeleteCo
      ? ([{
          key: "actions",
          header: "",
          align: "right",
          render: (c: CoRecord) => (
            <button
              type="button"
              aria-label={`Delete ${c.co_number || "change order"}`}
              title="Delete change order"
              onClick={(event) => {
                event.stopPropagation();
                onDeleteCo(c);
              }}
              style={{
                width: 28,
                height: 28,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid var(--border-default)",
                borderRadius: 4,
                background: "transparent",
                color: "var(--status-error)",
                cursor: "pointer",
              }}
            >
              <Trash2 size={13} aria-hidden="true" />
            </button>
          ),
        }] as Column<CoRecord>[])
      : []),
  ];

  return (
    <div className="co-cc sbp-command-page">
      <PageHeader
        eyebrow={`${projectName} / Commercial`}
        title="Change Order Control"
        subtitle="Contract exposure from draft pricing through approval, with cost, schedule, and evidence relationships visible."
        meta={[
          projectHealth ? `Project health: ${projectHealth}` : "Project health: unknown",
          percentComplete != null ? `${Math.round(percentComplete)}% project complete` : null,
          `${s.total} change orders`,
        ].filter(Boolean).join(" · ")}
        actions={(
          <>
            {onImport ? (
              <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onImport}>
                <Upload size={14} /> Import
              </button>
            ) : null}
            <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onExport}>
              <Download size={14} /> Export
            </button>
            {onCreate ? (
              <button type="button" className="cmd-btn cmd-btn--primary" onClick={onCreate}>
                <Plus size={14} /> New CO
              </button>
            ) : null}
          </>
        )}
      />

      <OperationalSummary metrics={operationalMetrics} ariaLabel="Change order operational summary" />

      <AttentionQueue
        title="Commercial Attention"
        items={attentionItems}
        emptyMessage="No pending change-order decisions or material commercial exposure."
      />

      <div className="sbp-work-grid">
        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head">
            <h2>Needs Decision</h2>
            <button type="button" className="cmd-btn cmd-btn--ghost" onClick={() => { onFilterChange("Under Review"); scrollToTable(); }}>View register</button>
          </div>
          <div>
            {s.decisionQueue.length === 0 ? (
              <div className="sbp-attention__empty">No COs awaiting decision.</div>
            ) : s.decisionQueue.map((co) => (
              <button type="button" className="cmd-row is-clickable" key={co.id} onClick={() => onOpenCo(co)} style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }}>
                <div>
                  <div className="cmd-row__num">{co.co_number || "CO"}</div>
                  <div className="cmd-row__meta">{co.title || "Untitled change"}</div>
                </div>
                <span className="cmd-row__meta">{formatCurrencyShort(Number(co.co_amount) || 0)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head">
            <h2>Risk & Exposure</h2>
            <button type="button" className="cmd-btn cmd-btn--ghost" onClick={scrollToTable}>View register</button>
          </div>
          <div>
            {s.riskQueue.length === 0 ? (
              <div className="sbp-attention__empty">No active commercial risk exposure.</div>
            ) : s.riskQueue.map((co) => (
              <button type="button" className="cmd-row is-clickable" key={co.id} onClick={() => onOpenCo(co)} style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }}>
                <div>
                  <div className="cmd-row__num">{co.co_number || "CO"}</div>
                  <div className="cmd-row__meta">{co.title || "Untitled change"}</div>
                </div>
                <Pill tone={coStatusTone(co.status)}>{co.status || "Draft"}</Pill>
              </button>
            ))}
          </div>
        </section>
      </div>

      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search CO #, title, description, or reason code"
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
