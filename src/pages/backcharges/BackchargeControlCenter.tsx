/**
 * BackchargeControlCenter — canonical Backcharge Defense register.
 *
 * Pure presentation: all data, mutations, and modal state live in the parent
 * Backcharges.jsx shell. The parent also owns the detail workflow and RBAC-
 * sensitive mutation handlers.
 * No network calls. No business logic. Re-uses the canonical command kit
 * components and the backchargeControlCenter.derive.ts engine.
 */
import { useMemo } from "react";
import { Download, Plus } from "lucide-react";
import "@/styles/command.css";
import {
  AttentionQueue, OperationalSummary, PageHeader, Pill, statusTone,
  FilterBar, DataTable, useCommandSkin,
} from "@/components/command";
import type { AttentionItem, Column } from "@/components/command";
import { buildBackchargeSummary } from "./backchargeControlCenter.derive";
import type { Backcharge } from "./backchargeControlCenter.derive";
import {
  BACKCHARGE_STATUS_LABELS,
  BACKCHARGE_STATUSES,
} from "@/lib/backcharge/types";
import type { BackchargeStatus } from "@/lib/backcharge/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Format a dollar amount for display (no cents unless non-zero). */
function fmtMoney(n: number): string {
  if (!n && n !== 0) return "$—";
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** Derive a Pill tone from a backcharge status. */
function backchargeTone(status: string | null | undefined): ReturnType<typeof statusTone> {
  switch (status as BackchargeStatus) {
    case "draft":        return "neutral";
    case "notice_sent":  return "info";
    case "pending":      return "warn";
    case "disputed":     return "danger";
    case "approved":     return "good";
    case "rejected":     return "neutral";
    case "collected":    return "good";
    case "void":         return "neutral";
    default:             return "neutral";
  }
}

/** Indicates whether the backcharge has a defensible notice on record. */
function noticeCell(bc: Backcharge) {
  if (bc.notice_date) return <Pill tone="good">Notice on file</Pill>;
  return <Pill tone="warn">No notice</Pill>;
}

/** Scroll the full DataTable into view (mirrors the RFI pattern). */
function scrollToTable() {
  document.querySelector(".bc-cc .cmd-table-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ─── Status filter chips (All + each status) ───────────────────────────────

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: "All", value: "all" },
  { label: "Open", value: "open" },
  ...BACKCHARGE_STATUSES.map((s) => ({ label: BACKCHARGE_STATUS_LABELS[s], value: s })),
];

// ─── Props ──────────────────────────────────────────────────────────────────

export interface BackchargeControlCenterProps {
  projectName: string;
  backcharges: Backcharge[];
  filtered: Backcharge[];
  search: string;
  onSearch: (v: string) => void;
  statusFilter: string;
  onStatusFilter: (v: string) => void;
  onOpen: (bc: Backcharge) => void;
  onExport: () => void;
  onCreate?: (() => void) | null;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function BackchargeControlCenter(props: BackchargeControlCenterProps) {
  const {
    projectName, backcharges, filtered, search, onSearch,
    statusFilter, onStatusFilter, onOpen, onExport, onCreate,
  } = props;

  useCommandSkin();
  const s = useMemo(() => buildBackchargeSummary(backcharges), [backcharges]);

  const operationalMetrics = [
    { label: "Open Exposure", value: fmtMoney(s.openAmount), sublabel: "being chased", tone: s.openTone },
    { label: "Total Logged", value: fmtMoney(s.totalAmount), sublabel: "all statuses", tone: "neutral" as const },
    { label: "Recovered", value: fmtMoney(s.recoveredAmount), sublabel: "collected", tone: s.recoveredAmount > 0 ? "good" as const : "neutral" as const },
    { label: "Disputed", value: s.disputed, sublabel: "backcharges", tone: s.disputed ? "danger" as const : "good" as const },
    { label: "Defense Ready", value: s.defenseReady, sublabel: "notice on file", tone: s.total > 0 && s.defenseReady === s.total ? "good" as const : "warn" as const },
    { label: "Notice Rate", value: `${s.noticeRate}%`, sublabel: "contractual coverage", tone: s.noticeRate === 100 ? "good" as const : s.total > 0 ? "warn" as const : "neutral" as const },
  ];

  const attentionItems: AttentionItem[] = s.openQueue.map((bc) => ({
    id: String(bc.id || bc.backcharge_number || bc.title),
    issue: `${bc.backcharge_number || "BC"} · ${bc.title || "Untitled backcharge"}`,
    deadline: bc.notice_date || bc.incident_date || null,
    risk: [
      bc.status === "disputed" ? "Disputed" : "Open recovery",
      !bc.notice_date ? "Notice missing" : null,
      fmtMoney(Number(bc.amount || 0)),
    ].filter(Boolean).join(" · "),
    owner: bc.responsible_party || null,
    nextAction: !bc.notice_date ? "Issue / document contractual notice" : bc.status === "disputed" ? "Resolve dispute" : "Advance recovery",
    tone: bc.status === "disputed" || !bc.notice_date ? "danger" : "warn",
    onOpen: () => onOpen(bc),
  }));

  // ── DataTable columns
  const columns: Column<Backcharge>[] = [
    {
      key: "num",
      header: "BC #",
      render: (b) => (
        <span className="cmd-row__num">{b.backcharge_number || "—"}</span>
      ),
    },
    {
      key: "title",
      header: "Title",
      render: (b) => b.title || "(untitled)",
    },
    {
      key: "vendor",
      header: "Responsible Party",
      render: (b) => b.responsible_party || "—",
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (b) => (
        <span style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)", fontWeight: 700 }}>
          {fmtMoney(Number(b.amount || 0))}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (b) => (
        <Pill tone={backchargeTone(b.status)}>
          {BACKCHARGE_STATUS_LABELS[b.status as BackchargeStatus] || b.status}
        </Pill>
      ),
    },
    {
      key: "notice",
      header: "Defense",
      render: noticeCell,
    },
    {
      key: "incident",
      header: "Incident Date",
      render: (b) => b.incident_date || <span className="cmd-row__meta">—</span>,
    },
    {
      key: "notice_date",
      header: "Notice Date",
      render: (b) =>
        b.notice_date ? (
          b.notice_date
        ) : (
          <span className="cmd-row__meta" style={{ color: "var(--color-warn, #f59e0b)" }}>
            Missing
          </span>
        ),
    },
  ];

  return (
    <div className="bc-cc sbp-command-page">
      <PageHeader
        eyebrow={`${projectName} / Commercial`}
        title="Backcharge Defense"
        subtitle="Cost recovery, responsible parties, notice coverage, disputes, and defensible documentation."
        meta={`${s.total} logged · ${s.open} open · ${fmtMoney(s.openAmount)} open exposure`}
        actions={(
          <>
            <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onExport}>
              <Download size={14} /> Export
            </button>
            {onCreate ? (
              <button type="button" className="cmd-btn cmd-btn--primary" onClick={onCreate}>
                <Plus size={14} /> New Backcharge
              </button>
            ) : null}
          </>
        )}
      />

      <OperationalSummary metrics={operationalMetrics} ariaLabel="Backcharge operational summary" />

      <AttentionQueue
        title="Recovery Attention"
        items={attentionItems}
        emptyMessage="No open backcharge recovery items."
      />

      <div className="sbp-work-grid">
        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head">
            <h2>Disputed</h2>
            <button type="button" className="cmd-btn cmd-btn--ghost" onClick={() => { onStatusFilter("disputed"); scrollToTable(); }}>View register</button>
          </div>
          <div>
            {s.disputedQueue.length === 0 ? (
              <div className="sbp-attention__empty">No disputed backcharges.</div>
            ) : s.disputedQueue.map((row) => (
              <button
                type="button"
                className="cmd-row is-clickable"
                key={row.id}
                onClick={() => {
                  const bc = backcharges.find((item) => item.id === row.id);
                  if (bc) onOpen(bc);
                }}
                style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }}
              >
                <div>
                  <div className="cmd-row__num">{row.title}</div>
                  <div className="cmd-row__meta">{row.responsible_party || "Responsible party unknown"}</div>
                </div>
                <Pill tone="danger">{fmtMoney(row.amount)}</Pill>
              </button>
            ))}
          </div>
        </section>

        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head"><h2>By Responsible Party</h2></div>
          <div>
            {s.byVendor.length === 0 ? (
              <div className="sbp-attention__empty">No backcharges logged.</div>
            ) : s.byVendor.slice(0, 8).map((vendor) => (
              <div className="cmd-row" key={vendor.vendor}>
                <div>
                  <div className="cmd-row__num">{vendor.vendor}</div>
                  <div className="cmd-row__meta">{vendor.count} backcharge{vendor.count === 1 ? "" : "s"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div>{fmtMoney(vendor.totalAmount)}</div>
                  <div className="cmd-row__meta">{vendor.openAmount > 0 ? `${fmtMoney(vendor.openAmount)} open` : "No open exposure"}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search title, responsible party, or backcharge number"
        filters={
          <>
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`cmd-chip-btn${statusFilter === f.value ? " is-active" : ""}`}
                onClick={() => onStatusFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={filtered}
        onRowClick={onOpen}
        emptyMessage="No backcharges match your filters."
      />
    </div>
  );
}
