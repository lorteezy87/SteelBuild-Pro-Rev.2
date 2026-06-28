/**
 * SOV Control Center — light Command UI skin.
 * Rendered by SOV.jsx when the `command_ui` flag is on.
 * Receives all data + callbacks from the parent (no network calls here).
 *
 * Mirrors the RfiControlCenter pattern exactly:
 *   PageHero → KpiStrip → DecisionPanels → FilterBar → DataTable
 */
import { useMemo } from "react";
import {
  ClipboardList, DollarSign, TrendingDown, BarChart3, AlertTriangle, CheckCircle, Clock,
} from "lucide-react";
import "@/styles/command.css";
import {
  PageHero, KpiStrip, DecisionPanel, Pill, FilterBar, DataTable, useCommandSkin,
} from "@/components/command";
import type { Column, KpiCellDef } from "@/components/command";
import { buildSovSummary, calcRow } from "./sovControlCenter.derive";
import type { SovLineItem, SovSummary } from "./sovControlCenter.derive";
// Note: formatCurrency/formatPercent from formatters.jsx are available if needed
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

  // Hero chips
  const heroChips = [
    { label: `${lines.length} Line Items` },
    { label: `${s.pctComplete}% Complete`, tone: "good" as const },
    { label: s.overBilledCount > 0 ? `${s.overBilledCount} Over-billed` : "No Over-billing" },
  ];

  // KPI strip
  const kpiCells: KpiCellDef[] = [
    {
      label: "Contract Value",
      value: fmtMoney(s.contractValue),
      sublabel: "scheduled",
      tone: "neutral",
      Icon: DollarSign,
    },
    {
      label: "Billed to Date",
      value: fmtMoney(s.billedToDate),
      sublabel: `${s.pctComplete}% complete`,
      tone: "good",
      Icon: BarChart3,
    },
    {
      label: "This Period",
      value: fmtMoney(s.thisPeriod),
      sublabel: "current billing",
      tone: s.thisPeriod > 0 ? "info" : "neutral",
      Icon: ClipboardList,
    },
    {
      label: "Balance to Finish",
      value: fmtMoney(s.balanceToFinish),
      sublabel: "remaining",
      tone: s.balanceToFinish > 0 ? "neutral" : "good",
      Icon: TrendingDown,
    },
    {
      label: "Retainage Held",
      value: fmtMoney(s.retainageHeld),
      sublabel: "withheld",
      tone: s.retainageHeld > 0 ? "warn" : "neutral",
      Icon: Clock,
    },
    {
      label: "Pending Approval",
      value: s.pendingApprovalCount,
      sublabel: "submitted items",
      tone: s.pendingApprovalCount > 0 ? "warn" : "neutral",
      Icon: AlertTriangle,
    },
    {
      label: "Over-billed",
      value: s.overBilledCount,
      sublabel: "items",
      tone: s.overBilledCount > 0 ? "danger" : "neutral",
      Icon: AlertTriangle,
    },
  ];

  const columns = useMemo(
    () => buildColumns(effectiveRetainage),
    [effectiveRetainage],
  );

  return (
    <div className="sov-cc">
      <PageHero
        Icon={ClipboardList}
        title="Schedule of Values Control Center"
        subtitle="Track billing progress, retainage, and pay application status for every line item."
        projectName={projectName}
        chips={heroChips}
        stats={[
          { value: fmtMoney(s.contractValue), label: "Contract Value" },
          { value: `${s.pctComplete}%`, label: "Billed to Date" },
        ]}
      />

      <KpiStrip cells={kpiCells} />

      <div className="cmd-panels">
        {/* Panel 1 — Billing Progress by Pay Application */}
        <DecisionPanel
          title="Billing Progress by Application"
          onViewAll={scrollToTable}
        >
          {s.billingProgress.length === 0 ? (
            <div className="cmd-row__meta">No billing applications yet.</div>
          ) : (
            s.billingProgress.map((row) => (
              <div className="cmd-row" key={row.appNumber}>
                <div>
                  <div className="cmd-row__num">App #{row.appNumber}</div>
                  <div className="cmd-row__meta">{row.itemCount} items · {fmtFull(row.scheduled)} scheduled</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Pill tone={row.pct >= 100 ? "good" : row.pct > 0 ? "info" : "neutral"}>
                    {row.pct}%
                  </Pill>
                  <span className="cmd-row__meta">{fmtFull(row.toDate)}</span>
                </div>
              </div>
            ))
          )}
        </DecisionPanel>

        {/* Panel 2 — By Division / Phase */}
        <DecisionPanel
          title="By Division / Phase"
          onViewAll={scrollToTable}
        >
          {s.byDivision.length === 0 ? (
            <div className="cmd-row__meta">No line items.</div>
          ) : (
            s.byDivision.slice(0, 6).map((row) => (
              <div className="cmd-row" key={row.label}>
                <div>
                  <div className="cmd-row__num">{row.label}</div>
                  <div className="cmd-row__meta">{row.itemCount} items</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{fmtFull(row.toDate)}</span>
                  <span className="cmd-row__meta">bal: {fmtFull(row.balance)}</span>
                </div>
              </div>
            ))
          )}
        </DecisionPanel>

        {/* Panel 3 — Items Needing Attention */}
        <DecisionPanel
          title="Items Needing Attention"
          onViewAll={scrollToTable}
        >
          {s.attentionItems.length === 0 ? (
            <div className="cmd-row__meta" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <CheckCircle style={{ width: 14, height: 14, color: "var(--status-success)" }} />
              All items look good.
            </div>
          ) : (
            s.attentionItems.map((item) => {
              const c = calcRow(item, effectiveRetainage);
              const tone = c.overBilled ? "danger" as const : item.status === "Submitted" ? "warn" as const : "neutral" as const;
              const label = c.overBilled ? "Over-billed" : item.status === "Submitted" ? "Awaiting Approval" : "Not Started";
              return (
                <div
                  className="cmd-row is-clickable"
                  key={item.id}
                  onClick={() => onOpenLine(item)}
                >
                  <div>
                    <div className="cmd-row__num">{item.line_item_number ?? item.sov_id ?? "—"}</div>
                    <div className="cmd-row__meta" style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.description || "No description"}
                    </div>
                  </div>
                  <Pill tone={tone}>{label}</Pill>
                </div>
              );
            })
          )}
        </DecisionPanel>
      </div>

      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search line number, description, or phase"
        onImport={onImport}
        onExport={onExport}
        primaryLabel="New Item"
        onPrimary={canCreate ? onCreate ?? null : null}
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
