/**
 * BudgetHoursControlCenter.tsx
 *
 * Command UI redesign for the Budget Hours page (flag: command_ui).
 *
 * Composition:
 *   PageHero      — title, chips (scope item count, specialty count, misses)
 *   KpiStrip      — 6 KPIs: Budget Hours, Actual Hours, % Used, Forecast,
 *                   Variance, Over-Budget count
 *   BhChartRow    — grouped bar (Shop Bud/Act, Field Bud/Act per scope item)
 *                   + pie (Shop vs Field budget split). Inline-styled per the
 *                   worktree constraint (no edits to command.css). Pattern
 *                   mirrors CostChartRow.tsx.
 *   3× DecisionPanel — By Scope Item / Over-Budget / Misses
 *   FilterBar     — search, category chips (All / Standard / Specialty),
 *                   "Over Budget" chip, Add Item, Set Up From Template, Export
 *   DataTable     — Scope Item, Shop Bud, Shop Act, Shop Δ%, Field Bud,
 *                   Field Act, Field Δ%, Total Bud, Total Act, Total Δ%
 *
 * Data + mutations are owned by the parent BudgetHours.jsx and passed as props
 * so the classic path is completely untouched.
 *
 * CSS classes emitted as inline styles where command.css classes would be
 * needed. Wanted class names noted in a comment block at the bottom of the file
 * for the coordinator to add to command.css.
 */
import React, { useMemo } from "react";
import { Clock, BarChart3, TrendingDown, TrendingUp, AlertTriangle, Layers, Pencil, Trash2 } from "lucide-react";
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
  buildBudgetHoursSummary,
  fmtHours,
  fmtPct,
  varianceTone,
} from "./budgetHoursControlCenter.derive";
import type { BudgetHourRow, WorkPackageRow } from "./budgetHoursControlCenter.derive";
import BhChartRow from "./BhChartRow";

// ─── Variance color (mirrors classic page's varianceColor) ────────────────────

function varColor(pct: number): string {
  if (pct >= 10) return "var(--status-error)";
  if (pct > 0) return "var(--status-warning)";
  return "var(--status-success)";
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface BudgetHoursControlCenterProps {
  /** Project name for the hero. */
  projectName: string;
  /** All active rows (is_deleted already filtered). */
  rows: BudgetHourRow[];
  /** Work packages for linked-hours rollup. */
  wpsById: Map<string, WorkPackageRow>;
  /** Search string state (controlled by parent). */
  search: string;
  onSearch: (v: string) => void;
  /** Category filter: "All" | "Standard" | "Specialty". */
  categoryFilter: string;
  onCategoryChange: (v: string) => void;
  /** Toggle "show only over-budget rows". */
  overBudgetOnly: boolean;
  onOverBudgetToggle: () => void;
  /** Already-filtered rows for the DataTable. */
  filteredRows: BudgetHourRow[];
  /** Open the add-row flow. */
  onAddItem: () => void;
  /** Open the preset picker dialog. */
  onSetUpTemplate: () => void;
  /** Export CSV. */
  onExport: () => void;
  /** Open row edit (same popover/behavior as classic). */
  onRowClick?: (row: BudgetHourRow) => void;
  /** Open the scope-item modal in edit mode for this row. */
  onEditRow?: (row: BudgetHourRow) => void;
  /** Request a (confirmed) soft-delete of this row. */
  onDeleteRow?: (row: BudgetHourRow) => void;
  /** RBAC gates (resolved from usePermissions in the parent). */
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

// ─── Derived table row type (for DataTable) ───────────────────────────────────

interface TableRow extends BudgetHourRow {
  _shopActual: number;
  _fieldActual: number;
  _shopVarPct: number;
  _fieldVarPct: number;
  _totalBudget: number;
  _totalActual: number;
  _totalVarPct: number;
  _isLinked: boolean;
}

const CATEGORY_OPTIONS = ["All", "Standard", "Specialty"] as const;

// ─── Component ───────────────────────────────────────────────────────────────

export default function BudgetHoursControlCenter({
  projectName,
  rows,
  wpsById,
  search,
  onSearch,
  categoryFilter,
  onCategoryChange,
  overBudgetOnly,
  onOverBudgetToggle,
  filteredRows,
  onAddItem,
  onSetUpTemplate,
  onExport,
  onRowClick,
  onEditRow,
  onDeleteRow,
  canCreate = false,
  canEdit = false,
  canDelete = false,
}: BudgetHoursControlCenterProps) {
  useCommandSkin();

  const s = useMemo(() => buildBudgetHoursSummary(rows, wpsById), [rows, wpsById]);

  // Enrich filteredRows with derived columns for the DataTable
  const tableRows: TableRow[] = useMemo(() => {
    return filteredRows.map((r) => {
      const linked = r.metadata?.linked_work_package_ids;
      const isLinked = Array.isArray(linked) && linked.length > 0;
      let shopActual = Number(r.shop_hours_actual) || 0;
      let fieldActual = Number(r.field_hours_actual) || 0;
      if (isLinked) {
        shopActual = 0;
        fieldActual = 0;
        for (const id of linked) {
          const wp = wpsById.get(id);
          if (!wp) continue;
          shopActual += Number(wp.shop_hours_actual) || 0;
          fieldActual += Number(wp.field_hours_actual) || 0;
        }
      }
      const shopBudget = Number(r.shop_hours_budget) || 0;
      const fieldBudget = Number(r.field_hours_budget) || 0;
      const totalBudget = shopBudget + fieldBudget;
      const totalActual = shopActual + fieldActual;
      const shopVarPct = shopBudget <= 0 ? (shopActual > 0 ? 100 : 0) : ((shopActual - shopBudget) / shopBudget) * 100;
      const fieldVarPct = fieldBudget <= 0 ? (fieldActual > 0 ? 100 : 0) : ((fieldActual - fieldBudget) / fieldBudget) * 100;
      const totalVarPct = totalBudget <= 0 ? (totalActual > 0 ? 100 : 0) : ((totalActual - totalBudget) / totalBudget) * 100;
      return {
        ...r,
        _shopActual: shopActual,
        _fieldActual: fieldActual,
        _shopVarPct: shopVarPct,
        _fieldVarPct: fieldVarPct,
        _totalBudget: totalBudget,
        _totalActual: totalActual,
        _totalVarPct: totalVarPct,
        _isLinked: isLinked,
      };
    });
  }, [filteredRows, wpsById]);

  // ── Hero chips ──
  const heroChips = [
    { label: `${s.standardCount} Standard` },
    { label: `${s.specialtyCount} Specialty` },
    { label: `${s.overBudgetCount} Over Budget`, tone: s.overBudgetCount > 0 ? ("danger" as const) : ("good" as const) },
  ];

  // ── KPI strip ──
  const kpiCells: KpiCellDef[] = [
    {
      label: "Budget Hours",
      value: fmtHours(s.totalBudgetHours),
      sublabel: "total budgeted",
      tone: "neutral",
      Icon: BarChart3,
    },
    {
      label: "Actual Hours",
      value: fmtHours(s.totalActualHours),
      sublabel: "hours logged",
      tone: "neutral",
      Icon: Clock,
    },
    {
      label: "% Used",
      value: `${s.pctUsed}%`,
      sublabel: "actual / budget",
      tone: s.pctUsed > 100 ? "danger" : s.pctUsed > 85 ? "warn" : "good",
      Icon: Layers,
    },
    {
      label: "Forecast",
      value: fmtHours(s.forecastHours),
      sublabel: "est. at completion",
      tone: s.forecastHours > s.totalBudgetHours ? "warn" : "good",
      Icon: TrendingUp,
    },
    {
      label: "Variance",
      value: fmtPct(s.totalVarPct),
      sublabel: s.varianceHours > 0 ? `+${fmtHours(s.varianceHours)}h over` : `${fmtHours(Math.abs(s.varianceHours))}h under`,
      tone: varianceTone(s.totalVarPct),
      Icon: TrendingDown,
    },
    {
      label: "Over Budget",
      value: s.overBudgetCount,
      sublabel: "scope items",
      tone: s.overBudgetCount > 0 ? "danger" : "neutral",
      Icon: AlertTriangle,
    },
  ];

  // ── DataTable columns ──
  const columns: Column<TableRow>[] = [
    {
      key: "scope",
      header: "Scope Item",
      render: (r) => (
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {r.scope_item || "—"}
          {r._isLinked && (
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
              letterSpacing: "0.10em", color: "var(--accent)", textTransform: "uppercase",
            }}>
              WP
            </span>
          )}
          {(r.category === "Specialty" || r.is_specialty) && (
            <Pill tone="info">Specialty</Pill>
          )}
        </span>
      ),
    },
    {
      key: "shopBud",
      header: "Shop Bud",
      align: "right",
      render: (r) => <span className="sbd-num">{fmtHours(r.shop_hours_budget ?? 0)}</span>,
    },
    {
      key: "shopAct",
      header: "Shop Act",
      align: "right",
      render: (r) => (
        <span className="sbd-num" style={{ color: r._shopVarPct >= 10 ? "var(--status-error)" : r._shopVarPct > 0 ? "var(--status-warning)" : "inherit" }}>
          {fmtHours(r._shopActual)}
        </span>
      ),
    },
    {
      key: "shopVar",
      header: "Shop Δ%",
      align: "right",
      render: (r) => (
        <span className="sbd-num" style={{ fontWeight: 700, color: varColor(r._shopVarPct) }}>
          {fmtPct(r._shopVarPct)}
        </span>
      ),
    },
    {
      key: "fieldBud",
      header: "Field Bud",
      align: "right",
      render: (r) => <span className="sbd-num">{fmtHours(r.field_hours_budget ?? 0)}</span>,
    },
    {
      key: "fieldAct",
      header: "Field Act",
      align: "right",
      render: (r) => (
        <span className="sbd-num" style={{ color: r._fieldVarPct >= 10 ? "var(--status-error)" : r._fieldVarPct > 0 ? "var(--status-warning)" : "inherit" }}>
          {fmtHours(r._fieldActual)}
        </span>
      ),
    },
    {
      key: "fieldVar",
      header: "Field Δ%",
      align: "right",
      render: (r) => (
        <span className="sbd-num" style={{ fontWeight: 700, color: varColor(r._fieldVarPct) }}>
          {fmtPct(r._fieldVarPct)}
        </span>
      ),
    },
    {
      key: "totalBud",
      header: "Total Bud",
      align: "right",
      render: (r) => <span className="sbd-num" style={{ fontWeight: 700 }}>{fmtHours(r._totalBudget)}</span>,
    },
    {
      key: "totalAct",
      header: "Total Act",
      align: "right",
      render: (r) => <span className="sbd-num" style={{ fontWeight: 700 }}>{fmtHours(r._totalActual)}</span>,
    },
    {
      key: "totalVar",
      header: "Total Δ%",
      align: "right",
      render: (r) => (
        <Pill tone={varianceTone(r._totalVarPct)}>
          {fmtPct(r._totalVarPct)}
        </Pill>
      ),
    },
    {
      key: "notes",
      header: "Notes",
      render: (r) => (
        <span className="cmd-row__meta" style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
          {r.notes || "—"}
        </span>
      ),
    },
  ];

  // Row actions (Edit / Delete) — only rendered when the user has the matching
  // permission. Buttons stopPropagation so they don't also fire onRowClick.
  const showActions = canEdit || canDelete;
  if (showActions) {
    columns.push({
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <span style={{ display: "inline-flex", gap: 4, justifyContent: "flex-end" }}>
          {canEdit && onEditRow && (
            <button
              type="button"
              className="sbd-btn sbd-btn-ghost"
              title="Edit scope item"
              aria-label={`Edit ${r.scope_item || "scope item"}`}
              onClick={(e) => { e.stopPropagation(); onEditRow(r); }}
              style={{ padding: "4px 8px", fontSize: 12 }}
            >
              <Pencil size={13} />
            </button>
          )}
          {canDelete && onDeleteRow && (
            <button
              type="button"
              className="sbd-btn sbd-btn-ghost"
              title="Delete scope item"
              aria-label={`Delete ${r.scope_item || "scope item"}`}
              onClick={(e) => { e.stopPropagation(); onDeleteRow(r); }}
              style={{ padding: "4px 8px", fontSize: 12, color: "var(--status-error)" }}
            >
              <Trash2 size={13} />
            </button>
          )}
        </span>
      ),
    });
  }

  return (
    <div className="bh-cc">
      <PageHero
        Icon={BarChart3}
        title="Budget Hours Control Center"
        subtitle="Shop and field labor-hour budget vs actuals — by scope item, with work package rollup and miss tracking."
        projectName={projectName}
        chips={heroChips}
      />

      <KpiStrip cells={kpiCells} />

      {/* Chart section — only shown when data exists */}
      {s.barChartData.length > 0 && (
        <BhChartRow
          barData={s.barChartData}
          pieData={s.byCategoryPie}
          totalBudget={s.totalBudgetHours}
          totalActual={s.totalActualHours}
        />
      )}

      {/* Decision panels */}
      <div className="cmd-panels">
        {/* Panel 1: By Scope Item — top 5 by total hours */}
        <DecisionPanel title="Top Scope Items">
          {s.byTrade
            .slice()
            .sort((a, b) => b.totalBudget - a.totalBudget)
            .slice(0, 5)
            .map((r) => (
              <div className="cmd-row" key={r.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="cmd-row__num" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.scopeItem}
                  </div>
                  <div className="cmd-row__meta">
                    {fmtHours(r.totalActual)} / {fmtHours(r.totalBudget)} h
                    {r.isLinked ? " · WP" : ""}
                  </div>
                </div>
                <Pill tone={varianceTone(r.totalVarPct)}>{fmtPct(r.totalVarPct)}</Pill>
              </div>
            ))}
          {s.byTrade.length === 0 && (
            <div className="cmd-row__meta">No scope items yet.</div>
          )}
        </DecisionPanel>

        {/* Panel 2: Over-Budget items */}
        <DecisionPanel title="Over Budget">
          {s.overBudgetRows.slice(0, 6).map((r) => (
            <div className="cmd-row" key={r.id}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cmd-row__num" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.scopeItem}
                </div>
                <div className="cmd-row__meta">
                  +{fmtHours(r.totalActual - r.totalBudget)} h over budget
                </div>
              </div>
              <Pill tone="danger">{fmtPct(r.totalVarPct)}</Pill>
            </div>
          ))}
          {s.overBudgetRows.length === 0 && (
            <div className="cmd-row__meta">No scope items over budget.</div>
          )}
        </DecisionPanel>

        {/* Panel 3: Misses */}
        <DecisionPanel title="Misses / Gaps in Scope">
          {s.misses.slice(0, 6).map((m) => (
            <div className="cmd-row" key={m.id}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cmd-row__num" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.location || "—"}
                </div>
                <div className="cmd-row__meta" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.explanation || "No explanation"}
                </div>
              </div>
              {m.rough_cost > 0 && (
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                  color: "var(--status-warning)", whiteSpace: "nowrap", marginLeft: 8,
                }}>
                  ${m.rough_cost.toLocaleString()}
                </span>
              )}
            </div>
          ))}
          {s.misses.length === 0 && (
            <div className="cmd-row__meta">No misses logged.</div>
          )}
        </DecisionPanel>
      </div>

      {/* Filter bar */}
      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search scope items or notes"
        onExport={onExport}
        primaryLabel={canCreate ? "Add Item" : undefined}
        onPrimary={canCreate ? onAddItem : null}
        filters={
          <>
            {CATEGORY_OPTIONS.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`cmd-chip-btn${categoryFilter === cat ? " is-active" : ""}`}
                onClick={() => onCategoryChange(cat)}
              >
                {cat}
              </button>
            ))}
            <button
              type="button"
              className={`cmd-chip-btn${overBudgetOnly ? " is-active" : ""}`}
              style={overBudgetOnly ? { borderColor: "var(--status-error)", color: "var(--status-error)" } : undefined}
              onClick={onOverBudgetToggle}
            >
              Over Budget
            </button>
            {canCreate && (
              <button
                type="button"
                className="cmd-chip-btn"
                onClick={onSetUpTemplate}
              >
                Set Up From Template
              </button>
            )}
          </>
        }
      />

      {/* Data table */}
      <DataTable
        columns={columns}
        rows={tableRows}
        onRowClick={onRowClick ? (r) => onRowClick(r) : undefined}
        emptyMessage={
          rows.filter((r) => r.category !== "Misses").length === 0
            ? "No scope items yet. Use Set Up From Template or Add Item."
            : "No items match your filters."
        }
      />

      {/*
        INLINE STYLE REPORT — CSS wanted in command.css (for coordinator):

        .bh-cc { }   — page wrapper, mirrors .rfi-cc and .cost-cc; no styles needed
                       beyond what the command skin already provides.

        No additional CSS is required beyond what .cmd-panels, .cmd-row,
        .cmd-row__num, .cmd-row__meta, .cmd-chip-btn.is-active, and .sbd-num
        already provide in command.css. All BH-specific styling is inline.
      */}
    </div>
  );
}
