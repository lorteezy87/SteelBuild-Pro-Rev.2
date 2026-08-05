/**
 * SubmittalRegisterPanel — the canonical Submittal Register route surface.
 *
 * Presentation-only. Owns the command skin and renders the kit's `cmd-*`
 * classes + primitives for the standalone route and detailing hub.
 * Every query, mutation, cache key, and piece of state stays in the owning
 * `Submittals.tsx` page — this panel receives the derived register model +
 * handler callbacks and renders the CHROME (header / KPI strip / filter bar)
 * onto the kit.
 *
 * The canonical surface owns the header (title + count + New /
 * Bulk-Add actions via FilterBar's action slots), the KPI strip (kit `cmd-kpi`
 * cells, still click-to-filter), and the filter bar (kit `FilterBar` search +
 * `sbd-select` Status/BIC filters + the master select-all checkbox).
 *
 * What this slice REUSES as-is (owner-directed sliced conversion; mirrors
 * ControlBoardPanel reusing the inline editors): the register list
 * `SubmittalVirtualList` and the right-hand `SubmittalDetail`. Both already
 * render light via the token cascade, and — critically — both already carry
 * this session's features:
 *   - Splitting + lineage grouping (SubmittalVirtualList `groupByLineage`
 *     → buildSubmittalLineageGroups; indented children, "N SPLITS" badge,
 *     "from <parent>" hint, spin-off action in SubmittalDetail).
 *   - Per-type Shop/Erection/Part chips (`showTypeChips` + componentsBySubmittal).
 *   - Working-day due display (the row's required_date, stamped working-day-aware
 *     upstream; the countdown/stamping logic is untouched write-side code).
 *   - Revision (row R{total_rounds}; the text `revision` shows in SubmittalDetail).
 * Passing the identical props keeps every one of those behaviors byte-identical.
 * SubmittalDetail's internal re-skin is deferred to a later slice (see the panel
 * docstring note) — it is reused unchanged here, already tinted by the cascade.
 */
import type { ComponentType, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Clock3, ShieldAlert, TrendingUp } from "lucide-react";
import { FilterBar, useCommandSkin } from "@/components/command";
import ListTruncationNotice from "@/components/shared/ListTruncationNotice";
import { BIC_CHOICES, STATUSES } from "./format";
import type { SubmittalStats } from "./submittalRegister.derive";
import type { Submittal } from "./types";

type KpiTone = "neutral" | "good" | "warn" | "danger" | "info";

/** One click-to-filter KPI cell. Reuses the kit's `cmd-kpi` chrome + tone
 *  colours; adds an inline gold active ring + pointer since `.cmd-kpi` is a
 *  static card in the kit (no interactive rule to lean on). */
function KpiCell({
  label, value, sub, tone = "neutral", Icon, active, onClick,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: KpiTone;
  Icon?: ComponentType<{ size?: number | string }>;
  active?: boolean;
  onClick?: () => void;
}) {
  const clickable = !!onClick;
  return (
    <div
      className={`cmd-kpi cmd-kpi--${tone}`}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-pressed={clickable ? !!active : undefined}
      onClick={onClick}
      onKeyDown={clickable ? (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); }
      } : undefined}
      style={{
        cursor: clickable ? "pointer" : "default",
        outline: active ? "2px solid var(--cmd-gold)" : undefined,
        outlineOffset: active ? "-1px" : undefined,
      }}
    >
      {Icon ? <div className="cmd-kpi__icon"><Icon size={18} /></div> : null}
      <div className="cmd-kpi__value">{value}</div>
      <div className="cmd-kpi__label">{label}</div>
      {sub ? <div className="cmd-kpi__sub">{sub}</div> : null}
    </div>
  );
}

export interface SubmittalRegisterPanelProps {
  /** Derived register model — counts + the visible/total lengths for the
   *  header + KPI cells. The list/detail bodies come in pre-built (below). */
  filtered: Submittal[];
  rows: Submittal[];
  stats: SubmittalStats;
  reviewsAtRisk: number;

  /** Filter state + setters (owned by the page). */
  filterStatus: string;
  filterBIC: string;
  search: string;
  onFilterStatus: (v: string) => void;
  onFilterBIC: (v: string) => void;
  onSearch: (v: string) => void;

  /** Master select-all state (drives the filter-bar checkbox). */
  selectedIds: Set<string>;
  allSelected: boolean;
  toggleAll: () => void;

  /** Header actions. */
  projectLabel: string;
  canCreate: boolean;
  onNewSubmittal: () => void;
  onBulkAdd: () => void;

  /** The register list + detail panel, built once by the page and passed
   *  through verbatim so every list /
   *  detail behavior — splitting/lineage, S/E/P chips, working-day due,
   *  revision — is byte-identical. This panel only owns the CHROME. */
  list: ReactNode;
  detail: ReactNode;
}

export default function SubmittalRegisterPanel({
  filtered, rows, stats, reviewsAtRisk,
  filterStatus, filterBIC, search, onFilterStatus, onFilterBIC, onSearch,
  selectedIds, allSelected, toggleAll,
  projectLabel, canCreate, onNewSubmittal, onBulkAdd,
  list, detail,
}: SubmittalRegisterPanelProps) {
  useCommandSkin();
  const countUnit = filtered.length !== rows.length ? ` of ${rows.length}` : "";
  const subtitle = stats.overdue > 0
    ? `${stats.overdue} overdue · ${stats.pending} awaiting review`
    : `${stats.pending} awaiting review · ${stats.approved} approved`;

  return (
    <div className="detailing-cc" style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%", minHeight: 0, overflow: "hidden" }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--cmd-text-muted)" }}>
            {projectLabel} · Submittals
          </div>
          <h2 style={{ margin: "3px 0 0", fontSize: 22, fontWeight: 700, color: "var(--cmd-text)" }}>
            Submittal Register
            <span style={{ marginLeft: 10, fontSize: 14, fontWeight: 600, color: "var(--cmd-text-muted)" }}>
              {filtered.length}{countUnit}
            </span>
          </h2>
          <div style={{ marginTop: 3, fontSize: 13, color: "var(--cmd-text-muted)" }}>{subtitle}</div>
        </div>
      </div>

      {/* ── KPI strip (click-to-filter, kit cmd-kpi cells) ─────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <KpiCell
          label="Total" value={stats.total} Icon={ClipboardList} tone="info"
          active={filterStatus === "all" && filterBIC === "all"}
          onClick={() => { onFilterStatus("all"); onFilterBIC("all"); }}
        />
        <KpiCell
          label="Pending" value={stats.pending} Icon={Clock3} tone="warn"
          active={filterStatus === "__pending"}
          onClick={() => onFilterStatus("__pending")}
        />
        <KpiCell
          label="Approved" value={stats.approved} Icon={CheckCircle2} tone="good"
          active={filterStatus === "__approved"}
          onClick={() => onFilterStatus("__approved")}
        />
        <KpiCell
          label="Rejected" value={stats.rejected} Icon={ShieldAlert} tone="danger"
          active={filterStatus === "__rejected"}
          onClick={() => onFilterStatus("__rejected")}
        />
        <KpiCell label="Overdue" value={stats.overdue} Icon={AlertTriangle} tone="danger" />
        <KpiCell label="At risk" value={reviewsAtRisk} Icon={TrendingUp} tone="warn" sub="forecast" />
      </div>

      <ListTruncationNotice count={rows.length} label="submittals" />

      {/* ── Filter bar (kit FilterBar: search + Status/BIC selects + actions) ── */}
      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search # / title / spec section"
        primaryLabel={canCreate ? "New Submittal" : undefined}
        onPrimary={canCreate ? onNewSubmittal : null}
        secondaryActions={
          canCreate ? (
            <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onBulkAdd}>Bulk Add</button>
          ) : null
        }
        filters={
          <>
            {/* Master select-all operates on the filtered list so it respects
                the active Status / BIC filters. Indeterminate is set
                imperatively because React has no checkbox prop for it. */}
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--cmd-text-muted)", cursor: filtered.length === 0 ? "not-allowed" : "pointer" }}>
              <input
                type="checkbox"
                className="cmd-check"
                aria-label="Select all visible submittals"
                ref={(el) => {
                  if (!el) return;
                  const some = filtered.some((r) => selectedIds.has(r.id as string));
                  el.indeterminate = some && !allSelected;
                }}
                checked={allSelected}
                onChange={toggleAll}
                disabled={filtered.length === 0}
                style={{ accentColor: "var(--cmd-gold)", cursor: filtered.length === 0 ? "not-allowed" : "pointer" }}
              />
              All
            </label>
            <select
              className="sbd-select"
              aria-label="Filter by status"
              value={filterStatus}
              onChange={(e) => onFilterStatus(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 8, fontSize: 12, minHeight: 34 }}
            >
              <option value="all">All Statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              className="sbd-select"
              aria-label="Filter by ball-in-court"
              value={filterBIC}
              onChange={(e) => onFilterBIC(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 8, fontSize: 12, minHeight: 34 }}
            >
              <option value="all">Any Ball-in-Court</option>
              {BIC_CHOICES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </>
        }
      />

      {/* ── Register body: list + detail (reused verbatim) ─────────────── */}
      <div className="cmd-table-wrap" style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden", padding: 0 }}>
        {list}
        {detail}
      </div>
    </div>
  );
}
