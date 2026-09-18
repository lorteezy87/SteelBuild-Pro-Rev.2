/**
 * SOV Control Center — light Command UI skin.
 * Rendered unconditionally by SOV.jsx.
 * Receives all data + callbacks from the parent (no network calls here).
 *
 * Mirrors the RfiControlCenter pattern exactly:
 *   PageHero → KpiStrip → DecisionPanels → FilterBar → DataTable
 */
import { useMemo } from "react";
import { Download, Plus, Upload } from "lucide-react";
import "@/styles/command.css";
import {
  AttentionQueue, OperationalSummary, PageHeader, Pill, FilterBar, DataTable, useCommandSkin,
} from "@/components/command";
import type { AttentionItem, Column } from "@/components/command";
import { buildSovSummary, calcRow } from "./sovControlCenter.derive";
import type { SovLineItem, SovSummary } from "./sovControlCenter.derive";
// Note: shared formatCurrency/formatPercent helpers are available if needed.
// but we use local fmtFull/fmtMoney below to stay strictly typed in this file.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compact dollar formatter for KPI strip (no cents on large numbers). */
function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

/** Full dollar format for table cells. */
function fmtFull(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function statusTone(status: string | null | undefined) {
  if (status === "Paid" || status === "Certified") return "good" as const;
  if (status === "Submitted") return "warn" as const;
  if (status === "Draft") return "neutral" as const;
  return "neutral" as const;
}

/** Scroll the full table into view when a panel's "View all" fires. */
function scrollToTable() {
  document.querySelector(".sov-cc .cmd-table-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SovControlCenterProps {
  projectName: string;
  /** All SOV line items for the project (unfiltered). */
  lines: SovLineItem[];
  /** Filtered + sorted subset currently shown in the table. */
  filtered: SovLineItem[];
  search: string;
  onSearch: (v: string) => void;
  statusFilter: string;
  onStatusFilter: (v: string) => void;
  /** effectiveRetainage: null = per-row; number = global override */
  effectiveRetainage: number | null;
  onExport: () => void;
  onImport?: (() => void) | null;
  onCreate?: (() => void) | null;
  onOpenLine: (line: SovLineItem) => void;
  canCreate: boolean;
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

const STATUS_CHIPS = ["All", "Draft", "Submitted", "Certified", "Paid"];

function buildColumns(
  effectiveRetainage: number | null,
): Column<SovLineItem>[] {
  return [
    {
      key: "line",
      header: "Line #",
      render: (r) => (
        <span className="cmd-row__num">{r.line_item_number ?? r.sov_id ?? "—"}</span>
      ),
    },
    {
      key: "desc",
      header: "Description",
      render: (r) => (
        <span style={{ maxWidth: 200, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {r.description || "—"}
        </span>
      ),
    },
    {
      key: "scheduled",
      header: "Sched. Value",
      align: "right",
      render: (r) => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
          {fmtFull(Number(r.scheduled_value) || 0)}
        </span>
      ),
    },
    {
      key: "pct",
      header: "% Complete",
      align: "right",
      render: (r) => {
        const curPct = Number(r.current_percent_complete) || 0;
        const tone = curPct >= 100 ? "good" as const : curPct > 0 ? "info" as const : "neutral" as const;
        return <Pill tone={tone}>{curPct}%</Pill>;
      },
    },
    {
      key: "billed",
      header: "Billed to Date",
      align: "right",
      render: (r) => {
        const c = calcRow(r, effectiveRetainage);
        return (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: c.overBilled ? "var(--status-error)" : undefined }}>
            {fmtFull(c.toDate)}
          </span>
        );
      },
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      render: (r) => {
        const c = calcRow(r, effectiveRetainage);
        return (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: c.balance < 0 ? "var(--status-error)" : undefined }}>
            {fmtFull(c.balance)}
          </span>
        );
      },
    },
    {
      key: "retainage",
      header: effectiveRetainage != null ? `Retainage (${effectiveRetainage}%)` : "Retainage",
      align: "right",
      render: (r) => {
        const c = calcRow(r, effectiveRetainage);
        return (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--status-warning)" }}>
            {fmtFull(c.retAmt)}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <Pill tone={statusTone(r.status as string | null)}>{r.status || "Draft"}</Pill>,
    },
  ];
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SovControlCenter(props: SovControlCenterProps) {
  const {
    projectName, lines, filtered, search, onSearch,
    statusFilter, onStatusFilter, effectiveRetainage,
    onExport, onImport, onCreate, onOpenLine, canCreate,
  } = props;

  useCommandSkin();

  const s: SovSummary = useMemo(() => buildSovSummary(lines, effectiveRetainage), [lines, effectiveRetainage]);

  const operationalMetrics = [
    { label: "Contract Value", value: fmtMoney(s.contractValue), sublabel: "scheduled", tone: "neutral" as const },
    { label: "Billed to Date", value: fmtMoney(s.billedToDate), sublabel: `${s.pctComplete}% complete`, tone: "good" as const },
    { label: "This Period", value: fmtMoney(s.thisPeriod), sublabel: "current billing", tone: s.thisPeriod > 0 ? "info" as const : "neutral" as const },
    { label: "Balance to Finish", value: fmtMoney(s.balanceToFinish), sublabel: "remaining", tone: "neutral" as const },
    { label: "Retainage Held", value: fmtMoney(s.retainageHeld), sublabel: "withheld", tone: s.retainageHeld > 0 ? "warn" as const : "neutral" as const },
    { label: "Pending Approval", value: s.pendingApprovalCount, sublabel: "submitted items", tone: s.pendingApprovalCount > 0 ? "warn" as const : "good" as const },
    { label: "Over-billed", value: s.overBilledCount, sublabel: "items", tone: s.overBilledCount > 0 ? "danger" as const : "good" as const },
  ];

  const attentionItems: AttentionItem[] = s.attentionItems.map((item): AttentionItem => {
    const row = calcRow(item, effectiveRetainage);
    return {
      id: String(item.id || item.line_item_number || item.sov_id),
      issue: `${item.line_item_number ?? item.sov_id ?? "SOV"} · ${item.description || "No description"}`,
      deadline: null,
      risk: row.overBilled ? "Over-billed line item" : item.status === "Submitted" ? "Awaiting billing approval" : "Billing progress requires review",
      owner: item.status === "Submitted" ? "External approval" : null,
      nextAction: row.overBilled ? "Correct billing value" : item.status === "Submitted" ? "Advance approval" : "Review SOV line",
      tone: row.overBilled ? "danger" : "warn",
      onOpen: () => onOpenLine(item),
    };
  });

  const columns = useMemo(
    () => buildColumns(effectiveRetainage),
    [effectiveRetainage],
  );

  return (
    <div className="sov-cc sbp-command-page">
      <PageHeader
        eyebrow={`${projectName} / Commercial`}
        title="Schedule of Values"
        subtitle="Billing authority, line-item progress, retainage, approval state, and balance to finish."
        meta={`${lines.length} line items · ${s.pctComplete}% billed · ${fmtMoney(s.contractValue)} scheduled`}
        actions={(
          <>
            {onImport ? <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onImport}><Upload size={14} /> Import</button> : null}
            <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onExport}><Download size={14} /> Export</button>
            {canCreate && onCreate ? <button type="button" className="cmd-btn cmd-btn--primary" onClick={onCreate}><Plus size={14} /> New Item</button> : null}
          </>
        )}
      />

      <OperationalSummary metrics={operationalMetrics} ariaLabel="SOV operational summary" />

      <AttentionQueue title="Billing Attention" items={attentionItems} emptyMessage="No SOV line items currently require attention." />

      <div className="sbp-work-grid">
        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head"><h2>Billing Progress by Application</h2></div>
          <div>
            {s.billingProgress.length === 0 ? <div className="sbp-attention__empty">No billing applications yet.</div> : s.billingProgress.map((row) => (
              <div className="cmd-row" key={row.appNumber}>
                <div><div className="cmd-row__num">App #{row.appNumber}</div><div className="cmd-row__meta">{row.itemCount} items · {fmtFull(row.scheduled)} scheduled</div></div>
                <div style={{ textAlign: "right" }}><div>{row.pct}%</div><div className="cmd-row__meta">{fmtFull(row.toDate)}</div></div>
              </div>
            ))}
          </div>
        </section>
        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head"><h2>By Division / Phase</h2></div>
          <div>
            {s.byDivision.length === 0 ? <div className="sbp-attention__empty">No line items.</div> : s.byDivision.slice(0, 6).map((row) => (
              <div className="cmd-row" key={row.label}>
                <div><div className="cmd-row__num">{row.label}</div><div className="cmd-row__meta">{row.itemCount} items</div></div>
                <div style={{ textAlign: "right" }}><div>{fmtFull(row.toDate)}</div><div className="cmd-row__meta">bal: {fmtFull(row.balance)}</div></div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search line number, description, or phase"
        filters={
          <>
            {STATUS_CHIPS.map((s) => (
              <button
                key={s}
                type="button"
                className={`cmd-chip-btn${statusFilter === s ? " is-active" : ""}`}
                onClick={() => onStatusFilter(s)}
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
        onRowClick={onOpenLine}
        emptyMessage="No SOV line items match your filters."
      />
    </div>
  );
}
