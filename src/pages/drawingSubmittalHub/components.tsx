import { Fragment, lazy, Suspense, useMemo, useRef, useState } from "react";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import { SectionCard, StatusPill } from "@/components/desktop/module";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  FileQuestion,
  GitCompareArrows,
  Lock,
  Search,
  ShieldCheck,
  User,
} from "lucide-react";
import LoadingSkeletonRaw from "@/components/shared/LoadingSkeleton";
import { compareDrawingSetPackages, formatDrawingSetNumber } from "@/lib/drawingSetOrdering";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { DRAFTING_STATES, effectiveDetailingState } from "@/lib/detailingPackageState";
import { ELEMENT_STATUS_META } from "@/services/modelElementStatus";
import type { ElementStatusKey, ElementStatusSummary } from "@/services/modelElementStatus";
import { FAB_STATUS_META, FAB_STATUS_ORDER, summarizeFabStatus } from "@/lib/fabStatus";
import {
  BIC_CHOICES,
  accent,
  border,
  currentRevisionForPackage,
  dueInfo,
  error,
  fmtDate,
  getActionTone,
  getOperationalStateColor,
  getSubmittalDueDate,
  info,
  isClosedPackage,
  itemUrgency,
  mono,
  pluralize,
  review,
  success,
  surface1,
  surface2,
  textMuted,
  textPrimary,
  toDateInputValue,
  warning,
} from "./format";
import type { CurrentRevisionInfo } from "./types";
import {
  DueChip,
  EmptyState,
  EscalateIconButton,
  FlagToggle,
  GridCell,
  GridHeaderCell,
  HealthChip,
  ModalLoadingFallback,
  OperationalStateChip,
  PipelineBar,
  RRChip,
  ReadyChip,
  RiskPill,
  SeqMetric,
  Td,
  Th,
  TriageMetric,
} from "./primitives";
export { ApprovalMatrix } from "./approvalMatrix";
export { LeadTimesModal } from "./leadTimesModal";
export { RevisionImpactBoard } from "./revisionImpactBoard";
import { useFlag } from "@/hooks/useFeatureFlag";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAppSecurity } from "@/components/shared/useAppSecurity";
import { Dialog as DialogRaw, DialogContent as DialogContentRaw, DialogHeader as DialogHeaderRaw, DialogTitle as DialogTitleRaw } from "@/components/ui/dialog";

// These shared screens are still .jsx; cast at the boundary (removable
// once they are typed).
type AnyProps = Record<string, any>;
const Dialog = DialogRaw as unknown as ComponentType<AnyProps>;
const DialogContent = DialogContentRaw as unknown as ComponentType<AnyProps>;
const DialogHeader = DialogHeaderRaw as unknown as ComponentType<AnyProps>;
const DialogTitle = DialogTitleRaw as unknown as ComponentType<AnyProps>;
const LoadingSkeleton = LoadingSkeletonRaw as unknown as ComponentType<AnyProps>;
// Lazy so the heavy revision/PDF modals only load when a row action fires —
// they never weigh down the hub chunk on tab open. The upload modals use
// lazyWithRetry so a stale-chunk 404 after a deploy triggers ONE reload for
// fresh assets instead of silently failing to open the modal.
const RevisionUploadModal = lazyWithRetry(() => import("@/components/drawings/RevisionUploadModal")) as unknown as ComponentType<AnyProps>;
const RevisionImpactReportModal = lazy(() => import("@/components/drawings/RevisionImpactReportModal")) as unknown as ComponentType<AnyProps>;
const DrawingSetUploadModal = lazyWithRetry(() => import("@/components/drawings/DrawingSetUploadModal")) as unknown as ComponentType<AnyProps>;
const DrawingLogImportModal = lazyWithRetry(() => import("@/components/drawings/DrawingLogImportModal")) as unknown as ComponentType<AnyProps>;

type IconType = ComponentType<{ size?: number | string; color?: string }>;

interface HeaderSignalProps {
  icon: IconType;
  label: string;
  value: ReactNode;
  tone: string;
}

export function HeaderSignal({ icon: Icon, label, value, tone }: HeaderSignalProps) {
  return (
    <div className="sbp-header-signal" style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      minHeight: 36,
      padding: "7px 10px",
      borderRadius: 10,
      background: `color-mix(in srgb, ${tone} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${tone} 32%, transparent)`,
      color: tone,
      fontFamily: mono,
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>
      <Icon size={14} />
      <span>{label}</span>
      <span className="sbd-num" style={{ color: textPrimary, fontSize: 13 }}>
        {value}
      </span>
    </div>
  );
}

interface TriageBoardProps {
  triage: any;
  kpis: any;
  drawingKpis: any;
  isLoading: boolean;
  onOpenTab: (key: string) => void;
  onUpdateOwner: (item: any, owner: string) => void;
  onUpdateDueDate: (item: any, date: string) => void;
  onAdvanceDetailing: (item: any, next: string) => void;
  onToggleReadiness: (item: any, field: "material_impacted" | "long_lead_impact", value: boolean) => void;
  sequenceReadiness: Array<{ sequence: string; packageCount: number; detailingPct: number; fabReadyCount: number; erectionReadyCount: number; atRiskCount: number }>;
  revisionImpact: Array<any>;
  isSaving: boolean;
  /** Escalate a queue item into a draft RFI / potential CO. Absent = hidden. */
  onEscalate?: (item: any, kind: "rfi" | "pco") => void;
  /** Open the revision overlay compare for a sheet. Absent = hidden. */
  onCompareRevision?: (drawingId: string) => void;
  /** 3D model element mapping rollup (Phase 0 of the BIM integration). */
  modelMapping?: ElementStatusSummary | null;
  /** The raw model_elements rows (for the per-bucket member drill-down). */
  modelElementRows?: any[];
  /** Open the Tekla/SDS2 member CSV import. Absent = section hidden. */
  onImportModelElements?: () => void;
}

export function TriageBoard({ triage, kpis, drawingKpis, isLoading, onOpenTab, onUpdateOwner, onUpdateDueDate, onAdvanceDetailing, onToggleReadiness, sequenceReadiness, revisionImpact, isSaving, onEscalate, onCompareRevision, modelMapping, modelElementRows, onImportModelElements }: TriageBoardProps) {
  if (isLoading) return <LoadingSkeleton />;

  const focusItem = triage.overdue[0] || triage.dueSoon[0] || triage.needsAction[0] || triage.noDate[0] || null;
  const focusTone = getActionTone(focusItem);
  const topStatuses = Object.entries(triage.pipelineCounts)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 6);
  const focusRoute = focusItem?.routeTab || "matrix";
  const criticalItems = Array.from(
    new Map(
      [...triage.overdue, ...triage.needsAction, ...triage.dueSoon]
        .sort(itemUrgency)
        .map((item: any) => [item.id, item]),
    ).values(),
  ).slice(0, 12) as any[];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))",
        gap: 14,
      }}>
        <SectionCard title="Critical work queue">
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            color: triage.overdue.length ? error : success,
            fontFamily: mono,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            marginBottom: 12,
          }}>
            {triage.overdue.length ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
            {triage.overdue.length ? "Immediate approval risk" : "Pipeline current"}
          </div>
          <h2 style={{
            margin: 0,
            color: textPrimary,
            fontFamily: "var(--font-display)",
            fontSize: 34,
            lineHeight: 1,
            fontWeight: 600,
          }}>
            {triage.overdue.length
              ? `${pluralize(triage.overdue.length, "item")} past due`
              : "No overdue drawing or submittal work"}
          </h2>
          <p style={{ margin: "10px 0 0", color: "var(--text-secondary)", maxWidth: 880, lineHeight: 1.5, fontSize: 13 }}>
            {triage.overdue.length
              ? `${pluralize(triage.overdueDrawingSets, "drawing set")} and ${pluralize(triage.overdueUnlinkedSubmittals, "unlinked submittal")} need attention before detailing can hand off cleanly.`
              : "Use this control board to watch due dates, rejected or resubmittal work, missing dates, and fabrication release readiness by drawing set."}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
            <RiskPill icon={Clock3} label="Due this week" value={triage.dueSoon.length} color={warning} />
            <RiskPill icon={AlertTriangle} label="Needs action" value={triage.needsAction.length} color={review} />
            <RiskPill icon={CalendarClock} label="Missing dates" value={triage.noDate.length} color={textMuted} />
            <RiskPill icon={CheckCircle2} label="Sets Released" value={drawingKpis.released} color={success} />
          </div>
        </SectionCard>

        <SectionCard title="Next decision" headerAction={<DueChip info={focusItem?.due || dueInfo(null)} compact />}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: "6px 0 0", color: textPrimary, fontSize: 18, lineHeight: 1.2 }}>
                {focusItem ? focusItem.title : "No open exception"}
              </h3>
            </div>
          </div>
          {focusItem ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.45 }}>
                  {focusItem.group} - {focusItem.status}
                </span>
                {focusItem.detailingState && <OperationalStateChip state={focusItem.detailingState} />}
                {focusItem.isRR && <RRChip />}
              </div>
              {/* ── Inline Quick-Action Controls ──────────────────────── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
                <InlineOwnerControl
                  currentOwner={focusItem.owner}
                  onAssign={(owner) => onUpdateOwner(focusItem, owner)}
                  disabled={isSaving}
                />
                <InlineDateControl
                  currentDate={focusItem.dueDate}
                  isOverdue={focusItem.due.overdue}
                  onSetDate={(date) => onUpdateDueDate(focusItem, date)}
                  disabled={isSaving}
                />
              </div>
              {/* ── Detailing-state advance (drafting phase only) ─────── */}
              {focusItem.kind === "Drawing Set" && focusItem._canDraft && (
                <InlineDetailingControl
                  current={focusItem._detailingStateRaw}
                  onAdvance={(next) => onAdvanceDetailing(focusItem, next)}
                  disabled={isSaving}
                />
              )}
              {/* ── Backward schedule + readiness (drawing sets) ──────── */}
              {focusItem.kind === "Drawing Set" && focusItem._readiness && (
                <ReadinessPanel
                  readiness={focusItem._readiness}
                  onToggle={(field, value) => onToggleReadiness(focusItem, field, value)}
                  disabled={isSaving}
                />
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
                <button
                  type="button"
                  onClick={() => onOpenTab(focusRoute)}
                  className="sbd-btn-primary"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  Open Work
                  <ArrowRight size={14} />
                </button>
                {/* Contextual escalation — turn the blocker into a draft RFI
                    or a potential CO without leaving the control board. */}
                {onEscalate && (
                  <>
                    <button
                      type="button"
                      className="sbd-btn-ghost"
                      onClick={() => onEscalate(focusItem, "rfi")}
                      title="Draft an RFI from this item"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36 }}
                    >
                      <FileQuestion size={13} /> Draft RFI
                    </button>
                    <button
                      type="button"
                      className="sbd-btn-ghost"
                      onClick={() => onEscalate(focusItem, "pco")}
                      title="Draft a potential change order from this item"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36 }}
                    >
                      <CircleDollarSign size={13} /> Draft PCO
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <EmptyState text="No overdue, due-soon, action, or missing-date work is currently flagged." />
          )}
        </SectionCard>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        <TriageMetric icon={AlertTriangle} label="Overdue Sets" value={triage.overdueDrawingSets} color={error} sub={`${triage.overdueUnlinkedSubmittals} unlinked subs`} />
        <TriageMetric icon={Clock3} label="Due This Week" value={triage.dueSoonDrawingSets} color={warning} sub="Next 7 days" />
        <TriageMetric icon={ShieldCheck} label="Needs Action" value={triage.needsAction.length} color={review} sub="Rejected / resubmit" />
        <TriageMetric icon={CalendarClock} label="Missing Dates" value={triage.noDateDrawingSets} color={textMuted} sub="Needs cleanup" />
        <TriageMetric icon={ClipboardList} label="Pending Review" value={kpis.pending} color={warning} sub={`${kpis.total} total submittals`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: 16 }}>
        <TriageList
          title="Critical Work Queue"
          subtitle="Overdue, rejected, resubmittal, and near-term items."
          items={criticalItems}
          empty="No critical work is currently queued."
          onOpenTab={onOpenTab}
          onEscalate={onEscalate}
        />
        <PipelinePanel topStatuses={topStatuses} openCount={triage.openItems.length} onOpenTab={onOpenTab} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: 16 }}>
        <TriageList
          title="Due Next 7 Days"
          subtitle="Drawing sets with required dates approaching."
          items={triage.dueSoon.slice(0, 8)}
          empty="No drawing or submittal due dates in the next week."
          onOpenTab={onOpenTab}
          onEscalate={onEscalate}
        />
        <TriageList
          title="Missing Due Dates"
          subtitle="Assign dates before these can be managed against schedule."
          items={triage.noDate.slice(0, 8)}
          empty="All open items have due dates."
          onOpenTab={onOpenTab}
        />
      </div>

      <SequenceReadinessSection rows={sequenceReadiness} />
      {onImportModelElements && (
        <ModelMappingSection summary={modelMapping} elements={modelElementRows} onImport={onImportModelElements} />
      )}
      <RevisionImpactSection rows={revisionImpact} onCompare={onCompareRevision} />
    </div>
  );
}

// ── 3D Model Mapping (BIM integration Phase 0) ──────────────────────────────
// Member-level piece-mark mapping coverage + status buckets. The same buckets
// (and their GUID sets) will drive the viewer's "paint by numbers" coloring —
// this section makes the mapping visible (and importable) before the viewer
// lands, so model data quality is established first.

const ELEMENT_BUCKET_ORDER = [
  "rfi_blocked", "behind_schedule", "in_detailing", "in_review",
  "fab_ready", "erection_ready", "unmapped",
] as const;

const DRILLDOWN_ROW_CAP = 100;

// The drill-down can open from EITHER chip row: a detailing-status bucket
// (resolved via the summary's id sets) or a fabrication-status bucket (resolved
// by filtering elements on fab_status). The discriminated union keeps the two
// member-resolution paths + header metas unambiguous.
type FabStatusKey = keyof typeof FAB_STATUS_META;
type OpenBucket =
  | { kind: "detail"; key: ElementStatusKey }
  | { kind: "fab"; key: FabStatusKey }
  | null;

function ModelMappingSection({ summary, elements, onImport }: { summary?: ElementStatusSummary | null; elements?: any[]; onImport: () => void }) {
  const total = summary?.total ?? 0;
  const [openBucket, setOpenBucket] = useState<OpenBucket>(null);

  // Members in the open bucket. Detailing buckets resolve via the summary's id
  // sets so the list always agrees with the chip counts (same engine, same
  // truth); fab buckets filter elements by fab_status directly (the query layer
  // already excludes deleted rows; the !is_deleted guard is belt-and-suspenders).
  const bucketMembers = useMemo(() => {
    if (!openBucket) return [];
    if (openBucket.kind === "fab") {
      const key = openBucket.key;
      return (elements || []).filter((el) => el?.id && !el.is_deleted && el.fab_status === key);
    }
    if (!summary) return [];
    const ids = new Set(summary.idsByStatus?.[openBucket.key] || []);
    return (elements || []).filter((el) => el?.id && ids.has(String(el.id)));
  }, [openBucket, summary, elements]);

  // Header meta for the open drill-down: fab buckets use FAB_STATUS_META,
  // detailing buckets use ELEMENT_STATUS_META. The member table columns are
  // status-agnostic, so only the header label/color differs.
  const openMeta = openBucket
    ? (openBucket.kind === "fab" ? FAB_STATUS_META[openBucket.key] : ELEMENT_STATUS_META[openBucket.key])
    : null;
  const fab = useMemo(() => summarizeFabStatus(elements || []), [elements]);

  return (
    <SectionCard
      title="3D model mapping"
      icon={Boxes}
      headerAction={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {total > 0 && <span className="sbd-badge-info">{total} members</span>}
          <button className="sbd-btn sbd-btn-ghost" onClick={onImport} style={{ fontSize: 12 }}>
            Import member CSV
          </button>
        </div>
      }
    >
      <p style={{ margin: "0 0 12px", color: textMuted, fontSize: 12 }}>
        Steel members mapped to packages by piece mark — this drives the BIM viewer&apos;s status coloring.
      </p>

      {total === 0 ? (
        <EmptyState text="No model members yet — export a member/assembly report (CSV) from Tekla or SDS2 and import it to map the physical steel to packages, sequences, and RFIs." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 10, color: textPrimary, marginBottom: 4 }}>
              <span style={{ color: textMuted }}>Linked to detailing packages</span>
              <span className="sbd-num">{summary?.mappedPct ?? 0}%</span>
            </div>
            <div style={{ height: 7, borderRadius: 999, background: surface2, overflow: "hidden", border: `1px solid ${border}` }}>
              <div style={{ height: "100%", width: `${summary?.mappedPct ?? 0}%`, background: accent, boxShadow: `0 0 10px ${accent}` }} />
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {ELEMENT_BUCKET_ORDER.map((bucket) => {
              const count = summary?.counts?.[bucket] ?? 0;
              if (!count) return null;
              const meta = ELEMENT_STATUS_META[bucket];
              const active = openBucket?.kind === "detail" && openBucket.key === bucket;
              return (
                <button
                  key={bucket}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setOpenBucket(active ? null : { kind: "detail", key: bucket })}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "5px 10px", borderRadius: 999, cursor: "pointer",
                    border: `1px solid color-mix(in srgb, ${meta.color} ${active ? 85 : 45}%, transparent)`,
                    background: `color-mix(in srgb, ${meta.color} ${active ? 24 : 12}%, transparent)`,
                    fontFamily: mono, fontSize: 10, color: textPrimary,
                    outlineOffset: 2,
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: meta.color, flexShrink: 0 }} />
                  {meta.label}
                  <strong className="sbd-num" style={{ fontSize: 12 }}>{count}</strong>
                </button>
              );
            })}
          </div>

          {fab.total > 0 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 10, color: textPrimary, marginBottom: 6 }}>
                <span style={{ color: textMuted }}>Fabrication status (from model)</span>
                <span className="sbd-num">{fab.pct}% tracked</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {FAB_STATUS_ORDER.map((s) => {
                  const count = fab.counts[s] || 0;
                  if (!count) return null;
                  const key = s as FabStatusKey;
                  const meta = FAB_STATUS_META[key];
                  const active = openBucket?.kind === "fab" && openBucket.key === key;
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setOpenBucket(active ? null : { kind: "fab", key })}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "5px 10px", borderRadius: 999, cursor: "pointer",
                        border: `1px solid color-mix(in srgb, ${meta.color} ${active ? 85 : 45}%, transparent)`,
                        background: `color-mix(in srgb, ${meta.color} ${active ? 24 : 12}%, transparent)`,
                        fontFamily: mono, fontSize: 10, color: textPrimary,
                        outlineOffset: 2,
                      }}
                    >
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: meta.color, flexShrink: 0 }} />
                      {meta.label} <span aria-hidden="true">·</span> <strong className="sbd-num" style={{ fontSize: 12 }}>{count}</strong>
                    </button>
                  );
                })}
              </div>
              <div style={{ marginTop: 6, fontFamily: mono, fontSize: 9, color: textMuted }}>
                Color the model by these in the 3D Model tab → Fab mode.
              </div>
            </div>
          )}

          {openBucket && openMeta && (
            <div style={{ border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                padding: "8px 12px", borderBottom: `1px solid ${border}`, background: surface1,
              }}>
                <div style={{ fontFamily: mono, fontSize: 10, color: textMuted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  <span style={{ color: openMeta.color, fontWeight: 800 }}>{openMeta.label}</span>
                  {" · "}{pluralize(bucketMembers.length, "member")}
                  {bucketMembers.length > DRILLDOWN_ROW_CAP ? ` · showing first ${DRILLDOWN_ROW_CAP}` : ""}
                </div>
                <button
                  type="button"
                  onClick={() => setOpenBucket(null)}
                  className="sbd-btn sbd-btn-ghost"
                  style={{ fontSize: 11, padding: "2px 10px" }}
                >
                  Close
                </button>
              </div>
              <div style={{ maxHeight: 280, overflowY: "auto" }}>
                <table className="sbd-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ position: "sticky", top: 0, background: surface1, zIndex: 1 }}>
                      <th style={drillTh}>Mark</th>
                      <th style={drillTh}>Assembly</th>
                      <th style={drillTh}>Profile</th>
                      <th style={{ ...drillTh, textAlign: "right" }}>Qty</th>
                      <th style={drillTh}>Seq</th>
                      <th style={drillTh}>Area</th>
                      <th style={drillTh}>Drawing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bucketMembers.slice(0, DRILLDOWN_ROW_CAP).map((el) => (
                      <tr key={el.id}>
                        <td style={{ ...drillTd, fontWeight: 700, color: textPrimary }}>{el.piece_mark}</td>
                        <td style={drillTd}>{el.assembly_mark || "—"}</td>
                        <td style={{ ...drillTd, fontFamily: mono, fontSize: 11 }}>{el.profile || "—"}</td>
                        <td style={{ ...drillTd, textAlign: "right" }} className="sbd-num">{el.quantity ?? 1}</td>
                        <td style={drillTd}>{el.sequence_number || "—"}</td>
                        <td style={drillTd}>{el.erection_area || "—"}</td>
                        <td style={{ ...drillTd, color: el.drawing_id ? success : textMuted }}>
                          {el.drawing_no || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

const drillTh: CSSProperties = {
  textAlign: "left", padding: "7px 12px", fontFamily: "var(--font-mono)",
  fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase",
  color: textMuted, borderBottom: `1px solid ${border}`,
};
const drillTd: CSSProperties = { padding: "6px 12px", borderBottom: `1px solid ${border}`, color: "var(--text-secondary)" };

// ── Sequence Readiness rollup ───────────────────────────────────────────────
// The sequence-aware view: group packages by erection sequence and show how far
// each sequence's detailing has progressed + how many packages are fab/erection
// ready, so the schedule can pull detailing (design doc §7).

interface SequenceReadinessRow {
  sequence: string;
  packageCount: number;
  detailingPct: number;
  fabReadyCount: number;
  erectionReadyCount: number;
  atRiskCount: number;
}

function SequenceReadinessSection({ rows }: { rows: SequenceReadinessRow[] }) {
  return (
    <SectionCard
      title="Sequence readiness"
      headerAction={<span className="sbd-badge-info">{rows.length}</span>}
    >
      <p style={{ margin: "0 0 12px", color: textMuted, fontSize: 12 }}>
        Detailing progress + fab/erection readiness by erection sequence.
      </p>
      {rows.length === 0 || rows.every((r) => r.sequence === "Unsequenced") ? (
        // No REAL sequence exists yet — a lone "Unsequenced" bucket is just a dead
        // row, so show the actionable hint instead. Once at least one real
        // sequence exists the trailing Unsequenced bucket stays visible as an
        // exception (sorted last by computeSequenceReadiness).
        <EmptyState text="No packages linked to an erection sequence yet — set an Area / Sequence on the drawing set (or link a work package) to populate this." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((row) => (
            <div key={row.sequence} style={{
              display: "grid",
              gridTemplateColumns: "minmax(80px, 0.7fr) minmax(120px, 1.3fr) repeat(3, minmax(64px, 0.5fr))",
              gap: 10, alignItems: "center",
              padding: "10px 12px", borderRadius: 10,
              border: `1px solid ${row.atRiskCount ? "color-mix(in srgb, var(--status-warning) 46%, transparent)" : border}`,
              background: "var(--bg-surface-low)",
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: mono, fontSize: 9, color: textMuted, letterSpacing: "0.1em", textTransform: "uppercase" }}>Seq</div>
                <div style={{ color: textPrimary, fontWeight: 800, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.sequence}</div>
                <div style={{ color: textMuted, fontSize: 11 }}>{pluralize(row.packageCount, "pkg")}</div>
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 10, color: textPrimary, marginBottom: 4 }}>
                  <span style={{ color: textMuted }}>Detailing</span>
                  <span className="sbd-num">{row.detailingPct}%</span>
                </div>
                <div style={{ height: 7, borderRadius: 999, background: surface2, overflow: "hidden", border: `1px solid ${border}` }}>
                  <div style={{ height: "100%", width: `${row.detailingPct}%`, background: accent, boxShadow: `0 0 10px ${accent}` }} />
                </div>
              </div>
              <SeqMetric label="Fab" value={`${row.fabReadyCount}/${row.packageCount}`} tone={row.fabReadyCount === row.packageCount ? success : textMuted} />
              <SeqMetric label="Erect" value={`${row.erectionReadyCount}/${row.packageCount}`} tone={row.erectionReadyCount === row.packageCount ? success : textMuted} />
              <SeqMetric label="At risk" value={row.atRiskCount} tone={row.atRiskCount ? warning : success} />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ── Revision Impact Tracker ─────────────────────────────────────────────────
// Revisions that landed on sheets already moving downstream (fabricated /
// delivered / in field) — the rework / change-order exposure (design doc §7).

const REV_SEVERITY_TONE: Record<string, string> = { critical: error, high: warning, medium: info, low: textMuted };

function RevisionImpactSection({ rows, onCompare }: { rows: any[]; onCompare?: (drawingId: string) => void }) {
  const shown = (rows || []).slice(0, 8);
  return (
    <SectionCard
      title="Revision impact"
      headerAction={<span className="sbd-badge-info">{rows?.length || 0}</span>}
    >
      <p style={{ margin: "0 0 12px", color: textMuted, fontSize: 12 }}>
        Revisions that landed on steel already moving downstream (rework / CO risk).
      </p>
      {shown.length === 0 ? (
        <EmptyState text="No change-revisions on tracked sheets, or none with downstream exposure." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {shown.map((r) => {
            const noneReached = !r.fabricated && !r.delivered && !r.inField;
            const pillTone = r.severity === "critical" || r.severity === "high" ? "danger"
              : r.severity === "medium" ? "review" : "neutral";
            return (
              <div key={r.revisionId} style={{
                display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(150px, 1fr) auto", gap: 12, alignItems: "center",
                padding: "10px 12px", borderRadius: 10,
                border: `1px solid ${r.severity === "critical" ? "color-mix(in srgb, var(--status-error) 56%, transparent)" : border}`,
                background: "var(--bg-surface-low)",
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: textPrimary, fontWeight: 800, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {(r.sheetNumber || "—")} · {r.revisionCode}
                  </div>
                  <div style={{ color: textMuted, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.drawingSetName || "Unassigned set"}{r.issuedAt ? ` · ${fmtDate(r.issuedAt)}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {r.fabricated && <ReadyChip ok={false} label="Fabricated" bad />}
                  {r.delivered && <ReadyChip ok={false} label="Delivered" bad />}
                  {r.inField && <ReadyChip ok={false} label="In field" bad />}
                  {noneReached && <span style={{ color: textMuted, fontFamily: mono, fontSize: 10 }}>caught pre-fab</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {onCompare && r.drawingId && (
                    <button
                      type="button"
                      className="sbd-btn-ghost"
                      onClick={() => onCompare(String(r.drawingId))}
                      title="Overlay-compare this revision against the prior one"
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, minHeight: 30, padding: "4px 9px", fontFamily: mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}
                    >
                      <GitCompareArrows size={12} /> Compare
                    </button>
                  )}
                  <StatusPill tone={pillTone}>{r.severity}</StatusPill>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

// ── Inline Quick-Action Controls ────────────────────────────────────────────
// Compact controls shown directly on the "Next Decision" card so users can
// assign an owner or set a due date without navigating away.

interface InlineOwnerControlProps {
  currentOwner: string;
  onAssign: (owner: string) => void;
  disabled: boolean;
}

function InlineOwnerControl({ currentOwner, onAssign, disabled }: InlineOwnerControlProps) {
  const [open, setOpen] = useState(false);
  const isUnassigned = !currentOwner || currentOwner === "Unassigned";

  return (
    <div style={{
      padding: "10px 12px",
      borderRadius: 10,
      background: surface1,
      border: `1px solid ${isUnassigned ? "color-mix(in srgb, var(--status-warning) 46%, transparent)" : border}`,
      position: "relative",
    }}>
      <div style={{
        fontFamily: mono, fontSize: 8, color: textMuted,
        letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4,
        display: "flex", alignItems: "center", gap: 5,
      }}>
        <User size={10} />
        Owner
      </div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: "100%",
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: disabled ? "not-allowed" : "pointer",
            color: isUnassigned ? warning : textPrimary,
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "inherit",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textAlign: "left",
          }}
          title="Click to assign owner"
        >
          {isUnassigned ? "Assign..." : currentOwner}
        </button>
      ) : (
        <select
          autoFocus
          value=""
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value) {
              onAssign(e.target.value);
              setOpen(false);
            }
          }}
          onBlur={() => setOpen(false)}
          style={{
            width: "100%",
            background: surface2,
            border: `1px solid ${accent}`,
            borderRadius: 6,
            padding: "3px 6px",
            color: textPrimary,
            fontFamily: mono,
            fontSize: 11,
            fontWeight: 700,
            outline: "none",
            cursor: "pointer",
          }}
        >
          <option value="" disabled>Select owner...</option>
          {BIC_CHOICES.map((choice) => (
            <option key={choice} value={choice}>{choice}</option>
          ))}
        </select>
      )}
    </div>
  );
}

interface InlineDateControlProps {
  currentDate: string | null;
  isOverdue: boolean;
  onSetDate: (date: string) => void;
  disabled: boolean;
}

function InlineDateControl({ currentDate, isOverdue, onSetDate, disabled }: InlineDateControlProps) {
  const [open, setOpen] = useState(false);
  const hasDate = !!currentDate;

  return (
    <div style={{
      padding: "10px 12px",
      borderRadius: 10,
      background: surface1,
      border: `1px solid ${isOverdue ? "color-mix(in srgb, var(--status-error) 46%, transparent)" : !hasDate ? "color-mix(in srgb, var(--status-warning) 46%, transparent)" : border}`,
      position: "relative",
    }}>
      <div style={{
        fontFamily: mono, fontSize: 8, color: textMuted,
        letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4,
        display: "flex", alignItems: "center", gap: 5,
      }}>
        <CalendarDays size={10} />
        Required
      </div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: "100%",
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: disabled ? "not-allowed" : "pointer",
            color: isOverdue ? error : !hasDate ? warning : textPrimary,
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "inherit",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textAlign: "left",
          }}
          title="Click to set due date"
        >
          {hasDate ? fmtDate(currentDate) : "Set date..."}
        </button>
      ) : (
        <input
          type="date"
          autoFocus
          disabled={disabled}
          defaultValue={toDateInputValue(currentDate)}
          onChange={(e) => {
            if (e.target.value) {
              onSetDate(e.target.value);
              setOpen(false);
            }
          }}
          onBlur={() => setOpen(false)}
          style={{
            width: "100%",
            background: surface2,
            border: `1px solid ${accent}`,
            borderRadius: 6,
            padding: "3px 6px",
            color: textPrimary,
            fontFamily: mono,
            fontSize: 11,
            fontWeight: 700,
            outline: "none",
            cursor: "pointer",
          }}
        />
      )}
    </div>
  );
}

// ── Operational-state chip + drafting-state advance control ─────────────────

interface InlineDetailingControlProps {
  current: string | null | undefined;
  onAdvance: (next: string) => void;
  disabled: boolean;
}

// Manual drafting-state advance (In Detailing → Internal Review → Ready to
// Submit). Only rendered for drawing-set packages with NO governing submittal —
// once a submittal exists, the submittal machine owns the state (§20).
function InlineDetailingControl({ current, onAdvance, disabled }: InlineDetailingControlProps) {
  return (
    <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: surface1, border: `1px solid ${border}` }}>
      <div style={{
        fontFamily: mono, fontSize: 8, color: textMuted,
        letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8,
        display: "flex", alignItems: "center", gap: 5,
      }}>
        <ClipboardList size={10} />
        Detailing state
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {DRAFTING_STATES.map((s) => {
          const isCurrent = current === s;
          const color = getOperationalStateColor(s);
          return (
            <button
              key={s}
              type="button"
              disabled={disabled || isCurrent}
              onClick={() => onAdvance(s)}
              title={isCurrent ? `Already ${s}` : `Set to ${s}`}
              style={{
                padding: "5px 9px",
                borderRadius: 8,
                fontFamily: mono,
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.04em",
                cursor: disabled || isCurrent ? "default" : "pointer",
                color: isCurrent ? "#0b0e14" : color,
                background: isCurrent ? color : `color-mix(in srgb, ${color} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${color} 42%, transparent)`,
                opacity: disabled && !isCurrent ? 0.6 : 1,
              }}
            >
              {s}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Backward schedule + readiness panel ─────────────────────────────────────

const SCHEDULE_ROWS: Array<[string, string]> = [
  ["detailingStart", "Detailing start"],
  ["internalReviewDue", "Internal review"],
  ["submitBy", "Submit by"],
  ["approvalNeededBy", "Approval by"],
  ["fabReleaseRequiredBy", "Fab release by"],
  ["erectionReleaseRequiredBy", "Erection release by"],
];

interface ReadinessPanelProps {
  readiness: any;
  onToggle: (field: "material_impacted" | "long_lead_impact", value: boolean) => void;
  disabled: boolean;
}

function ReadinessPanel({ readiness, onToggle, disabled }: ReadinessPanelProps) {
  const {
    backwardDates = {}, scheduleRisk = {}, fabricationReady, erectionReady,
    rfiBlocked, revisionImpacted, materialImpacted, longLeadImpact, prioritySequence,
  } = readiness || {};
  const riskTone = scheduleRisk.severity === "critical" ? error : scheduleRisk.severity === "at_risk" ? warning : success;
  const riskLabel = scheduleRisk.severity === "critical"
    ? `Critical · ${scheduleRisk.daysLate}d`
    : scheduleRisk.severity === "at_risk" ? `At risk · ${scheduleRisk.daysLate}d` : "On track";
  const hasSchedule = SCHEDULE_ROWS.some(([k]) => backwardDates[k]);

  return (
    <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: surface1, border: `1px solid ${border}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div style={{ fontFamily: mono, fontSize: 8, color: textMuted, letterSpacing: "0.12em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5 }}>
          <CalendarClock size={10} /> Schedule &amp; readiness
        </div>
        <span title={(scheduleRisk.reasons || []).join("; ") || "On track"} style={{
          fontFamily: mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
          color: riskTone, padding: "2px 8px", borderRadius: 999,
          background: `color-mix(in srgb, ${riskTone} 16%, transparent)`,
          border: `1px solid color-mix(in srgb, ${riskTone} 42%, transparent)`,
        }}>
          {riskLabel}
        </span>
      </div>

      {hasSchedule ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 12px", marginBottom: 10 }}>
          {SCHEDULE_ROWS.map(([k, label]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontFamily: mono, fontSize: 10 }}>
              <span style={{ color: textMuted }}>{label}</span>
              <span style={{ color: backwardDates[k] ? textPrimary : textMuted }}>
                {backwardDates[k] ? fmtDate(backwardDates[k]) : "TBD"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: textMuted, marginBottom: 10, lineHeight: 1.4 }}>
          Link a work package with an erection date to compute the backward schedule.
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        <ReadyChip ok={!!fabricationReady} label="Fab ready" />
        <ReadyChip ok={!!erectionReady} label="Erect ready" />
        {rfiBlocked && <ReadyChip ok={false} label="RFI blocked" bad />}
        {revisionImpacted && <ReadyChip ok={false} label="Rev impacted" bad />}
        {prioritySequence && <ReadyChip ok label="Seq" neutral />}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <FlagToggle label="Material impacted" active={!!materialImpacted} disabled={disabled} onClick={() => onToggle("material_impacted", !materialImpacted)} />
        <FlagToggle label="Long-lead impact" active={!!longLeadImpact} disabled={disabled} onClick={() => onToggle("long_lead_impact", !longLeadImpact)} />
      </div>
    </div>
  );
}

interface PipelinePanelProps {
  topStatuses: Array<[string, unknown]>;
  openCount: number;
  onOpenTab: (key: string) => void;
}

function PipelinePanel({ topStatuses, openCount, onOpenTab }: PipelinePanelProps) {
  return (
    <SectionCard
      title="Open pipeline"
      headerAction={
        <button type="button" className="sbd-btn-ghost" onClick={() => onOpenTab("matrix")} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          Matrix
          <ArrowRight size={13} />
        </button>
      }
    >
      <p style={{ margin: "0 0 11px", color: textMuted, fontSize: 12 }}>
        Current approval status distribution.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {topStatuses.length === 0 ? (
          <EmptyState text="No open items to summarize." />
        ) : (
          topStatuses.map(([status, count]) => (
            <PipelineBar key={status} status={status} count={count as number} total={openCount} />
          ))
        )}
      </div>
    </SectionCard>
  );
}

interface TriageListProps {
  title: string;
  subtitle: string;
  items: any[];
  empty: string;
  onOpenTab: (key: string) => void;
  compact?: boolean;
  onEscalate?: (item: any, kind: "rfi" | "pco") => void;
}

function TriageList({ title, subtitle, items, empty, onOpenTab, compact = false, onEscalate }: TriageListProps) {
  return (
    <SectionCard
      title={title}
      headerAction={<span className="sbd-badge-info">{items.length}</span>}
    >
      <p style={{ margin: "0 0 12px", color: textMuted, fontSize: 12 }}>{subtitle}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.length === 0 ? (
          <EmptyState text={empty} />
        ) : (
          items.map((item) => (
            <TriageItemRow key={item.id} item={item} onOpen={() => onOpenTab(item.routeTab)} onEscalate={onEscalate} />
          ))
        )}
      </div>
    </SectionCard>
  );
}

function TriageItemRow({ item, onOpen, onEscalate }: { item: any; onOpen: () => void; onEscalate?: (item: any, kind: "rfi" | "pco") => void }) {
  const tone = getActionTone(item);
  // div+role=button (not <button>) so the per-row escalation buttons can nest
  // without invalid button-in-button markup. Enter/Space still activate.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{
        display: "grid",
        gridTemplateColumns: onEscalate
          ? "minmax(0, 1.5fr) minmax(90px, 0.35fr) minmax(120px, 0.45fr) auto 28px"
          : "minmax(0, 1.5fr) minmax(90px, 0.35fr) minmax(120px, 0.45fr) 28px",
        gap: 12,
        alignItems: "center",
        width: "100%",
        textAlign: "left",
        padding: "12px 14px",
        borderRadius: 12,
        border: `1px solid ${item.due.overdue ? "color-mix(in srgb, var(--status-error) 60%, transparent)" : border}`,
        background: item.due.overdue
          ? "color-mix(in srgb, var(--status-error) 11%, var(--bg-surface-low) 89%)"
          : "var(--bg-surface-low)",
        color: textPrimary,
        cursor: "pointer",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, marginBottom: 5 }}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: tone,
            boxShadow: `0 0 12px color-mix(in srgb, ${tone} 45%, transparent)`,
            flex: "0 0 auto",
          }} />
          <span style={{ fontFamily: mono, fontSize: 9, color: item.kind === "Drawing Set" ? accent : success, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 800 }}>
            {item.kind}
          </span>
        </div>
        <div style={{ color: textPrimary, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 13 }}>
          {item.title}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, minWidth: 0 }}>
          <span style={{ color: textMuted, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
            {item.group}
          </span>
          {item.detailingState
            ? <OperationalStateChip state={item.detailingState} />
            : <span style={{ color: textMuted, fontSize: 12, whiteSpace: "nowrap" }}>- {item.status}</span>}
          {item.isRR && <RRChip />}
        </div>
      </div>
      <div>
        <DueChip info={item.due} compact />
      </div>
      <div style={{ color: "var(--text-secondary)", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        <span style={{ color: textMuted, fontFamily: mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em" }}>Owner / Due</span>
        <br />
        {item.owner} - {fmtDate(item.dueDate)}
      </div>
      {onEscalate && (
        <div
          style={{ display: "flex", gap: 4 }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <EscalateIconButton
            icon={FileQuestion}
            label="RFI"
            title={`Draft an RFI from "${item.title}"`}
            onClick={() => onEscalate(item, "rfi")}
          />
          <EscalateIconButton
            icon={CircleDollarSign}
            label="PCO"
            title={`Draft a potential change order from "${item.title}"`}
            onClick={() => onEscalate(item, "pco")}
          />
        </div>
      )}
      <div style={{ color: textMuted, display: "flex", justifyContent: "flex-end" }}>
        <ArrowRight size={15} />
      </div>
    </div>
  );
}

// Per-row action/state handlers shared by the table and virtualized branches of
// the Drawing Register. The cell content is identical in both; only the wrapping
// element differs (<td> in the table, grid <div> in the virtual list).
interface RegisterRowHandlers {
  rowBtn: CSSProperties;
  aiDiffEnabled: boolean;
  onOpenSummary?: (summary: any) => void;
  setHealthDetail: (h: any) => void;
  setRevisionSet: (pkg: any) => void;
  setReportSet: (pkg: any) => void;
}

// Shared CSS-grid column template for the virtualized Drawing Register (header +
// rows use this exact string, so they always align). Widths approximate the
// table's auto-layout: a wide set-name column, content columns, then the
// right-aligned numeric / action columns.
const REGISTER_GRID_COLS =
  "minmax(220px, 2.4fr) minmax(64px, 0.8fr) minmax(80px, 0.9fr) 64px minmax(120px, 1.1fr) minmax(96px, 1fr) minmax(80px, 0.8fr) minmax(96px, 1fr) 56px minmax(150px, 1fr)";

// ⚠ MIRROR of the table-branch <Td> cells in DrawingRegisterTable (the
// !shouldVirtualize branch). Any column add/edit MUST be made in BOTH places.
/**
 * RegisterGridCells — virtualized mirror of the inline table <Td> cells. Same
 * content and styling, rendered as grid <div> cells (in REGISTER_GRID_COLS
 * order) so the absolute-positioned virtual rows line up with the grid header.
 */
function RegisterGridCells({ r, h }: { r: any; h: RegisterRowHandlers }) {
  return (
    <>
      <GridCell style={{ color: textPrimary, fontWeight: 600 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", minWidth: 0 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.pkg.name}</span>
          {r.locked && (
            <span title={r.lockedReason || "Locked — released for fabrication"} style={{ marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 4, fontFamily: mono, fontSize: 8.5, fontWeight: 800, color: "#f59e0b", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.4)", textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>
              <Lock size={9} /> Locked
            </span>
          )}
          {r.revSummary && (
            <button type="button" title="View the revision summary" onClick={(e) => { e.stopPropagation(); h.onOpenSummary?.(r.revSummary.summary); }}
              style={{ marginLeft: 8, fontFamily: mono, fontSize: 8.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", padding: "1px 6px", borderRadius: 4, cursor: "pointer", flexShrink: 0, background: "color-mix(in srgb, var(--accent) 14%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 40%, transparent)", color: accent }}>
              revised · {r.revSummary.sheets_changed}
            </button>
          )}
        </span>
      </GridCell>
      <GridCell style={{ color: textMuted }}>{r.setNo}</GridCell>
      <GridCell style={{ color: textMuted }}>{r.discipline}</GridCell>
      <GridCell align="right">{r.sheetCount}</GridCell>
      <GridCell>{r.effectiveState && r.effectiveState !== "Not Started" ? <OperationalStateChip state={r.effectiveState} /> : <span style={{ fontFamily: mono, fontSize: 10, color: textMuted }}>{r.dominantStage || "No submittal"}</span>}</GridCell>
      <GridCell>{r.health ? <HealthChip health={r.health} onClick={() => h.setHealthDetail(r.health)} /> : <span style={{ fontFamily: mono, fontSize: 10, color: textMuted }}>—</span>}</GridCell>
      <GridCell style={{ color: r.done ? success : textMuted }}>{r.releasedCount}/{r.sheetCount}</GridCell>
      <GridCell><DueChip info={r.due} /></GridCell>
      <GridCell align="right" style={{ color: textMuted }}>{r.maxRev || "—"}</GridCell>
      <GridCell align="right" style={{ whiteSpace: "nowrap" }}>
        {r.pkg.parent && (
          <button
            type="button"
            disabled={r.locked}
            title={r.locked ? `Locked — ${r.lockedReason || "an admin must unlock before a new revision"}` : "Upload a new revision for this set"}
            onClick={() => { if (!r.locked) h.setRevisionSet(r.pkg); }}
            style={{ ...h.rowBtn, opacity: r.locked ? 0.45 : 1, cursor: r.locked ? "not-allowed" : "pointer" }}
          >New Rev</button>
        )}
        {h.aiDiffEnabled && (
          <button type="button" title="AI Revision Impact Report" onClick={() => h.setReportSet(r.pkg)} style={{ ...h.rowBtn, marginLeft: 6, color: accent, borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)" }}>✦ Report</button>
        )}
      </GridCell>
    </>
  );
}

/**
 * RegisterVirtualList — virtualized rendering of the Drawing Register, used only
 * when row count exceeds VIRTUALIZE_THRESHOLD. Uses a sticky CSS-grid header and
 * absolute-positioned grid rows (the repo's useVirtualizer house pattern). The
 * left-border late/done accent and row keys are preserved from the table.
 */
function RegisterVirtualList({
  rows, sortByHealth, setSortByHealth, h,
}: {
  rows: any[];
  sortByHealth: null | "asc" | "desc";
  setSortByHealth: (fn: (s: null | "asc" | "desc") => null | "asc" | "desc") => void;
  h: RegisterRowHandlers;
}) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 41,
    overscan: 12,
  });

  return (
    <div style={{ border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden", background: surface1 }}>
      <div style={{
        display: "grid", gridTemplateColumns: REGISTER_GRID_COLS,
        borderBottom: `1px solid ${border}`, borderLeft: "3px solid transparent",
      }}>
        <GridHeaderCell>Drawing Set Package</GridHeaderCell>
        <GridHeaderCell>Set #</GridHeaderCell>
        <GridHeaderCell>Discipline</GridHeaderCell>
        <GridHeaderCell align="right">Sheets</GridHeaderCell>
        <GridHeaderCell>Status</GridHeaderCell>
        <GridHeaderCell>
          <span
            onClick={() => setSortByHealth((s) => (s === "asc" ? "desc" : s === "desc" ? null : "asc"))}
            style={{ cursor: "pointer", userSelect: "none" }}
            title="Sort by health score"
          >
            Health{sortByHealth === "asc" ? " ▲" : sortByHealth === "desc" ? " ▼" : ""}
          </span>
        </GridHeaderCell>
        <GridHeaderCell>Released</GridHeaderCell>
        <GridHeaderCell>Due</GridHeaderCell>
        <GridHeaderCell align="right">Rev</GridHeaderCell>
        <GridHeaderCell align="right">{""}</GridHeaderCell>
      </div>
      <div ref={parentRef} style={{ maxHeight: 600, overflowY: "auto" }}>
        <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const r = rows[virtualRow.index];
            return (
              <div
                key={r.pkg.key}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: "absolute", top: 0, left: 0, width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                  display: "grid", gridTemplateColumns: REGISTER_GRID_COLS,
                  borderTop: virtualRow.index === 0 ? "none" : `1px solid ${border}`,
                  borderLeft: r.late ? "3px solid var(--status-error)" : r.done ? "3px solid var(--status-success)" : "3px solid transparent",
                }}
              >
                <RegisterGridCells r={r} h={h} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * DrawingRegisterTable — the Drawing Register as a clean, flat, per-set table,
 * mirroring the Approval/Submittal register look (same Th/Td/OperationalStateChip/DueChip
 * primitives) instead of the dense grouped DrawingsTable. One row per drawing
 * set. Left border: red = late, green = done (good to go), neutral = in progress.
 * Full sheet-level management still lives on the standalone Drawings page.
 */
export function DrawingRegisterTable({
  setPackages, projectId, activeProject, drawingSets = [], isLoading, healthByKey, currentRevByDrawingId, summariesBySet, onRevisionUploaded, onOpenSummary,
}: {
  setPackages: any[]; projectId?: string; activeProject?: any; drawingSets?: any[]; isLoading?: boolean;
  healthByKey?: Map<string, any>;
  /** Authoritative current revision per drawing (drawing_revisions.is_current) —
   *  drives the "Rev" column instead of the deprecated drawings.revision_number. */
  currentRevByDrawingId?: Map<string, CurrentRevisionInfo>;
  summariesBySet?: Map<string, any>;
  onRevisionUploaded?: (pkgKey: string) => void;
  onOpenSummary?: (summary: any) => void;
}) {
  const aiDiffEnabled = useFlag("revision_ai_diff");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can } = useAppSecurity() as any;
  const canEdit = !can || can("edit", "drawing");
  const [search, setSearch] = useState("");
  const [revisionSet, setRevisionSet] = useState<any>(null);
  const [reportSet, setReportSet] = useState<any>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [logImportOpen, setLogImportOpen] = useState(false);
  const [healthDetail, setHealthDetail] = useState<any>(null);
  const [sortByHealth, setSortByHealth] = useState<null | "asc" | "desc">(null);

  const allSheets = useMemo(() => (setPackages || []).flatMap((p: any) => p.sheets || []), [setPackages]);
  const existingSetNames = useMemo(() => [...new Set((setPackages || []).map((p: any) => p.name).filter(Boolean))], [setPackages]);
  const refetchDrawings = () => {
    qc.invalidateQueries({ queryKey: ["drawings"] });
    qc.invalidateQueries({ queryKey: ["drawing-sets", projectId] });
    qc.invalidateQueries({ queryKey: ["drawing-revisions", projectId] });
    // Doc Control register reads the current revision from drawing_register_view
    // under this key — without it the register served a stale revision after an
    // upload until a manual page reload.
    qc.invalidateQueries({ queryKey: ["drawing-register", projectId] });
  };

  const rowBtn: CSSProperties = {
    fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
    padding: "3px 8px", borderRadius: 6, cursor: "pointer",
    background: "transparent", border: `1px solid ${border}`, color: textMuted,
  };

  const rows = useMemo(() => {
    return (setPackages || [])
      .map((pkg: any) => {
        const sheets: any[] = pkg.sheets || [];
        const submittals: any[] = pkg.submittals || [];
        const latestSubmittal = submittals.slice().sort((a, b) => (b.round_number || 1) - (a.round_number || 1))[0] || null;
        const sheetCount = sheets.length || (pkg.parent?.sheet_count ?? 0);
        // Per-sheet "released" count is DISPLAY ONLY (the n/total badge). It still
        // reads the legacy columns to show progress, but it MUST NOT decide the
        // package's released/done state — that is submittal-governed below.
        const releasedCount = sheets.filter((d) => d.stage === "Released" || d.set_approval_status === "approved").length;
        // §20-21: the package's released/done state is the submittal authority, via
        // the SAME predicate as the hub's "Sets Released" KPI (isClosedPackage), so
        // the Released column and the KPI never disagree. A stale legacy
        // set_approval_status="approved" on a sheet can no longer force "Released"
        // while a governing submittal is still mid-flow.
        const done = isClosedPackage(pkg);
        // Operational (coalesced) state drives the Status chip so it agrees with the
        // Released column — a mid-flow submittal can't render alongside a green
        // "Released", and a released package reads "Released" in both columns.
        const effectiveState = effectiveDetailingState(pkg.parent, submittals, sheets);
        const due = dueInfo(getSubmittalDueDate(latestSubmittal), done);
        const discipline = pkg.parent?.discipline || [...new Set(sheets.map((d) => d.discipline).filter(Boolean))][0] || "—";
        // §20-21: the displayed Rev is a per-set rollup of the AUTHORITATIVE
        // current revision (drawing_revisions.is_current via currentRevByDrawingId)
        // — the code of the highest-version sheet — NOT the drift-prone, free-text
        // drawings.revision_number. currentRevisionForPackage already falls back
        // to the legacy number, then "—", when no sheet has a current revision.
        const maxRev = currentRevisionForPackage(sheets, currentRevByDrawingId || new Map());
        const stageCounts: Record<string, number> = {};
        for (const d of sheets) if (d.stage) stageCounts[d.stage] = (stageCounts[d.stage] || 0) + 1;
        const dominantStage = Object.entries(stageCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
        return {
          pkg, due, sheetCount, releasedCount, discipline, maxRev, dominantStage,
          // `status` (raw latest-submittal status) is retained for the search
          // filter below ONLY — it does NOT drive the Status cell, which renders
          // from `effectiveState` (the coalesced operational state).
          status: latestSubmittal?.status || null, effectiveState, done, late: !!due.overdue && !done,
          health: healthByKey?.get(pkg.key) || null,
          locked: !!pkg.parent?.is_locked,
          lockedReason: pkg.parent?.locked_reason || null,
          revSummary: pkg.setId ? (summariesBySet?.get(String(pkg.setId)) || null) : null,
          setNo: pkg.parent ? formatDrawingSetNumber(pkg.parent) : "TBD",
        };
      })
      .filter((r) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (r.pkg.name || "").toLowerCase().includes(q)
          || String(r.setNo).toLowerCase().includes(q)
          || (r.discipline || "").toLowerCase().includes(q)
          || (r.status || "").toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (sortByHealth) {
          const sa = a.health?.score ?? 101;
          const sb = b.health?.score ?? 101;
          return sortByHealth === "asc" ? sa - sb : sb - sa;
        }
        return compareDrawingSetPackages(a.pkg.parent || a.pkg, b.pkg.parent || b.pkg);
      });
  }, [setPackages, search, healthByKey, sortByHealth, summariesBySet, currentRevByDrawingId]);

  // Above this many rows, render the virtualized grid instead of a full <table>
  // so large projects (1000+ sets) stay fast. Small projects keep the exact
  // table rendering below — unchanged.
  const VIRTUALIZE_THRESHOLD = 100;
  const shouldVirtualize = rows.length > VIRTUALIZE_THRESHOLD;
  const rowHandlers: RegisterRowHandlers = {
    rowBtn, aiDiffEnabled, onOpenSummary, setHealthDetail, setRevisionSet, setReportSet,
  };

  if (isLoading) return <LoadingSkeleton />;

  return (
    <SectionCard
      title="Drawing register"
      headerAction={
        <button type="button" className="sbd-btn" title="Full Drawings editor — filters, bulk actions, rename / delete, per-sheet" onClick={() => navigate("/Drawings")}>Open full editor ↗</button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 1 440px", minWidth: 200 }}>
          <Search size={14} color={textMuted} style={{ position: "absolute", left: 10, top: 9 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search drawing sets…"
            style={{ width: "100%", padding: "7px 10px 7px 30px", borderRadius: 8, border: `1px solid ${border}`, background: surface1, color: textPrimary, fontFamily: mono, fontSize: 12, outline: "none" }}
          />
        </div>
        <div style={{ flex: 1 }} />
        {canEdit && (
          <button type="button" className="sbd-btn sbd-btn-primary cmd-btn cmd-btn--primary" onClick={() => setUploadOpen(true)}>+ Upload Drawings</button>
        )}
        {canEdit && (
          <button type="button" className="sbd-btn" onClick={() => setLogImportOpen(true)}>Import Log</button>
        )}
      </div>

      {shouldVirtualize ? (
        // ≥100 rows: virtualized grid. desk-table is intentionally NOT applied here —
        // RegisterVirtualList uses its own CSS grid layout (not a <table> element)
        // and the divergence is deliberate so the plain-table codepath can adopt
        // kit table styling without breaking the virtual renderer's grid geometry.
        <RegisterVirtualList rows={rows} sortByHealth={sortByHealth} setSortByHealth={setSortByHealth} h={rowHandlers} />
      ) : (
      <div style={{ border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden", background: surface1 }}>
        {/* desk-table: kit table class — plain-table codepath only (see note on RegisterVirtualList above). */}
        <table className="desk-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <Th>Drawing Set Package</Th>
              <Th>Set #</Th>
              <Th>Discipline</Th>
              <Th style={{ textAlign: "right" }}>Sheets</Th>
              <Th>Status</Th>
              <Th>
                <span
                  onClick={() => setSortByHealth((s) => (s === "asc" ? "desc" : s === "desc" ? null : "asc"))}
                  style={{ cursor: "pointer", userSelect: "none" }}
                  title="Sort by health score"
                >
                  Health{sortByHealth === "asc" ? " ▲" : sortByHealth === "desc" ? " ▼" : ""}
                </span>
              </Th>
              <Th>Released</Th>
              <Th>Due</Th>
              <Th style={{ textAlign: "right" }}>Rev</Th>
              <Th style={{ textAlign: "right" }}>{""}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <Td colSpan={10} style={{ textAlign: "center", color: textMuted, padding: 28 }}>
                  No drawing sets {search ? "match your search" : "yet"}.
                </Td>
              </tr>
            ) : rows.map((r) => (
              <tr key={r.pkg.key} style={{
                borderTop: `1px solid ${border}`,
                borderLeft: r.late ? "3px solid var(--status-error)" : r.done ? "3px solid var(--status-success)" : "3px solid transparent",
              }}>
                {/* ⚠ MIRROR of RegisterGridCells (virtualized branch) — edit both when changing columns. */}
                <Td style={{ color: textPrimary, fontWeight: 600 }}>
                  {r.pkg.name}
                  {r.locked && (
                    <span title={r.lockedReason || "Locked — released for fabrication"} style={{ marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 4, fontFamily: mono, fontSize: 8.5, fontWeight: 800, color: "#f59e0b", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.4)", textTransform: "uppercase", letterSpacing: "0.04em", verticalAlign: "middle" }}>
                      <Lock size={9} /> Locked
                    </span>
                  )}
                  {r.revSummary && (
                    <button type="button" title="View the revision summary" onClick={(e) => { e.stopPropagation(); onOpenSummary?.(r.revSummary.summary); }}
                      style={{ marginLeft: 8, fontFamily: mono, fontSize: 8.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", padding: "1px 6px", borderRadius: 4, cursor: "pointer", verticalAlign: "middle", background: "color-mix(in srgb, var(--accent) 14%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 40%, transparent)", color: accent }}>
                      revised · {r.revSummary.sheets_changed}
                    </button>
                  )}
                </Td>
                <Td style={{ color: textMuted }}>{r.setNo}</Td>
                <Td style={{ color: textMuted }}>{r.discipline}</Td>
                <Td className="is-num" style={{ textAlign: "right" }}>{r.sheetCount}</Td>
                <Td>{r.effectiveState && r.effectiveState !== "Not Started"
                  // C3: render the operational state via kit StatusPill — tone mapped from
                  // the coalesced state string. OperationalStateChip is still used elsewhere
                  // in this file (triage lists, next-decision panel); only the register
                  // Status cell is swapped here.
                  ? <StatusPill tone={
                      /Released for Fabrication|Approved|Partially Released|Released for Erection/i.test(r.effectiveState) ? "done"
                      : /Internal Review|OFA|BFA|OFS|IFC/i.test(r.effectiveState) ? "review"
                      : /R&R|Revise/i.test(r.effectiveState) ? "danger"
                      : /IFA|In Detailing|Ready to Submit/i.test(r.effectiveState) ? "open"
                      : "neutral"
                    }>{r.effectiveState}</StatusPill>
                  : <span style={{ fontFamily: mono, fontSize: 10, color: textMuted }}>{r.dominantStage || "No submittal"}</span>
                }</Td>
                <Td>{r.health ? <HealthChip health={r.health} onClick={() => setHealthDetail(r.health)} /> : <span style={{ fontFamily: mono, fontSize: 10, color: textMuted }}>—</span>}</Td>
                <Td className="is-num" style={{ color: r.done ? success : textMuted }}>{r.releasedCount}/{r.sheetCount}</Td>
                <Td><DueChip info={r.due} /></Td>
                <Td className="is-num" style={{ textAlign: "right", color: textMuted }}>{r.maxRev || "—"}</Td>
                <Td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {r.pkg.parent && (
                    <button
                      type="button"
                      disabled={r.locked}
                      title={r.locked ? `Locked — ${r.lockedReason || "an admin must unlock before a new revision"}` : "Upload a new revision for this set"}
                      onClick={() => { if (!r.locked) setRevisionSet(r.pkg); }}
                      style={{ ...rowBtn, opacity: r.locked ? 0.45 : 1, cursor: r.locked ? "not-allowed" : "pointer" }}
                    >New Rev</button>
                  )}
                  {aiDiffEnabled && (
                    <button type="button" title="AI Revision Impact Report" onClick={() => setReportSet(r.pkg)} style={{ ...rowBtn, marginLeft: 6, color: accent, borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)" }}>✦ Report</button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {healthDetail && <HealthBreakdownDialog health={healthDetail} onClose={() => setHealthDetail(null)} />}

      {revisionSet && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <RevisionUploadModal open onClose={() => setRevisionSet(null)} onComplete={() => { onRevisionUploaded?.(revisionSet?.key); setRevisionSet(null); }} activeProject={activeProject} preSelectedSet={revisionSet?.parent || revisionSet} drawingSets={drawingSets} />
        </Suspense>
      )}
      {reportSet && (
        <Suspense fallback={null}>
          <RevisionImpactReportModal open onClose={() => setReportSet(null)} set={reportSet} projectId={projectId} />
        </Suspense>
      )}
      {uploadOpen && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <DrawingSetUploadModal open onClose={() => setUploadOpen(false)} onComplete={refetchDrawings} activeProject={activeProject} existingDrawings={allSheets} existingSetNames={existingSetNames} />
        </Suspense>
      )}
      {logImportOpen && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <DrawingLogImportModal open projectId={projectId} projectName={activeProject?.name} onClose={() => setLogImportOpen(false)} onImported={refetchDrawings} />
        </Suspense>
      )}
      </div>
    </SectionCard>
  );
}

// ── Drawing health (slice 2 of the Hub Command Center) ─────────────────────
function HealthBreakdownDialog({ health, onClose }: { health: any; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent style={{ maxWidth: 460, background: "var(--bg-base, #0D1117)", border: `1px solid ${border}` }}>
        <DialogHeader>
          <DialogTitle>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: health.band.color, flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 700, color: textPrimary }}>{health.setName}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontFamily: mono, fontSize: 20, fontWeight: 800, color: health.band.color }}>{health.grade}</span>
              <span className="sbd-num" style={{ fontFamily: mono, fontSize: 20, fontWeight: 800, color: textPrimary }}>{health.score}</span>
            </div>
          </DialogTitle>
        </DialogHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 9, padding: "4px 2px 6px" }}>
          <div style={{ fontFamily: mono, fontSize: 9.5, color: textMuted, letterSpacing: "0.08em" }}>
            {health.band.label.toUpperCase()} · STAGE {String(health.stage).toUpperCase()} · {100 - health.score} PTS DEDUCTED
          </div>
          {health.factors.map((f: any) => {
            const pct = f.weight ? Math.round((f.score / f.weight) * 100) : 100;
            const col = f.deduction <= 0 ? success : f.severity === "critical" ? error : f.severity === "high" ? warning : "#D29922";
            return (
              <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 12, color: textPrimary, fontWeight: 600 }}>{f.label}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontFamily: mono, fontSize: 10, color: f.deduction > 0 ? col : textMuted }}>
                    {f.deduction > 0 ? `−${f.deduction}` : "ok"} <span style={{ color: textMuted }}>/ {f.weight}</span>
                  </span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: "var(--bg-surface, rgba(255,255,255,0.06))", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: col, transition: "width 0.2s ease" }} />
                </div>
                <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.4 }}>{f.detail}</div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Control Board "fleet health" rollup — average score, band distribution, and
 *  the sets that need attention (click → Drawing Register). */
export function FleetHealthStrip({ fleet, onOpenRegister }: { fleet: any; onOpenRegister?: () => void }) {
  if (!fleet || !fleet.count) return null;
  const bands: Array<[string, string, number]> = [
    ["Excellent", "#2EA043", fleet.byBand.excellent],
    ["Good", "#7DBE3C", fleet.byBand.good],
    ["At Risk", "#D29922", fleet.byBand.at_risk],
    ["Critical", "#F85149", fleet.byBand.critical],
  ];
  const worst = (fleet.worst || []).filter((s: any) => s.score < 75).slice(0, 3);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, padding: "12px 14px", marginBottom: 12, borderRadius: 10, border: `1px solid ${border}`, background: surface1 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: textMuted }}>Fleet Health</span>
        <span className="sbd-num" style={{ fontFamily: mono, fontSize: 22, fontWeight: 800, color: textPrimary }}>{fleet.averageScore}<span style={{ fontSize: 12, color: textMuted, fontWeight: 600 }}> avg</span></span>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {bands.filter(([, , n]) => n > 0).map(([label, color, n]) => (
          <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: mono, fontSize: 10, fontWeight: 700, color: textMuted }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />{n} {label.toUpperCase()}
          </span>
        ))}
      </div>
      <span style={{ flex: 1 }} />
      {worst.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: textMuted }}>Needs attention</span>
          {worst.map((s: any) => (
            <button key={s.setId || s.setName} type="button" onClick={onOpenRegister} title={`${s.setName} — ${s.band.label}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 8px", borderRadius: 999, cursor: "pointer", background: `color-mix(in srgb, ${s.band.color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${s.band.color} 40%, transparent)` }}>
              <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 800, color: s.band.color }}>{s.grade} {s.score}</span>
              <span style={{ fontSize: 11, color: textPrimary, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.setName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
