import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { daysUntil } from "@/lib/dateMath";
import { formatDate } from "@/components/shared/formatters";
import { submittalStatusToStage, isRRStatus, CLOSED_SUBMITTAL_STATUSES } from "@/lib/submittalStageMapping";
import { nextSubmittalAction } from "@/lib/submittalActionEngine";
import { STAGE_MAP } from "@/components/drawings/drawingsConfig";
import { formatDrawingSetNumber, sortDrawingSetPackages } from "@/lib/drawingSetOrdering";
import CommentThreadRaw from "@/components/collaboration/CommentThread";
import RoundTimelineRaw from "@/components/submittals/RoundTimeline";
import ResponseMatrixRaw from "@/components/submittals/ResponseMatrix";
import SubmittalForecastCard from "@/components/submittals/SubmittalForecastCard";
import { buildResponseMatrix } from "@/lib/submittalResubmittal";
import { forecastSubmittal } from "@/lib/submittalForecast";
import type { CycleStats } from "@/lib/submittalForecast";
import { LinkedRFIs as LinkedRFIsRaw, LinkedTasks as LinkedTasksRaw } from "@/components/submittals/LinkedEntities";
import SubmittalReviewStripRaw from "@/components/submittals/SubmittalReviewStrip";
import ApprovalChainPanelRaw from "@/components/submittals/ApprovalChainPanel";
import {
  buildSubmittalLineageGroups,
  getSubmittalLineage,
  submittalLineageLabel,
  type SubmittalLineageRow,
} from "@/lib/submittalLineage";
import {
  DRAWING_TYPES,
  DRAWING_TYPE_ABBR,
  buildComponentChips,
  componentState,
  missingDrawingTypes,
  sortComponents,
  type DrawingType,
  type SubmittalComponent,
} from "@/lib/submittalComponents";
import { BIC_CHOICES, STATUSES, STATUS_CFG, TYPES } from "./format";
import type { DrawingSet, DrawingSetsById, Submittal, SubmittalRoundRecord } from "./types";

// These children are still .jsx, so TS infers their array props from `[]`
// default params as `never[]`; cast at the boundary (removable once each is
// typed) so the typed parent can pass real arrays. Runtime is unchanged.
const CommentThread = CommentThreadRaw as unknown as ComponentType<Record<string, any>>;
const ApprovalChainPanel = ApprovalChainPanelRaw as unknown as ComponentType<Record<string, any>>;
const RoundTimeline = RoundTimelineRaw as unknown as ComponentType<Record<string, any>>;
const ResponseMatrix = ResponseMatrixRaw as unknown as ComponentType<Record<string, any>>;
const SubmittalReviewStrip = SubmittalReviewStripRaw as unknown as ComponentType<Record<string, any>>;
const LinkedRFIs = LinkedRFIsRaw as unknown as ComponentType<Record<string, any>>;
const LinkedTasks = LinkedTasksRaw as unknown as ComponentType<Record<string, any>>;

// Phase 3 splitting: the "Spin off child" action is only offered once a
// submittal has reached an approved/terminal disposition — the split scope
// (e.g. "Gate Posts") is defined against approved parent content, so splitting
// a Draft/Under-Review submittal would be premature.
const SPLIT_ELIGIBLE_STATUSES = new Set<string>([
  "Approved",
  "Approved as Noted",
  "Released for Fabrication",
]);

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

// ── Row ──────────────────────────────────────────────────────────────

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

// ── Detail panel ─────────────────────────────────────────────────────

interface SubmittalDetailProps {
  submittal: Submittal | null;
  allSubmittals?: Submittal[];
  drawingSets?: DrawingSet[];
  rounds?: SubmittalRoundRecord[];
  allRfis?: any[];
  allTasks?: any[];
  projectName?: string;
  /** Active project record — used for project-defined approval-route templates. */
  project?: any;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: string) => void;
  onBICChange: (bic: string) => void;
  onFieldChange: (patch: Record<string, any>) => void;
  onNewRound?: () => void;
  onReturnRound: (roundId: string) => void;
  /** Per-sheet reviewer responses for this submittal's rounds (response matrix). */
  sheetResponses?: any[];
  /** Project drawings — resolve a blank sheet number / title in the matrix. */
  drawings?: any[];
  /** Project-wide review-cycle stats (for the return forecast). */
  cycleStats?: CycleStats | null;
  /** Today as 'YYYY-MM-DD' (injected — never new Date() in render). */
  today?: string;
  /** Advance the submittal one step in the canonical flow (status + BIC together). */
  onAdvance?: (action: { nextStatus: string | null; nextBallInCourt: string | null; label: string; nextStage: string | null; chainStepIndex?: number }) => void;
  /**
   * When true (from the `submittal_approved_to_scrub` flag), a BFA "Approved"
   * routes to the detailer scrub (OFS) like "Approved as Noted" instead of
   * skipping to IFC. Defaults to false — legacy behavior.
   */
  approvedRoutesToScrub?: boolean;
  /**
   * Phase 3 splitting (flag `submittal_splitting`): when true, show the "Spin
   * off child" action + the lineage card. Defaults to false — nothing renders.
   */
  splittingEnabled?: boolean;
  /** Open the spin-off form with this submittal as the parent (Phase 3). */
  onSpinOff?: () => void;
  /** Navigate the detail panel to a sibling submittal by id (Phase 3 lineage links). */
  onSelectSubmittal?: (id: string) => void;
  /**
   * Phase 4 per-drawing-type (flag `submittal_drawing_types`): when true, show
   * the per-type (Shop/Erection/Part) received + release section. Defaults to
   * false — nothing renders. Independent of the fab-release gate.
   */
  drawingTypesEnabled?: boolean;
  /** This submittal's component rows (one per tracked drawing type). */
  components?: SubmittalComponent[];
  /** Set (or clear) a type's received date. */
  onComponentSetReceived?: (args: { drawingType: DrawingType; existing: SubmittalComponent | null; date: string | null }) => void;
  /** Release / un-release a type for fabrication (parallel to the fab gate). */
  onComponentSetReleased?: (args: { drawingType: DrawingType; existing: SubmittalComponent | null; released: boolean }) => void;
  /** Start tracking a drawing type (create an empty component row). */
  onComponentAddType?: (drawingType: DrawingType) => void;
  /** Stop tracking a drawing type (remove its component row). */
  onComponentRemoveType?: (component: SubmittalComponent) => void;
}

export function SubmittalDetail({ submittal, allSubmittals = [], drawingSets = [], rounds = [], allRfis = [], allTasks = [], projectName = "Project", project = null, onClose, onEdit, onDelete, onStatusChange, onBICChange, onFieldChange, onNewRound, onReturnRound, sheetResponses = [], drawings = [], cycleStats = null, today = "", onAdvance, approvedRoutesToScrub = false, splittingEnabled = false, onSpinOff, onSelectSubmittal, drawingTypesEnabled = false, components = [], onComponentSetReceived, onComponentSetReleased, onComponentAddType, onComponentRemoveType }: SubmittalDetailProps) {
  // Round-over-round per-sheet disposition matrix (computed before any early
  // return to keep hook order stable). Empty-safe — renders nothing when the
  // submittal has no recorded reviewer responses.
  const responseMatrix = useMemo(
    () => buildResponseMatrix({ rounds, responses: sheetResponses, drawings }),
    [rounds, sheetResponses, drawings],
  );
  // Review-return forecast for a pending submittal (also before any early
  // return). Empty-safe — `forecastable:false` when not under review, no sent
  // date, or no stats yet, in which case the section renders nothing.
  const forecast = useMemo(
    () =>
      cycleStats && today
        ? forecastSubmittal({ submittal: submittal as any, rounds, stats: cycleStats, today })
        : { forecastable: false },
    [submittal, rounds, cycleStats, today],
  );
  const navigate = useNavigate();
  // Related RFIs surfaced via the drawing-set link (NOT the manual
  // submittal.linked_rfi_ids list). The real submittal↔RFI link is the
  // scalar `rfis.drawing_set_id` matched against the submittal's
  // drawing_set_ids[] — this is read-only and DISTINCT from "Linked RFIs"
  // so set-assigned RFIs show up in the register. Computed before any early
  // return to keep hook order stable.
  const relatedSetRfis = useMemo(() => {
    const setIds = Array.isArray(submittal?.drawing_set_ids) ? submittal!.drawing_set_ids : [];
    if (!setIds.length || !Array.isArray(allRfis)) return [];
    const linkedManual = new Set(
      Array.isArray(submittal?.linked_rfi_ids) ? submittal!.linked_rfi_ids : [],
    );
    return allRfis.filter(
      (rfi: any) =>
        rfi?.drawing_set_id &&
        setIds.includes(rfi.drawing_set_id) &&
        !linkedManual.has(rfi.id),
    );
  }, [submittal, allRfis]);
  // Phase 3 lineage: this submittal's immediate parent + spun-off children,
  // resolved against the project's submittals. Computed before any early return
  // to keep hook order stable; empty-safe when the flag is off / no lineage.
  const lineage = useMemo(
    () => getSubmittalLineage(submittal, allSubmittals),
    [submittal, allSubmittals],
  );
  // Wrap onFieldChange so a no-op edit (typing the same value back)
  // doesn't fire a network update — small UX nicety, also stops
  // accidental "Updated" toasts when the user just tabs through.
  const patch = (field: string, value: any) => {
    if (!submittal || !onFieldChange) return;
    if ((submittal[field] ?? "") === (value ?? "")) return;
    onFieldChange({ [field]: value === "" ? null : value });
  };
  if (!submittal) {
    return (
      <div style={{ width: 480, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6, color: "var(--text-muted)", background: "var(--bg-page, #0D1117)" }}>
        <div style={{ fontSize: 32 }}>◆</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}>Select a submittal</div>
      </div>
    );
  }

  const cfg = STATUS_CFG[submittal.status ?? ""] || STATUS_CFG.Draft;
  const overdue =
    submittal.required_date &&
    !["Approved", "Approved as Noted", "Released for Fabrication", "Void"].includes(submittal.status ?? "") &&
    daysUntil(submittal.required_date) < 0;

  return (
    <div style={{ width: 480, flexShrink: 0, display: "flex", flexDirection: "column", background: "var(--bg-page, #0D1117)", minHeight: 0 }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--divider)", background: "rgba(255,255,255,0.04)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 800, color: "var(--accent)", letterSpacing: "0.08em" }}>
              {submittal.submittal_number}
              {submittal.total_rounds > 1 && <span style={{ marginLeft: 8, color: "var(--status-warning)" }}>ROUND {submittal.total_rounds}</span>}
            </div>
            <InlineText
              value={submittal.title}
              onCommit={(v) => patch("title", v)}
              required
              style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.3 }}
              placeholder="Untitled submittal"
            />
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 3, color: cfg.color, background: cfg.bg }}>
                {submittal.status}
              </span>
              {/* BIC chip — a completed submittal (Released for Fabrication /
                  Void) has its ball cleared, so show "Closed" rather than a
                  stale reviewer or nothing. */}
              {(CLOSED_SUBMITTAL_STATUSES.has(submittal.status ?? "") || submittal.ball_in_court) && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 3, color: "var(--text-secondary)", background: "var(--bg-surface-high)" }}>
                  BIC · {CLOSED_SUBMITTAL_STATUSES.has(submittal.status ?? "") ? "Closed" : submittal.ball_in_court}
                </span>
              )}
              {overdue && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--status-error)" }}>
                  ⚠ {Math.abs(daysUntil(submittal.required_date))}d overdue
                </span>
              )}
              {/* Phase 4: S/E/P chips — each tracked drawing type's received/
                  released state at a glance. Rendered only under the flag. */}
              {drawingTypesEnabled && <SubmittalTypeChips components={components} />}
            </div>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 20, marginLeft: 10 }}>×</button>
        </div>

        {/* Verb-driven next-step CTA — one click advances the canonical
            workflow (status + ball-in-court together). Disabled at terminals. */}
        {onAdvance && (() => {
          const action = nextSubmittalAction(submittal, { approvedRoutesToScrub });
          return (
            <button
              type="button"
              className="sbd-btn-primary"
              disabled={action.disabled}
              onClick={() => !action.disabled && onAdvance(action)}
              title={action.disabled ? "No further workflow step" : `Set to ${action.nextStage} (${action.nextStatus}${action.nextBallInCourt ? ` · BIC ${action.nextBallInCourt}` : ""})`}
              style={{
                marginTop: 12, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                minHeight: 38, opacity: action.disabled ? 0.55 : 1, cursor: action.disabled ? "default" : "pointer",
              }}
            >
              {action.label}{!action.disabled && " →"}
            </button>
          );
        })()}

        {/* Phase 3 splitting: "Spin off child" — surfaced once the submittal is
            approved/terminal (the split scope is only known after approval, e.g.
            ARCH/MISC approved → later "Gate Posts"). Opens the new-submittal form
            prefilled with this submittal as the parent. Flag-gated by the parent. */}
        {splittingEnabled && onSpinOff && SPLIT_ELIGIBLE_STATUSES.has(submittal.status ?? "") && (
          <button
            type="button"
            onClick={onSpinOff}
            title="Create a child submittal that links back to this one"
            style={{
              marginTop: 8, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
              minHeight: 34, background: "transparent", border: "1px dashed var(--accent)", borderRadius: 4,
              color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
              cursor: "pointer", textTransform: "uppercase",
            }}
          >
            ⑃ Spin off child
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
        {/* Review engine strip — 5-stage deterministic pipeline */}
        <SubmittalReviewStrip
          submittal={submittal}
          allSubmittals={allSubmittals}
          drawingSets={drawingSets}
          rfis={allRfis}
          rounds={rounds}
          projectName={projectName}
        />

        {/* Phase 3 lineage — shown only under the flag AND only when this
            submittal actually has a parent or children. "Spun off from <parent>"
            when it's a child; a linked list of children when it's a parent. */}
        {splittingEnabled && (lineage.parent || lineage.children.length > 0) && (
          <DetailSection title="Lineage">
            {lineage.parent && (
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)", marginBottom: lineage.children.length > 0 ? 8 : 0 }}>
                Spun off from{" "}
                <button
                  type="button"
                  onClick={() => lineage.parent?.id && onSelectSubmittal?.(lineage.parent.id)}
                  style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}
                >
                  {submittalLineageLabel(lineage.parent)}
                </button>
                {submittal.split_reason && (
                  <span style={{ color: "var(--text-muted)" }}> — {submittal.split_reason}</span>
                )}
              </div>
            )}
            {lineage.children.length > 0 && (
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
                  Spun-off children ({lineage.children.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {lineage.children.map((child) => (
                    <div key={child.id} style={{ fontFamily: "var(--font-body)", fontSize: 12 }}>
                      <button
                        type="button"
                        onClick={() => child.id && onSelectSubmittal?.(child.id)}
                        style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}
                      >
                        {submittalLineageLabel(child)}
                      </button>
                      {child.split_reason && (
                        <span style={{ color: "var(--text-muted)" }}> — {child.split_reason}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DetailSection>
        )}

        {/* Phase 4 per-drawing-type tracking — Shop / Erection / Part, each with
            its own received date + release-for-fab toggle, tracked independently
            (Shop can release while Erection waits). Flag-gated; the release here
            is PARALLEL to (not part of) the submittals.status fab-release gate. */}
        {drawingTypesEnabled && submittal.id && submittal.project_id && (
          <DetailSection title="Drawing types (Shop / Erection / Part)">
            <DrawingTypeComponents
              submittalId={submittal.id}
              projectId={submittal.project_id}
              components={components}
              onSetReceived={(args) => onComponentSetReceived?.(args)}
              onSetReleased={(args) => onComponentSetReleased?.(args)}
              onAddType={(t) => onComponentAddType?.(t)}
              onRemoveType={(c) => onComponentRemoveType?.(c)}
            />
          </DetailSection>
        )}

        {/* Review forecast — for a submittal currently out for review, project
            the expected return from the shop's historical cycle time and flag
            late risk / fab impact. Hidden for non-pending submittals. */}
        {forecast.forecastable && (
          <DetailSection title="Review forecast">
            <SubmittalForecastCard forecast={forecast} />
          </DetailSection>
        )}

        {/* Status pills — click to transition */}
        <DetailSection title="Status workflow">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => s !== submittal.status && onStatusChange(s)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  border: s === submittal.status ? `1px solid ${cfg.color}` : "1px solid var(--border-default)",
                  background: s === submittal.status ? cfg.bg : "transparent",
                  color: s === submittal.status ? cfg.color : "var(--text-muted)",
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
                  cursor: s === submittal.status ? "default" : "pointer",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </DetailSection>

        {/* Ball-in-court chooser */}
        <DetailSection title="Ball in court">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {BIC_CHOICES.map((b) => (
              <button
                key={b}
                onClick={() => b !== submittal.ball_in_court && onBICChange(b)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  border: b === submittal.ball_in_court ? "1px solid var(--accent)" : "1px solid var(--border-default)",
                  background: b === submittal.ball_in_court ? "var(--accent-muted)" : "transparent",
                  color: b === submittal.ball_in_court ? "var(--accent)" : "var(--text-muted)",
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
                  cursor: b === submittal.ball_in_court ? "default" : "pointer",
                }}
              >
                {b}
              </button>
            ))}
          </div>
        </DetailSection>

        {/* Approval routing — optional multi-party chain (Detailer → GC →
            Architect → EOR). Drives WHO the verb CTA hands the ball to
            next; status stays the workflow truth (§20). */}
        <DetailSection title="Approval routing">
          <ApprovalChainPanel
            submittal={submittal}
            project={project}
            onFieldChange={onFieldChange}
          />
        </DetailSection>

        {/* Approval-cycle history — vertical timeline of all submittal
            rounds (one row per submit→return cycle) with cycle number,
            revision, status, resulting stage, durations, and BIC.
            "New Round" opens the next resubmission cycle. */}
        <DetailSection title={`Approval Cycles (${rounds.length})`}>
          <RoundTimeline
            rounds={rounds}
            submittal={submittal}
            submittalId={submittal.id}
            onReturnRound={onReturnRound}
          />
          {onNewRound && (() => {
            // After an R&R / Rejected return the next round IS the resubmittal,
            // so make that the obvious next action and label it as such — it
            // opens the round prefilled with the reviewer's open comments (§20).
            const isResubmit = ["Revise and Resubmit", "Rejected"].includes(submittal.status ?? "");
            const lastRoundNum = rounds.length
              ? (rounds[rounds.length - 1].round_number || rounds.length)
              : (submittal.total_rounds || 0);
            const nextRoundNum = (lastRoundNum || 0) + 1;
            return (
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={onNewRound}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 4,
                    background: isResubmit ? "#F97316" : "var(--accent)",
                    color: "#fff",
                    border: "none",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    cursor: "pointer",
                    textTransform: "uppercase",
                  }}
                >
                  {isResubmit ? `↻ Start Resubmittal — Round ${nextRoundNum}` : "+ New Round"}
                </button>
                {isResubmit && (
                  <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 8.5, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                    Carries the reviewer's open comments forward.
                  </div>
                )}
              </div>
            );
          })()}
        </DetailSection>

        {/* Response Matrix — each sheet's reviewer disposition across rounds
            (R1 R&R → R2 No Exception …). Only shows once a round has recorded
            per-sheet responses. */}
        {responseMatrix.rows.length > 0 && (
          <DetailSection title={`Response matrix (${responseMatrix.rows.length} sheet${responseMatrix.rows.length === 1 ? "" : "s"})`}>
            <ResponseMatrix columns={responseMatrix.columns} rows={responseMatrix.rows} />
          </DetailSection>
        )}

        {/* Meta grid — every cell is inline-editable. Click the value
            (or the dash for an empty field) to turn it into an
            editor; blur or Enter commits, Esc cancels. Saves a round
            trip through the Edit modal for one-field fixes like
            "submitted on the 14th, not the 15th." */}
        <DetailSection title="Details">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <EditableMeta
              label="Type"
              kind="select"
              value={submittal.submittal_type}
              choices={TYPES}
              allowClear
              onCommit={(v) => patch("submittal_type", v)}
            />
            <EditableMeta
              label="Discipline"
              value={submittal.discipline}
              onCommit={(v) => patch("discipline", v)}
            />
            <EditableMeta
              label="Spec Section"
              value={submittal.spec_section}
              onCommit={(v) => patch("spec_section", v)}
            />
            <EditableMeta
              label="Revision"
              value={submittal.revision}
              onCommit={(v) => patch("revision", v)}
            />
            <EditableMeta
              label="Submitted"
              kind="date"
              value={submittal.submitted_date}
              displayValue={formatDate(submittal.submitted_date)}
              onCommit={(v) => patch("submitted_date", v)}
            />
            <EditableMeta
              label="Required"
              kind="date"
              value={submittal.required_date}
              displayValue={formatDate(submittal.required_date)}
              warn={overdue}
              onCommit={(v) => patch("required_date", v)}
            />
            <EditableMeta
              label="Returned"
              kind="date"
              value={submittal.returned_date}
              displayValue={formatDate(submittal.returned_date)}
              onCommit={(v) => patch("returned_date", v)}
            />
            <EditableMeta
              label="Approved"
              kind="date"
              value={submittal.approved_date}
              displayValue={formatDate(submittal.approved_date)}
              onCommit={(v) => patch("approved_date", v)}
            />
            <EditableMeta
              label="Submitted by"
              value={submittal.submitted_by}
              onCommit={(v) => patch("submitted_by", v)}
            />
            <EditableMeta
              label="Reviewer"
              value={submittal.reviewer}
              onCommit={(v) => patch("reviewer", v)}
            />
            <EditableMeta
              label="Received From"
              value={submittal.received_from}
              onCommit={(v) => patch("received_from", v)}
            />
            <EditableMeta
              label="Distributed To"
              value={submittal.distributed_to}
              onCommit={(v) => patch("distributed_to", v)}
            />
            <EditableMeta
              label="Transmittal #"
              value={submittal.transmittal_number}
              onCommit={(v) => patch("transmittal_number", v)}
            />
            <EditableMeta
              label="Days in Review"
              value={submittal.days_in_review != null ? String(submittal.days_in_review) : ""}
              onCommit={(v) => patch("days_in_review", v ? parseInt(v, 10) : null)}
            />
          </div>
        </DetailSection>

        {/* Linked drawing sets — chips per linked set + a picker to
            link more. The submittal_drawing_sets relationship is
            stored as a uuid[] on the submittal row, so add/remove is
            a single-field patch on `drawing_set_ids`. */}
        <DetailSection title="Linked drawing sets">
          <LinkedDrawingSets
            value={submittal.drawing_set_ids || []}
            allSets={drawingSets}
            onChange={(next) => onFieldChange && onFieldChange({ drawing_set_ids: next })}
          />
        </DetailSection>

        {/* Linked RFIs */}
        <DetailSection title="Linked RFIs">
          <LinkedRFIs
            value={submittal.linked_rfi_ids || []}
            allRfis={allRfis}
            onChange={(next: string[]) => onFieldChange && onFieldChange({ linked_rfi_ids: next })}
          />
        </DetailSection>

        {/* Related RFIs (via drawing set) — read-only. RFIs assigned to one of
            this submittal's drawing sets, surfaced so set-assigned RFIs aren't
            invisible in the register. DISTINCT from the manual "Linked RFIs"
            list above; click a chip to open the RFI. Renders nothing when none. */}
        {relatedSetRfis.length > 0 && (
          <DetailSection title="Related RFIs (via drawing set)">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {relatedSetRfis.map((rfi: any) => {
                const num = rfi.rfi_number || rfi.number || "";
                const title = rfi.title || rfi.subject || "";
                const label = num && title ? `${num} — ${title}` : num || title || "(untitled RFI)";
                return (
                  <button
                    key={rfi.id}
                    type="button"
                    onClick={() => navigate(`${createPageUrl("RFIs")}?id=${rfi.id}`)}
                    title={`Open ${label}`}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "3px 10px", borderRadius: 999,
                      background: "var(--bg-surface-high)",
                      color: "var(--accent)",
                      border: "1px solid var(--accent)",
                      fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                      letterSpacing: "0.05em", maxWidth: 360, cursor: "pointer",
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </DetailSection>
        )}

        {/* Linked Tasks */}
        <DetailSection title="Linked Tasks">
          <LinkedTasks
            value={submittal.linked_task_ids || []}
            allTasks={allTasks}
            onChange={(next: string[]) => onFieldChange && onFieldChange({ linked_task_ids: next })}
          />
        </DetailSection>

        {/* Notes — always rendered (even when empty) so the user has a
            click target for adding the first note inline. */}
        <DetailSection title="Notes">
          <InlineTextarea
            value={submittal.notes || ""}
            onCommit={(v) => patch("notes", v)}
            placeholder="Click to add notes (cover-letter scope, known issues, etc.)"
          />
        </DetailSection>

        {/* Comments */}
        <DetailSection title="Discussion">
          <div style={{ height: 320 }}>
            <CommentThread
              entityType="submittal"
              entityId={submittal.id}
              projectId={submittal.project_id}
              compact
            />
          </div>
        </DetailSection>
      </div>

      <div style={{ padding: "12px 20px", borderTop: "1px solid var(--divider)", background: "rgba(255,255,255,0.04)", display: "flex", gap: 8 }}>
        <button
          onClick={onEdit}
          style={{ flex: 1, background: "var(--accent)", color: "#fff", border: "none", borderRadius: 4, padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: "0.08em" }}
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          style={{ background: "var(--bg-surface)", border: "1px solid var(--danger-border)", color: "var(--status-error)", borderRadius: 4, padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: "0.08em" }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ── Phase 4: per-drawing-type (Shop / Erection / Part) components ─────────
// Flag-gated by `submittal_drawing_types` at the page. S/E/P chips show each
// tracked type's state (not received / received / released); the detail-panel
// section lets the user set a received date + release toggle per type,
// independently. Release-per-type is a PARALLEL concern — it does NOT touch
// submittals.status or the fab-release gate.

// A small colored pill per tracked drawing type. Released = success tint;
// received = neutral-strong; not-received = muted outline. Ported from the
// standalone tracker's TypeChips.
export function SubmittalTypeChips({ components }: { components: SubmittalComponent[] }) {
  const chips = buildComponentChips(components);
  if (chips.length === 0) return null;
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      {chips.map((chip) => {
        const released = chip.state === "released";
        const received = chip.state === "received";
        const style: CSSProperties = released
          ? { color: "var(--status-success, #16a34a)", background: "var(--status-success-bg, rgba(22,163,74,0.14))", borderColor: "var(--status-success, #16a34a)" }
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

export interface DrawingTypeComponentsProps {
  submittalId: string;
  projectId: string;
  components: SubmittalComponent[];
  /** Set (or clear) a type's received date. */
  onSetReceived: (args: { drawingType: DrawingType; existing: SubmittalComponent | null; date: string | null }) => void;
  /** Release / un-release a type for fabrication. */
  onSetReleased: (args: { drawingType: DrawingType; existing: SubmittalComponent | null; released: boolean }) => void;
  /** Add an (empty) component row for a type not tracked yet. */
  onAddType: (drawingType: DrawingType) => void;
  /** Remove a type's component row entirely. */
  onRemoveType: (component: SubmittalComponent) => void;
}

export function DrawingTypeComponents({ components, onSetReceived, onSetReleased, onAddType, onRemoveType }: DrawingTypeComponentsProps) {
  const present = sortComponents(components).filter(
    (c): c is SubmittalComponent & { drawing_type: DrawingType } =>
      (DRAWING_TYPES as readonly string[]).includes(c.drawing_type),
  );
  const missing = missingDrawingTypes(components);

  return (
    <div>
      {present.length === 0 && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", fontStyle: "italic", marginBottom: 8 }}>
          No drawing types tracked yet. Add Shop, Erection, or Part below to track
          each independently.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {present.map((c) => {
          const state = componentState(c);
          const released = state === "released";
          return (
            <div
              key={c.drawing_type}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 4,
                border: "1px solid var(--border-default)",
                background: released ? "var(--status-success-bg, rgba(22,163,74,0.08))" : "var(--bg-surface-low)",
              }}
            >
              {/* Type label + state chip */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "0.04em" }}>
                  {DRAWING_TYPE_ABBR[c.drawing_type]}
                </span>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                  {c.drawing_type}
                </span>
              </div>

              {/* Received date control */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Rcvd
                </span>
                <input
                  type="date"
                  value={c.received_date || ""}
                  onChange={(e) => onSetReceived({ drawingType: c.drawing_type, existing: c, date: e.target.value || null })}
                  aria-label={`${c.drawing_type} received date`}
                  style={{
                    fontFamily: "var(--font-mono)", fontSize: 11, padding: "2px 6px",
                    background: "var(--bg-input, var(--bg-surface-low))",
                    border: "1px solid var(--border-default)", borderRadius: 3,
                    color: "var(--text-primary)", outline: "none", maxWidth: 140,
                  }}
                />
              </div>

              {/* Release toggle + remove */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, justifySelf: "end" }}>
                <button
                  type="button"
                  onClick={() => onSetReleased({ drawingType: c.drawing_type, existing: c, released: !released })}
                  title={released
                    ? `${c.drawing_type} released${c.released_date ? ` ${formatDate(c.released_date)}` : ""} — click to un-release`
                    : `Release ${c.drawing_type} for fabrication`}
                  style={{
                    padding: "3px 10px", borderRadius: 3, cursor: "pointer",
                    fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
                    border: released ? "1px solid var(--status-success, #16a34a)" : "1px solid var(--border-default)",
                    background: released ? "var(--status-success, #16a34a)" : "transparent",
                    color: released ? "#fff" : "var(--text-muted)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {released ? `RELEASED${c.released_date ? ` · ${formatDate(c.released_date)}` : ""}` : "RELEASE"}
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveType(c)}
                  title={`Stop tracking ${c.drawing_type}`}
                  aria-label={`Remove ${c.drawing_type}`}
                  style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 13, lineHeight: 1, padding: "0 2px" }}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add a not-yet-tracked type */}
      {missing.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {missing.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onAddType(t)}
              title={`Track ${t} drawings independently`}
              style={{
                padding: "4px 10px", borderRadius: 3, background: "transparent",
                border: "1px dashed var(--border-default)", color: "var(--accent)",
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                cursor: "pointer", textTransform: "uppercase",
              }}
            >
              + {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Inline-edit primitives ──────────────────────────────────────────
// Click-to-edit cells used throughout the SubmittalDetail panel.
// Common rules across all three:
//   • Esc cancels (restores prior value, exits edit mode).
//   • Enter commits for single-line; Cmd/Ctrl+Enter commits for
//     multi-line — bare Enter inside a textarea inserts a newline,
//     which is what users want for notes.
//   • Blur commits.
//   • A no-op commit (same value) silently exits without firing the
//     network call (the parent's `patch()` does the same guard but
//     belt-and-suspenders is cheap).

interface InlineTextProps {
  value?: string;
  onCommit: (value: string) => void;
  required?: boolean;
  style?: CSSProperties;
  placeholder?: string;
}

function InlineText({ value, onCommit, required, style, placeholder }: InlineTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  useEffect(() => { setDraft(value || ""); }, [value]);

  const commit = () => {
    const next = draft.trim();
    if (required && !next) { setDraft(value || ""); setEditing(false); return; }
    if (next === (value || "")) { setEditing(false); return; }
    onCommit(next);
    setEditing(false);
  };
  const cancel = () => { setDraft(value || ""); setEditing(false); };

  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        title="Click to edit"
        style={{
          ...style,
          cursor: "text",
          padding: "2px 0",
          borderBottom: "1px dashed transparent",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderBottom = "1px dashed var(--border-default)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderBottom = "1px dashed transparent"; }}
      >
        {value || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>{placeholder || "—"}</span>}
      </div>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        else if (e.key === "Escape") { e.preventDefault(); cancel(); }
      }}
      style={{
        ...style,
        width: "100%",
        background: "var(--bg-input, var(--bg-surface-low))",
        border: "1px solid var(--accent)",
        borderRadius: 3,
        padding: "2px 6px",
        outline: "none",
      }}
    />
  );
}

interface InlineTextareaProps {
  value?: string;
  onCommit: (value: string) => void;
  placeholder?: string;
}

function InlineTextarea({ value, onCommit, placeholder }: InlineTextareaProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  useEffect(() => { setDraft(value || ""); }, [value]);

  const commit = () => {
    if ((draft || "") === (value || "")) { setEditing(false); return; }
    onCommit(draft || "");
    setEditing(false);
  };
  const cancel = () => { setDraft(value || ""); setEditing(false); };

  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        title="Click to edit"
        style={{
          padding: "8px 10px",
          background: "var(--bg-surface-low)",
          border: "1px dashed var(--border-default)",
          borderRadius: 4,
          fontFamily: "var(--font-body)",
          fontSize: 12,
          whiteSpace: "pre-wrap",
          color: value ? "var(--text-primary)" : "var(--text-muted)",
          fontStyle: value ? "normal" : "italic",
          cursor: "text",
          minHeight: 40,
        }}
      >
        {value || (placeholder || "Click to add notes")}
      </div>
    );
  }
  return (
    <textarea
      autoFocus
      rows={4}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); cancel(); }
        else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
      }}
      style={{
        width: "100%",
        padding: "8px 10px",
        fontSize: 12,
        fontFamily: "var(--font-body)",
        background: "var(--bg-input, var(--bg-surface-low))",
        border: "1px solid var(--accent)",
        borderRadius: 4,
        resize: "vertical",
        outline: "none",
      }}
    />
  );
}

// LinkedDrawingSets — chip list of linked drawing sets with an add
// picker. The link is stored as `submittal.drawing_set_ids: uuid[]`,
// so add/remove just rewrites the array and patches the column.
//
// We render set names by joining against the project-wide drawingSets
// list passed in from the parent. A linked id with no matching set
// (deleted/soft-deleted set) still renders as a chip with a "(missing)"
// hint so the user can unlink it instead of being silently lost.
interface LinkedDrawingSetsProps {
  value?: string[];
  allSets?: DrawingSet[];
  onChange?: (next: string[]) => void;
}

function LinkedDrawingSets({ value = [], allSets = [], onChange }: LinkedDrawingSetsProps) {
  const [picking, setPicking] = useState(false);
  // Index live sets for O(1) lookups when rendering chips.
  const setsById = useMemo(() => {
    const m = new Map<string, DrawingSet>();
    allSets.forEach((s) => m.set(s.id as string, s));
    return m;
  }, [allSets]);

  // Sets the user can still pick (not already linked, not soft-deleted).
  const available = useMemo(
    () => sortDrawingSetPackages(allSets.filter((s) => !value.includes(s.id as string) && !s.is_deleted)),
    [allSets, value],
  );

  const remove = (id: string) => {
    if (!onChange) return;
    onChange(value.filter((v) => v !== id));
  };
  const add = (id: string) => {
    if (!onChange || !id) return;
    if (value.includes(id)) return;
    onChange([...value, id]);
    setPicking(false);
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
        {value.length === 0 && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", fontStyle: "italic" }}>
            No drawing sets linked.
          </span>
        )}
        {value.map((id) => {
          const set = setsById.get(id);
          const label = set
            ? `Set # ${formatDrawingSetNumber(set)} · ${set.set_name || "(unnamed set)"}${set.revision ? ` · R${set.revision}` : ""}`
            : "(missing set)";
          return (
            <span
              key={id}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "3px 4px 3px 10px", borderRadius: 999,
                background: set ? "var(--accent-muted)" : "var(--bg-surface-high)",
                color: set ? "var(--accent)" : "var(--text-muted)",
                border: set ? "1px solid var(--accent)" : "1px dashed var(--border-default)",
                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                maxWidth: 360,
              }}
              title={set?.discipline ? `${label} · ${set.discipline}` : label}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {label}
              </span>
              <button
                onClick={() => remove(id)}
                title="Unlink this drawing set"
                style={{
                  background: "transparent", border: "none", cursor: "pointer",
                  color: "inherit", padding: "0 4px", fontSize: 12, lineHeight: 1,
                }}
              >
                ×
              </button>
            </span>
          );
        })}
      </div>

      {picking ? (
        <select
          autoFocus
          defaultValue=""
          onChange={(e) => add(e.target.value)}
          onBlur={() => setPicking(false)}
          style={{
            fontFamily: "var(--font-mono)", fontSize: 10, padding: "4px 8px",
            background: "var(--bg-input)",
            border: "1px solid var(--accent)", borderRadius: 3,
            color: "var(--text-primary)", outline: "none",
            maxWidth: "100%",
          }}
        >
          <option value="">— pick a drawing set —</option>
          {available.length === 0 && (
            <option disabled value="__none">
              No more sets to link
            </option>
          )}
          {available.map((s) => (
            <option key={s.id} value={s.id}>
              {`Set # ${formatDrawingSetNumber(s)} · ${s.set_name || "(unnamed set)"}${s.revision ? ` · R${s.revision}` : ""}`}
              {s.discipline ? ` · ${s.discipline}` : ""}
            </option>
          ))}
        </select>
      ) : (
        <button
          onClick={() => setPicking(true)}
          disabled={available.length === 0}
          title={available.length === 0 ? "All project drawing sets are already linked" : "Link a drawing set to this submittal"}
          style={{
            padding: "4px 10px", borderRadius: 3,
            background: "transparent",
            border: "1px dashed var(--border-default)",
            color: available.length === 0 ? "var(--text-muted)" : "var(--accent)",
            fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
            cursor: available.length === 0 ? "not-allowed" : "pointer",
            textTransform: "uppercase",
          }}
        >
          + Link drawing set
        </button>
      )}
    </div>
  );
}

// EditableMeta — drop-in replacement for <Meta>. `kind` selects the
// editor: "text" (default), "date" (HTML date input), "select"
// (constrained to `choices`). For date cells, pass a pre-formatted
// `displayValue` for the read-only state; the underlying `value`
// stays in ISO so the date input round-trips cleanly.
interface EditableMetaProps {
  label: string;
  value?: any;
  displayValue?: string;
  kind?: "text" | "date" | "select";
  choices?: string[];
  allowClear?: boolean;
  warn?: any;
  onCommit: (value: any) => void;
}

function EditableMeta({ label, value, displayValue, kind = "text", choices, allowClear, warn, onCommit }: EditableMetaProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => { setDraft(value ?? ""); }, [value]);

  const commit = (next?: any) => {
    const v = next === undefined ? draft : next;
    if ((v ?? "") === (value ?? "")) { setEditing(false); return; }
    onCommit(v === "" ? null : v);
    setEditing(false);
  };
  const cancel = () => { setDraft(value ?? ""); setEditing(false); };

  const labelEl = (
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 2 }}>
      {label}
    </div>
  );

  if (!editing) {
    const shown = displayValue || value;
    return (
      <div>
        {labelEl}
        <div
          onClick={() => setEditing(true)}
          title="Click to edit"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12,
            color: warn ? "var(--status-error)" : (shown ? "var(--text-primary)" : "var(--text-muted)"),
            fontWeight: warn ? 700 : 500,
            cursor: "text",
            padding: "2px 0",
            borderBottom: "1px dashed transparent",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderBottom = "1px dashed var(--border-default)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderBottom = "1px dashed transparent"; }}
        >
          {shown || "—"}
        </div>
      </div>
    );
  }

  // Editing state — input shape depends on kind.
  const baseStyle: CSSProperties = {
    width: "100%",
    fontFamily: "var(--font-body)",
    fontSize: 12,
    background: "var(--bg-input, var(--bg-surface-low))",
    border: "1px solid var(--accent)",
    borderRadius: 3,
    padding: "2px 6px",
    outline: "none",
  };

  if (kind === "select") {
    return (
      <div>
        {labelEl}
        <select
          autoFocus
          value={draft || ""}
          onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}
          onBlur={() => commit()}
          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); cancel(); } }}
          style={baseStyle}
        >
          {allowClear && <option value="">— none —</option>}
          {(choices ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
    );
  }

  if (kind === "date") {
    return (
      <div>
        {labelEl}
        <input
          type="date"
          autoFocus
          value={draft || ""}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            else if (e.key === "Escape") { e.preventDefault(); cancel(); }
          }}
          style={baseStyle}
        />
      </div>
    );
  }

  return (
    <div>
      {labelEl}
      <input
        autoFocus
        value={draft || ""}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          else if (e.key === "Escape") { e.preventDefault(); cancel(); }
        }}
        style={baseStyle}
      />
    </div>
  );
}
