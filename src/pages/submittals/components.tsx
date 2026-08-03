import { useMemo, useRef } from "react";
import type { CSSProperties } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { daysUntil } from "@/lib/dateMath";
import { formatDate } from "@/components/shared/formatters";
import { submittalStatusToStage, isRRStatus } from "@/lib/submittalStageMapping";
import { STAGE_MAP } from "@/components/drawings/drawingsConfig";
import { formatDrawingSetNumber } from "@/lib/drawingSetOrdering";
import {
  buildSubmittalLineageGroups,
  type SubmittalLineageRow,
} from "@/lib/submittalLineage";
import {
  buildComponentChips,
  type SubmittalComponent,
} from "@/lib/submittalComponents";
import { STATUS_CFG } from "./format";
import type { DrawingSetsById, Submittal } from "./types";

// ── Virtual list wrapper ───────────────────────────────────────────────

interface SubmittalVirtualListProps {
  filtered: Submittal[];
  isLoading: boolean;
  rows: Submittal[];
  selectedId: string | null;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  setSelectedId: (id: string) => void;
  drawingSetsById: DrawingSetsById;
  /**
   * Phase 3 splitting (flag `submittal_splitting`): when true, cluster child
   * submittals under their parent (indented, with a "N splits" badge + a "from
   * <parent>" hint), preserving the incoming sort for top-level rows. When false
   * (flag off) the list renders flat exactly as before.
   */
  groupByLineage?: boolean;
  /**
   * Phase 4 per-drawing-type (flag `submittal_drawing_types`): when true, render
   * S/E/P chips on each row. `componentsBySubmittal` maps submittal id → its
   * component rows. When false (flag off) no chips render.
   */
  showTypeChips?: boolean;
  componentsBySubmittal?: Record<string, SubmittalComponent[]>;
}

export function SubmittalVirtualList({ filtered, isLoading, rows, selectedId, selectedIds, toggleSelect, setSelectedId, drawingSetsById, groupByLineage = false, showTypeChips = false, componentsBySubmittal = {} }: SubmittalVirtualListProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  // Flatten to render rows once. Off ⇒ a trivial depth-0 wrapper over `filtered`
  // (identical order/behavior to before). On ⇒ the parent-grouped tree order.
  const renderRows = useMemo<Array<SubmittalLineageRow<Submittal>>>(
    () =>
      groupByLineage
        ? buildSubmittalLineageGroups(filtered)
        : filtered.map(
            (r): SubmittalLineageRow<Submittal> => ({ row: r, depth: 0, childCount: 0, parentId: null, parentName: null }),
          ),
    [filtered, groupByLineage],
  );
  const virtualizer = useVirtualizer({
    count: renderRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 10,
  });

  if (isLoading) {
    return (
      <div style={{ flex: 1, overflowY: "auto", borderRight: "1px solid var(--divider)" }}>
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>Loading…</div>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div style={{ flex: 1, overflowY: "auto", borderRight: "1px solid var(--divider)" }}>
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          {rows.length === 0 ? "No submittals yet. Click NEW SUBMITTAL to log one." : "No submittals match the current filters."}
        </div>
      </div>
    );
  }

  return (
    <div ref={parentRef} style={{ flex: 1, overflowY: "auto", borderRight: "1px solid var(--divider)" }}>
      <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = renderRows[virtualRow.index];
          const r = item.row;
          return (
            <div
              key={r.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
            >
              <SubmittalRow
                row={r}
                selected={r.id === selectedId}
                checked={selectedIds.has(r.id as string)}
                onToggle={() => toggleSelect(r.id as string)}
                onClick={() => setSelectedId(r.id as string)}
                drawingSetsById={drawingSetsById}
                depth={item.depth}
                childCount={item.childCount}
                parentName={item.parentName}
                typeChipComponents={showTypeChips ? (componentsBySubmittal[r.id as string] || []) : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface SubmittalRowProps {
  row: Submittal;
  selected: boolean;
  checked: boolean;
  onToggle?: () => void;
  onClick: () => void;
  drawingSetsById?: DrawingSetsById;
  /** Phase 3 lineage: indent depth (0 = top-level). */
  depth?: number;
  /** Phase 3 lineage: number of direct children (drives the "N splits" badge). */
  childCount?: number;
  /** Phase 3 lineage: parent label for a child row ("(removed)" if orphaned); null when top-level. */
  parentName?: string | null;
  /** Phase 4: this row's component rows (S/E/P chips). undefined ⇒ flag off, no chips. */
  typeChipComponents?: SubmittalComponent[];
}

function SubmittalRow({ row, selected, checked, onToggle, onClick, drawingSetsById, depth = 0, childCount = 0, parentName = null, typeChipComponents }: SubmittalRowProps) {
  const cfg = STATUS_CFG[row.status ?? ""] || STATUS_CFG.Draft;
  // Derived workflow stage — gives users IFA/OFA/BFA/OFS/IFC/Released
  // alongside the literal submittal status. R&R outcomes are surfaced
  // explicitly so users can see "looped back to IFA" at a glance.
  const stage = submittalStatusToStage(row.status, row.ball_in_court, row.approved_date);
  const stageCfg = stage ? STAGE_MAP[stage] : null;
  const showRR = isRRStatus(row.status);
  const linkedSets = Array.isArray(row.drawing_set_ids)
    ? row.drawing_set_ids.map((id) => drawingSetsById?.get(id)).filter(Boolean)
    : [];
  const primarySet = linkedSets[0] || null;
  const overdue =
    row.required_date &&
    !["Approved", "Approved as Noted", "Released for Fabrication", "Void"].includes(row.status ?? "") &&
    daysUntil(row.required_date) < 0;

  // The list is dense — give each row a status-tinted left rail and a
  // very faint status-tinted background wash so adjacent statuses
  // separate visually before the user even reads the chip.
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open submittal ${row.submittal_number || row.title || ""}`}
      onClick={onClick}
      onKeyDown={(e) => {
        // Only Enter/Space that originate on the row itself open the detail —
        // key events bubbling up from the nested selection checkbox (Space
        // toggles it) must not also pop the panel.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--divider)",
        cursor: "pointer",
        background: selected
          ? "var(--accent-muted)"
          : `linear-gradient(90deg, ${cfg.bg} 0%, transparent 22%)`,
        borderLeft: `3px solid ${selected ? "var(--accent)" : cfg.color}`,
      }}
      onMouseEnter={(e) => {
        if (selected) return;
        e.currentTarget.style.background =
          `linear-gradient(90deg, ${cfg.bg} 0%, var(--hover-bg) 30%)`;
      }}
      onMouseLeave={(e) => {
        if (selected) return;
        e.currentTarget.style.background =
          `linear-gradient(90deg, ${cfg.bg} 0%, transparent 22%)`;
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        {/* Selection checkbox — stops propagation so toggling the
            checkbox doesn't also pop the detail panel for that row.
            Hit area is intentionally larger than the input itself
            (10px padding around) for thumb-friendliness on tablets. */}
        <div
          onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
          style={{ padding: "2px 6px 2px 0", display: "flex", alignItems: "center", cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={!!checked}
            onChange={(e) => { e.stopPropagation(); onToggle?.(); }}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select submittal ${row.submittal_number || row.title}`}
            style={{ margin: 0, cursor: "pointer" }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0, paddingLeft: depth > 0 ? depth * 16 : 0 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, color: "var(--accent)", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 6 }}>
            {/* Child indicator — a corner arrow marks a spun-off child row. */}
            {depth > 0 && <span title="Spun-off child" style={{ color: "var(--text-muted)", fontWeight: 700 }}>↳</span>}
            <span>{row.submittal_number}</span>
            {row.total_rounds > 1 && <span style={{ color: "var(--status-warning)" }}>R{row.total_rounds}</span>}
            {/* "N splits" badge — how many children were spun off this parent. */}
            {childCount > 0 && (
              <span
                title={`${childCount} child submittal${childCount === 1 ? "" : "s"} spun off`}
                style={{ padding: "1px 6px", borderRadius: 3, background: "var(--accent-muted)", color: "var(--accent)", fontSize: 8, fontWeight: 700, letterSpacing: "0.04em" }}
              >
                {childCount} SPLIT{childCount === 1 ? "" : "S"}
              </span>
            )}
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {row.title}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
            {primarySet ? `Set # ${formatDrawingSetNumber(primarySet)} · ${primarySet.set_name || "Drawing set"} · ` : ""}
            {row.spec_section ? `Spec ${row.spec_section} · ` : ""}
            {row.discipline || row.submittal_type || ""}
          </div>
          {/* Lineage hint on a child row — which parent it was spun off from. */}
          {parentName && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, color: "var(--text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              from {parentName}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
            {/* Derived workflow-stage chip — shows IFA/OFA/BFA/R&R/OFS/IFC/
                Released so the user can see workflow position at a
                glance, not just the raw submittal status. R&R statuses
                derive the first-class R&R stage (2026-07-25), so the chip
                itself reads R&R — no extra loop suffix needed. */}
            {stageCfg && (
              <span
                title={`Workflow stage: ${stageCfg.label}${showRR ? " — Revise and Resubmit" : ""}`}
                style={{
                  fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                  padding: "2px 6px", borderRadius: 3, letterSpacing: "0.06em",
                  color: stageCfg.color, background: stageCfg.bg, whiteSpace: "nowrap",
                }}
              >
                {stageCfg.label}
              </span>
            )}
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              padding: "2px 8px", borderRadius: 3, letterSpacing: "0.06em",
              color: cfg.color, background: cfg.bg, whiteSpace: "nowrap",
            }}>
              {row.status}
            </span>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: overdue ? "var(--status-error)" : "var(--text-muted)", marginTop: 4 }}>
            {row.required_date ? formatDate(row.required_date) : "—"}
            {overdue && " ⚠"}
          </div>
          {/* Phase 4: S/E/P chips — each tracked drawing type's state. Rendered
              only when the flag passes components down (undefined ⇒ nothing). */}
          {typeChipComponents && typeChipComponents.length > 0 && (
            <div style={{ marginTop: 4, display: "flex", justifyContent: "flex-end" }}>
              <SubmittalTypeChips components={typeChipComponents} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SubmittalTypeChips({ components }: { components: SubmittalComponent[] }) {
  const chips = buildComponentChips(components);
  if (chips.length === 0) return null;
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      {chips.map((chip) => {
        const released = chip.state === "released";
        const received = chip.state === "received";
        const style: CSSProperties = released
          ? { color: "var(--status-success, var(--status-success))", background: "var(--status-success-bg, var(--success-muted))", borderColor: "var(--status-success, var(--status-success))" }
          : received
            ? { color: "var(--text-primary)", background: "var(--bg-surface-high)", borderColor: "var(--border-strong, var(--border-default))" }
            : { color: "var(--text-muted)", background: "transparent", borderColor: "var(--border-default)" };
        return (
          <span
            key={chip.drawingType}
            title={chip.title}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              height: 16, minWidth: 16, padding: "0 3px", borderRadius: 3,
              border: "1px solid", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              ...style,
            }}
          >
            {chip.abbr}
          </span>
        );
      })}
    </span>
  );
}
