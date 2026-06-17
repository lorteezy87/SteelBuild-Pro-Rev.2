import { Fragment, lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { ComponentType, CSSProperties, ReactNode } from "react";
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
  Layers3,
  Link2,
  Lock,
  Search,
  ShieldCheck,
  User,
} from "lucide-react";
import LoadingSkeletonRaw from "@/components/shared/LoadingSkeleton";
import CycleTimeCardRaw from "@/components/submittals/CycleTimeCard";
import AgingReportTableRaw from "@/components/submittals/AgingReportTable";
import { compareDrawingSetPackages, formatDrawingSetNumber } from "@/lib/drawingSetOrdering";
import { DRAFTING_STATES } from "@/lib/detailingPackageState";
import { ELEMENT_STATUS_META } from "@/services/modelElementStatus";
import type { ElementStatusKey, ElementStatusSummary } from "@/services/modelElementStatus";
import {
  BIC_CHOICES,
  STATUS_COLORS,
  accent,
  border,
  dueInfo,
  error,
  fmtDate,
  getActionTone,
  getOperationalStateColor,
  getStatusColor,
  getSubmittalDueDate,
  info,
  isClosedSubmittal,
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
import type { DueInfo, Submittal } from "./types";
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
const CycleTimeCard = CycleTimeCardRaw as unknown as ComponentType<AnyProps>;
const AgingReportTable = AgingReportTableRaw as unknown as ComponentType<AnyProps>;
// Lazy so the heavy revision/PDF modals only load when a row action fires —
// they never weigh down the hub chunk on tab open.
const RevisionUploadModal = lazy(() => import("@/components/drawings/RevisionUploadModal")) as unknown as ComponentType<AnyProps>;
const RevisionImpactReportModal = lazy(() => import("@/components/drawings/RevisionImpactReportModal")) as unknown as ComponentType<AnyProps>;
const DrawingSetUploadModal = lazy(() => import("@/components/drawings/DrawingSetUploadModal")) as unknown as ComponentType<AnyProps>;
const DrawingLogImportModal = lazy(() => import("@/components/drawings/DrawingLogImportModal")) as unknown as ComponentType<AnyProps>;

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
    new Map([...triage.overdue, ...triage.needsAction, ...triage.dueSoon].map((item: any) => [item.id, item])).values()
  ).slice(0, 12) as any[];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))",
        gap: 14,
      }}>
        <div className="sbd-card-strong" style={{
          padding: 20,
          borderRadius: 16,
          border: `1px solid ${triage.overdue.length ? "color-mix(in srgb, var(--status-error) 56%, var(--border-default))" : border}`,
          background: triage.overdue.length
            ? "linear-gradient(135deg, color-mix(in srgb, var(--status-error) 13%, var(--bg-surface) 87%), var(--bg-surface-low))"
            : "linear-gradient(135deg, color-mix(in srgb, var(--status-success) 8%, var(--bg-surface) 92%), var(--bg-surface-low))",
          boxShadow: triage.overdue.length ? "0 16px 42px rgba(248,81,73,0.12)" : "var(--shadow-card)",
        }}>
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
        </div>

        <div className="sbd-card" style={{ padding: 18, borderRadius: 16, border: `1px solid ${focusItem ? focusTone : border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: mono, color: textMuted, fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                Next Decision
              </div>
              <h3 style={{ margin: "6px 0 0", color: textPrimary, fontSize: 18, lineHeight: 1.2 }}>
                {focusItem ? focusItem.title : "No open exception"}
              </h3>
            </div>
            <DueChip info={focusItem?.due || dueInfo(null)} compact />
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
        </div>
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

function ModelMappingSection({ summary, elements, onImport }: { summary?: ElementStatusSummary | null; elements?: any[]; onImport: () => void }) {
  const total = summary?.total ?? 0;
  const [openBucket, setOpenBucket] = useState<ElementStatusKey | null>(null);

  // Members in the open bucket, resolved via the summary's id sets so the
  // list always agrees with the chip counts (same engine, same truth).
  const bucketMembers = useMemo(() => {
    if (!openBucket || !summary) return [];
    const ids = new Set(summary.idsByStatus?.[openBucket] || []);
    return (elements || []).filter((el) => el?.id && ids.has(String(el.id)));
  }, [openBucket, summary, elements]);

  const openMeta = openBucket ? ELEMENT_STATUS_META[openBucket] : null;

  return (
    <section className="sbd-card" style={{ padding: 16, borderRadius: 14, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <Boxes size={18} style={{ color: accent, marginTop: 2 }} />
          <div>
            <h3 style={{ margin: 0, color: textPrimary, fontSize: 16 }}>3D Model Mapping</h3>
            <p style={{ margin: "4px 0 0", color: textMuted, fontSize: 12 }}>
              Steel members mapped to packages by piece mark — this drives the BIM viewer&apos;s status coloring.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {total > 0 && <span className="sbd-badge-info">{total} members</span>}
          <button className="sbd-btn sbd-btn-ghost" onClick={onImport} style={{ fontSize: 12 }}>
            Import member CSV
          </button>
        </div>
      </div>

      {total === 0 ? (
        <EmptyState text="No model members yet — export a member/assembly report (CSV) from Tekla or SDS2 and import it to map the physical steel to packages, sequences, and RFIs." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 10, color: textPrimary, marginBottom: 4 }}>
              <span style={{ color: textMuted }}>Mapped to packages</span>
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
              const active = openBucket === bucket;
              return (
                <button
                  key={bucket}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setOpenBucket(active ? null : bucket)}
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
    </section>
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
    <section className="sbd-card" style={{ padding: 16, borderRadius: 14, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, color: textPrimary, fontSize: 16 }}>Sequence Readiness</h3>
          <p style={{ margin: "4px 0 0", color: textMuted, fontSize: 12 }}>
            Detailing progress + fab/erection readiness by erection sequence.
          </p>
        </div>
        <span className="sbd-badge-info">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <EmptyState text="No packages linked to an erection sequence yet — link work packages to drawing sets to populate this." />
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
    </section>
  );
}

function SeqMetric({ label, value, tone }: { label: string; value: ReactNode; tone: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: mono, fontSize: 9, color: textMuted, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</div>
      <div className="sbd-num" style={{ color: tone, fontFamily: mono, fontSize: 15, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}

// ── Revision Impact Tracker ─────────────────────────────────────────────────
// Revisions that landed on sheets already moving downstream (fabricated /
// delivered / in field) — the rework / change-order exposure (design doc §7).

const REV_SEVERITY_TONE: Record<string, string> = { critical: error, high: warning, medium: info, low: textMuted };

function RevisionImpactSection({ rows, onCompare }: { rows: any[]; onCompare?: (drawingId: string) => void }) {
  const shown = (rows || []).slice(0, 8);
  return (
    <section className="sbd-card" style={{ padding: 16, borderRadius: 14, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, color: textPrimary, fontSize: 16 }}>Revision Impact</h3>
          <p style={{ margin: "4px 0 0", color: textMuted, fontSize: 12 }}>
            Revisions that landed on steel already moving downstream (rework / CO risk).
          </p>
        </div>
        <span className="sbd-badge-info">{rows?.length || 0}</span>
      </div>
      {shown.length === 0 ? (
        <EmptyState text="No change-revisions on tracked sheets, or none with downstream exposure." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {shown.map((r) => {
            const tone = REV_SEVERITY_TONE[r.severity] || textMuted;
            const noneReached = !r.fabricated && !r.delivered && !r.inField;
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
                  <span style={{
                    fontFamily: mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
                    color: tone, padding: "3px 9px", borderRadius: 999,
                    background: `color-mix(in srgb, ${tone} 16%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${tone} 42%, transparent)`,
                  }}>
                    {r.severity}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
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

function OperationalStateChip({ state }: { state: string }) {
  const color = getOperationalStateColor(state);
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 999,
      fontFamily: mono,
      fontSize: 9,
      fontWeight: 800,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color,
      background: `color-mix(in srgb, ${color} 16%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 42%, transparent)`,
      whiteSpace: "nowrap",
    }}>
      {state}
    </span>
  );
}

// R&R loop-back badge, shown next to the stage chip when the governing submittal
// is Revise-and-Resubmit / Rejected. The stage rolls up to IFA for counts, so
// this keeps an R&R rejection from reading as a fresh IFA on the board (and
// matches the register's literal "Revise and Resubmit").
function RRChip() {
  const color = "#f59e0b"; // matches "Revise and Resubmit" in format.ts
  return (
    <span
      title="Revise & Resubmit — the review sent this package back; the cycle restarts at IFA"
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontFamily: mono,
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 42%, transparent)`,
        whiteSpace: "nowrap",
      }}
    >
      R&amp;R
    </span>
  );
}

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

function ReadyChip({ ok, label, bad = false, neutral = false }: { ok: boolean; label: string; bad?: boolean; neutral?: boolean }) {
  const color = neutral ? info : bad ? error : ok ? success : textMuted;
  return (
    <span style={{
      fontFamily: mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
      color, padding: "2px 7px", borderRadius: 999,
      background: `color-mix(in srgb, ${color} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
    }}>
      {label}
    </span>
  );
}

function FlagToggle({ label, active, disabled, onClick }: { label: string; active: boolean; disabled: boolean; onClick: () => void }) {
  const color = active ? warning : textMuted;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={active ? `Clear: ${label}` : `Flag: ${label}`}
      style={{
        fontFamily: mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
        color: active ? "#0b0e14" : color, cursor: disabled ? "default" : "pointer",
        padding: "4px 9px", borderRadius: 8,
        background: active ? warning : `color-mix(in srgb, ${textMuted} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {active ? "● " : "○ "}{label}
    </button>
  );
}

interface RiskPillProps {
  icon: IconType;
  label: string;
  value: ReactNode;
  color: string;
}

function RiskPill({ icon: Icon, label, value, color }: RiskPillProps) {
  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "7px 10px",
      borderRadius: 999,
      background: `color-mix(in srgb, ${color} 11%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      color,
      fontFamily: mono,
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
    }}>
      <Icon size={13} />
      <span>{label}</span>
      <span className="sbd-num" style={{ color: textPrimary }}>{value}</span>
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
    <div className="sbd-card" style={{ padding: 16, borderRadius: 16, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
        <div>
          <h3 style={{ margin: 0, color: textPrimary, fontSize: 16 }}>Open Pipeline</h3>
          <p style={{ margin: "4px 0 0", color: textMuted, fontSize: 12 }}>
            Current approval status distribution.
          </p>
        </div>
        <button type="button" className="sbd-btn-ghost" onClick={() => onOpenTab("matrix")} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          Matrix
          <ArrowRight size={13} />
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {topStatuses.length === 0 ? (
          <EmptyState text="No open items to summarize." />
        ) : (
          topStatuses.map(([status, count]) => (
            <PipelineBar key={status} status={status} count={count as number} total={openCount} />
          ))
        )}
      </div>
    </div>
  );
}

interface TriageMetricProps {
  icon: IconType;
  label: string;
  value: ReactNode;
  sub: ReactNode;
  color: string;
}

function TriageMetric({ icon: Icon, label, value, sub, color }: TriageMetricProps) {
  return (
    <div className="sbd-card" style={{ padding: "14px 16px", borderRadius: 14, borderTop: `2px solid ${color}`, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: textMuted, fontWeight: 800 }}>
          {label}
        </div>
        {Icon && <Icon size={15} color={color} />}
      </div>
      <div className="sbd-num" style={{ color, fontFamily: mono, fontSize: 30, lineHeight: 1, fontWeight: 800, marginTop: 10 }}>
        {value}
      </div>
      <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 8 }}>{sub}</div>
    </div>
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
    <section className="sbd-card" style={{ padding: compact ? 14 : 16, borderRadius: 14, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, color: textPrimary, fontSize: 16 }}>{title}</h3>
          <p style={{ margin: "4px 0 0", color: textMuted, fontSize: 12 }}>{subtitle}</p>
        </div>
        <span className="sbd-badge-info">{items.length}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.length === 0 ? (
          <EmptyState text={empty} />
        ) : (
          items.map((item) => (
            <TriageItemRow key={item.id} item={item} onOpen={() => onOpenTab(item.routeTab)} onEscalate={onEscalate} />
          ))
        )}
      </div>
    </section>
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

function EscalateIconButton({ icon: Icon, label, title, onClick }: { icon: IconType; label: string; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        minHeight: 30, padding: "4px 8px", borderRadius: 7, cursor: "pointer",
        background: "transparent", border: `1px solid ${border}`,
        color: textMuted, fontFamily: mono, fontSize: 9, fontWeight: 800,
        letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.color = "var(--accent)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = border;
        e.currentTarget.style.color = textMuted;
      }}
    >
      <Icon size={11} />
      {label}
    </button>
  );
}

function PipelineBar({ status, count, total }: { status: string; count: number; total: number }) {
  const color = STATUS_COLORS[status] || accent;
  const pct = total > 0 ? Math.max(4, Math.round((count / total) * 100)) : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontFamily: mono, fontSize: 11, color: textPrimary, marginBottom: 5 }}>
        <span>{status}</span>
        <span className="sbd-num">{count}</span>
      </div>
      <div style={{ height: 7, borderRadius: 999, background: surface2, overflow: "hidden", border: `1px solid ${border}` }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, boxShadow: `0 0 12px ${color}` }} />
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ padding: 14, color: textMuted, border: `1px dashed ${border}`, borderRadius: 10, fontSize: 13 }}>
      {text}
    </div>
  );
}

function DueChip({ info: chipInfo, compact = false }: { info: DueInfo; compact?: boolean }) {
  return (
    <span style={{
      display: "inline-block",
      marginTop: compact ? 0 : 6,
      padding: compact ? "3px 7px" : "2px 6px",
      borderRadius: 999,
      fontFamily: mono,
      fontSize: 9,
      fontWeight: 800,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: chipInfo.tone,
      background: `color-mix(in srgb, ${chipInfo.tone} 16%, transparent)`,
      border: `1px solid color-mix(in srgb, ${chipInfo.tone} 44%, transparent)`,
      whiteSpace: "nowrap",
    }}>
      {chipInfo.label}
    </span>
  );
}

interface ApprovalMatrixProps {
  drawingSets: any[];
  submittals: Submittal[];
  roundsBySubmittal: Record<string, any[]>;
  isLoading: boolean;
}

/**
 * DrawingRegisterTable — the Drawing Register as a clean, flat, per-set table,
 * mirroring the Approval/Submittal register look (same Th/Td/StatusChip/DueChip
 * primitives) instead of the dense grouped DrawingsTable. One row per drawing
 * set. Left border: red = late, green = done (good to go), neutral = in progress.
 * Full sheet-level management still lives on the standalone Drawings page.
 */
export function DrawingRegisterTable({
  setPackages, projectId, activeProject, drawingSets = [], isLoading, healthByKey,
}: {
  setPackages: any[]; projectId?: string; activeProject?: any; drawingSets?: any[]; isLoading?: boolean;
  healthByKey?: Map<string, any>;
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
        const closed = latestSubmittal ? isClosedSubmittal(latestSubmittal) : false;
        const sheetCount = sheets.length || (pkg.parent?.sheet_count ?? 0);
        const releasedCount = sheets.filter((d) => d.stage === "Released" || d.set_approval_status === "approved").length;
        const done = closed || (sheetCount > 0 && releasedCount === sheetCount);
        const due = dueInfo(getSubmittalDueDate(latestSubmittal), done);
        const discipline = pkg.parent?.discipline || [...new Set(sheets.map((d) => d.discipline).filter(Boolean))][0] || "—";
        const maxRev = sheets.reduce((m, d) => Math.max(m, Number(String(d.revision_number || "0").replace(/[^\d]/g, "")) || 0), 0);
        const stageCounts: Record<string, number> = {};
        for (const d of sheets) if (d.stage) stageCounts[d.stage] = (stageCounts[d.stage] || 0) + 1;
        const dominantStage = Object.entries(stageCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
        return {
          pkg, due, sheetCount, releasedCount, discipline, maxRev, dominantStage,
          status: latestSubmittal?.status || null, done, late: !!due.overdue && !done,
          health: healthByKey?.get(pkg.key) || null,
          locked: !!pkg.parent?.is_locked,
          lockedReason: pkg.parent?.locked_reason || null,
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
  }, [setPackages, search, healthByKey, sortByHealth]);

  if (isLoading) return <LoadingSkeleton />;

  return (
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
          <button type="button" className="sbd-btn sbd-btn-primary" onClick={() => setUploadOpen(true)}>+ Upload Drawings</button>
        )}
        {canEdit && (
          <button type="button" className="sbd-btn" onClick={() => setLogImportOpen(true)}>Import Log</button>
        )}
        <button type="button" className="sbd-btn" title="Full Drawings editor — filters, bulk actions, rename / delete, per-sheet" onClick={() => navigate("/Drawings")}>Open full editor ↗</button>
      </div>

      <div style={{ border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden", background: surface1 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
                <Td style={{ color: textPrimary, fontWeight: 600 }}>
                  {r.pkg.name}
                  {r.locked && (
                    <span title={r.lockedReason || "Locked — released for fabrication"} style={{ marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 4, fontFamily: mono, fontSize: 8.5, fontWeight: 800, color: "#f59e0b", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.4)", textTransform: "uppercase", letterSpacing: "0.04em", verticalAlign: "middle" }}>
                      <Lock size={9} /> Locked
                    </span>
                  )}
                </Td>
                <Td style={{ color: textMuted }}>{r.setNo}</Td>
                <Td style={{ color: textMuted }}>{r.discipline}</Td>
                <Td style={{ textAlign: "right" }}>{r.sheetCount}</Td>
                <Td>{r.status ? <StatusChip status={r.status} /> : <span style={{ fontFamily: mono, fontSize: 10, color: textMuted }}>{r.dominantStage || "No submittal"}</span>}</Td>
                <Td>{r.health ? <HealthChip health={r.health} onClick={() => setHealthDetail(r.health)} /> : <span style={{ fontFamily: mono, fontSize: 10, color: textMuted }}>—</span>}</Td>
                <Td style={{ color: r.done ? success : textMuted }}>{r.releasedCount}/{r.sheetCount}</Td>
                <Td><DueChip info={r.due} /></Td>
                <Td style={{ textAlign: "right", color: textMuted }}>{r.maxRev || "—"}</Td>
                <Td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {r.pkg.parent && (
                    <button
                      type="button"
                      disabled={r.locked}
                      title={r.locked ? `Locked — ${r.lockedReason || "an admin must unlock before a new revision"}` : "Upload a new revision for this set"}
                      onClick={() => { if (!r.locked) setRevisionSet(r.pkg.parent); }}
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

      {healthDetail && <HealthBreakdownDialog health={healthDetail} onClose={() => setHealthDetail(null)} />}

      {revisionSet && (
        <Suspense fallback={null}>
          <RevisionUploadModal open onClose={() => setRevisionSet(null)} onComplete={() => setRevisionSet(null)} activeProject={activeProject} preSelectedSet={revisionSet} drawingSets={drawingSets} />
        </Suspense>
      )}
      {reportSet && (
        <Suspense fallback={null}>
          <RevisionImpactReportModal open onClose={() => setReportSet(null)} set={reportSet} projectId={projectId} />
        </Suspense>
      )}
      {uploadOpen && (
        <Suspense fallback={null}>
          <DrawingSetUploadModal open onClose={() => setUploadOpen(false)} onComplete={refetchDrawings} activeProject={activeProject} existingDrawings={allSheets} existingSetNames={existingSetNames} />
        </Suspense>
      )}
      {logImportOpen && (
        <Suspense fallback={null}>
          <DrawingLogImportModal open projectId={projectId} projectName={activeProject?.name} onClose={() => setLogImportOpen(false)} onImported={refetchDrawings} />
        </Suspense>
      )}
    </div>
  );
}

// ── Drawing health (slice 2 of the Hub Command Center) ─────────────────────
function HealthChip({ health, onClick }: { health: any; onClick?: () => void }) {
  const c = health.band.color;
  const n = health.issues.length;
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${health.band.label} · ${n} issue${n === 1 ? "" : "s"} — click for the breakdown`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 8px", borderRadius: 999, cursor: "pointer",
        background: `color-mix(in srgb, ${c} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 45%, transparent)`,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, flexShrink: 0 }} />
      <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 800, color: c }}>{health.grade}</span>
      <span className="sbd-num" style={{ fontFamily: mono, fontSize: 11, color: textPrimary }}>{health.score}</span>
    </button>
  );
}

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

export function ApprovalMatrix({ drawingSets, submittals, roundsBySubmittal, isLoading }: ApprovalMatrixProps) {
  const [search, setSearch] = useState("");

  // Build matrix: for each drawing set, find all submittals that reference it
  const matrixRows = useMemo(() => {
    const activeSubmittals = submittals.filter((s) => !s.is_deleted);
    const setSubmittalMap: Record<string, any[]> = {};

    for (const sub of activeSubmittals) {
      const setIds = Array.isArray(sub.drawing_set_ids) ? sub.drawing_set_ids : [];
      for (const sid of setIds) {
        if (!setSubmittalMap[sid]) setSubmittalMap[sid] = [];
        setSubmittalMap[sid].push(sub);
      }
    }

    const activeSets = drawingSets
      .filter((s) => !s.is_deleted)
      .map((set) => {
        const linked = setSubmittalMap[set.id] || [];
        const latestSubmittal = linked.slice().sort(
          (a, b) => (b.round_number || 1) - (a.round_number || 1)
        )[0] || null;
        const due = dueInfo(getSubmittalDueDate(latestSubmittal), latestSubmittal ? isClosedSubmittal(latestSubmittal) : false);
        return {
          ...set,
          submittals: linked,
          latestSubmittal,
          due,
        };
      })
      .filter((set) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          formatDrawingSetNumber(set).toLowerCase().includes(q) ||
          (set.set_name || "").toLowerCase().includes(q) ||
          (set.discipline || "").toLowerCase().includes(q) ||
          set.submittals.some((s) => (s.submittal_number || "").toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        return compareDrawingSetPackages(a, b);
      });

    return activeSets;
  }, [drawingSets, submittals, search]);

  // Summary counts
  const summary = useMemo(() => {
    let noSubmittal = 0, pending = 0, approved = 0, rejected = 0, overdue = 0, dueSoon = 0;
    for (const row of matrixRows) {
      if (!row.latestSubmittal) { noSubmittal++; continue; }
      const st = row.latestSubmittal.status;
      if (st === "Approved" || st === "Approved as Noted" || st === "Released for Fabrication") approved++;
      else if (st === "Rejected" || st === "Revise and Resubmit") rejected++;
      else pending++;
      if (row.due.overdue) overdue++;
      if (row.due.dueSoon) dueSoon++;
    }
    return { noSubmittal, pending, approved, rejected, overdue, dueSoon, total: matrixRows.length };
  }, [matrixRows]);

  if (isLoading) return <LoadingSkeleton />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── Analytics (cycle-time + aging) ───────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))", gap: 16 }}>
        <CycleTimeCard submittals={submittals} isLoading={isLoading} />
        <AgingReportTable submittals={submittals} isLoading={isLoading} />
      </div>

      {/* ── Summary Bar ──────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 10, flexWrap: "wrap",
        alignItems: "center",
        padding: 14,
        borderRadius: 16,
        border: `1px solid ${border}`,
        background: surface1,
      }}>
        <div style={{ flex: "1 1 320px", minWidth: 220 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Layers3 size={15} color={accent} />
            <div style={{ fontFamily: mono, fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: accent }}>
              Approval Matrix
            </div>
          </div>
          <label style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            maxWidth: 520,
            padding: "8px 11px",
            borderRadius: 10,
            border: `1px solid ${border}`,
            background: surface2,
            color: textMuted,
          }}>
          <Search size={15} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sets, submittals..."
            style={{
              width: "100%",
              background: "transparent",
              color: textPrimary,
              border: 0,
              fontFamily: mono, fontSize: 12,
              outline: "none",
            }}
          />
          </label>
        </div>
        <SummaryChip icon={Layers3} label="Sets" value={summary.total} color={accent} />
        <SummaryChip icon={Link2} label="No Submittal" value={summary.noSubmittal} color={textMuted} />
        <SummaryChip icon={AlertTriangle} label="Overdue" value={summary.overdue} color={error} />
        <SummaryChip icon={Clock3} label="Due Soon" value={summary.dueSoon} color={warning} />
        <SummaryChip icon={ClipboardList} label="Pending" value={summary.pending} color={warning} />
        <SummaryChip icon={ShieldCheck} label="Approved" value={summary.approved} color={success} />
        <SummaryChip icon={AlertTriangle} label="Needs Action" value={summary.rejected} color={review} />
      </div>

      {/* ── Matrix Table ─────────────────────────────────────────── */}
      <div className="sbd-card" style={{
        borderRadius: 16, border: `1px solid ${border}`,
        overflowX: "auto",
        padding: 0,
      }}>
        <table className="sbd-table" style={{
          width: "100%", minWidth: 980, borderCollapse: "collapse",
          fontFamily: mono, fontSize: 12,
        }}>
          <thead>
            <tr style={{ background: surface2 }}>
              <Th>Drawing Set Package</Th>
              <Th>Set #</Th>
              <Th>Discipline</Th>
              <Th style={{ textAlign: "center" }}>Sheets</Th>
              <Th>Linked Submittal</Th>
              <Th>Status</Th>
              <Th>Due Status</Th>
              <Th style={{ textAlign: "center" }}>Round</Th>
              <Th>Ball In Court</Th>
              <Th>Submitted</Th>
              <Th>Required</Th>
              <Th>Returned</Th>
            </tr>
          </thead>
          <tbody>
            {matrixRows.length === 0 ? (
              <tr>
                <td colSpan={12} style={{
                  padding: 40, textAlign: "center", color: textMuted,
                }}>
                  {search ? "No matching drawing sets." : "No drawing sets yet."}
                </td>
              </tr>
            ) : (
              matrixRows.map((row) => (
                <MatrixRow
                  key={row.id}
                  drawingSet={row}
                  sub={row.latestSubmittal}
                  due={row.due}
                  allSubmittals={row.submittals}
                  roundsBySubmittal={roundsBySubmittal}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Matrix table row ──────────────────────────────────────────────────────

interface MatrixRowProps {
  drawingSet: any;
  sub: any;
  due: DueInfo;
  allSubmittals: any[];
  roundsBySubmittal: Record<string, any[]>;
}

function MatrixRow({ drawingSet, sub, due, allSubmittals, roundsBySubmittal }: MatrixRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasMultiple = allSubmittals.length > 1;
  const overdueStyle: CSSProperties = due?.overdue ? { color: error, fontWeight: 700 } : {};
  const rowStatusColor = getStatusColor(sub?.status);

  return (
    <>
      <tr
        onClick={hasMultiple ? () => setExpanded(!expanded) : undefined}
        style={{
          borderBottom: `1px solid ${border}`,
          borderLeft: `3px solid ${sub ? rowStatusColor : warning}`,
          cursor: hasMultiple ? "pointer" : "default",
          transition: "background 0.1s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = surface2)}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <Td style={{ fontWeight: 600 }}>
          {hasMultiple && (
            <span style={{ marginRight: 6, fontSize: 10, opacity: 0.6 }}>
              {expanded ? "▾" : "▸"}
            </span>
          )}
          {drawingSet.set_name || "—"}
        </Td>
        <Td style={{ color: accent, fontWeight: 800 }}>{formatDrawingSetNumber(drawingSet)}</Td>
        <Td style={{ color: textMuted }}>{drawingSet.discipline || "—"}</Td>
        <Td style={{ textAlign: "center" }}>{drawingSet.sheet_count || 0}</Td>
        {sub ? (
          <>
            <Td style={{ color: accent }}>{sub.submittal_number}</Td>
            <Td>
              <StatusChip status={sub.status} />
            </Td>
            <Td>
              <DueChip info={due} />
            </Td>
            <Td style={{ textAlign: "center" }}>
              {sub.round_number > 1 && (
                <span style={{
                  background: warning, color: "#000",
                  padding: "1px 6px", borderRadius: 3, fontSize: 10, fontWeight: 700,
                }}>
                  R{sub.round_number}
                </span>
              )}
              {sub.round_number <= 1 && "1"}
            </Td>
            <Td>{sub.ball_in_court || "—"}</Td>
            <Td>{fmtDate(sub.submitted_date)}</Td>
            <Td style={overdueStyle}>{fmtDate(getSubmittalDueDate(sub))}</Td>
            <Td>{fmtDate(sub.returned_date)}</Td>
          </>
        ) : (
          <>
            <Td style={{ color: warning, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }} colSpan={8}>
              No submittal linked - not tracked in approval pipeline
            </Td>
          </>
        )}
      </tr>

      {/* Expanded: show all submittals for this set */}
      {expanded && allSubmittals
        .filter((s) => s.id !== sub?.id)
        .map((s) => (
          <tr key={s.id} style={{ borderBottom: `1px solid ${border}`, background: surface1 }}>
            <Td style={{ paddingLeft: 32, color: textMuted }}>↳</Td>
            <Td />
            <Td />
            <Td />
            <Td style={{ color: accent }}>{s.submittal_number}</Td>
            <Td><StatusChip status={s.status} /></Td>
            <Td><DueChip info={dueInfo(getSubmittalDueDate(s), isClosedSubmittal(s))} /></Td>
            <Td style={{ textAlign: "center" }}>{s.round_number || 1}</Td>
            <Td>{s.ball_in_court || "—"}</Td>
            <Td>{fmtDate(s.submitted_date)}</Td>
            <Td>{fmtDate(getSubmittalDueDate(s))}</Td>
            <Td>{fmtDate(s.returned_date)}</Td>
          </tr>
        ))}

      {/* Expanded: show round history for the latest submittal */}
      {expanded && sub && roundsBySubmittal[sub.id]?.length > 0 && (
        <tr style={{ background: surface1 }}>
          <td colSpan={12} style={{ padding: "8px 32px 12px" }}>
            <RoundTimeline rounds={roundsBySubmittal[sub.id]} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Round Timeline (compact inline version) ────────────────────────────────

function RoundTimeline({ rounds }: { rounds: any[] }) {
  if (!rounds || rounds.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{
        fontFamily: mono, fontSize: 10, color: textMuted,
        textTransform: "uppercase", letterSpacing: "0.08em",
        marginRight: 8,
      }}>
        Round History:
      </span>
      {rounds.map((r, i) => {
        const isLast = i === rounds.length - 1;
        const statusColor = STATUS_COLORS[r.status] || textMuted;
        const days = r.submitted_date && r.returned_date
          ? Math.ceil((new Date(r.returned_date).getTime() - new Date(r.submitted_date).getTime()) / 86400000)
          : null;

        return (
          <Fragment key={r.id}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "3px 10px", borderRadius: 4,
              background: isLast ? `${statusColor}18` : surface2,
              border: `1px solid ${isLast ? statusColor : border}`,
            }}>
              <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: textPrimary }}>
                R{r.round_number}
              </span>
              <span style={{
                fontSize: 9, padding: "1px 5px", borderRadius: 3,
                background: `${statusColor}30`, color: statusColor, fontWeight: 600,
              }}>
                {r.status}
              </span>
              {days !== null && (
                <span style={{ fontSize: 9, color: textMuted }}>
                  {days}d
                </span>
              )}
            </div>
            {!isLast && (
              <span style={{ color: textMuted, fontSize: 10 }}>→</span>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

// ── Shared micro-components ────────────────────────────────────────────────

function Th({ children, style = {} }: { children?: ReactNode; style?: CSSProperties }) {
  return (
    <th style={{
      padding: "10px 12px", textAlign: "left",
      fontFamily: mono, fontSize: 10, fontWeight: 600,
      textTransform: "uppercase", letterSpacing: "0.08em",
      color: textMuted, borderBottom: `1px solid ${border}`,
      ...style,
    }}>
      {children}
    </th>
  );
}

function Td({ children, style = {}, colSpan }: { children?: ReactNode; style?: CSSProperties; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className="sbd-num" style={{
      padding: "8px 12px",
      fontFamily: mono, fontSize: 12,
      color: textPrimary,
      ...style,
    }}>
      {children}
    </td>
  );
}

function StatusChip({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || textMuted;
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px", borderRadius: 3,
      fontSize: 10, fontWeight: 600,
      fontFamily: mono,
      background: `${color}20`,
      color,
      border: `1px solid ${color}40`,
    }}>
      {status}
    </span>
  );
}

interface SummaryChipProps {
  icon: IconType;
  label: string;
  value: ReactNode;
  color: string;
}

function SummaryChip({ icon: Icon, label, value, color }: SummaryChipProps) {
  return (
    <div className="sbd-pill" style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "6px 10px", borderRadius: 999,
      background: surface2, border: `1px solid ${border}`,
    }}>
      {Icon && <Icon size={13} color={color} />}
      <span style={{ fontFamily: mono, fontSize: 10, color: textMuted, textTransform: "uppercase" }}>
        {label}
      </span>
      <span className="sbd-num" style={{ fontFamily: mono, fontSize: 14, fontWeight: 700, color }}>
        {value}
      </span>
    </div>
  );
}

// ── Lead-times settings modal ───────────────────────────────────────────────
// Edits the per-project backward-schedule lead times (projects.metadata.
// detailing_lead_days). Opaque panel bg per the dark-theme modal rule (a
// translucent --bg-surface/--bg-card would render see-through over the scrim).

const LEAD_FIELDS: Array<{ key: string; label: string; hint: string }> = [
  { key: "detailing",      label: "Detailing duration", hint: "Detailing start → internal review" },
  { key: "internalReview", label: "Internal review",    hint: "Internal review → submit" },
  { key: "approval",       label: "Approval cycle",     hint: "Submit → approval (EOR)" },
  { key: "fabRelease",     label: "Release buffer",     hint: "Approval → fab release" },
  { key: "fab",            label: "Fab + ship",         hint: "Fab release → erection release" },
  { key: "erectionPrep",   label: "Field prep",         hint: "Erection release → erection start" },
];

interface LeadTimesModalProps {
  leadDays: Record<string, number>;
  defaults: Record<string, number>;
  saving: boolean;
  onSave: (leads: Record<string, number>) => void;
  onClose: () => void;
}

export function LeadTimesModal({ leadDays, defaults, saving, onSave, onClose }: LeadTimesModalProps) {
  const [draft, setDraft] = useState<Record<string, number>>(() => ({ ...defaults, ...leadDays }));

  // Escape closes the modal (keyboard accessibility — §25). Guarded by `saving`
  // so a mid-save Escape can't drop the dialog before the mutation settles.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [saving, onClose]);

  const setField = (key: string, value: string) => {
    const n = Math.max(0, Math.round(Number(value) || 0));
    setDraft((d) => ({ ...d, [key]: n }));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(480px, 100%)", maxHeight: "85vh", overflowY: "auto",
          background: "var(--bg-surface-secondary)",
          border: `1px solid ${border}`, borderRadius: 16,
          boxShadow: "var(--shadow-card)", padding: 20,
        }}
      >
        <div style={{ marginBottom: 4, fontFamily: mono, fontSize: 9, color: textMuted, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          Detailing Control Center
        </div>
        <h2 style={{ margin: "0 0 6px", color: textPrimary, fontSize: 20 }}>Lead Times</h2>
        <p style={{ margin: "0 0 16px", color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.5 }}>
          Calendar-day gaps used to schedule each package <strong>backward</strong> from its linked
          erection date. Saved as this project&apos;s defaults; an individual package can still
          override them in its metadata.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {LEAD_FIELDS.map((f) => (
            <label key={f.key} style={{ display: "grid", gridTemplateColumns: "1fr 92px", gap: 10, alignItems: "center" }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", color: textPrimary, fontSize: 13, fontWeight: 700 }}>{f.label}</span>
                <span style={{ display: "block", color: textMuted, fontSize: 11 }}>{f.hint}</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, justifySelf: "end" }}>
                <input
                  type="number" min={0} inputMode="numeric"
                  value={draft[f.key] ?? 0}
                  disabled={saving}
                  onChange={(e) => setField(f.key, e.target.value)}
                  style={{
                    width: 56, background: "var(--bg-input, var(--bg-surface-low))",
                    border: `1px solid ${border}`, borderRadius: 8, padding: "6px 8px",
                    color: textPrimary, fontFamily: mono, fontSize: 13, textAlign: "right", outline: "none",
                  }}
                />
                <span style={{ color: textMuted, fontFamily: mono, fontSize: 11 }}>d</span>
              </span>
            </label>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 20 }}>
          <button type="button" className="sbd-btn-ghost" disabled={saving} onClick={() => setDraft({ ...defaults })}>
            Reset to defaults
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="sbd-btn-ghost" disabled={saving} onClick={onClose}>Cancel</button>
            <button type="button" className="sbd-btn-primary" disabled={saving} onClick={() => onSave(draft)}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
