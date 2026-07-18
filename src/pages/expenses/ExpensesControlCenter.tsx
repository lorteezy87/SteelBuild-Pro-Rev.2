/**
 * ExpensesControlCenter is the canonical Expenses page shell.
 * All data, filters, mutations, and dialogs remain owned by Expenses.jsx.
 * Specialized expense analytics and actions are composed inside this shell.
 *
 * Inline styles only — do not edit src/styles/command.css from here.
 */

import { type ReactNode, useMemo } from "react";
import { Receipt, Clock, CheckCircle2, AlertCircle, TrendingUp, DollarSign, CalendarDays, RefreshCw } from "lucide-react";
import "@/styles/command.css";
import {
  PageHero,
  KpiStrip,
  DecisionPanel,
  useCommandSkin,
} from "@/components/command";
import type { KpiCellDef } from "@/components/command";
import { photoFor } from "@/config/launcherConfig";
import { buildExpensesSummary } from "./expensesControlCenter.derive";
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

// ── Scroll to data table ──────────────────────────────────────────────────
function scrollToTable() {
  document.querySelector(".exp-cc .sbd-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  onRefresh?: () => void;
  children?: ReactNode;
}

// ── Component ─────────────────────────────────────────────────────────────
export default function ExpensesControlCenter(props: ExpensesControlCenterProps) {
  const {
    projectName,
    expenses,
    onStatusFilter,
    onOpenExpense,
    onRefresh,
    children,
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


  return (
    <div className="exp-cc">
      <PageHero
        Icon={Receipt}
        title="Expenses"
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

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button
          type="button"
          onClick={onRefresh}
          disabled={!onRefresh}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 11px", border: "1px solid var(--border-default)", borderRadius: 7, background: "var(--bg-surface)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", cursor: onRefresh ? "pointer" : "default", opacity: onRefresh ? 1 : 0.6 }}
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>
      {children}
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
