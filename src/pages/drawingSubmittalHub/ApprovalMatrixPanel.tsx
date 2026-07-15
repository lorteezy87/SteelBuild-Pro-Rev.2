/**
 * ApprovalMatrixPanel — the canonical Detailing Approval Matrix (matrix tab).
 *
 * Presentation-only. Renders inside the DetailingCommandShell light island
 * (`.detailing-cc` token cascade). The hub owns every query/mutation and this
 * panel owns only the matrix presentation and pure formatting.
 *
 * What this converts to kit primitives: the summary/search chrome (kit FilterBar
 * + Pills) and the matrix table + expandable child rows (on `cmd-table`). The
 * analytics cards (CycleTimeCard / AgingReportTable) are REUSED VERBATIM under
 * `.detailing-cc` so they inherit the shipped light cascade — same reuse the
 * merged 2b/2c slices used for their native sub-widgets.
 *
 * ⚠ Working-day due display (`submittal_workday_dues`, Phase 5): `useWorkdays`
 * is threaded into `buildApprovalMatrixRows` (main-row dues) AND the expanded
 * child rows' inline `dueInfoFor`. Every
 * matrix due is a submittal date (no drawing carve-out here), so no source-gate.
 */
import { Fragment, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { AlertTriangle, ClipboardList, Clock3, Layers3, Link2, ShieldCheck } from "lucide-react";
import LoadingSkeletonRaw from "@/components/shared/LoadingSkeleton";
import CycleTimeCardRaw from "@/components/submittals/CycleTimeCard";
import AgingReportTableRaw from "@/components/submittals/AgingReportTable";
import { formatDrawingSetNumber } from "@/lib/drawingSetOrdering";
import {
  CLOSED_SUBMITTAL_STATUSES,
  STATUS_COLORS,
  buildApprovalMatrixRows,
  dueInfoFor,
  fmtDate,
  getStatusColor,
  getSubmittalDueDate,
  isClosedSubmittal,
  summarizeApprovalMatrix,
} from "./format";
import type { DueInfo } from "./types";
import { FilterBar, Pill } from "@/components/command";
import type { PillTone } from "@/components/command";

type AnyProps = Record<string, any>;
const LoadingSkeleton = LoadingSkeletonRaw as unknown as ComponentType<AnyProps>;
const CycleTimeCard = CycleTimeCardRaw as unknown as ComponentType<AnyProps>;
const AgingReportTable = AgingReportTableRaw as unknown as ComponentType<AnyProps>;

interface ApprovalMatrixPanelProps {
  drawingSets: any[];
  submittals: any[];
  roundsBySubmittal: Record<string, any[]>;
  isLoading: boolean;
  useWorkdays?: boolean;
}

/** Submittal status → kit Pill tone. Uses the shared status colour
 *  families (approved → good, R&R/rejected → review, closed → neutral, else
 *  warn/pending). */
function statusTone(status?: string | null): PillTone {
  switch (status) {
    case "Approved":
    case "Approved as Noted":
    case "Released for Fabrication":
      return "good";
    case "Rejected":
    case "Revise and Resubmit":
      return "review";
    case "Void":
      return "neutral";
    default:
      return "warn";
  }
}

/** Due-status → kit Pill tone. */
function dueTone(due: DueInfo | undefined): PillTone {
  if (!due) return "neutral";
  if (due.overdue) return "danger";
  if (due.dueSoon) return "warn";
  return "good";
}

export function ApprovalMatrixPanel({ drawingSets, submittals, roundsBySubmittal, isLoading, useWorkdays = false }: ApprovalMatrixPanelProps) {
  const [search, setSearch] = useState("");

  const matrixRows = useMemo(
    () => buildApprovalMatrixRows(drawingSets, submittals, search, useWorkdays),
    [drawingSets, submittals, search, useWorkdays],
  );
  const summary = useMemo(() => summarizeApprovalMatrix(matrixRows), [matrixRows]);

  if (isLoading) return <LoadingSkeleton />;

  return (
    <section className="detailing-cc" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── Analytics (cycle-time + aging) — reused verbatim ─────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))", gap: 16 }}>
        <CycleTimeCard submittals={submittals} roundsBySubmittal={roundsBySubmittal} isLoading={isLoading} />
        <AgingReportTable submittals={submittals} isLoading={isLoading} />
      </div>

      {/* ── Summary pills + search (kit FilterBar) ───────────────────────── */}
      <FilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search sets, submittals…"
        filters={
          <>
            <SummaryPill icon={Layers3} label="Sets" value={summary.total} tone="neutral" />
            <SummaryPill icon={Link2} label="No Submittal" value={summary.noSubmittal} tone="neutral" />
            <SummaryPill icon={AlertTriangle} label="Overdue" value={summary.overdue} tone="danger" />
            <SummaryPill icon={Clock3} label="Due Soon" value={summary.dueSoon} tone="warn" />
            <SummaryPill icon={ClipboardList} label="Pending" value={summary.pending} tone="warn" />
            <SummaryPill icon={ShieldCheck} label="Approved" value={summary.approved} tone="good" />
            <SummaryPill icon={AlertTriangle} label="Needs Action" value={summary.rejected} tone="review" />
          </>
        }
      />

      {/* ── Matrix table ─────────────────────────────────────────────────── */}
      <div className="cmd-table-wrap">
        <table className="cmd-table" style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <th>Drawing Set Package</th>
              <th>Set #</th>
              <th>Discipline</th>
              <th style={{ textAlign: "center" }}>Sheets</th>
              <th>Linked Submittal</th>
              <th>Status</th>
              <th>Due Status</th>
              <th style={{ textAlign: "center" }}>Round</th>
              <th>Ball In Court</th>
              <th>Submitted</th>
              <th>Required</th>
              <th>Returned</th>
            </tr>
          </thead>
          <tbody>
            {matrixRows.length === 0 ? (
              <tr>
                <td colSpan={12} className="cmd-table__empty">
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
                  useWorkdays={useWorkdays}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Matrix row (with expandable submittal history) ──────────────────────────

interface MatrixRowProps {
  drawingSet: any;
  sub: any;
  due: DueInfo;
  allSubmittals: any[];
  roundsBySubmittal: Record<string, any[]>;
  useWorkdays?: boolean;
}

function MatrixRow({ drawingSet, sub, due, allSubmittals, roundsBySubmittal, useWorkdays = false }: MatrixRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasMultiple = allSubmittals.length > 1;
  const rowRail = sub ? getStatusColor(sub.status) : "var(--cmd-warn)";

  return (
    <>
      <tr
        className={hasMultiple ? "is-clickable" : undefined}
        onClick={hasMultiple ? () => setExpanded(!expanded) : undefined}
        style={{ borderLeft: `3px solid ${rowRail}` }}
      >
        <td style={{ fontWeight: 600 }}>
          {hasMultiple && (
            <span style={{ marginRight: 6, fontSize: 10, opacity: 0.6 }}>{expanded ? "▾" : "▸"}</span>
          )}
          {drawingSet.set_name || "—"}
        </td>
        <td style={{ color: "var(--cmd-gold)", fontWeight: 800 }}>{formatDrawingSetNumber(drawingSet)}</td>
        <td style={{ color: "var(--cmd-text-muted)" }}>{drawingSet.discipline || "—"}</td>
        <td style={{ textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{drawingSet.sheet_count || 0}</td>
        {sub ? (
          <>
            <td style={{ color: "var(--cmd-gold)" }}>{sub.submittal_number}</td>
            <td><Pill tone={statusTone(sub.status)}>{sub.status}</Pill></td>
            <td><Pill tone={dueTone(due)}>{due.label}</Pill></td>
            <td style={{ textAlign: "center" }}>
              {sub.round_number > 1
                ? <Pill tone="warn">R{sub.round_number}</Pill>
                : "1"}
            </td>
            <td>{CLOSED_SUBMITTAL_STATUSES.has(sub.status ?? "") ? "Closed" : (sub.ball_in_court || "—")}</td>
            <td>{fmtDate(sub.submitted_date)}</td>
            <td style={due?.overdue ? { color: "var(--cmd-danger)", fontWeight: 700 } : undefined}>{fmtDate(getSubmittalDueDate(sub))}</td>
            <td>{fmtDate(sub.returned_date)}</td>
          </>
        ) : (
          <td style={{ color: "var(--cmd-warn)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }} colSpan={8}>
            No submittal linked - not tracked in approval pipeline
          </td>
        )}
      </tr>

      {/* Expanded: all other submittals for this set */}
      {expanded && allSubmittals
        .filter((s) => s.id !== sub?.id)
        .map((s) => (
          <tr key={s.id} style={{ background: "#f7f9fc" }}>
            <td style={{ paddingLeft: 32, color: "var(--cmd-text-muted)" }}>↳</td>
            <td />
            <td />
            <td />
            <td style={{ color: "var(--cmd-gold)" }}>{s.submittal_number}</td>
            <td><Pill tone={statusTone(s.status)}>{s.status}</Pill></td>
            <td><Pill tone={dueTone(dueInfoFor(getSubmittalDueDate(s), { closed: isClosedSubmittal(s), useWorkdays }))}>
              {dueInfoFor(getSubmittalDueDate(s), { closed: isClosedSubmittal(s), useWorkdays }).label}
            </Pill></td>
            <td style={{ textAlign: "center" }}>{s.round_number || 1}</td>
            <td>{CLOSED_SUBMITTAL_STATUSES.has(s.status ?? "") ? "Closed" : (s.ball_in_court || "—")}</td>
            <td>{fmtDate(s.submitted_date)}</td>
            <td>{fmtDate(getSubmittalDueDate(s))}</td>
            <td>{fmtDate(s.returned_date)}</td>
          </tr>
        ))}

      {/* Expanded: round history for the latest submittal */}
      {expanded && sub && roundsBySubmittal[sub.id]?.length > 0 && (
        <tr style={{ background: "#f7f9fc" }}>
          <td colSpan={12} style={{ padding: "8px 32px 12px" }}>
            <RoundTimeline rounds={roundsBySubmittal[sub.id]} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Round timeline (compact inline history) ─────────────────────────────────

function RoundTimeline({ rounds }: { rounds: any[] }) {
  if (!rounds || rounds.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 10, color: "var(--cmd-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 8 }}>
        Round History:
      </span>
      {rounds.map((r, i) => {
        const isLast = i === rounds.length - 1;
        const statusColor = STATUS_COLORS[r.status] || "var(--cmd-text-muted)";
        const days = r.submitted_date && r.returned_date
          ? Math.ceil((new Date(r.returned_date).getTime() - new Date(r.submitted_date).getTime()) / 86400000)
          : null;

        return (
          <Fragment key={r.id}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "3px 10px", borderRadius: 4,
              background: isLast ? `color-mix(in srgb, ${statusColor} 12%, var(--cmd-surface))` : "var(--cmd-surface)",
              border: `1px solid ${isLast ? statusColor : "var(--cmd-border)"}`,
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--cmd-text)" }}>R{r.round_number}</span>
              <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: `color-mix(in srgb, ${statusColor} 20%, transparent)`, color: statusColor, fontWeight: 600 }}>
                {r.status}
              </span>
              {days !== null && <span style={{ fontSize: 9, color: "var(--cmd-text-muted)" }}>{days}d</span>}
            </div>
            {!isLast && <span style={{ color: "var(--cmd-text-muted)", fontSize: 10 }}>→</span>}
          </Fragment>
        );
      })}
    </div>
  );
}

// ── Leaf chrome ──────────────────────────────────────────────────────────────

function SummaryPill({ icon: Icon, label, value, tone }: { icon: ComponentType<{ size?: number | string }>; label: string; value: number; tone: PillTone }) {
  return (
    <span className={`cmd-pill cmd-pill--${tone}`} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <Icon size={12} />
      <span style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10 }}>{label}</span>
      <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </span>
  );
}
