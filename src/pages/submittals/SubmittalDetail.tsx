import { useMemo, useState } from "react";
import type { ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { daysUntil } from "@/lib/dateMath";
import { formatDate } from "@/components/shared/formatters";
import { submittalStatusToStage, CLOSED_SUBMITTAL_STATUSES } from "@/lib/submittalStageMapping";
import { nextSubmittalAction } from "@/lib/submittalActionEngine";
import { computeSubmittalRiskAging } from "@/lib/submittalRiskAging";
import type { OfsChecklistState } from "@/lib/ofsCompletionGate";
import CommentThreadRaw from "@/components/collaboration/CommentThread";
import RoundTimelineRaw from "@/components/submittals/RoundTimeline";
import ResponseMatrixRaw from "@/components/submittals/ResponseMatrix";
import IfcIssueDialog from "@/components/submittals/IfcIssueDialog";
import CommentDispositionChecklist from "@/components/submittals/CommentDispositionChecklist";
import type { CommentDispositionStatus } from "@/lib/commentDispositionGate";
import SubmittalForecastCard from "@/components/submittals/SubmittalForecastCard";
import { buildResponseMatrix } from "@/lib/submittalResubmittal";
import { forecastSubmittal } from "@/lib/submittalForecast";
import type { CycleStats } from "@/lib/submittalForecast";
import { LinkedRFIs as LinkedRFIsRaw, LinkedTasks as LinkedTasksRaw } from "@/components/submittals/LinkedEntities";
import SubmittalReviewStripRaw from "@/components/submittals/SubmittalReviewStrip";
import ApprovalChainPanelRaw from "@/components/submittals/ApprovalChainPanel";
import { getSubmittalLineage, submittalLineageLabel } from "@/lib/submittalLineage";
import type { DrawingType, SubmittalComponent } from "@/lib/submittalComponents";
import { BIC_CHOICES, STATUSES, STATUS_CFG, TYPES } from "./format";
import {
  filterRelatedSetRfis,
  isSplitEligibleStatus,
  isSubmittalDetailOverdue,
  isResubmitStatus,
  computeNextRoundNumber,
  buildSubmittalFieldPatch,
  riskTierChipColor,
} from "./submittalsPageHelpers";
import { SubmittalTypeChips } from "./components";
import {
  DetailSection,
  DrawingTypeComponents,
  InlineText,
  InlineTextarea,
  LinkedDrawingSets,
  EditableMeta,
} from "./SubmittalDetailUi";

import type { DrawingSet, Submittal, SubmittalRoundRecord } from "./types";

type GenericProps = Record<string, unknown>;

interface LinkedRfiRecord extends GenericProps {
  id?: string;
  drawing_set_id?: string;
  rfi_number?: string;
  number?: string;
  title?: string;
  subject?: string;
}

interface LinkedTaskRecord extends GenericProps {
  id?: string;
}

interface ProjectDrawingRecord extends GenericProps {
  id?: string;
}

interface SheetResponseRecord extends GenericProps {
  id?: string;
}

interface CommentDispositionRecord extends GenericProps {
  id?: string;
}

const CommentThread = CommentThreadRaw as unknown as ComponentType<GenericProps>;
const ApprovalChainPanel = ApprovalChainPanelRaw as unknown as ComponentType<GenericProps>;
const RoundTimeline = RoundTimelineRaw as unknown as ComponentType<GenericProps>;
const ResponseMatrix = ResponseMatrixRaw as unknown as ComponentType<GenericProps>;
const SubmittalReviewStrip = SubmittalReviewStripRaw as unknown as ComponentType<GenericProps>;
const LinkedRFIs = LinkedRFIsRaw as unknown as ComponentType<GenericProps>;
const LinkedTasks = LinkedTasksRaw as unknown as ComponentType<GenericProps>;

export interface SubmittalDetailProps {
  submittal: Submittal | null;
  allSubmittals?: Submittal[];
  drawingSets?: DrawingSet[];
  rounds?: SubmittalRoundRecord[];
  allRfis?: LinkedRfiRecord[];
  allTasks?: LinkedTaskRecord[];
  projectName?: string;
  project?: GenericProps | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: string) => void;
  onBICChange: (bic: string) => void;
  onFieldChange: (patch: Record<string, unknown>) => void;
  onNewRound?: () => void;
  onReturnRound: (roundId: string) => void;
  sheetResponses?: SheetResponseRecord[];
  drawings?: ProjectDrawingRecord[];
  cycleStats?: CycleStats | null;
  today?: string;
  onAdvance?: (action: {
    nextStatus: string | null;
    nextBallInCourt: string | null;
    label: string;
    nextStage: string | null;
    chainStepIndex?: number;
    ofsChecklist?: OfsChecklistState | null;
    ofsOverrideReason?: string | null;
    commentOverrideReason?: string | null;
  }) => void;
  approvedRoutesToScrub?: boolean;
  commentDispositions?: CommentDispositionRecord[];
  onCommentDispositionAdd?: (draft: {
    comment_number: string;
    source: string;
    location: string;
    comment_text: string;
    is_required: boolean;
  }) => void | Promise<void>;
  onCommentDispositionStatus?: (id: string, status: CommentDispositionStatus) => void | Promise<void>;
  onCommentDispositionResolution?: (id: string, resolution: string) => void | Promise<void>;
  splittingEnabled?: boolean;
  onSpinOff?: () => void;
  onSelectSubmittal?: (id: string) => void;
  drawingTypesEnabled?: boolean;
  components?: SubmittalComponent[];
  onComponentSetReceived?: (args: {
    drawingType: DrawingType;
    existing: SubmittalComponent | null;
    date: string | null;
  }) => void;
  onComponentSetReleased?: (args: {
    drawingType: DrawingType;
    existing: SubmittalComponent | null;
    released: boolean;
  }) => void;
  onComponentAddType?: (drawingType: DrawingType) => void;
  onComponentRemoveType?: (component: SubmittalComponent) => void;
}

export function SubmittalDetail({
  submittal,
  allSubmittals = [],
  drawingSets = [],
  rounds = [],
  allRfis = [],
  allTasks = [],
  projectName = "Project",
  project = null,
  onClose,
  onEdit,
  onDelete,
  onStatusChange,
  onBICChange,
  onFieldChange,
  onNewRound,
  onReturnRound,
  sheetResponses = [],
  drawings = [],
  cycleStats = null,
  today = "",
  onAdvance,
  approvedRoutesToScrub = true,
  commentDispositions = [],
  onCommentDispositionAdd,
  onCommentDispositionStatus,
  onCommentDispositionResolution,
  splittingEnabled = false,
  onSpinOff,
  onSelectSubmittal,
  drawingTypesEnabled = false,
  components = [],
  onComponentSetReceived,
  onComponentSetReleased,
  onComponentAddType,
  onComponentRemoveType,
}: SubmittalDetailProps) {
  const [pendingIfcAction, setPendingIfcAction] = useState<{
    nextStatus: string | null;
    nextBallInCourt: string | null;
    label: string;
    nextStage: string | null;
    chainStepIndex?: number;
  } | null>(null);
  const responseMatrix = useMemo(
    () =>
      buildResponseMatrix({
        rounds,
        responses: sheetResponses as never,
        drawings: drawings as never,
      }),
    [rounds, sheetResponses, drawings],
  );
  const forecast = useMemo(
    () =>
      cycleStats && today
        ? forecastSubmittal({ submittal: submittal as Submittal, rounds, stats: cycleStats, today })
        : { forecastable: false },
    [submittal, rounds, cycleStats, today],
  );
  const navigate = useNavigate();
  const relatedSetRfis = useMemo(
    () => filterRelatedSetRfis(submittal, allRfis),
    [submittal, allRfis],
  );
  const lineage = useMemo(
    () => getSubmittalLineage(submittal, allSubmittals),
    [submittal, allSubmittals],
  );
  const patch = (field: string, value: unknown) => {
    if (!onFieldChange) return;
    const next = buildSubmittalFieldPatch(submittal as Record<string, unknown> | null, field, value);
    if (next) onFieldChange(next);
  };

  if (!submittal) {
    return (
      <div style={{ width: 480, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6, color: "var(--text-muted)", background: "var(--bg-page, var(--bg-page))" }}>
        <div style={{ fontSize: 32 }}>◆</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}>Select a submittal</div>
      </div>
    );
  }

  const cfg = STATUS_CFG[submittal.status ?? ""] || STATUS_CFG.Draft;
  const overdue = isSubmittalDetailOverdue(
    submittal.status,
    submittal.required_date,
    daysUntil,
  );
  const workflowStage = submittalStatusToStage(
    submittal.status,
    submittal.ball_in_court,
    submittal.approved_date,
  );
  const risk = computeSubmittalRiskAging({
    stage: workflowStage,
    dueDate: submittal.required_date || null,
    statusChangedAt:
      submittal.returned_date ||
      submittal.approved_date ||
      submittal.updated_at ||
      submittal.submitted_date ||
      null,
    useWorkdays: true,
  });
  const riskChipColor = riskTierChipColor(risk?.tier);

  return (
    <div style={{ width: 480, flexShrink: 0, display: "flex", flexDirection: "column", background: "var(--bg-page, var(--bg-page))", minHeight: 0 }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--divider)", background: "var(--bg-hover)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 800, color: "var(--accent)", letterSpacing: "0.08em" }}>
              {submittal.submittal_number}
              {submittal.total_rounds > 1 && <span style={{ marginLeft: 8, color: "var(--status-warning)" }}>ROUND {submittal.total_rounds}</span>}
            </div>
            <InlineText
              value={submittal.title}
              onCommit={(value) => patch("title", value)}
              required
              style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.3 }}
              placeholder="Untitled submittal"
            />
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 3, color: cfg.color, background: cfg.bg }}>
                {submittal.status}
              </span>
              {(CLOSED_SUBMITTAL_STATUSES.has(submittal.status ?? "") || submittal.ball_in_court) && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 3, color: "var(--text-secondary)", background: "var(--bg-surface-high)" }}>
                  BIC · {CLOSED_SUBMITTAL_STATUSES.has(submittal.status ?? "") ? "Closed" : submittal.ball_in_court}
                </span>
              )}
              {risk && risk.tier !== "normal" && (
                <span
                  title={risk.reason}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: 3,
                    color: riskChipColor,
                    background: "var(--bg-surface-high)",
                  }}
                >
                  Risk · {risk.tier}
                </span>
              )}
              {overdue && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--status-error)" }}>
                  ⚠ {Math.abs(daysUntil(submittal.required_date))}d overdue
                </span>
              )}
              {drawingTypesEnabled && <SubmittalTypeChips components={components} />}
            </div>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 20, marginLeft: 10 }}>×</button>
        </div>

        {onAdvance && (() => {
          const action = nextSubmittalAction(submittal, { approvedRoutesToScrub });
          return (
            <button
              type="button"
              className="sbd-btn-primary"
              disabled={action.disabled}
              onClick={() => {
                if (action.disabled) return;
                if (action.currentStage === "OFS" && action.nextStage === "IFC") {
                  setPendingIfcAction(action);
                  return;
                }
                onAdvance(action);
              }}
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

        <IfcIssueDialog
          open={!!pendingIfcAction}
          submittalNumber={submittal.submittal_number}
          dispositions={commentDispositions}
          onClose={() => setPendingIfcAction(null)}
          onConfirm={({ checklist, overrideReason }) => {
            if (!pendingIfcAction || !onAdvance) return;
            const action = pendingIfcAction;
            setPendingIfcAction(null);
            onAdvance({
              ...action,
              ofsChecklist: checklist,
              ofsOverrideReason: overrideReason,
              commentOverrideReason: overrideReason,
            });
          }}
        />

        {splittingEnabled && onSpinOff && isSplitEligibleStatus(submittal.status) && (
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
        <SubmittalReviewStrip
          submittal={submittal}
          allSubmittals={allSubmittals}
          drawingSets={drawingSets}
          rfis={allRfis}
          rounds={rounds}
          projectName={projectName}
        />

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

        {drawingTypesEnabled && submittal.id && submittal.project_id && (
          <DetailSection title="Drawing types (Shop / Erection / Part)">
            <DrawingTypeComponents
              submittalId={submittal.id}
              projectId={submittal.project_id}
              components={components}
              onSetReceived={(args) => onComponentSetReceived?.(args)}
              onSetReleased={(args) => onComponentSetReleased?.(args)}
              onAddType={(drawingType) => onComponentAddType?.(drawingType)}
              onRemoveType={(component) => onComponentRemoveType?.(component)}
            />
          </DetailSection>
        )}

        {forecast.forecastable && (
          <DetailSection title="Review forecast">
            <SubmittalForecastCard forecast={forecast} />
          </DetailSection>
        )}

        <DetailSection title="Status workflow">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {STATUSES.map((status) => (
              <button
                key={status}
                onClick={() => status !== submittal.status && onStatusChange(status)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  border: status === submittal.status ? `1px solid ${cfg.color}` : "1px solid var(--border-default)",
                  background: status === submittal.status ? cfg.bg : "transparent",
                  color: status === submittal.status ? cfg.color : "var(--text-muted)",
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
                  cursor: status === submittal.status ? "default" : "pointer",
                }}
              >
                {status}
              </button>
            ))}
          </div>
        </DetailSection>

        <DetailSection title="Ball in court">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {BIC_CHOICES.map((ballInCourt) => (
              <button
                key={ballInCourt}
                onClick={() => ballInCourt !== submittal.ball_in_court && onBICChange(ballInCourt)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  border: ballInCourt === submittal.ball_in_court ? "1px solid var(--accent)" : "1px solid var(--border-default)",
                  background: ballInCourt === submittal.ball_in_court ? "var(--accent-muted)" : "transparent",
                  color: ballInCourt === submittal.ball_in_court ? "var(--accent)" : "var(--text-muted)",
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
                  cursor: ballInCourt === submittal.ball_in_court ? "default" : "pointer",
                }}
              >
                {ballInCourt}
              </button>
            ))}
          </div>
        </DetailSection>

        <DetailSection title="Approval routing">
          <ApprovalChainPanel
            submittal={submittal}
            project={project}
            onFieldChange={onFieldChange}
          />
        </DetailSection>

        <DetailSection title={`Approval Cycles (${rounds.length})`}>
          <RoundTimeline
            rounds={rounds}
            submittal={submittal}
            submittalId={submittal.id}
            onReturnRound={onReturnRound}
          />
          {onNewRound && (() => {
            const isResubmit = isResubmitStatus(submittal.status);
            const nextRoundNum = computeNextRoundNumber(rounds, submittal.total_rounds);
            return (
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={onNewRound}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 4,
                    background: isResubmit ? "var(--status-review)" : "var(--accent)",
                    color: "var(--on-accent)",
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

        {responseMatrix.rows.length > 0 && (
          <DetailSection title={`Response matrix (${responseMatrix.rows.length} sheet${responseMatrix.rows.length === 1 ? "" : "s"})`}>
            <ResponseMatrix columns={responseMatrix.columns} rows={responseMatrix.rows} />
          </DetailSection>
        )}

        {onCommentDispositionAdd &&
          onCommentDispositionStatus &&
          ["Approved", "Approved as Noted", "Revise and Resubmit", "Rejected"].includes(
            submittal.status ?? "",
          ) && (
          <DetailSection title={`Returned comments (${commentDispositions.length})`}>
            <CommentDispositionChecklist
              dispositions={commentDispositions as never}
              onAdd={onCommentDispositionAdd}
              onUpdateStatus={onCommentDispositionStatus}
              onUpdateResolution={onCommentDispositionResolution}
            />
          </DetailSection>
        )}

        <DetailSection title="Details">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <EditableMeta
              label="Type"
              kind="select"
              value={submittal.submittal_type}
              choices={TYPES}
              allowClear
              onCommit={(value) => patch("submittal_type", value)}
            />
            <EditableMeta
              label="Discipline"
              value={submittal.discipline}
              onCommit={(value) => patch("discipline", value)}
            />
            <EditableMeta
              label="Spec Section"
              value={submittal.spec_section}
              onCommit={(value) => patch("spec_section", value)}
            />
            <EditableMeta
              label="Revision"
              value={submittal.revision}
              onCommit={(value) => patch("revision", value)}
            />
            <EditableMeta
              label="Submitted"
              kind="date"
              value={submittal.submitted_date}
              displayValue={formatDate(submittal.submitted_date)}
              onCommit={(value) => patch("submitted_date", value)}
            />
            <EditableMeta
              label="Required"
              kind="date"
              value={submittal.required_date}
              displayValue={formatDate(submittal.required_date)}
              warn={overdue}
              onCommit={(value) => patch("required_date", value)}
            />
            <EditableMeta
              label="Returned"
              kind="date"
              value={submittal.returned_date}
              displayValue={formatDate(submittal.returned_date)}
              onCommit={(value) => patch("returned_date", value)}
            />
            <EditableMeta
              label="Approved"
              kind="date"
              value={submittal.approved_date}
              displayValue={formatDate(submittal.approved_date)}
              onCommit={(value) => patch("approved_date", value)}
            />
            <EditableMeta
              label="Submitted by"
              value={submittal.submitted_by}
              onCommit={(value) => patch("submitted_by", value)}
            />
            <EditableMeta
              label="Reviewer"
              value={submittal.reviewer}
              onCommit={(value) => patch("reviewer", value)}
            />
            <EditableMeta
              label="Received From"
              value={submittal.received_from}
              onCommit={(value) => patch("received_from", value)}
            />
            <EditableMeta
              label="Distributed To"
              value={submittal.distributed_to}
              onCommit={(value) => patch("distributed_to", value)}
            />
            <EditableMeta
              label="Transmittal #"
              value={submittal.transmittal_number}
              onCommit={(value) => patch("transmittal_number", value)}
            />
            <EditableMeta
              label="Days in Review"
              value={submittal.days_in_review != null ? String(submittal.days_in_review) : ""}
              onCommit={(value) => patch("days_in_review", value ? parseInt(String(value), 10) : null)}
            />
          </div>
        </DetailSection>

        <DetailSection title="Linked drawing sets">
          <LinkedDrawingSets
            value={submittal.drawing_set_ids || []}
            allSets={drawingSets}
            onChange={(next) => onFieldChange && onFieldChange({ drawing_set_ids: next })}
          />
        </DetailSection>

        <DetailSection title="Linked RFIs">
          <LinkedRFIs
            value={submittal.linked_rfi_ids || []}
            allRfis={allRfis}
            onChange={(next: string[]) => onFieldChange && onFieldChange({ linked_rfi_ids: next })}
          />
        </DetailSection>

        {relatedSetRfis.length > 0 && (
          <DetailSection title="Related RFIs (via drawing set)">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {relatedSetRfis.map((rfi) => {
                const number = rfi.rfi_number || rfi.number || "";
                const title = rfi.title || rfi.subject || "";
                const label = number && title ? `${number} — ${title}` : number || title || "(untitled RFI)";
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

        <DetailSection title="Linked Tasks">
          <LinkedTasks
            value={submittal.linked_task_ids || []}
            allTasks={allTasks}
            onChange={(next: string[]) => onFieldChange && onFieldChange({ linked_task_ids: next })}
          />
        </DetailSection>

        <DetailSection title="Notes">
          <InlineTextarea
            value={submittal.notes || ""}
            onCommit={(value) => patch("notes", value)}
            placeholder="Click to add notes (cover-letter scope, known issues, etc.)"
          />
        </DetailSection>

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

      <div style={{ padding: "12px 20px", borderTop: "1px solid var(--divider)", background: "var(--bg-hover)", display: "flex", gap: 8 }}>
        <button
          onClick={onEdit}
          style={{ flex: 1, background: "var(--accent)", color: "var(--on-accent)", border: "none", borderRadius: 4, padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: "0.08em" }}
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
