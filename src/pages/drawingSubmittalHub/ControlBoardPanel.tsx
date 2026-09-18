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
import { DateRiskCell, DecisionPanel, Pill, StatusBadge, WorkflowStage } from "@/components/command";
import type { PillTone } from "@/components/command";
import { adaptControlBoardFocus, buildControlBoardModel, buildProductionReadinessQueue } from "./drawingControlCenter.derive";
import type { HubTabKey } from "./hubLinks";
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
  error, warning, review, textMuted,
} from "./format";
import LoadingSkeletonRaw from "@/components/shared/LoadingSkeleton";
import type { ComponentType } from "react";
import type { ElementStatusSummary } from "@/services/modelElementStatus";
import type {
  DrawingKpis,
  ModelElementViewRow,
  RevisionImpactViewRow,
  SequenceReadinessRow,
  SubmittalKpis,
  TriageItem,
  TriageModel,
} from "./types";
import { useControlBoardNavigation } from "./useControlBoardNavigation";

type AnyProps = Record<string, any>;
const LoadingSkeleton = LoadingSkeletonRaw as unknown as ComponentType<AnyProps>;

type EscalationKind = "rfi" | "pco";

const APPROVAL_LIFECYCLE = ["IFA", "OFA", "BFA", "OFS", "IFC", "Released"] as const;

function approvalStages(current?: string | null) {
  const currentIndex = APPROVAL_LIFECYCLE.indexOf(current as (typeof APPROVAL_LIFECYCLE)[number]);
  const rr = current === "R&R";
  return APPROVAL_LIFECYCLE.map((stage, index) => ({
    id: stage,
    label: stage,
    state:
      rr && stage === "BFA"
        ? "blocked" as const
        : currentIndex >= 0 && index < currentIndex
          ? "complete" as const
          : currentIndex >= 0 && index === currentIndex
            ? "current" as const
            : "upcoming" as const,
  }));
}

export interface ControlBoardPanelProps {
  triage: TriageModel;
  kpis: SubmittalKpis;
  drawingKpis: DrawingKpis;
  isLoading: boolean;
  onOpenTab: (key: HubTabKey) => void;
  /**
   * Opens an in-hub href (the hub passes a push-navigate). When given, queue
   * rows and Open Work open the item's record (hubHrefForTriageItem), and
   * Create submittal opens create on the hub's Submittal Register. Absent:
   * rows and Open Work fall back to onOpenTab(routeTab), and Create
   * submittal to the standalone /Submittals page.
   */
  onOpenHref?: (href: string) => void;
  /** Absent = the viewer lacks the project role these writes need (RLS: field+). */
  onUpdateOwner?: (item: TriageItem, owner: string) => void;
  onUpdateDueDate?: (item: TriageItem, date: string) => void;
  onAdvanceDetailing?: (item: TriageItem, next: string) => void;
  onToggleReadiness?: (item: TriageItem, field: "material_impacted" | "long_lead_impact", value: boolean) => void;
  sequenceReadiness: SequenceReadinessRow[];
  revisionImpact: RevisionImpactViewRow[];
  isSaving: boolean;
  onEscalate?: (item: TriageItem, kind: EscalationKind) => void;
  onCompareRevision?: (drawingId: string) => void;
  modelMapping?: ElementStatusSummary | null;
  modelElementRows?: ModelElementViewRow[];
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
function itemTone(item: TriageItem): PillTone {
  if (item?.due?.overdue) return "danger";
  if (item?.needsAction) return "review";
  if (item?.due?.dueSoon) return "warn";
  return "neutral";
}

/** One clickable queue row. In the hub it opens the item's record (its
 *  governing submittal, else its set's Sets & revisions view, else its tab);
 *  without onOpenHref it routes to the item's tab. */
function QueueRow({
  item,
  onOpen,
}: {
  item: TriageItem;
  onOpen: (item: TriageItem) => void;
}) {
  const open = () => onOpen(item);
  return (
    <div
      className="cmd-row is-clickable"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
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
  const {
    triage, kpis, isLoading, onOpenTab, onOpenHref,
    onUpdateOwner, onUpdateDueDate, onAdvanceDetailing, onToggleReadiness,
    sequenceReadiness, revisionImpact, isSaving,
    onEscalate, onCompareRevision, modelMapping, modelElementRows,
    modelRosterCount, modelRosterCountLoading, modelRosterLoading, onLoadModelRoster,
    onImportModelElements,
  } = props;
  const { openItem, createSubmittal } = useControlBoardNavigation({ onOpenTab, onOpenHref });

  if (isLoading) return <LoadingSkeleton />;

  const model = buildControlBoardModel(triage);
  const focusView = adaptControlBoardFocus(model.focusItem);
  const focus = focusView?.item ?? null;
  const productionReadiness = buildProductionReadinessQueue(triage);

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

            <div style={{ marginTop: 12 }}>
              <WorkflowStage
                stages={approvalStages(focus.detailingState || focus.status)}
                currentStage={focus.detailingState || focus.status}
                compact
                ariaLabel="Detailing approval lifecycle"
              />
            </div>

            {/* Inline owner + due-date editors (reused as-is). */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
              {/* Each control is disabled when its OWN write could not succeed
                  (canWrite* mirror the validators), so an enabled control always
                  means a click that lands. */}
              <InlineOwnerControl
                currentOwner={focus.owner}
                onAssign={(owner: string) => onUpdateOwner?.(focus, owner)}
                disabled={isSaving || !onUpdateOwner || !focusView?.writeAccess.owner}
                label={focusView?.ownerLabel || "Owner"}
              />
              <InlineDateControl
                currentDate={focus.dueDate}
                isOverdue={focus.due?.overdue}
                onSetDate={(date: string) => onUpdateDueDate?.(focus, date)}
                disabled={isSaving || !onUpdateDueDate || !focusView?.writeAccess.dueDate}
              />
            </div>

            {/* Detailing-state advance — drafting phase only. Gated on the write
                validator, not on _canDraft: the latter is satisfied by packages
                with no drawing_set_id, or whose effective state has already
                reached the formal workflow, both of which the write rejects. */}
            {focus.kind === "Drawing Set" && onAdvanceDetailing && focusView?.writeAccess.detailingState && (
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
                disabled={isSaving || !onToggleReadiness || !focusView?.writeAccess.readinessFlags}
              />
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
              <button
                type="button"
                className="cmd-btn cmd-btn--primary"
                onClick={() => openItem(focus)}
              >
                Open Work <ArrowRight size={14} />
              </button>
              {focusView?.canCreateSubmittal && focus._drawingSetId && (
                <button
                  type="button"
                  className="cmd-btn cmd-btn--ghost"
                  onClick={() => createSubmittal(focus._drawingSetId!)}
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
        {/* Scoped like the KPI strip's "Submittals Needing Action" above the
            board: this tile counts triage items, that one submittal rows.
            One unscoped name for both read as a contradiction. */}
        <TriageMetric icon={ShieldCheck} label="Items Needing Action" value={triage.needsAction.length} color={review} sub="Rejected / resubmit" />
        <TriageMetric icon={CalendarClock} label="Missing Dates" value={triage.noDate.length} color={textMuted} sub="Needs cleanup" />
        <TriageMetric icon={ClipboardList} label="Pending Review" value={kpis.pending} color={warning} sub={`${kpis.total} total submittals`} />
      </div>

      <section className="sbp-work-panel" aria-label="Production Readiness Queue">
        <div className="sbp-work-panel__head">
          <h2>Production Readiness Queue</h2>
          <span className="cmd-row__meta">Approval dates come from the existing backward schedule. Unknown evidence stays unknown.</span>
        </div>
        <div className="cmd-table-wrap">
          <table className="cmd-table">
            <thead>
              <tr>
                <th>Package</th>
                <th>Current Stage</th>
                <th>Required IFC</th>
                <th>Fab Start</th>
                <th>Float</th>
                <th>Blocker</th>
              </tr>
            </thead>
            <tbody>
              {productionReadiness.map((row) => (
                <tr key={row.id} className="is-clickable" onClick={() => openItem(row.item)}>
                  <td>
                    <div className="cmd-row__num">{row.package}</div>
                    <div className="cmd-row__meta">{row.item.owner || "Owner unknown"}</div>
                  </td>
                  <td>
                    <StatusBadge
                      label={row.currentStage}
                      tone={row.ready ? "success" : row.currentStage === "R&R" ? "danger" : "accent"}
                    />
                  </td>
                  <td>
                    <DateRiskCell
                      value={row.requiredIfc}
                      risk={row.requiredIfc ? (row.item._readiness?.scheduleRisk?.atRisk ? "warning" : "upcoming") : "unknown"}
                    />
                  </td>
                  <td><DateRiskCell value={row.fabStart} risk="unknown" /></td>
                  <td>{row.floatDays == null ? <span className="cmd-row__meta">Unknown</span> : `${row.floatDays}d`}</td>
                  <td>
                    <StatusBadge
                      label={row.blocker}
                      tone={row.ready ? "success" : row.blocker === "Readiness evidence unavailable" ? "neutral" : "warning"}
                    />
                  </td>
                </tr>
              ))}
              {productionReadiness.length === 0 ? (
                <tr>
                  <td colSpan={6} className="cmd-table__empty">No open drawing packages.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Queues (kit DecisionPanel + cmd-row) ────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: 14 }}>
        <DecisionPanel title="Critical Work Queue" onViewAll={() => onOpenTab("matrix")}>
          {model.criticalItems.length === 0
            ? <EmptyState text="No critical work is currently queued." />
            : model.criticalItems.map((it) => <QueueRow key={it.id} item={it} onOpen={openItem} />)}
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
            : model.dueSoon.map((it) => <QueueRow key={it.id} item={it} onOpen={openItem} />)}
        </DecisionPanel>
        <DecisionPanel title="Missing Due Dates">
          {model.noDate.length === 0
            ? <EmptyState text="All open items have due dates." />
            : model.noDate.map((it) => <QueueRow key={it.id} item={it} onOpen={openItem} />)}
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
