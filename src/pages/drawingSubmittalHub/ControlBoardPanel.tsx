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
import { useState } from "react";
import { ArrowRight, FileQuestion, CircleDollarSign } from "lucide-react";
import { DateRiskCell, DecisionPanel, StatusBadge, WorkflowStage } from "@/components/command";
import {
  adaptControlBoardFocus,
  buildControlBoardModel,
  buildNeedsActionRows,
  buildProductionReadinessQueue,
  buildStagePipeline,
  nextActionForTriageItem,
  openRfisForBoard,
  pipelineLaneFor,
} from "./drawingControlCenter.derive";
import type { NeedsActionFilter } from "./drawingControlCenter.derive";
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
  EmptyState,
} from "./primitives";
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
  /** The project's RFIs (any status); the board lists the open ones. Omit to hide the list. */
  openRfis?: ReadonlyArray<Record<string, unknown>>;
  onOpenRfi?: (rfiId: string) => void;
}

/** Viewer's local calendar day as YYYY-MM-DD. */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "2026-10-19" → "10/19/26"; an unparseable value is shown as given. */
function formatShortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1].slice(2)}` : iso;
}

/** Stage pill: the package's operational state, toned by workflow lane. */
function StagePill({ state }: { state: string }) {
  const lane = pipelineLaneFor(state);
  const tone = state === "R&R" ? "bad" : lane ?? "none";
  return <span className={`sdc-pill sdc-pill--${tone}`} title={state}>{state}</span>;
}

/** One Needs-action row. Opens the item's record (its governing submittal,
 *  else its set's Sets & revisions view, else its tab). */
function NeedsActionRow({ item, onOpen }: { item: TriageItem; onOpen: (item: TriageItem) => void }) {
  const open = () => onOpen(item);
  const state = item.detailingState || item.status;
  const flag = item.due?.overdue ? "over" : item.due?.dueSoon ? "warn" : item.needsAction ? "over" : null;
  return (
    <li>
      <button
        type="button"
        className="sdc-na__row"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => {
          // Handled here (and the native click suppressed) so Enter and Space
          // open the record exactly once.
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        }}
      >
      <div className="sdc-na__rec">
        <div className="sdc-eyebrow">{item.kind}</div>
        <div><StagePill state={state} />{item.isRR && state !== "R&R" ? <> <RRChip /></> : null}</div>
      </div>
      <div className="sdc-na__what">
        <div className="sdc-na__t">{item.title}</div>
        <div className="sdc-na__sub">{item.group}{item.status && item.status !== state ? ` · ${item.status}` : ""}</div>
      </div>
      <div className="c3">
        {nextActionForTriageItem(item)}
        {flag && item.due?.label ? <> <span className={`sdc-flag sdc-flag--${flag}`}>{item.due.label}</span></> : null}
      </div>
      <div className="c4 sdc-na__who">{item.owner || "—"}</div>
      </button>
    </li>
  );
}

export default function ControlBoardPanel(props: ControlBoardPanelProps) {
  const {
    triage, isLoading, onOpenTab, onOpenHref,
    onUpdateOwner, onUpdateDueDate, onAdvanceDetailing, onToggleReadiness,
    sequenceReadiness, revisionImpact, isSaving,
    onEscalate, onCompareRevision, modelMapping, modelElementRows,
    modelRosterCount, modelRosterCountLoading, modelRosterLoading, onLoadModelRoster,
    onImportModelElements, openRfis, onOpenRfi,
  } = props;
  const { openItem, createSubmittal } = useControlBoardNavigation({ onOpenTab, onOpenHref });
  const [filter, setFilter] = useState<NeedsActionFilter>("all");

  if (isLoading) return <LoadingSkeleton />;

  const model = buildControlBoardModel(triage);
  const focusView = adaptControlBoardFocus(model.focusItem);
  const focus = focusView?.item ?? null;
  const productionReadiness = buildProductionReadinessQueue(triage);

  const needsRows = buildNeedsActionRows(triage, filter);
  const openCount = buildNeedsActionRows(triage, "all").length;
  const pipeline = buildStagePipeline(triage.setItems);
  const laneMax = Math.max(1, ...pipeline.lanes.map((l) => l.count));
  const boardRfis = openRfisForBoard(openRfis ?? [], localToday());
  const chips: Array<{ key: NeedsActionFilter; label: string; value: number; title: string }> = [
    { key: "all", label: "All", value: openCount, title: "Every open drawing set and unlinked submittal" },
    { key: "overdue", label: "Overdue", value: triage.overdue.length, title: `${triage.overdueDrawingSets} drawing sets, ${triage.overdueUnlinkedSubmittals} unlinked submittals` },
    { key: "dueSoon", label: "Due This Week", value: triage.dueSoon.length, title: "Due in the next 7 days" },
    // Scoped like the KPI strip's "Submittals Needing Action" above the
    // board: this chip counts triage items, that one submittal rows.
    { key: "needsAction", label: "Items Needing Action", value: triage.needsAction.length, title: "Rejected or revise-and-resubmit" },
    { key: "noDate", label: "Missing Dates", value: triage.noDate.length, title: "Open items with no due date" },
  ];

  return (
    <div className="sdc-board">
      <div className="sdc-ov-grid">
      <div className="sdc-ov-main">
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
            <div className="cmd-row__meta" style={{ marginTop: 7 }}>
              Next: {nextActionForTriageItem(focus)}
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

      <section className="sdc-panel" aria-labelledby="sdc-needs-action">
        <div className="sdc-sec-h">
          <h2 id="sdc-needs-action">Needs action</h2>
          <span className="sdc-muted">
            {needsRows.length} {filter === "all" ? "open items" : `of ${openCount} open items`}, most urgent first
          </span>
          <span className="sdc-sec-h__tools">
            <button type="button" className="cmd-btn cmd-btn--ghost cmd-btn--sm" onClick={() => onOpenTab("matrix")}>Approval Matrix</button>
          </span>
        </div>
        <div className="sdc-chips" role="group" aria-label="Filter open work">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              className="sdc-chip"
              aria-pressed={filter === c.key}
              title={c.title}
              onClick={() => setFilter(c.key)}
            >
              {c.label}<b>{c.value}</b>
            </button>
          ))}
        </div>
        <div className="sdc-na-head" aria-hidden="true">
          <span>Record</span><span>Where it stands</span><span className="c3">Waiting on</span><span className="c4">Who</span>
        </div>
        <ul className="sdc-na">
          {needsRows.length === 0 ? (
            <li className="sdc-empty">
              {filter === "all" ? "Nothing waiting. Every package is released or closed." : "No open items in this view."}
            </li>
          ) : needsRows.map((it) => <NeedsActionRow key={it.id} item={it} onOpen={openItem} />)}
        </ul>
      </section>
      </div>

      <aside className="sdc-ov-aside">
        <div className="sdc-sec-h"><h2>Package pipeline</h2><span className="sdc-muted">{pipeline.total} drawing sets</span></div>
        <div className="sdc-panel sdc-pipe">
          <div className="sdc-pipe__rows">
            {pipeline.lanes.map((l) => (
              <button
                key={l.lane}
                type="button"
                className="sdc-pipe__row"
                title={`${l.label}: ${l.count}`}
                aria-label={`${l.label}: ${l.count} drawing sets. Open Shop Drawings`}
                onClick={() => onOpenTab("drawings")}
              >
                <span className="sdc-mono">{l.lane}</span>
                <span className="sdc-pipe__bar"><i style={{ width: `${((l.count / laneMax) * 100).toFixed(1)}%` }} /></span>
                <span className="sdc-mono sdc-pipe__n">{l.count}</span>
              </button>
            ))}
          </div>
          {pipeline.unclassified > 0 && (
            <p className="sdc-note">{pipeline.unclassified} set{pipeline.unclassified === 1 ? "" : "s"} in a state outside these lanes.</p>
          )}
          <p className="sdc-note">NS Not Started or detailing · IFA Issued for Approval · OFA Out for Approval · BFA Back from Approval (incl. R&amp;R) · OFS Out for Scrub · IFC Issued for Construction · REL Released</p>
        </div>

        {openRfis && (
          <>
            <div className="sdc-sec-h sdc-sec-h--gap">
              <h2>Open RFIs</h2>
              <span className="sdc-muted">{boardRfis.total} open</span>
            </div>
            <div className="sdc-links">
              {boardRfis.rows.length === 0 ? <p className="sdc-muted">No open RFIs.</p> : boardRfis.rows.map((r) => (
                <button key={r.id} type="button" className="sdc-lnk" onClick={() => onOpenRfi?.(r.id)} disabled={!onOpenRfi}>
                  <span className="sdc-mono">{r.number}</span>
                  <span className="sdc-lnk__grow">{r.title}</span>
                  <span className={`sdc-mono ${r.overdue ? "sdc-over" : "sdc-muted"}`}>{r.dueDate ? formatShortDate(r.dueDate) : "No date"}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </aside>
      </div>

      <section className="sbp-work-panel" aria-label="Drawing release review">
        <div className="sbp-work-panel__head">
          <h2>Drawing release review</h2>
          <span className="cmd-row__meta">Stage and known exceptions only. Verify the server fab-release gate before authorizing production.</span>
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
                <th>Review signal</th>
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
                    <span title="Workflow state only; this is not fabrication or erection authorization.">
                      <StatusBadge label={row.currentStage} tone={row.currentStage === "R&R" ? "danger" : "neutral"} />
                    </span>
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
                      tone={row.blocker === "Server fab-release check required" || row.blocker.includes("evidence unavailable") ? "neutral" : "warning"}
                    />
                  </td>
                </tr>
              ))}
              {productionReadiness.length === 0 ? (
                <tr>
                  <td colSpan={6} className="cmd-table__empty">No drawing sets to review.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

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
