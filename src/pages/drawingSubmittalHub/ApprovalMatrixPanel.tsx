/**
 * ApprovalMatrixPanel — the canonical Detailing Approval Matrix (matrix tab).
 *
 * Clean default columns (7): Set | Set # | Submittal | Status | Due | Ball In Court | Round.
 * Secondary (discipline, sheets, submitted/required/returned dates) live on expand.
 * Summary pills trimmed to the four action signals operators care about.
 */
import { Fragment, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { AlertTriangle, ClipboardList, MessageSquareWarning, ShieldCheck } from "lucide-react";
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
import { evaluateApproverNotes, INCOMPLETE_EOR_AOR_LABEL } from "@/lib/approverNotes";

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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))", gap: 16 }}>
        <CycleTimeCard submittals={submittals} roundsBySubmittal={roundsBySubmittal} isLoading={isLoading} />
        <AgingReportTable submittals={submittals} isLoading={isLoading} />
      </div>

      <FilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search sets, submittals…"
        filters={
          <>
            <SummaryPill icon={AlertTriangle} label="Overdue" value={summary.overdue} tone="danger" />
            <SummaryPill icon={ClipboardList} label="Pending" value={summary.pending} tone="warn" />
            <SummaryPill icon={MessageSquareWarning} label="Incomplete · EOR/AOR" value={summary.pendingEor} tone={summary.pendingEor ? "warn" : "neutral"} />
            <SummaryPill icon={ShieldCheck} label="Approved" value={summary.approved} tone="good" />
            <SummaryPill icon={AlertTriangle} label="Needs Action" value={summary.rejected} tone="review" />
          </>
        }
      />

      <div className="cmd-table-wrap">
        <table className="cmd-table" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th>Drawing Set</th>
              <th>Set #</th>
              <th>Submittal</th>
              <th>Status</th>
              <th>Due</th>
              <th>Ball In Court</th>
              <th style={{ textAlign: "center" }}>Round</th>
            </tr>
          </thead>
          <tbody>
            {matrixRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="cmd-table__empty">
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
  const rowRail = sub ? getStatusColor(sub.status) : "var(--cmd-warn)";
  const hasHistory = allSubmittals.length > 1 || (sub && (roundsBySubmittal[sub.id]?.length ?? 0) > 0);
  const approverNotes = evaluateApproverNotes(sub);

  return (
    <>
      <tr
        className="is-clickable"
        onClick={() => setExpanded(!expanded)}
        style={{ borderLeft: `3px solid ${rowRail}`, cursor: "pointer" }}
      >
        <td style={{ fontWeight: 600 }}>
          <span style={{ marginRight: 6, fontSize: 10, opacity: 0.6 }}>{expanded ? "▾" : "▸"}</span>
          {drawingSet.set_name || "—"}
        </td>
        <td style={{ color: "var(--cmd-gold)", fontWeight: 800 }}>{formatDrawingSetNumber(drawingSet)}</td>
        {sub ? (
          <>
            <td style={{ color: "var(--cmd-gold)" }}>{sub.submittal_number}</td>
            <td>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <Pill tone={statusTone(sub.status)}>{sub.status}</Pill>
                {approverNotes.label && (
                  <span title={approverNotes.label}>
                    <Pill tone="warn">Incomplete</Pill>
                  </span>
                )}
              </div>
            </td>
            <td><Pill tone={dueTone(due)}>{due.label}</Pill></td>
            <td>{CLOSED_SUBMITTAL_STATUSES.has(sub.status ?? "") ? "Closed" : (sub.ball_in_court || "—")}</td>
            <td style={{ textAlign: "center" }}>
              {sub.round_number > 1
                ? <Pill tone="warn">R{sub.round_number}</Pill>
                : "1"}
            </td>
          </>
        ) : (
          <td style={{ color: "var(--cmd-warn)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }} colSpan={5}>
            No submittal linked
          </td>
        )}
      </tr>

      {expanded && (
        <tr style={{ background: "var(--cmd-row-hover)" }}>
          <td colSpan={7} style={{ padding: "10px 16px 12px 28px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px", fontSize: 12, color: "var(--cmd-text-muted)", marginBottom: hasHistory ? 10 : 0 }}>
              <span>Discipline: <strong style={{ color: "var(--cmd-text)" }}>{drawingSet.discipline || "—"}</strong></span>
              <span>Sheets: <strong style={{ color: "var(--cmd-text)", fontVariantNumeric: "tabular-nums" }}>{drawingSet.sheet_count || 0}</strong></span>
              {sub && (
                <>
                  <span>Submitted: <strong style={{ color: "var(--cmd-text)" }}>{fmtDate(sub.submitted_date)}</strong></span>
                  <span>Required: <strong style={{ color: due?.overdue ? "var(--cmd-danger)" : "var(--cmd-text)" }}>{fmtDate(getSubmittalDueDate(sub))}</strong></span>
                  <span>Returned: <strong style={{ color: "var(--cmd-text)" }}>{fmtDate(sub.returned_date)}</strong></span>
                </>
              )}
            </div>

            {approverNotes.unansweredCount > 0 && (
              <div
                style={{
                  marginBottom: 10,
                  padding: "8px 10px",
                  borderRadius: 3,
                  border: "1px solid color-mix(in srgb, var(--cmd-warn) 40%, var(--cmd-border))",
                  background: "color-mix(in srgb, var(--cmd-warn) 10%, transparent)",
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--cmd-warn)", marginBottom: 6 }}>
                  {INCOMPLETE_EOR_AOR_LABEL}
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, color: "var(--cmd-text)", fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                  {approverNotes.unanswered.map((note) => (
                    <li key={note.id}>{note.note}</li>
                  ))}
                </ul>
              </div>
            )}

            {allSubmittals.filter((s) => s.id !== sub?.id).map((s) => {
              const childDue = dueInfoFor(getSubmittalDueDate(s), { closed: isClosedSubmittal(s), useWorkdays });
              return (
                <div key={s.id} style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", alignItems: "center", marginBottom: 6, fontSize: 12 }}>
                  <span style={{ color: "var(--cmd-text-muted)" }}>↳</span>
                  <span style={{ color: "var(--cmd-gold)", fontWeight: 600 }}>{s.submittal_number}</span>
                  <Pill tone={statusTone(s.status)}>{s.status}</Pill>
                  <Pill tone={dueTone(childDue)}>{childDue.label}</Pill>
                  <span style={{ color: "var(--cmd-text-muted)" }}>R{s.round_number || 1}</span>
                  <span style={{ color: "var(--cmd-text-muted)" }}>{CLOSED_SUBMITTAL_STATUSES.has(s.status ?? "") ? "Closed" : (s.ball_in_court || "—")}</span>
                  <span style={{ color: "var(--cmd-text-muted)" }}>{fmtDate(s.submitted_date)} → {fmtDate(getSubmittalDueDate(s))} → {fmtDate(s.returned_date)}</span>
                </div>
              );
            })}

            {sub && roundsBySubmittal[sub.id]?.length > 0 && (
              <RoundTimeline rounds={roundsBySubmittal[sub.id]} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function RoundTimeline({ rounds }: { rounds: any[] }) {
  if (!rounds || rounds.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
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

function SummaryPill({ icon: Icon, label, value, tone }: { icon: ComponentType<{ size?: number | string }>; label: string; value: number; tone: PillTone }) {
  return (
    <span className={`cmd-pill cmd-pill--${tone}`} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <Icon size={12} />
      <span style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10 }}>{label}</span>
      <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </span>
  );
}
