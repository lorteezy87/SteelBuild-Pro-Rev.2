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
import { Download, Plus } from "lucide-react";
import "@/styles/command.css";
import {
  AttentionQueue, OperationalSummary, PageHeader, Pill, statusTone,
  FilterBar, DataTable, useCommandSkin,
} from "@/components/command";
import type { AttentionItem, Column } from "@/components/command";
import { buildProcurementSummary, computedShipDate, isOverdue, isLate, daysUntil } from "./procurementControlCenter.derive";
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

  const attentionItems: AttentionItem[] = s.attentionQueue
    .filter((item) => {
      const due = daysUntil(item.required_date);
      return (
        isOverdue(item) ||
        isLate(item) ||
        item.is_long_lead === true ||
        !item.required_date ||
        (due !== null && due >= 0 && due <= 7) ||
        item.status === "Identified" ||
        item.priority === "High"
      );
    })
    .map((item) => {
      let risk = "Procurement follow-up";
      let nextAction = "Review procurement item";
      let tone: AttentionItem["tone"] = "warn";

      if (!item.required_date) {
        risk = "Need-by date unknown";
        nextAction = "Set required date";
      } else if (isOverdue(item)) {
        risk = "Required date passed";
        nextAction = "Recover material / confirm delivery plan";
        tone = "danger";
      } else if (isLate(item)) {
        risk = "Ship date slips need-by";
        nextAction = "Escalate vendor commitment";
        tone = "danger";
      } else if (item.is_long_lead) {
        risk = "Long-lead exposure";
        nextAction = "Confirm long-lead commitment";
      } else if (item.status === "Identified") {
        risk = "Not yet quoted / ordered";
        nextAction = "Advance quote / PO";
      }

      return {
        id: item.id,
        issue: `${item.po_number || item.procurement_category || "Item"} · ${item.description || "No description"}`,
        deadline: item.required_date || null,
        risk,
        owner: item.vendor || null,
        nextAction,
        tone,
        onOpen: () => onOpenItem(item),
      };
    })
    .slice(0, 10);

  const operationalMetrics = [
    { label: "Open Items", value: s.open, sublabel: "not received / cancelled", tone: s.open ? "info" as const : "good" as const },
    { label: "Overdue", value: s.overdue, sublabel: "need-by passed", tone: s.overdue ? "danger" as const : "good" as const },
    { label: "Awaiting Delivery", value: s.partiallyReceived, sublabel: "shipped / en route", tone: s.partiallyReceived ? "info" as const : "neutral" as const },
    { label: "Long Lead", value: s.longLead, sublabel: `${s.longLeadSlipping} slipping`, tone: s.longLeadSlipping ? "danger" as const : s.longLead ? "warn" as const : "neutral" as const },
    { label: "Missing Need-By", value: s.missingRequiredDate, sublabel: "open items", tone: s.missingRequiredDate ? "warn" as const : "good" as const },
    { label: "Total Weight", value: `${s.totalWeightTons.toFixed(1)}T`, sublabel: "recorded procurement", tone: "neutral" as const },
    { label: "Received", value: items.filter((item) => item.status === "Received").length, sublabel: "complete", tone: "good" as const },
  ];

  // ── DataTable columns ───────────────────────────────────────────────────
  const columns: Column<ProcurementItem>[] = [
    {
      key: "item",
      header: "Item / Category",
      grid: "minmax(210px, 1.7fr)",
      render: (item) => (
        <div>
          <div style={{ fontWeight: 700 }}>{item.description || item.procurement_category || "Unspecified item"}</div>
          <div className="cmd-row__meta">{item.procurement_category || "Category unknown"}</div>
        </div>
      ),
    },
    {
      key: "vendor",
      header: "Vendor / PO",
      grid: "minmax(135px, 1fr)",
      render: (item) => (
        <div>
          <div>{item.vendor || "Vendor unknown"}</div>
          <div className="cmd-row__meta">{item.po_number ? `PO ${item.po_number}` : "PO not recorded"}</div>
        </div>
      ),
    },
    {
      key: "package",
      header: "WP / Seq",
      grid: "minmax(110px, .8fr)",
      render: (item) => {
        const metadata = item.metadata || {};
        const sequence =
          typeof metadata.sequence_number === "string"
            ? metadata.sequence_number
            : typeof metadata.sequence === "string"
              ? metadata.sequence
              : null;
        return (
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{item.work_package_id || "WP unknown"}</div>
            <div className="cmd-row__meta">{sequence ? `Seq ${sequence}` : "Sequence unknown"}</div>
          </div>
        );
      },
    },
    {
      key: "needby",
      header: "Need By",
      grid: "minmax(112px, .9fr)",
      render: needByCell,
    },
    {
      key: "commitment",
      header: "Ship / Delivery",
      grid: "minmax(150px, 1fr)",
      render: (item) => {
        const ship = item.expected_ship_date || computedShipDate(item);
        return (
          <div>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: ship && isLate(item) ? "var(--status-error)" : undefined,
            }}>
              {ship ? `Ship ${fmtDate(ship)}${isLate(item) ? " · late" : ""}` : "Ship date unknown"}
            </div>
            <div className="cmd-row__meta">
              {item.scheduled_date ? `Delivery ${fmtDate(item.scheduled_date)}` : "Delivery commitment unknown"}
            </div>
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      grid: "minmax(110px, .8fr)",
      render: (item) => <Pill tone={procStatusTone(item.status)}>{item.status || "Unknown"}</Pill>,
    },
    {
      key: "risk",
      header: "Risk",
      grid: "minmax(135px, .9fr)",
      render: (item) => {
        if (!item.required_date) return <Pill tone="warn">Need-by unknown</Pill>;
        if (isOverdue(item)) return <Pill tone="danger">Overdue</Pill>;
        if (isLate(item)) return <Pill tone="danger">Slipping</Pill>;
        if (item.is_long_lead) return <Pill tone="warn">Long Lead</Pill>;
        return <Pill tone="good">Clear</Pill>;
      },
    },
    {
      key: "weight",
      header: "Weight",
      align: "right",
      grid: "minmax(80px, .65fr)",
      render: (item) => item.weight_tons != null
        ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{Number(item.weight_tons).toFixed(1)}T</span>
        : <span style={{ color: "var(--text-muted)" }}>Unknown</span>,
    },
  ];

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="proc-cc sbp-command-page">
      <PageHeader
        eyebrow={`${projectName} / Production`}
        title="Procurement Control"
        subtitle="Material commitments, long-lead exposure, need-by dates, and vendor follow-up."
        meta={`${s.total} items · ${s.open} open · ${s.overdue} overdue`}
        actions={(
          <>
            <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onExport}>
              <Download size={14} /> Export
            </button>
            {onCreate ? (
              <button type="button" className="cmd-btn cmd-btn--primary" onClick={onCreate}>
                <Plus size={14} /> Add Item
              </button>
            ) : null}
          </>
        )}
      />

      <OperationalSummary
        metrics={operationalMetrics}
        ariaLabel="Procurement operational summary"
      />

      <AttentionQueue
        title="Material Attention"
        items={attentionItems}
        emptyMessage="No procurement items currently require management attention."
      />

      <div className="sbp-work-grid">
        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head">
            <h2>Awaiting Delivery</h2>
            <button type="button" className="cmd-btn cmd-btn--ghost" onClick={() => { onStatusChange("Shipped"); scrollToTable(); }}>
              View in transit
            </button>
          </div>
          <div>
            {s.awaitingDelivery.length === 0 ? (
              <div className="sbp-attention__empty">No items in transit.</div>
            ) : s.awaitingDelivery.map((item) => (
              <button
                type="button"
                className="cmd-row is-clickable"
                key={item.id}
                onClick={() => onOpenItem(item)}
                style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }}
              >
                <div>
                  <div className="cmd-row__num">{item.po_number || item.procurement_category || "Shipment"}</div>
                  <div className="cmd-row__meta">{item.vendor || "Vendor unknown"}</div>
                </div>
                <span className="cmd-row__meta">
                  {item.required_date ? `Need ${fmtDate(item.required_date)}` : "Need-by unknown"}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head">
            <h2>Vendor Load</h2>
            <button type="button" className="cmd-btn cmd-btn--ghost" onClick={scrollToTable}>View register</button>
          </div>
          <div>
            {s.vendorSummary.length === 0 ? (
              <div className="sbp-attention__empty">No open vendor commitments.</div>
            ) : s.vendorSummary.slice(0, 6).map((row) => (
              <div className="cmd-row" key={row.vendor}>
                <div>
                  <div className="cmd-row__num">{row.vendor}</div>
                  <div className="cmd-row__meta">{row.count} open · {row.pendingCount} pending</div>
                </div>
                <Pill tone={row.overdueCount > 0 ? "danger" : "neutral"}>
                  {row.overdueCount > 0 ? `${row.overdueCount} overdue` : "On record"}
                </Pill>
              </div>
            ))}
          </div>
        </section>
      </div>

      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search description, vendor, or PO number"
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
