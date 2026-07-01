/**
 * ExpensesControlCenter — light Command UI skin for the Expenses page.
 * Rendered behind the `command_ui` feature flag from Expenses.jsx.
 * All data + mutations live in the parent; this component is pure presentation.
 *
 * Inline styles only — do not edit src/styles/command.css from here.
 * CSS wants are listed in the component docblock at the bottom.
 */

import { useMemo } from "react";
import { Receipt, Clock, CheckCircle2, AlertCircle, TrendingUp, DollarSign, CalendarDays } from "lucide-react";
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
import { buildExpensesSummary, expenseStatusTone } from "./expensesControlCenter.derive";
import type { ExpenseRecord } from "./expensesControlCenter.derive";
import { formatMoney } from "@/lib/money";

// ── Money display helpers ─────────────────────────────────────────────────

function fmtMoney(n: number): string {
  return formatMoney(n);
}

function fmtMoneyShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

// ── Status chips for the FilterBar ───────────────────────────────────────
const STATUS_OPTIONS = ["All", "Paid", "Unpaid", "Pending Approval", "Voided"] as const;

// ── Scroll to data table ──────────────────────────────────────────────────
function scrollToTable() {
  document.querySelector(".exp-cc .cmd-table-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Props ─────────────────────────────────────────────────────────────────
export interface ExpensesControlCenterProps {
  projectName: string;
  expenses: ExpenseRecord[];
  filtered: ExpenseRecord[];
  search: string;
  onSearch: (v: string) => void;
  statusFilter: string;
  onStatusFilter: (v: string) => void;
  onExport: () => void;
  onImport?: (() => void) | null;
  onCreate?: (() => void) | null;
  onOpenExpense: (e: ExpenseRecord) => void;
}

// ── Component ─────────────────────────────────────────────────────────────
export default function ExpensesControlCenter(props: ExpensesControlCenterProps) {
  const {
    projectName,
    expenses,
    filtered,
    search,
    onSearch,
    statusFilter,
    onStatusFilter,
    onExport,
    onImport,
    onCreate,
    onOpenExpense,
  } = props;

  useCommandSkin();
  const s = useMemo(() => buildExpensesSummary(expenses), [expenses]);

  // Hero chips — quick status summary
  const chips = [
    { label: `${s.totalCount} Total` },
    { label: `${s.paidCount} Paid`, tone: "good" as const },
    { label: `${s.outstandingCount} Outstanding`, tone: s.outstandingCount > 0 ? ("warn" as const) : ("neutral" as const) },
  ];

  // KPI strip — 6 cells from real fields
  const kpiCells: KpiCellDef[] = [
    {
      label: "Pending Approval",
      value: s.approvalQueue.length,
      sublabel: "expenses",
      tone: s.approvalQueue.length > 0 ? "warn" : "neutral",
      Icon: AlertCircle,
    },
    {
      label: "Outstanding",
      value: fmtMoneyShort(s.outstandingAmount),
      sublabel: "unpaid + pending",
      tone: s.outstandingAmount > 0 ? "danger" : "neutral",
      Icon: Clock,
    },
    {
      label: "Total Committed",
      value: fmtMoneyShort(s.totalAmount),
      sublabel: "excl. voided",
      tone: "neutral",
      Icon: DollarSign,
    },
    {
      label: "Paid",
      value: fmtMoneyShort(s.paidAmount),
      sublabel: `${s.paidCount} expenses`,
      tone: "good",
      Icon: CheckCircle2,
    },
    {
      label: "This Month",
      value: fmtMoneyShort(s.thisMonthAmount),
      sublabel: `${s.thisMonthCount} expenses`,
      tone: "info",
      Icon: CalendarDays,
    },
    {
      label: "Top Vendor Spend",
      value: s.byVendor[0] ? fmtMoneyShort(s.byVendor[0].amount) : "—",
      sublabel: s.byVendor[0]?.vendor ?? "no vendors",
      tone: "neutral",
      Icon: TrendingUp,
    },
  ];

  // Table columns — real fields only
  const columns: Column<ExpenseRecord>[] = [
    {
      key: "date",
      header: "Date",
      render: (e) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{e.expense_date || "—"}</span>,
    },
    {
      key: "num",
      header: "Expense #",
      render: (e) => <span className="cmd-row__num">{e.expense_number || "—"}</span>,
    },
    {
      key: "desc",
      header: "Description",
      render: (e) => (
        <span style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block" }}>
          {e.description || "—"}
        </span>
      ),
    },
    {
      key: "vendor",
      header: "Vendor",
      render: (e) => e.vendor || <span className="cmd-row__meta">—</span>,
    },
    {
      key: "type",
      header: "Type",
      render: (e) => e.expense_type ? <Pill tone="neutral">{e.expense_type}</Pill> : <span className="cmd-row__meta">—</span>,
    },
    {
      key: "cost_code",
      header: "Cost Code",
      render: (e) => e.cost_code_name || e.cost_code || <span className="cmd-row__meta">—</span>,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right" as const,
      render: (e) => (
        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
          {e.amount != null ? fmtMoney(Number(e.amount)) : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (e) => <Pill tone={expenseStatusTone(e.payment_status)}>{e.payment_status || "—"}</Pill>,
    },
  ];

  return (
    <div className="exp-cc">
      <PageHero
        Icon={Receipt}
        title="Expenses Control Center"
        subtitle="Track committed costs, approvals, and vendor spend across this project."
        projectName={projectName}
        chips={chips}
        photoSrc={photoFor("Expenses") ?? undefined}
      />

      <KpiStrip cells={kpiCells} />

      <div className="cmd-panels">
        {/* Panel 1: Approval queue */}
        <DecisionPanel
          title="Approval Queue"
          onViewAll={() => { onStatusFilter("Pending Approval"); scrollToTable(); }}
        >
          {s.approvalQueue.map((e) => (
            <div
              className="cmd-row is-clickable"
              key={e.id}
              onClick={() => {
                const full = expenses.find((x) => x.id === e.id);
                if (full) onOpenExpense(full);
              }}
            >
              <div>
                <div className="cmd-row__num">{e.expense_number || "EXP"}</div>
                <div className="cmd-row__meta">{e.vendor || e.description || "No description"}</div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                  {fmtMoney(e.amount)}
                </span>
                <span className="cmd-row__meta">{e.expense_date || "—"}</span>
              </div>
            </div>
          ))}
          {s.approvalQueue.length === 0 && (
            <div className="cmd-row__meta">No expenses pending approval.</div>
          )}
        </DecisionPanel>

        {/* Panel 2: By cost code / category */}
        <DecisionPanel title="By Category" onViewAll={scrollToTable}>
          {s.byCategory.map((c) => (
            <div className="cmd-row" key={c.category}>
              <div>
                <div className="cmd-row__num">{c.category}</div>
                <div className="cmd-row__meta">{c.count} expense{c.count !== 1 ? "s" : ""}</div>
              </div>
              <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                {fmtMoney(c.amount)}
              </span>
            </div>
          ))}
          {s.byCategory.length === 0 && (
            <div className="cmd-row__meta">No expenses yet.</div>
          )}
        </DecisionPanel>

        {/* Panel 3: Top vendors */}
        <DecisionPanel title="By Vendor" onViewAll={scrollToTable}>
          {s.byVendor.map((v) => (
            <div className="cmd-row" key={v.vendor}>
              <div>
                <div className="cmd-row__num">{v.vendor}</div>
                <div className="cmd-row__meta">{v.count} expense{v.count !== 1 ? "s" : ""}</div>
              </div>
              <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                {fmtMoney(v.amount)}
              </span>
            </div>
          ))}
          {s.byVendor.length === 0 && (
            <div className="cmd-row__meta">No vendors yet.</div>
          )}
        </DecisionPanel>
      </div>

      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search expense number, description, or vendor"
        onImport={onImport}
        onExport={onExport}
        primaryLabel="New Expense"
        onPrimary={onCreate || null}
        filters={
          <>
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                className={`cmd-chip-btn${statusFilter === opt || (opt === "All" && statusFilter === "all") ? " is-active" : ""}`}
                onClick={() => onStatusFilter(opt === "All" ? "all" : opt)}
              >
                {opt}
              </button>
            ))}
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={filtered}
        onRowClick={onOpenExpense}
        emptyMessage="No expenses match your filters."
      />
    </div>
  );
}

/*
 * CSS wants (inline styles used instead — report to command.css maintainer):
 *
 * .exp-cc — page wrapper; same pattern as .rfi-cc
 *   No custom CSS needed beyond what .rfi-cc already establishes; the
 *   command kit's .cmd-panels / .cmd-row / .cmd-row__num / .cmd-row__meta
 *   classes cover all panel rows.
 *
 * Amount column: fontVariantNumeric: "tabular-nums" applied inline so numbers
 *   align in the table. Would be cleaner as a utility class, e.g.:
 *   .cmd-num { font-variant-numeric: tabular-nums; font-weight: 600; }
 *
 * Description ellipsis: maxWidth 260px + overflow ellipsis applied inline.
 *   Would be cleaner as .cmd-cell--desc { max-width: 260px; overflow: hidden; ... }
 */
