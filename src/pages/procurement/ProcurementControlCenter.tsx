/**
 * ProcurementControlCenter.tsx
 *
 * Canonical control-center skin for the Procurement page. Rendered when the `canonical presentation`
 * canonical route is active. The page-owned Procurement body is
 * untouched — this file is a pure presentation layer over the same data.
 *
 * Data contract:
 *   - `items`   — already-filtered, non-deleted procurement rows (delivery
 *                 rows where procurement_category IS NOT NULL).
 *   - `filtered` — the items after the page's search/status/category
 *                 filters have been applied (drives the DataTable).
 *   - All event handlers come from the page-owned Procurement shell — no new
 *     mutations live here.
 *
 * CSS wants (inline styles used — coordinator should add to command.css):
 *   .proc-cc                  — page root, same role as .rfi-cc
 *   .proc-cc .cmd-table-wrap  — auto-scroll target for "View all" links
 */

import { useMemo } from "react";
import {
  PackageCheck, Truck, AlertTriangle, Clock, CircleCheck,
  Activity, Gauge,
} from "lucide-react";
import "@/styles/command.css";
import {
  PageHero, KpiStrip, DecisionPanel, Pill, statusTone,
  FilterBar, DataTable, useCommandSkin,
} from "@/components/command";
import type { Column, KpiCellDef } from "@/components/command";
import { photoFor } from "@/config/launcherConfig";
import { buildProcurementSummary, isOverdue, isLate, daysUntil } from "./procurementControlCenter.derive";
import type { ProcurementItem } from "./procurementControlCenter.derive";
import { PROCUREMENT_CATEGORIES, ALL_STATUSES, fmtDate } from "./format";

// ── Types ───────────────────────────────────────────────────────────────────

export interface ProcurementControlCenterProps {
  projectName: string;
  items: ProcurementItem[];
  filtered: ProcurementItem[];
  search: string;
  onSearch: (v: string) => void;
  categoryFilter: string;
  onCategoryChange: (v: string) => void;
  statusFilter: string;
  onStatusChange: (v: string) => void;
  onOpenItem: (item: ProcurementItem) => void;
  onExport: () => void;
  onCreate?: (() => void) | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Map procurement status to a pill tone. */
function procStatusTone(status: string | null | undefined): ReturnType<typeof statusTone> {
  switch (status) {
    case "Received":      return "good";
    case "Shipped":       return "info";
    case "In Production": return "info";
    case "Confirmed":     return "info";
    case "PO Issued":     return "warn";
    case "Quoted":        return "warn";
    case "Identified":    return "neutral";
    case "Cancelled":     return "neutral";
    default:              return "neutral";
  }
}

/** Need-by date cell — shows overdue badge when past. */
function needByCell(item: ProcurementItem) {
  if (!item.required_date) return <span style={{ color: "var(--text-muted)", fontSize: 11 }}>No date</span>;
  if (isOverdue(item)) {
    const days = Math.abs(daysUntil(item.required_date) ?? 0);
    return <span style={{ color: "var(--status-error)", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700 }}>{item.required_date} · {days}d late</span>;
  }
  const diff = daysUntil(item.required_date);
  if (diff !== null && diff <= 7) {
    return <span style={{ color: "var(--status-warning)", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700 }}>{item.required_date} · {diff}d</span>;
  }
  return <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{item.required_date}</span>;
}

/** Scroll to the DataTable below the panels. */
function scrollToTable() {
  document.querySelector(".proc-cc .cmd-table-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ProcurementControlCenter(props: ProcurementControlCenterProps) {
  const {
    projectName, items, filtered, search, onSearch,
    categoryFilter, onCategoryChange, statusFilter, onStatusChange,
    onOpenItem, onExport, onCreate,
  } = props;

  useCommandSkin();

  const s = useMemo(() => buildProcurementSummary(items), [items]);

  // ── Hero chips ──────────────────────────────────────────────────────────
  const chips = [
    { label: `${s.total} Items` },
    { label: `${s.open} Open`, tone: "good" as const },
    { label: `${s.overdue} Overdue` },
  ];

  // ── KPI strip ──────────────────────────────────────────────────────────
  const kpiCells: KpiCellDef[] = [
    {
      label: "Open POs",
      value: s.open,
      sublabel: "items",
      tone: "warn",
      Icon: Activity,
    },
    {
      label: "Overdue",
      value: s.overdue,
      sublabel: "need-by passed",
      tone: s.overdue > 0 ? "danger" : "neutral",
      Icon: AlertTriangle,
    },
    {
      label: "Awaiting Delivery",
      value: s.partiallyReceived,
      sublabel: "shipped / en route",
      tone: s.partiallyReceived > 0 ? "info" : "neutral",
      Icon: Truck,
    },
    {
      label: "Long-Lead Items",
      value: s.longLead,
      sublabel: `${s.longLeadSlipping} slipping`,
      tone: s.longLeadSlipping > 0 ? "danger" : "neutral",
      Icon: Clock,
    },
    {
      label: "LL Slipping",
      value: s.longLeadSlipping,
      sublabel: "ship after need-by",
      tone: s.longLeadSlipping > 0 ? "danger" : "neutral",
      Icon: AlertTriangle,
    },
    {
      label: "Total Weight",
      // No money; raw tons from weight_tons column.
      value: `${s.totalWeightTons.toFixed(1)}T`,
      sublabel: "procurement tons",
      tone: "neutral",
      Icon: Gauge,
    },
    {
      label: "Received",
      value: items.filter((i) => i.status === "Received").length,
      sublabel: "complete",
      tone: "good",
      Icon: CircleCheck,
    },
  ];

  // ── DataTable columns ───────────────────────────────────────────────────
  const columns: Column<ProcurementItem>[] = [
    {
      key: "po",
      header: "PO #",
      render: (i) => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700 }}>
          {i.po_number || "—"}
        </span>
      ),
    },
    {
      key: "vendor",
      header: "Vendor",
      render: (i) => i.vendor || <span style={{ color: "var(--text-muted)" }}>—</span>,
    },
    {
      key: "description",
      header: "Material / Description",
      render: (i) => (
        <span style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
          {i.description || i.procurement_category || "—"}
        </span>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (i) => (
        <span style={{ fontSize: 10, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
          {i.procurement_category || "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (i) => <Pill tone={procStatusTone(i.status)}>{i.status || "—"}</Pill>,
    },
    {
      key: "needby",
      header: "Need By",
      render: needByCell,
    },
    {
      key: "ship",
      header: "ETA / Ship",
      render: (i) => {
        const d = i.expected_ship_date || null;
        if (!d) return <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>;
        const late = isLate(i);
        return (
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 11,
            color: late ? "var(--status-error)" : undefined,
          }}>
            {d}{late ? " · late" : ""}
          </span>
        );
      },
    },
    {
      key: "weight",
      header: "Wt (T)",
      align: "right",
      render: (i) => i.weight_tons != null
        ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{Number(i.weight_tons).toFixed(1)}</span>
        : <span style={{ color: "var(--text-muted)" }}>—</span>,
    },
  ];

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="proc-cc">
      <PageHero
        Icon={PackageCheck}
        title="Procurement Control Center"
        subtitle="Track purchase orders, vendors, long-lead items, and delivery commitments for this steel project."
        projectName={projectName}
        chips={chips}
        photoSrc={photoFor("Procurement") ?? undefined}
      />

      <KpiStrip cells={kpiCells} />

      <div className="cmd-panels">
        {/* Panel 1 — items needing attention (overdue / slipping / long-lead) */}
        <DecisionPanel
          title="Needs Attention"
          onViewAll={() => { onStatusChange("all"); scrollToTable(); }}
        >
          {s.attentionQueue.map((item) => (
            <div
              className="cmd-row is-clickable"
              key={item.id}
              onClick={() => onOpenItem(item)}
            >
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700 }}>
                  {item.po_number || item.procurement_category || "Item"}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                  {item.vendor || "No vendor"} · {item.description ? item.description.slice(0, 40) : "—"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {isOverdue(item) && <Pill tone="danger">Overdue</Pill>}
                {!isOverdue(item) && isLate(item) && <Pill tone="warn">Slipping</Pill>}
                {!isOverdue(item) && !isLate(item) && item.is_long_lead && <Pill tone="info">Long Lead</Pill>}
                <Pill tone={procStatusTone(item.status)}>{item.status || "—"}</Pill>
              </div>
            </div>
          ))}
          {s.attentionQueue.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>All items on track.</div>
          )}
        </DecisionPanel>

        {/* Panel 2 — shipped / awaiting delivery */}
        <DecisionPanel
          title="Awaiting Delivery"
          onViewAll={() => { onStatusChange("Shipped"); scrollToTable(); }}
        >
          {s.awaitingDelivery.map((item) => (
            <div
              className="cmd-row is-clickable"
              key={item.id}
              onClick={() => onOpenItem(item)}
            >
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700 }}>
                  {item.po_number || item.procurement_category || "Shipment"}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                  {item.vendor || "No vendor"}
                  {item.expected_ship_date ? ` · ETA ${fmtDate(item.expected_ship_date)}` : ""}
                </div>
              </div>
              {item.required_date && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>
                  Need {fmtDate(item.required_date)}
                </span>
              )}
            </div>
          ))}
          {s.awaitingDelivery.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>No items in transit.</div>
          )}
        </DecisionPanel>

        {/* Panel 3 — vendor breakdown */}
        <DecisionPanel
          title="By Vendor"
          onViewAll={scrollToTable}
        >
          {s.vendorSummary.slice(0, 6).map((row) => (
            <div className="cmd-row" key={row.vendor}>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700 }}>{row.vendor}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                  {row.count} open · {row.pendingCount} pending · {row.overdueCount} overdue
                </div>
              </div>
              {row.overdueCount > 0 && <Pill tone="danger">{row.overdueCount} late</Pill>}
            </div>
          ))}
          {s.vendorSummary.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>No open items.</div>
          )}
        </DecisionPanel>
      </div>

      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search description, vendor, or PO number"
        onExport={onExport}
        primaryLabel="Add Item"
        onPrimary={onCreate ?? null}
        filters={
          <>
            {/* Category chips */}
            <button
              type="button"
              className={`cmd-chip-btn${categoryFilter === "all" ? " is-active" : ""}`}
              onClick={() => onCategoryChange("all")}
            >
              All Categories
            </button>
            {PROCUREMENT_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`cmd-chip-btn${categoryFilter === cat ? " is-active" : ""}`}
                onClick={() => onCategoryChange(cat)}
              >
                {cat}
              </button>
            ))}

            {/* Status chips — subtle separator via spacing in CSS */}
            <span style={{ display: "inline-block", width: 1, height: 20, background: "var(--divider)", margin: "0 4px", verticalAlign: "middle" }} aria-hidden="true" />
            {ALL_STATUSES.map((st) => (
              <button
                key={st}
                type="button"
                className={`cmd-chip-btn${statusFilter === st ? " is-active" : ""}`}
                onClick={() => onStatusChange(st)}
              >
                {st}
              </button>
            ))}
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={filtered}
        onRowClick={onOpenItem}
        emptyMessage="No procurement items match your filters."
      />
    </div>
  );
}
