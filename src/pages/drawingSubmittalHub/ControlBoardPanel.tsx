/**
 * ControlBoardPanel — the canonical Detailing Control Board (overview tab).
 *
 * Presentation-only. Renders inside the canonical DetailingCommandShell
 * light island (whole-<html> [data-skin="command"]), so the kit's `cmd-*`
 * classes resolve. The hub (DrawingSubmittalHub.tsx) still owns every query,
 * mutation, cache key, and piece of state — this panel receives the exact same
 * read-models + handler callbacks shared by the hub, so behavior
 * is preserved.
 *
 * What this slice CONVERTS to kit primitives: the Next-Decision focus card, the
 * four triage queues (Critical / Pipeline / Due Soon / Missing Dates), and the
 * metric row — onto DecisionPanel / cmd-row / Pill.
 *
 * What this slice REUSES as-is (owner-directed, spec §10 low-risk path): the four
 * inline editors (owner / due-date / detailing-state / readiness) and the three
 * analytical sub-sections (Sequence Readiness / Model Mapping / Revision Impact),
 * imported from triageBoard.tsx. They already render light via the shipped token
 * cascade; passing the identical callbacks keeps their write paths unchanged.
 */
import {
  ArrowRight, FileQuestion, CircleDollarSign,
  AlertTriangle, Clock3, ShieldCheck, CalendarClock, ClipboardList,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DecisionPanel, Pill } from "@/components/command";
import type { PillTone } from "@/components/command";
import { buildControlBoardModel } from "./drawingControlCenter.derive";
import {
  InlineOwnerControl,
  InlineDateControl,
  InlineDetailingControl,
} from "./inlineControls";
import {
  ReadinessPanel,
  SequenceReadinessSection,
  ModelMappingSection,
  RevisionImpactSection,
} from "./triageBoard";
import {
  OperationalStateChip,
  RRChip,
  TriageMetric,
  EmptyState,
} from "./primitives";
import {
  canWriteDetailingState,
  canWriteDueDate,
  canWriteOwner,
  canWriteReadinessFlags,
  error, warning, review, textMuted,
} from "./format";
import LoadingSkeletonRaw from "@/components/shared/LoadingSkeleton";
import type { ComponentType } from "react";

type AnyProps = Record<string, any>;
const LoadingSkeleton = LoadingSkeletonRaw as unknown as ComponentType<AnyProps>;

type EscalationKind = "rfi" | "pco";

export interface ControlBoardPanelProps {
  triage: any;
  kpis: any;
  drawingKpis: any;
  isLoading: boolean;
  onOpenTab: (key: string) => void;
  /** Absent = the viewer lacks the project role these writes need (RLS: field+). */
  onUpdateOwner?: (item: any, owner: string) => void;
  onUpdateDueDate?: (item: any, date: string) => void;
  onAdvanceDetailing?: (item: any, next: string) => void;
  onToggleReadiness?: (item: any, field: "material_impacted" | "long_lead_impact", value: boolean) => void;
  sequenceReadiness: any[];
  revisionImpact: any[];
  isSaving: boolean;
  onEscalate?: (item: any, kind: EscalationKind) => void;
  onCompareRevision?: (drawingId: string) => void;
  modelMapping?: any;
  modelElementRows?: any[];
  /** Live member count from the HEAD-count query; null while it is still loading. */
  modelRosterCount?: number | null;
  modelRosterCountLoading?: boolean;
  /** True while the full roster is being paged in on demand. */
  modelRosterLoading?: boolean;
  onLoadModelRoster?: () => void;
  onImportModelElements?: () => void;
}

/** Map a triage item's due/action state to a kit Pill tone.
 *  board's colour semantics (overdue → danger, needs-action → review,
 *  due-soon → warn, else neutral). */
function itemTone(item: any): PillTone {
  if (item?.due?.overdue) return "danger";
  if (item?.needsAction) return "review";
  if (item?.due?.dueSoon) return "warn";
  return "neutral";
}

/** One clickable queue row that routes to the item's tab. */
function QueueRow({ item, onOpenTab }: { item: any; onOpenTab: (k: string) => void }) {
  return (
    <div
      className="cmd-row is-clickable"
      role="button"
      tabIndex={0}
      onClick={() => onOpenTab(item.routeTab)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenTab(item.routeTab);
        }
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div className="cmd-row__num" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.title}
        </div>
        <div className="cmd-row__meta">{item.group} · {item.owner}</div>
      </div>
      <Pill tone={itemTone(item)}>{item.due?.label || item.status}</Pill>
    </div>
  );
}

export default function ControlBoardPanel(props: ControlBoardPanelProps) {
  const navigate = useNavigate();
  const {
    triage, kpis, isLoading, onOpenTab,
    onUpdateOwner, onUpdateDueDate, onAdvanceDetailing, onToggleReadiness,
    sequenceReadiness, revisionImpact, isSaving,
    onEscalate, onCompareRevision, modelMapping, modelElementRows,
    modelRosterCount, modelRosterCountLoading, modelRosterLoading, onLoadModelRoster,
    onImportModelElements,
  } = props;

  if (isLoading) return <LoadingSkeleton />;

  const model = buildControlBoardModel(triage);
  // `focus` carries runtime-only fields the container augments (isRR,
  // _canDraft, _detailingStateRaw, _readiness) that aren't on the strict
  // TriageItem type — accessed loosely here at the read-model boundary
  // does (its triage prop is `any`). The derive layer stays strictly typed.
  const focus: any = model.focusItem;
  const focusRoute = focus?.routeTab || "matrix";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ── Next decision — focus item + inline editors ─────────────────── */}
      <DecisionPanel title="Next decision">
        {!focus ? (
          <EmptyState text="No overdue, due-soon, action, or missing-date work is currently flagged." />
        ) : (
          <>
            <div className="cmd-row__num" style={{ fontSize: 16, lineHeight: 1.25 }}>{focus.title}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              <span className="cmd-row__meta">{focus.group} · {focus.status}</span>
              {focus.detailingState && <OperationalStateChip state={focus.detailingState} />}
              {/* R&R is a first-class stage (2026-07-25): skip the extra badge
                  when the state chip itself already reads R&R. */}
              {focus.isRR && focus.detailingState !== "R&R" && <RRChip />}
            </div>

            {/* Inline owner + due-date editors (reused as-is). */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
              {/* Each control is disabled when its OWN write could not succeed
                  (canWrite* mirror the validators), so an enabled control always
                  means a click that lands. */}
              <InlineOwnerControl
                currentOwner={focus.owner}
                onAssign={(owner: string) => onUpdateOwner?.(focus, owner)}
                disabled={isSaving || !onUpdateOwner || !canWriteOwner(focus)}
                label={focus._ownerScope || "Owner"}
              />
              <InlineDateControl
                currentDate={focus.dueDate}
                isOverdue={focus.due?.overdue}
                onSetDate={(date: string) => onUpdateDueDate?.(focus, date)}
                disabled={isSaving || !onUpdateDueDate || !canWriteDueDate(focus)}
              />
            </div>

            {/* Detailing-state advance — drafting phase only. Gated on the write
                validator, not on _canDraft: the latter is satisfied by packages
                with no drawing_set_id, or whose effective state has already
                reached the formal workflow, both of which the write rejects. */}
            {focus.kind === "Drawing Set" && onAdvanceDetailing && canWriteDetailingState(focus) && (
              <InlineDetailingControl
                current={focus._detailingStateRaw}
                onAdvance={(next: string) => onAdvanceDetailing?.(focus, next)}
                disabled={isSaving}
              />
            )}

            {/* Backward schedule + readiness — drawing sets. The panel still
                RENDERS for any package with a readiness model (the backward
                dates are useful on their own); only the toggles are gated on
                having a drawing_set row to write them to. */}
            {focus.kind === "Drawing Set" && focus._readiness && (
              <ReadinessPanel
                readiness={focus._readiness}
                onToggle={(field: "material_impacted" | "long_lead_impact", value: boolean) => onToggleReadiness?.(focus, field, value)}
                disabled={isSaving || !onToggleReadiness || !canWriteReadinessFlags(focus)}
              />
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
              <button
                type="button"
                className="cmd-btn cmd-btn--primary"
                onClick={() => onOpenTab(focusRoute)}
              >
                Open Work <ArrowRight size={14} />
              </button>
              {focus.kind === "Drawing Set" && focus._drawingSetId && (focus._canDraft || focus._needsUnlinkedHint) && (
                <button
                  type="button"
                  className="cmd-btn cmd-btn--ghost"
                  onClick={() => navigate(`/Submittals?targetSetId=${encodeURIComponent(focus._drawingSetId)}`)}
                  title="Create a submittal linked to this drawing set"
                >
                  Create submittal
                </button>
              )}
              {onEscalate && (
                <>
                  <button
                    type="button"
                    className="cmd-btn cmd-btn--ghost"
                    onClick={() => onEscalate(focus, "rfi")}
                    title="Draft an RFI from this item"
                  >
                    <FileQuestion size={13} /> Draft RFI
                  </button>
                  <button
                    type="button"
                    className="cmd-btn cmd-btn--ghost"
                    onClick={() => onEscalate(focus, "pco")}
                    title="Draft a potential change order from this item"
                  >
                    <CircleDollarSign size={13} /> Draft PCO
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </DecisionPanel>

      {/* ── Metric row (reused TriageMetric primitive) ──────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        <TriageMetric icon={AlertTriangle} label="Overdue Sets" value={triage.overdueDrawingSets} color={error} sub={`${triage.overdueUnlinkedSubmittals} unlinked subs`} />
        {/* These two counted drawing sets ONLY while the queues directly below
            them list drawing sets AND unlinked submittals — tile said 2, list
            showed 6. Their labels are unscoped, so the value must be too. */}
        <TriageMetric icon={Clock3} label="Due This Week" value={triage.dueSoon.length} color={warning} sub="Next 7 days" />
        <TriageMetric icon={ShieldCheck} label="Needs Action" value={triage.needsAction.length} color={review} sub="Rejected / resubmit" />
        <TriageMetric icon={CalendarClock} label="Missing Dates" value={triage.noDate.length} color={textMuted} sub="Needs cleanup" />
        <TriageMetric icon={ClipboardList} label="Pending Review" value={kpis.pending} color={warning} sub={`${kpis.total} total submittals`} />
      </div>

      {/* ── Queues (kit DecisionPanel + cmd-row) ────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: 14 }}>
        <DecisionPanel title="Critical Work Queue" onViewAll={() => onOpenTab("matrix")}>
          {model.criticalItems.length === 0
            ? <EmptyState text="No critical work is currently queued." />
            : model.criticalItems.map((it) => <QueueRow key={it.id} item={it} onOpenTab={onOpenTab} />)}
        </DecisionPanel>
        <DecisionPanel title="Pipeline">
          {model.topStatuses.length === 0
            ? <EmptyState text="No open items." />
            : model.topStatuses.map(([status, count]) => (
                <div className="cmd-row" key={status}>
                  <div className="cmd-row__num">{status}</div>
                  <Pill tone="neutral">{count}</Pill>
                </div>
              ))}
        </DecisionPanel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: 14 }}>
        <DecisionPanel title="Due Next 7 Days">
          {model.dueSoon.length === 0
            ? <EmptyState text="No drawing or submittal due dates in the next week." />
            : model.dueSoon.map((it) => <QueueRow key={it.id} item={it} onOpenTab={onOpenTab} />)}
        </DecisionPanel>
        <DecisionPanel title="Missing Due Dates">
          {model.noDate.length === 0
            ? <EmptyState text="All open items have due dates." />
            : model.noDate.map((it) => <QueueRow key={it.id} item={it} onOpenTab={onOpenTab} />)}
        </DecisionPanel>
      </div>

      {/* ── Analytical sub-sections (reused as-is; light via token cascade) ── */}
      <SequenceReadinessSection rows={sequenceReadiness} />
      {onImportModelElements && (
        <ModelMappingSection
          summary={modelMapping}
          elements={modelElementRows}
          rosterCount={modelRosterCount}
          rosterCountLoading={modelRosterCountLoading}
          rosterLoading={modelRosterLoading}
          onLoadRoster={onLoadModelRoster}
          onImport={onImportModelElements}
        />
      )}
      <RevisionImpactSection rows={revisionImpact} onCompare={onCompareRevision} />
    </div>
  );
}
