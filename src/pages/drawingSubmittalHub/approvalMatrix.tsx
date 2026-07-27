import { Fragment, useMemo, useState } from "react";
import type { ComponentType, CSSProperties } from "react";
import {
  AlertTriangle,
  ClipboardList,
  Clock3,
  Layers3,
  Link2,
  Search,
  ShieldCheck,
} from "lucide-react";
import { SectionCard } from "@/components/desktop/module";
import LoadingSkeletonRaw from "@/components/shared/LoadingSkeleton";
import CycleTimeCardRaw from "@/components/submittals/CycleTimeCard";
import AgingReportTableRaw from "@/components/submittals/AgingReportTable";
import { formatDrawingSetNumber } from "@/lib/drawingSetOrdering";
import {
  CLOSED_SUBMITTAL_STATUSES,
  STATUS_COLORS,
  accent,
  border,
  buildApprovalMatrixRows,
  dueInfoFor,
  error,
  fmtDate,
  getStatusColor,
  getSubmittalDueDate,
  isClosedSubmittal,
  mono,
  review,
  success,
  summarizeApprovalMatrix,
  surface1,
  surface2,
  textMuted,
  textPrimary,
  warning,
} from "./format";
import type { DueInfo, Submittal } from "./types";
import { DueChip, StatusChip, SummaryChip, Td, Th } from "./primitives";

// These shared screens are still .jsx; cast at the boundary (removable
// once they are typed).
type AnyProps = Record<string, any>;
const LoadingSkeleton = LoadingSkeletonRaw as unknown as ComponentType<AnyProps>;
const CycleTimeCard = CycleTimeCardRaw as unknown as ComponentType<AnyProps>;
const AgingReportTable = AgingReportTableRaw as unknown as ComponentType<AnyProps>;

interface ApprovalMatrixProps {
  drawingSets: any[];
  submittals: Submittal[];
  roundsBySubmittal: Record<string, any[]>;
  isLoading: boolean;
  // When on (from the `submittal_workday_dues` flag), each row's Due-Status chip
  // counts in working days (Mon–Fri). Every matrix due is a submittal date, so
  // there is no drawing-date carve-out here. Defaults off → calendar-day.
  useWorkdays?: boolean;
}

export function ApprovalMatrix({ drawingSets, submittals, roundsBySubmittal, isLoading, useWorkdays = false }: ApprovalMatrixProps) {
  const [search, setSearch] = useState("");

  // Build matrix + summary (pure logic in format.ts; testable).
  const matrixRows = useMemo(
    () => buildApprovalMatrixRows(drawingSets, submittals, search, useWorkdays),
    [drawingSets, submittals, search, useWorkdays],
  );
  const summary = useMemo(() => summarizeApprovalMatrix(matrixRows), [matrixRows]);

  if (isLoading) return <LoadingSkeleton />;

  return (
    <SectionCard title="Approval matrix">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* ── Analytics (cycle-time + aging) ───────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))", gap: 16 }}>
          <CycleTimeCard submittals={submittals} roundsBySubmittal={roundsBySubmittal} isLoading={isLoading} />
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
                    useWorkdays={useWorkdays}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </SectionCard>
  );
}

// ── Matrix table row ──────────────────────────────────────────────────────

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
                  background: warning, color: "var(--cmd-pill-warn-fg)",
                  padding: "1px 6px", borderRadius: 3, fontSize: 10, fontWeight: 700,
                }}>
                  R{sub.round_number}
                </span>
              )}
              {sub.round_number <= 1 && "1"}
            </Td>
            <Td>{CLOSED_SUBMITTAL_STATUSES.has(sub.status ?? "") ? "Closed" : (sub.ball_in_court || "—")}</Td>
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
            <Td><DueChip info={dueInfoFor(getSubmittalDueDate(s), { closed: isClosedSubmittal(s), useWorkdays })} /></Td>
            <Td style={{ textAlign: "center" }}>{s.round_number || 1}</Td>
            <Td>{CLOSED_SUBMITTAL_STATUSES.has(s.status ?? "") ? "Closed" : (s.ball_in_court || "—")}</Td>
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
