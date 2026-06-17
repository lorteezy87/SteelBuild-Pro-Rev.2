import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { daysUntil } from "@/lib/dateMath";
import { formatDate } from "@/components/shared/formatters";
import { submittalStatusToStage, isRRStatus } from "@/lib/submittalStageMapping";
import { nextSubmittalAction } from "@/lib/submittalActionEngine";
import { STAGE_MAP } from "@/components/drawings/drawingsConfig";
import { formatDrawingSetNumber, sortDrawingSetPackages } from "@/lib/drawingSetOrdering";
import CommentThreadRaw from "@/components/collaboration/CommentThread";
import RoundTimeline from "@/components/submittals/RoundTimeline";
import ResponseMatrix from "@/components/submittals/ResponseMatrix";
import SubmittalForecastCard from "@/components/submittals/SubmittalForecastCard";
import { buildResponseMatrix } from "@/lib/submittalResubmittal";
import { forecastSubmittal } from "@/lib/submittalForecast";
import type { CycleStats } from "@/lib/submittalForecast";
import { LinkedRFIs, LinkedTasks } from "@/components/submittals/LinkedEntities";
import SubmittalReviewStrip from "@/components/submittals/SubmittalReviewStrip";
import ApprovalChainPanelRaw from "@/components/submittals/ApprovalChainPanel";
import { BIC_CHOICES, STATUSES, STATUS_CFG, TYPES } from "./format";
import type { DrawingSet, DrawingSetsById, Submittal, SubmittalRoundRecord } from "./types";

// CommentThread is still .jsx; cast at the boundary (removable once typed).
const CommentThread = CommentThreadRaw as unknown as ComponentType<Record<string, any>>;
const ApprovalChainPanel = ApprovalChainPanelRaw as unknown as ComponentType<Record<string, any>>;

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
}

export function SubmittalVirtualList({ filtered, isLoading, rows, selectedId, selectedIds, toggleSelect, setSelectedId, drawingSetsById }: SubmittalVirtualListProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: filtered.length,
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
          const r = filtered[virtualRow.index];
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
}

function SubmittalRow({ row, selected, checked, onToggle, onClick, drawingSetsById }: SubmittalRowProps) {
  const cfg = STATUS_CFG[row.status] || STATUS_CFG.Draft;
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
    !["Approved", "Approved as Noted", "Released for Fabrication", "Void"].includes(row.status) &&
    daysUntil(row.required_date) < 0;

  // The list is dense — give each row a status-tinted left rail and a
  // very faint status-tinted background wash so adjacent statuses
  // separate visually before the user even reads the chip.
  return (
    <div
      onClick={onClick}
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
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, color: "var(--accent)", letterSpacing: "0.06em" }}>
            {row.submittal_number}
            {row.round_number > 1 && <span style={{ marginLeft: 6, color: "var(--status-warning)" }}>R{row.round_number}</span>}
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {row.title}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
            {primarySet ? `Set # ${formatDrawingSetNumber(primarySet)} · ${primarySet.set_name || "Drawing set"} · ` : ""}
            {row.spec_section ? `Spec ${row.spec_section} · ` : ""}
            {row.discipline || row.submittal_type || ""}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
            {/* Derived workflow-stage chip — shows IFA/OFA/BFA/OFS/IFC/
                Released so the user can see workflow position at a
                glance, not just the raw submittal status. */}
            {stageCfg && (
              <span
                title={`Workflow stage: ${stageCfg.label}${showRR ? " (R&R loop)" : ""}`}
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
}

export function SubmittalDetail({ submittal, allSubmittals = [], drawingSets = [], rounds = [], allRfis = [], allTasks = [], projectName = "Project", project = null, onClose, onEdit, onDelete, onStatusChange, onBICChange, onFieldChange, onNewRound, onReturnRound, sheetResponses = [], drawings = [], cycleStats = null, today = "", onAdvance }: SubmittalDetailProps) {
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
  // Wrap onFieldChange so a no-op edit (typing the same value back)
  // doesn't fire a network update — small UX nicety, also stops
  // accidental "Updated" toasts when the user just tabs through.
  const patch = (field: string, value: any) => {
    if (!onFieldChange) return;
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

  const cfg = STATUS_CFG[submittal.status] || STATUS_CFG.Draft;
  const overdue =
    submittal.required_date &&
    !["Approved", "Approved as Noted", "Released for Fabrication", "Void"].includes(submittal.status) &&
    daysUntil(submittal.required_date) < 0;

  return (
    <div style={{ width: 480, flexShrink: 0, display: "flex", flexDirection: "column", background: "var(--bg-page, #0D1117)", minHeight: 0 }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--divider)", background: "rgba(255,255,255,0.04)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 800, color: "var(--accent)", letterSpacing: "0.08em" }}>
              {submittal.submittal_number}
              {submittal.round_number > 1 && <span style={{ marginLeft: 8, color: "var(--status-warning)" }}>ROUND {submittal.round_number}</span>}
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
              {submittal.ball_in_court && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 3, color: "var(--text-secondary)", background: "var(--bg-surface-high)" }}>
                  BIC · {submittal.ball_in_court}
                </span>
              )}
              {overdue && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--status-error)" }}>
                  ⚠ {Math.abs(daysUntil(submittal.required_date))}d overdue
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 20, marginLeft: 10 }}>×</button>
        </div>

        {/* Verb-driven next-step CTA — one click advances the canonical
            workflow (status + ball-in-court together). Disabled at terminals. */}
        {onAdvance && (() => {
          const action = nextSubmittalAction(submittal);
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

        {/* Round History — vertical timeline of all submittal rounds
            with status badges, durations, and BIC. "New Round" creates
            a fresh resubmission round. */}
        <DetailSection title={`Round History (${rounds.length})`}>
          <RoundTimeline
            rounds={rounds}
            submittalId={submittal.id}
            onReturnRound={onReturnRound}
          />
          {onNewRound && (() => {
            // After an R&R / Rejected return the next round IS the resubmittal,
            // so make that the obvious next action and label it as such — it
            // opens the round prefilled with the reviewer's open comments (§20).
            const isResubmit = ["Revise and Resubmit", "Rejected"].includes(submittal.status);
            const lastRoundNum = rounds.length
              ? (rounds[rounds.length - 1].round_number || rounds.length)
              : (submittal.round_number || 0);
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
            onChange={(next) => onFieldChange && onFieldChange({ linked_rfi_ids: next })}
          />
        </DetailSection>

        {/* Linked Tasks */}
        <DetailSection title="Linked Tasks">
          <LinkedTasks
            value={submittal.linked_task_ids || []}
            allTasks={allTasks}
            onChange={(next) => onFieldChange && onFieldChange({ linked_task_ids: next })}
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
          {choices.map((c) => <option key={c} value={c}>{c}</option>)}
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
