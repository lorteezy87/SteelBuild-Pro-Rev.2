/**
 * ApprovalMatrixPanel — the canonical Detailing Approval Matrix (matrix tab).
 *
 * One row per drawing set. Columns follow SteelBuild-Pro-2026's matrix, laid
 * over Rev.2's governing-submittal rule (buildApprovalMatrixRows):
 *   Set | Set # | Sheets | On Hold | Submittal | Stage · Status | Due | Ball In Court | Round | Last Transmittal
 * Stage is the Process Board's rule (resolvePackageStage), so the two tabs
 * agree; the raw submittal status and the Incomplete · EOR/AOR flag sit beside
 * it. Discipline, dates, sibling submittals and round history live on expand.
 *
 * The summary pills are click-through filters kept in the URL
 * (?matrix_filter=), so every count is one click from its rows and a filtered
 * view is linkable. Cells link into sibling tabs (submittal, create-from-set,
 * holds, transmittal) with history pushes, so Back returns here.
 *
 * Grid first; the cycle-time and aging analytics sit below it.
 */
import { Fragment, useMemo, useState } from "react";
import type { ComponentType, MouseEvent, ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ClipboardList, FileQuestion, MessageSquareWarning, ShieldAlert, ShieldCheck } from "lucide-react";
import LoadingSkeletonRaw from "@/components/shared/LoadingSkeleton";
import CycleTimeCardRaw from "@/components/submittals/CycleTimeCard";
import AgingReportTableRaw from "@/components/submittals/AgingReportTable";
import StageChipRaw from "@/components/drawings/StageChip";
import { formatDrawingSetNumber } from "@/lib/drawingSetOrdering";
import type { DrawingHoldRow } from "@/hooks/useDrawingHolds";
import type { TransmittalRow } from "@/hooks/useTransmittals";
import {
  CLOSED_SUBMITTAL_STATUSES,
  STATUS_COLORS,
  buildApprovalMatrixRows,
  dueInfoFor,
  fmtDate,
  getStatusColor,
  getSubmittalDueDate,
  isClosedSubmittal,
  pluralize,
  summarizeApprovalMatrix,
  submittalRoundCount,
} from "./format";
import {
  createSubmittalForSetHref,
  enrichApprovalMatrixRows,
  matchesMatrixFilter,
  parseMatrixFilter,
  submittalHref,
  summarizeMatrixCoverage,
  transmittalHref,
} from "./approvalMatrix.derive";
import type { EnrichedMatrixRow, LastSent, MatrixFilter, MatrixTransmittal } from "./approvalMatrix.derive";
import { hubHref } from "./hubLinks";
import type { DueInfo, SetPackage } from "./types";
import { FilterBar, Pill } from "@/components/command";
import type { PillTone } from "@/components/command";
import { evaluateApproverNotes, INCOMPLETE_EOR_AOR_LABEL } from "@/lib/approverNotes";

type AnyProps = Record<string, any>;
const LoadingSkeleton = LoadingSkeletonRaw as unknown as ComponentType<AnyProps>;
const CycleTimeCard = CycleTimeCardRaw as unknown as ComponentType<AnyProps>;
const AgingReportTable = AgingReportTableRaw as unknown as ComponentType<AnyProps>;
const StageChip = StageChipRaw as unknown as ComponentType<AnyProps>;

/** URL param holding the active quick filter. The hub drops it on tab change. */
export const MATRIX_FILTER_PARAM = "matrix_filter";
/** Whether the holds list is known yet — "no rows" is not "no holds". */
export type HoldsStatus = "ready" | "loading" | "error";
/**
 * Whether the expanded row's Last sent inputs, the transmittal log AND the
 * drawing revisions, are known yet. Missing either, "Not sent yet" or
 * "0 revised" would be a guess.
 */
export type LastSentStatus = "ready" | "loading" | "error";
const COLUMN_COUNT = 10;
// Stable defaults: a fresh [] per render would re-run the row enrichment memo.
const NO_PACKAGES: SetPackage[] = [];
const NO_HOLDS: DrawingHoldRow[] = [];
const NO_REVISION_IDS: ReadonlyMap<string, string> = new Map();

interface ApprovalMatrixPanelProps {
  drawingSets: any[];
  submittals: any[];
  roundsBySubmittal: Record<string, any[]>;
  isLoading: boolean;
  useWorkdays?: boolean;
  /** The hub's set packages: live sheets per set + the Process Board's stage inputs. */
  setPackages?: SetPackage[];
  /** Project holds from the hub's shared useDrawingHolds query. */
  holds?: DrawingHoldRow[];
  /**
   * Until holds are known the On Hold column, pill and filter say so instead
   * of claiming "none" — the header badge waits the same way.
   */
  holdsStatus?: HoldsStatus;
  /** Transmittal log (loaded only while this tab is open). */
  transmittals?: TransmittalRow[];
  transmittalsLoading?: boolean;
  /**
   * drawing_id → current drawing_revisions.id, from the hub's revisions read.
   * Drives "revised since" on the expanded row's Last sent line.
   */
  currentRevisionIdByDrawingId?: ReadonlyMap<string, string> | null;
  /** Defaults to "loading" while `transmittals` is undefined, else "ready". */
  lastSentStatus?: LastSentStatus;
  /** Gates the "+ Create submittal" link on sets with none. */
  canCreateSubmittal?: boolean;
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

// Same palette as the Transmittals tab's Dir. column.
function directionTone(direction: string): PillTone {
  if (direction === "incoming") return "info";
  if (direction === "outgoing") return "good";
  return "neutral";
}

// Links live inside a click-to-expand row; keep a link click from also
// toggling the row on its way out.
const stopRowToggle = (event: MouseEvent) => event.stopPropagation();

const muted = { color: "var(--cmd-text-muted)" } as const;
const linkStyle = { color: "var(--cmd-gold)", fontWeight: 600, textDecoration: "none" } as const;

export function ApprovalMatrixPanel({
  drawingSets,
  submittals,
  roundsBySubmittal,
  isLoading,
  useWorkdays = false,
  setPackages = NO_PACKAGES,
  holds = NO_HOLDS,
  holdsStatus = "ready",
  transmittals,
  transmittalsLoading = false,
  currentRevisionIdByDrawingId = NO_REVISION_IDS,
  lastSentStatus,
  canCreateSubmittal = false,
}: ApprovalMatrixPanelProps) {
  // An undefined log is unknown, not empty: never "Not sent yet" off it.
  const lastSentState: LastSentStatus = lastSentStatus ?? (transmittals === undefined ? "loading" : "ready");
  const [search, setSearch] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = parseMatrixFilter(searchParams.get(MATRIX_FILTER_PARAM));

  // Filter toggles REPLACE the entry: linkable, without a Back press per click.
  const setFilter = (next: MatrixFilter | null) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next) params.set(MATRIX_FILTER_PARAM, next);
      else params.delete(MATRIX_FILTER_PARAM);
      return params;
    }, { replace: true });
  };

  const baseRows = useMemo(
    () => buildApprovalMatrixRows(drawingSets, submittals, search, useWorkdays),
    [drawingSets, submittals, search, useWorkdays],
  );
  const matrixRows = useMemo(
    () => enrichApprovalMatrixRows(baseRows, { setPackages, holds, transmittals, currentRevisionIdByDrawingId }),
    [baseRows, setPackages, holds, transmittals, currentRevisionIdByDrawingId],
  );
  const summary = useMemo(() => summarizeApprovalMatrix(matrixRows), [matrixRows]);
  const coverage = useMemo(() => summarizeMatrixCoverage(matrixRows), [matrixRows]);
  const visibleRows = useMemo(
    () => matrixRows.filter((row) => matchesMatrixFilter(row, filter)),
    [matrixRows, filter],
  );

  if (isLoading) return <LoadingSkeleton />;

  const holdsKnown = holdsStatus === "ready";
  const pills: Array<{ key: MatrixFilter; icon: ComponentType<{ size?: number | string }>; label: string; value: number | null; tone: PillTone; title?: string }> = [
    { key: "overdue", icon: AlertTriangle, label: "Overdue", value: summary.overdue, tone: "danger" },
    { key: "pending", icon: ClipboardList, label: "Pending", value: summary.pending, tone: "warn" },
    { key: "action", icon: AlertTriangle, label: "Needs Action", value: summary.rejected, tone: "review" },
    { key: "eor", icon: MessageSquareWarning, label: "Incomplete · EOR/AOR", value: summary.pendingEor, tone: summary.pendingEor ? "warn" : "neutral" },
    { key: "nosub", icon: FileQuestion, label: "No Submittal", value: summary.noSubmittal, tone: summary.noSubmittal ? "warn" : "neutral", title: "Sets with nothing in the submittal workflow yet" },
    {
      key: "hold",
      icon: ShieldAlert,
      label: "On Hold",
      value: holdsKnown ? coverage.setsOnHold : null,
      tone: holdsKnown && coverage.setsOnHold ? "warn" : "neutral",
      title: holdsKnown
        ? `${coverage.sheetsOnHold} sheet${coverage.sheetsOnHold === 1 ? "" : "s"} on active hold across ${coverage.setsOnHold} set${coverage.setsOnHold === 1 ? "" : "s"}`
        : holdsStatus === "loading" ? "Checking holds…" : "Holds couldn't be loaded",
    },
    { key: "approved", icon: ShieldCheck, label: "Approved", value: summary.approved, tone: "good" },
  ];

  return (
    <section className="detailing-cc" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <FilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search sets, submittals…"
        filters={
          <>
            {pills.map((pill) => (
              <FilterPill
                key={pill.key}
                icon={pill.icon}
                label={pill.label}
                value={pill.value}
                tone={pill.tone}
                title={pill.title}
                active={filter === pill.key}
                dimmed={filter !== null && filter !== pill.key}
                onClick={() => setFilter(filter === pill.key ? null : pill.key)}
              />
            ))}
            {filter && (
              <button type="button" className="cmd-chip-btn" onClick={() => setFilter(null)}>
                Clear filter
              </button>
            )}
          </>
        }
      />

      <div className="cmd-table-wrap">
        <table className="cmd-table" style={{ minWidth: 1080 }} aria-label="Approval matrix">
          <thead>
            <tr>
              <th>Drawing Set</th>
              <th>Set #</th>
              <th style={{ textAlign: "center" }}>Sheets</th>
              <th style={{ textAlign: "center" }}>On Hold</th>
              <th>Submittal</th>
              <th title="Stage comes from the governing submittal. When none governs — or it has no workflow stage, like Void — the sheets' stage shows, marked “from sheets”: the Process Board's rule.">
                Stage · Status
              </th>
              <th>Due</th>
              <th>Ball In Court</th>
              <th style={{ textAlign: "center" }}>Round</th>
              <th>Last Transmittal</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={COLUMN_COUNT} className="cmd-table__empty">
                  {filter === "hold" && !holdsKnown ? (
                    holdsStatus === "loading"
                      ? "Checking holds…"
                      : "Holds couldn't be loaded, so this filter can't be applied right now."
                  ) : filter ? (
                    <>
                      No drawing sets match this filter.{" "}
                      <button type="button" className="cmd-btn cmd-btn--ghost" onClick={() => setFilter(null)}>
                        Clear filter
                      </button>
                    </>
                  ) : search ? "No matching drawing sets." : "No drawing sets yet."}
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <MatrixRow
                  key={row.id}
                  row={row}
                  roundsBySubmittal={roundsBySubmittal}
                  useWorkdays={useWorkdays}
                  canCreateSubmittal={canCreateSubmittal}
                  transmittalsLoading={transmittalsLoading}
                  holdsStatus={holdsStatus}
                  lastSentStatus={lastSentState}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))", gap: 16 }}>
        <CycleTimeCard submittals={submittals} roundsBySubmittal={roundsBySubmittal} isLoading={isLoading} />
        <AgingReportTable submittals={submittals} isLoading={isLoading} />
      </div>
    </section>
  );
}

interface MatrixRowProps {
  row: EnrichedMatrixRow<any>;
  roundsBySubmittal: Record<string, any[]>;
  useWorkdays?: boolean;
  canCreateSubmittal: boolean;
  transmittalsLoading: boolean;
  holdsStatus: HoldsStatus;
  lastSentStatus: LastSentStatus;
}

function MatrixRow({ row, roundsBySubmittal, useWorkdays = false, canCreateSubmittal, transmittalsLoading, holdsStatus, lastSentStatus }: MatrixRowProps) {
  const [expanded, setExpanded] = useState(false);
  const sub = row.latestSubmittal ?? null;
  const due: DueInfo = row.due;
  const allSubmittals: any[] = Array.isArray(row.submittals) ? row.submittals : [];
  const otherSubmittals = allSubmittals.filter((s) => s.id !== sub?.id);
  // Ties the disclosure button to the detail row it reveals.
  const detailId = `matrix-detail-${row.id}`;
  const rowRail = sub ? getStatusColor(sub.status) : "var(--cmd-warn)";
  const hasHistory = otherSubmittals.length > 0 || (sub && (roundsBySubmittal[sub.id]?.length ?? 0) > 0);
  const approverNotes = evaluateApproverNotes(sub);
  const setLabel = row.set_name || formatDrawingSetNumber(row) || "this set";

  return (
    <>
      <tr
        className="is-clickable"
        data-set-id={row.id}
        onClick={() => setExpanded(!expanded)}
        style={{ borderLeft: `3px solid ${rowRail}`, cursor: "pointer" }}
      >
        <td style={{ fontWeight: 600 }}>
          {/* A REAL button owns the disclosure, so the row's dates and any
              unanswered approver notes are reachable by keyboard. The <tr>
              keeps its click handler for mouse convenience, but must not take
              role="button" — that would break the table's row semantics for a
              screen reader. stopPropagation so the button doesn't toggle twice. */}
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={detailId}
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            title={expanded ? "Hide submittal detail" : "Show submittal detail"}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "transparent", border: "none", padding: 0,
              font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left",
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 10, opacity: 0.6 }}>{expanded ? "▾" : "▸"}</span>
            {row.set_name || "—"}
          </button>
        </td>
        <td style={{ color: "var(--cmd-gold)", fontWeight: 800 }}>{formatDrawingSetNumber(row)}</td>
        <td style={{ textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
          {row.sheetCount ?? <span style={muted}>—</span>}
        </td>
        <td style={{ textAlign: "center" }}>
          {holdsStatus !== "ready" ? (
            holdsStatus === "loading"
              ? <UnknownValue glyph="…" label="Loading holds" />
              : <UnknownValue glyph="?" label="Holds couldn't be loaded" />
          ) : row.onHold > 0 ? (
            <Link
              to={hubHref("holds")}
              onClick={stopRowToggle}
              aria-label={`${row.onHold} sheet${row.onHold === 1 ? "" : "s"} on hold in ${setLabel} — open Holds & Blockers`}
              style={{ textDecoration: "none" }}
            >
              <Pill tone="warn">{row.onHold}</Pill>
            </Link>
          ) : <span style={muted}>—</span>}
        </td>
        <td style={{ whiteSpace: "nowrap" }}>
          {sub ? (
            <>
              <Link to={submittalHref(sub.id)} onClick={stopRowToggle} style={linkStyle} title="Open this submittal">
                {sub.submittal_number || "Unnumbered"}
              </Link>
              {otherSubmittals.length > 0 && (
                <span style={{ ...muted, marginLeft: 6 }} title={`${otherSubmittals.length} more submittal${otherSubmittals.length === 1 ? "" : "s"} on this set — expand the row`}>
                  +{otherSubmittals.length}
                </span>
              )}
            </>
          ) : canCreateSubmittal ? (
            <Link
              to={createSubmittalForSetHref(row.id)}
              onClick={stopRowToggle}
              className="cmd-chip-btn"
              style={{ textDecoration: "none", display: "inline-block" }}
              aria-label={`Create submittal for ${setLabel}`}
            >
              + Create submittal
            </Link>
          ) : (
            <span style={{ color: "var(--cmd-warn-text)", fontWeight: 700, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              No submittal
            </span>
          )}
        </td>
        <td>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <StageChip stage={row.stage} />
            {row.stageSource === "sheets" && (
              <span
                style={{ ...muted, fontSize: 11 }}
                title={sub
                  ? `Its governing submittal (${sub.status || "no status"}) has no workflow stage, so the sheets' stage is shown.`
                  : "No submittal governs this set yet, so its sheets' stage is shown."}
              >
                from sheets
              </span>
            )}
            {sub && <Pill tone={statusTone(sub.status)}>{sub.status}</Pill>}
            {approverNotes.label && (
              <span title={approverNotes.label}>
                <Pill tone="warn">Incomplete</Pill>
              </span>
            )}
          </div>
        </td>
        <td>{sub ? <Pill tone={dueTone(due)}>{due.label}</Pill> : <span style={muted}>—</span>}</td>
        <td>
          {sub
            ? (CLOSED_SUBMITTAL_STATUSES.has(sub.status ?? "") ? "Closed" : (sub.ball_in_court || "—"))
            : <span style={muted}>—</span>}
        </td>
        <td style={{ textAlign: "center" }}>
          {sub
            ? (submittalRoundCount(sub) > 1 ? <Pill tone="warn">R{submittalRoundCount(sub)}</Pill> : "1")
            : <span style={muted}>—</span>}
        </td>
        <td>
          <LastTransmittalCell transmittal={row.lastTransmittal} loading={transmittalsLoading} />
        </td>
      </tr>

      {expanded && (
        <tr id={detailId} style={{ background: "var(--cmd-row-hover)" }}>
          <td colSpan={COLUMN_COUNT} style={{ padding: "10px 16px 12px 28px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px", fontSize: 12, color: "var(--cmd-text-muted)", marginBottom: 8 }}>
              <span>Discipline: <strong style={{ color: "var(--cmd-text)" }}>{row.discipline || "—"}</strong></span>
              {sub && (
                <>
                  <span>Submitted: <strong style={{ color: "var(--cmd-text)" }}>{fmtDate(sub.submitted_date)}</strong></span>
                  <span>Required: <strong style={{ color: due?.overdue ? "var(--cmd-danger-text)" : "var(--cmd-text)" }}>{fmtDate(getSubmittalDueDate(sub))}</strong></span>
                  <span>Returned: <strong style={{ color: "var(--cmd-text)" }}>{fmtDate(sub.returned_date)}</strong></span>
                </>
              )}
              {row.lastTransmittal?.party && (
                <span>Last transmittal party: <strong style={{ color: "var(--cmd-text)" }}>{row.lastTransmittal.party}</strong></span>
              )}
            </div>

            <LastSentLine lastSent={row.lastSent} status={lastSentStatus} marginBottom={hasHistory ? 10 : 0} />

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
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--cmd-warn-text)", marginBottom: 6 }}>
                  {INCOMPLETE_EOR_AOR_LABEL}
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, color: "var(--cmd-text)", fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                  {approverNotes.unanswered.map((note) => (
                    <li key={note.id}>{note.note}</li>
                  ))}
                </ul>
              </div>
            )}

            {otherSubmittals.map((s) => {
              const childDue = dueInfoFor(getSubmittalDueDate(s), { closed: isClosedSubmittal(s), useWorkdays });
              return (
                <div key={s.id} style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", alignItems: "center", marginBottom: 6, fontSize: 12 }}>
                  <span style={muted}>↳</span>
                  <Link to={submittalHref(s.id)} style={linkStyle}>{s.submittal_number || "Unnumbered"}</Link>
                  <Pill tone={statusTone(s.status)}>{s.status}</Pill>
                  <Pill tone={dueTone(childDue)}>{childDue.label}</Pill>
                  <span style={muted}>R{submittalRoundCount(s)}</span>
                  <span style={muted}>{CLOSED_SUBMITTAL_STATUSES.has(s.status ?? "") ? "Closed" : (s.ball_in_court || "—")}</span>
                  <span style={muted}>{fmtDate(s.submitted_date)} → {fmtDate(getSubmittalDueDate(s))} → {fmtDate(s.returned_date)}</span>
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

/**
 * A value that isn't known yet (or failed to load): a visible glyph plus a
 * screen-reader phrase. Never a dash — a dash reads as "none".
 */
function UnknownValue({ glyph, label }: { glyph: string; label: string }) {
  return (
    <span style={muted} title={label}>
      <span aria-hidden="true">{glyph}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function LastTransmittalCell({ transmittal, loading }: { transmittal: MatrixTransmittal | null; loading: boolean }): ReactNode {
  if (loading) return <UnknownValue glyph="…" label="Loading transmittals" />;
  if (!transmittal) return <span style={muted}>—</span>;
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", whiteSpace: "nowrap" }}>
      <Link
        to={transmittalHref(transmittal.id)}
        onClick={stopRowToggle}
        style={linkStyle}
        title={`Open transmittal ${transmittal.number}${transmittal.party ? ` · ${transmittal.party}` : ""}`}
      >
        {transmittal.number || "Unnumbered"}
      </Link>
      <Pill tone={directionTone(transmittal.direction)}>{transmittal.direction}</Pill>
      {transmittal.date && <span style={{ ...muted, fontSize: 11 }}>{fmtDate(transmittal.date)}</span>}
    </span>
  );
}

const valueStyle = { color: "var(--cmd-text)" } as const;

/**
 * The expanded row's Last sent line: the newest OUTGOING transmittal that
 * carried a sheet of this set, how many of those sheets were revised since,
 * and how many are superseded now. Loading, failed, undated, unmatched and
 * cut-off states never read as "Not sent yet".
 */
function LastSentLine({ lastSent, status, marginBottom }: { lastSent: LastSent; status: LastSentStatus; marginBottom: number }) {
  return (
    <div data-last-sent={status === "ready" ? lastSent.kind : status} style={{ fontSize: 12, color: "var(--cmd-text-muted)", marginBottom }}>
      {"Last sent: "}
      <LastSentValue lastSent={lastSent} status={status} />
    </div>
  );
}

function LastSentValue({ lastSent, status }: { lastSent: LastSent; status: LastSentStatus }): ReactNode {
  if (status === "loading") return <UnknownValue glyph="…" label="Loading last sent transmittal" />;
  if (status === "error") return <UnknownValue glyph="?" label="Transmittals or revisions couldn't be loaded" />;
  if (lastSent.kind === "none") return <strong style={valueStyle}>Not sent yet</strong>;
  if (lastSent.kind === "unknown") {
    const reasons: string[] = [];
    if (lastSent.possiblyTruncated) reasons.push("Some transmittal records weren't loaded");
    if (lastSent.unresolvedItems > 0) reasons.push(`${pluralize(lastSent.unresolvedItems, "transmittal item")} couldn't be matched to a sheet`);
    return (
      <strong style={valueStyle} title={`${reasons.join("; ")}, so this set's last outgoing transmittal can't be confirmed.`}>
        Unknown
      </strong>
    );
  }
  if (lastSent.kind === "undated") {
    const number = lastSent.transmittal.number || "Unnumbered";
    // An undated draft is a Rev.2 entry with the date left blank or a 2026
    // draft not sent yet; the row can't say which, so it claims neither.
    const { draft } = lastSent.transmittal;
    return (
      <>
        <Link to={transmittalHref(lastSent.transmittal.id)} style={linkStyle} title={`Open transmittal ${number}`}>
          {number}
        </Link>
        {" · "}
        <strong
          style={valueStyle}
          title={draft
            ? `${number} is logged as outgoing with no send date and isn't marked sent, so whether and when it went out can't be shown.`
            : `${number} is logged as outgoing with no send date, so when it went out, and what changed since, can't be shown.`}
        >
          {draft ? "Logged, no send date" : "Sent (date not entered)"}
        </strong>
        {lastSent.possiblyTruncated && <PartialLogCaveat />}
      </>
    );
  }
  const sent = lastSent.transmittal;
  const number = sent.number || "Unnumbered";
  const revised = sent.revisedSinceSent;
  const superseded = sent.supersededNow;
  const unchecked = sent.uncheckedSheets;
  // A cut-off log may be missing some of this transmittal's items: every count
  // is then a lower bound, and a 0 proves nothing.
  const partial = lastSent.possiblyTruncated;
  const atLeast = partial ? "at least " : "";
  // Every sheet unchecked: "0 revised since" would rest on nothing, so only the
  // "couldn't be checked" segment shows. Same for a 0 off a partial log.
  const checked = sent.sheetCount - unchecked;
  const showRevised = checked > 0 && (!partial || revised > 0);
  return (
    <>
      <Link to={transmittalHref(sent.id)} style={linkStyle} title={`Open transmittal ${number}`}>
        {number}
      </Link>
      {" · "}
      <strong style={valueStyle}>{fmtDate(sent.dateSent)}</strong>
      {sent.sentTo && (
        <>
          {" · to "}
          <strong style={valueStyle}>{sent.sentTo}</strong>
        </>
      )}
      {" · "}
      <strong style={valueStyle}>{`${atLeast}${pluralize(sent.sheetCount, "sheet")}`}</strong>
      {showRevised && (
        <>
          {" · "}
          <strong
            style={{ color: revised > 0 ? "var(--cmd-warn-text)" : "var(--cmd-text)" }}
            title={`Revised since sent: ${atLeast}${revised} of ${pluralize(checked, "sheet")} checked against a current revision`}
          >
            {`${atLeast}${revised} revised since`}
          </strong>
        </>
      )}
      {/* Present state, not "since": drawings keep no supersession date. */}
      {superseded > 0 && (
        <>
          {" · "}
          <strong
            style={{ color: "var(--cmd-warn-text)" }}
            title={`Superseded now: ${atLeast}${pluralize(superseded, "sheet")}. When a sheet was superseded isn't recorded, so this can include sheets superseded before ${number} went out.`}
          >
            {`${atLeast}${superseded} now superseded`}
          </strong>
        </>
      )}
      {/* Unknown is not "unrevised": say how many sheets had nothing to compare against. */}
      {unchecked > 0 && (
        <>
          {" · "}
          <span title={`Nothing to compare for ${pluralize(unchecked, "sheet")}: no current revision is loaded, or ${number} didn't record which revision it sent. ${unchecked === 1 ? "It isn't" : "They aren't"} counted as revised.`}>
            {`${atLeast}${unchecked} couldn't be checked`}
          </span>
        </>
      )}
      {partial && <PartialLogCaveat />}
    </>
  );
}

/** Visible, not hover-only: counts off a cut-off log are lower bounds. */
function PartialLogCaveat() {
  return (
    <>
      {" · "}
      <span
        style={{ color: "var(--cmd-warn-text)" }}
        title="Some transmittal records weren't loaded, so this set's last transmittal and its counts may be incomplete."
      >
        may be incomplete
      </span>
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

/**
 * A summary pill that is also its filter. Pressed state is announced
 * (aria-pressed) and drawn as a ring; the other pills dim so the active one
 * reads at a glance. A zero-count pill can't be switched on — it would only
 * show an empty grid — but an active one can always be switched off.
 */
function FilterPill({
  icon: Icon,
  label,
  value,
  tone,
  title,
  active,
  dimmed,
  onClick,
}: {
  icon: ComponentType<{ size?: number | string }>;
  label: string;
  /** null = not known yet; the pill shows "…" and stays switchable. */
  value: number | null;
  tone: PillTone;
  title?: string;
  active: boolean;
  dimmed: boolean;
  onClick: () => void;
}) {
  const disabled = value === 0 && !active;
  return (
    <button
      type="button"
      className={`cmd-pill cmd-pill--${tone}`}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      title={title ?? (active ? `Showing ${label.toLowerCase()} — click to clear` : `Show only ${label.toLowerCase()}`)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        border: "none",
        fontFamily: "inherit",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : dimmed ? 0.6 : 1,
        boxShadow: active ? "0 0 0 2px var(--cmd-text)" : undefined,
      }}
    >
      <Icon size={12} />
      <span style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10 }}>{label}</span>
      <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{value ?? "…"}</span>
    </button>
  );
}
