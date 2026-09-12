import React, { type CSSProperties, type MouseEvent } from "react";
import { Lock } from "lucide-react";
import type { Json } from "@/types/supabase";
import type { Drawing } from "@/hooks/useDrawings";
import { mono, STAGE_MAP, STAGE_ORDER } from "./drawingsConfig";
import StageChip from "./StageChip";
import PriorityDot from "./PriorityDot";
import { OverdueBadge, RFILinkBadge, SupersededBadge } from "./DrawingBadges";
import { isOverdue, daysLate, urgencyClass } from "./drawingsUtils";
import { hasTitleblockTemplate } from "@/lib/titleblock";
import { formatDrawingSetNumber } from "@/lib/drawingSetOrdering";
import { ActionButton } from "./DrawingsTablePrimitives";
import type { DrawingGroup } from "./drawingsTableDerive";

// ─── AI extraction / upload status badge ───────────────────────────────────
//
// Shown inline next to the sheet title so the user can see at a glance
// whether a child row is mid-processing, needs review, or failed to extract.
// Processed rows render nothing (no chrome) to keep the log clean.
const AI_STATUS_META = {
  Pending:     { label: "QUEUED",    color: "var(--text-muted)",     bg: "var(--bg-surface-high)",                                       border: "var(--border-default)",                                           title: "Queued for AI extraction" },
  Extracting:  { label: "✦ READING", color: "var(--status-warning)", bg: "color-mix(in srgb, var(--status-warning) 12%, transparent)", border: "color-mix(in srgb, var(--status-warning) 35%, transparent)", title: "Claude is reading this sheet" },
  NeedsReview: { label: "REVIEW",    color: "var(--status-review)",  bg: "color-mix(in srgb, var(--status-review) 12%, transparent)",  border: "color-mix(in srgb, var(--status-review) 35%, transparent)",  title: "AI finished but found something to verify" },
  Failed:      { label: "✗ FAILED",  color: "var(--status-error)",   bg: "color-mix(in srgb, var(--status-error) 12%, transparent)",   border: "color-mix(in srgb, var(--status-error) 35%, transparent)",   title: "AI extraction failed — click to retry" },
};

interface AIStatusBadgeProps {
  status: string | null;
  uploadStatus: string | null;
  error: string | null;
}

function AIStatusBadge({ status, uploadStatus, error }: AIStatusBadgeProps) {
  // Failed upload always wins — it's more severe than any AI state.
  if (uploadStatus === "Failed") {
    return (
      <span title={error || "File upload failed"} style={{
        ...mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.08em",
        padding: "1px 5px", borderRadius: 4, marginLeft: 6,
        color: "var(--status-error)",
        background: "color-mix(in srgb, var(--status-error) 12%, transparent)",
        border: "1px solid color-mix(in srgb, var(--status-error) 35%, transparent)",
        verticalAlign: "middle",
      }}>
        ↑ UPLOAD FAILED
      </span>
    );
  }
  if (uploadStatus === "Uploading") {
    return (
      <span title="Uploading to storage" style={{
        ...mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.08em",
        padding: "1px 5px", borderRadius: 4, marginLeft: 6,
        color: "var(--status-info)",
        background: "color-mix(in srgb, var(--status-info) 12%, transparent)",
        border: "1px solid color-mix(in srgb, var(--status-info) 35%, transparent)",
        verticalAlign: "middle",
      }}>
        ↑ UPLOADING
      </span>
    );
  }
  const meta = status && status in AI_STATUS_META
    ? AI_STATUS_META[status as keyof typeof AI_STATUS_META]
    : null;
  if (!meta) return null; // Processed / unknown → render nothing
  return (
    <span title={error || meta.title} style={{
      ...mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.08em",
      padding: "1px 5px", borderRadius: 4, marginLeft: 6,
      color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`,
      verticalAlign: "middle",
    }}>
      {meta.label}
    </span>
  );
}

// ─── Row renderers ──────────────────────────────────────────────────────────

const tdBase: CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--divider)",
  verticalAlign: "middle",
};

interface StageBarProps {
  stageCounts: Record<string, number>;
  total: number;
}

function StageBar({ stageCounts, total }: StageBarProps) {
  if (!total) return null;
  return (
    <div
      style={{
        display: "flex",
        height: 4,
        width: 72,
        borderRadius: 2,
        overflow: "hidden",
        background: "var(--bg-surface-high)",
      }}
      title={Object.entries(stageCounts)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${STAGE_MAP[k]?.label || k}: ${n}`)
        .join(" · ")}
    >
      {STAGE_ORDER.map((key) => {
        const n = stageCounts[key] || 0;
        if (n === 0) return null;
        const meta = STAGE_MAP[key];
        return (
          <div
            key={key}
            style={{
              width: `${(n / total) * 100}%`,
              background: meta?.color || "var(--text-muted)",
            }}
          />
        );
      })}
    </div>
  );
}

export interface DrawingSetSubmittalCounts {
  total: number;
  open: number;
  latestStatus?: string | null;
}

interface GroupRowProps {
  group: DrawingGroup;
  expanded: boolean;
  onToggleExpand: () => void;
  groupSelected: boolean;
  groupIndeterminate: boolean;
  onToggleGroupSelect: () => void;
  onSetApproval: (group: DrawingGroup) => void;
  onDeleteSet?: ((group: DrawingGroup) => void) | null;
  onRenameSet?: ((group: DrawingGroup) => void) | null;
  onMarkTitleblock?: ((group: DrawingGroup) => void) | null;
  onPackageReport?: ((group: DrawingGroup) => void) | null;
  hideOnCompact?: CSSProperties;
  submittalCounts?: DrawingSetSubmittalCounts;
}

export function GroupRow({
  group, expanded, onToggleExpand,
  groupSelected, groupIndeterminate, onToggleGroupSelect,
  onSetApproval, onDeleteSet, onRenameSet, onMarkTitleblock, onPackageReport, hideOnCompact,
  // { total, open } | undefined. When present (and total > 0), we
  // render a "N SUBMITTALS" chip in the group meta line so you can
  // see at a glance which sets have transmittal activity.
  submittalCounts,
}: GroupRowProps) {
  // Whether the parent drawing_sets row already has both title + sheet-#
  // rectangles saved. Drives the button label ("Mark" vs "Update") and
  // colour cue on the row.
  const hasTemplate = group.parent ? hasTitleblockTemplate(group.parent) : false;
  const a = group.aggregates;
  const accent = group.isUngrouped ? "var(--text-muted)" : "var(--accent)";
  // Overdue sets get a red-tinted gradient + a red left-border strip so the
  // row reads as "needs attention" at a glance, even before the user parses
  // the small "X OVERDUE — MAX Yd LATE" text.
  // A set is "good to go" (never late) when its workflow is actually done, by
  // the real sources of truth: every linked submittal terminal-approved
  // (open === 0), a legacy approved set_approval_status, or an explicit manual
  // release state. Without this, a past due_date on an already-released set
  // flagged the whole row red — the "good sets lighting up red" bug.
  const submittalClosed = !!(submittalCounts && submittalCounts.total > 0 && submittalCounts.open === 0);
  const setDone =
    submittalClosed ||
    a.aggregateStatus === "approved" ||
    ["Partially Released", "Released for Erection"].includes(group.parent?.detailing_state ?? "");
  // Late only when past due AND not done. Three-state row coloring makes
  // late vs. done vs. in-progress obvious at a glance.
  const overdueActive = a.overdueCount > 0 && !setDone;
  const isGroupOverdue = overdueActive && !group.isUngrouped;
  const rowBg = isGroupOverdue
    ? "linear-gradient(90deg, color-mix(in srgb, var(--status-error) 14%, transparent), color-mix(in srgb, var(--status-error) 4%, transparent) 65%, transparent)"   // red = late
    : group.isUngrouped
      ? "color-mix(in srgb, var(--text-primary) 1.5%, transparent)"
      : setDone
        ? "linear-gradient(90deg, color-mix(in srgb, var(--status-success) 10%, transparent), color-mix(in srgb, var(--status-success) 2%, transparent) 65%, transparent)" // green = done
        : "linear-gradient(90deg, color-mix(in srgb, var(--accent) 8%, transparent), color-mix(in srgb, var(--accent) 2%, transparent) 65%, transparent)"; // amber = in progress

  return (
    <tr
      style={{
        background: rowBg,
        borderTop: "1px solid var(--border-default)",
        borderBottom: "1px solid var(--border-default)",
        borderLeft: isGroupOverdue ? "4px solid var(--status-error)" : setDone ? "4px solid var(--status-success)" : "4px solid transparent",
        cursor: "default",
      }}
    >
      {/* Checkbox */}
      <td style={tdBase}>
        <input
          type="checkbox"
          checked={groupSelected}
          ref={(el) => { if (el) el.indeterminate = groupIndeterminate; }}
          onChange={onToggleGroupSelect}
          disabled={group.isUngrouped}
          style={{ cursor: group.isUngrouped ? "default" : "pointer", opacity: group.isUngrouped ? 0.4 : 1 }}
        />
      </td>

      {/* Expand chevron + set name + count spans across TITLE column */}
      <td
        colSpan={3}
        style={{
          ...tdBase,
          padding: "10px 12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={onToggleExpand}
            aria-label={expanded ? "Collapse set" : "Expand set"}
            style={{
              background: "var(--bg-surface-high)",
              border: `1px solid ${accent}40`,
              borderRadius: 4,
              width: 22, height: 22,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
              transition: "transform 0.2s",
              transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
              color: accent,
              ...mono, fontSize: 10, fontWeight: 800,
              flexShrink: 0,
            }}
          >
            ▸
          </button>
          {a.hasPriority && !group.isUngrouped && <PriorityDot active={true} />}
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <div style={{
              ...mono, fontSize: 12, fontWeight: 800,
              color: group.isUngrouped ? "var(--text-muted)" : "var(--text-primary)",
              letterSpacing: "0.08em", textTransform: "uppercase",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              {group.name}
              {!group.isUngrouped && (
                <span
                  title="Drawing set number"
                  style={{
                    ...mono,
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: "0.08em",
                    color: "var(--accent)",
                    background: "var(--accent-muted)",
                    border: "1px solid var(--accent-border)",
                    borderRadius: 999,
                    padding: "2px 7px",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}
                >
                  SET # {formatDrawingSetNumber(group)}
                </span>
              )}
              {/* Lock indicator (migration 071). Shown to everyone — admin
                  unlock lives on the viewer header. */}
              {group.parent?.is_locked && (
                <span
                  title={
                    group.parent?.locked_reason
                      ? `Locked: ${group.parent.locked_reason}`
                      : "Set is locked from edits"
                  }
                  style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 18, height: 18, borderRadius: 3,
                    background: "color-mix(in srgb, var(--status-warning) 15%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--status-warning) 40%, transparent)",
                    color: "var(--status-warning)",
                  }}
                >
                  <Lock size={10} />
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {group.setOnly ? (
                <>
                  <span
                    title="Set-level record imported from Drive. Per-sheet rows not populated yet."
                    style={{
                      ...mono, fontSize: 8, fontWeight: 800, letterSpacing: "0.10em",
                      padding: "1px 6px", borderRadius: 3,
                      color: "var(--status-info)",
                      background: "color-mix(in srgb, var(--status-info) 12%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--status-info) 35%, transparent)",
                      textTransform: "uppercase",
                    }}
                  >
                    SET · FROM DRIVE
                  </span>
                  {a.stageSummary && (
                    <>
                      <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>·</span>
                      <span style={{ ...mono, fontSize: 9, color: accent, fontWeight: 700, letterSpacing: "0.08em" }}>
                        LATEST: {a.stageSummary}
                      </span>
                    </>
                  )}
                  {a.eventCount != null && (
                    <>
                      <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>·</span>
                      <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
                        {a.eventCount} ROUND-TRIP{a.eventCount === 1 ? "" : "S"}
                      </span>
                    </>
                  )}
                  {a.driveUrl && (
                    <>
                      <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>·</span>
                      <a
                        href={a.driveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="Open Drive BFA folder"
                        style={{
                          ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                          color: "var(--accent)", textDecoration: "none",
                          padding: "1px 6px", borderRadius: 3,
                          border: "1px solid var(--accent-border)",
                          background: "var(--accent-muted)",
                        }}
                      >
                        OPEN DRIVE ↗
                      </a>
                    </>
                  )}
                </>
              ) : (
                <>
                  <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
                    {a.total} SHEET{a.total === 1 ? "" : "S"}
                  </span>
                  <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>·</span>
                  <span style={{ ...mono, fontSize: 9, color: accent, fontWeight: 700 }}>
                    {a.releasedCount}/{a.total} RELEASED ({a.percentReleased}%)
                  </span>
                </>
              )}
              {a.disciplines.length > 0 && (
                <>
                  <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>·</span>
                  <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
                    {a.disciplines.slice(0, 3).join(" / ")}
                    {a.disciplines.length > 3 ? ` +${a.disciplines.length - 3}` : ""}
                  </span>
                </>
              )}
              {overdueActive && (
                <>
                  <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>·</span>
                  <span style={{ ...mono, fontSize: 9, color: "var(--status-error)", fontWeight: 800 }}>
                    {a.overdueCount} OVERDUE{a.maxLate > 0 ? ` · MAX ${a.maxLate}D LATE` : ""}
                  </span>
                </>
              )}
              {/* Submittal rollup — submittals are workflow source of
                  truth (Sprint 1+). Shows count + latest status so the
                  group header reflects the live workflow state without
                  a click-through. "N OPEN" only renders when there's
                  any open transmittal so closed sets stay visually
                  quiet. */}
              {submittalCounts && submittalCounts.total > 0 && (
                <>
                  <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>·</span>
                  <span
                    className={submittalCounts.open > 0 ? "sbd-badge-info" : "sbd-badge"}
                    title={`${submittalCounts.total} submittal${submittalCounts.total === 1 ? "" : "s"} reference this set${submittalCounts.latestStatus ? `, latest: ${submittalCounts.latestStatus}` : ""}${submittalCounts.open > 0 ? ` · ${submittalCounts.open} still open` : ""}`}
                    style={{
                      ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                      color: submittalCounts.open > 0 ? "var(--accent)" : "var(--text-muted)",
                    }}
                  >
                    <span className="sbd-num">{submittalCounts.total}</span> SUBMITTAL{submittalCounts.total === 1 ? "" : "S"}
                    {submittalCounts.latestStatus ? ` · ${String(submittalCounts.latestStatus).toUpperCase()}` : ""}
                    {submittalCounts.open > 0 ? <> · <span className="sbd-num">{submittalCounts.open}</span> OPEN</> : ""}
                  </span>
                </>
              )}
              {/* AI processing rollup — only shown when there are non-released sheets with flags */}
              {a.percentReleased < 100 && (a.aiExtracting > 0 || a.aiNeedsReview > 0 || a.aiFailed > 0) && (
                <>
                  <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>·</span>
                  <span style={{ ...mono, fontSize: 9, color: "var(--status-warning)", fontWeight: 700 }}>
                    {a.aiProcessed}/{a.total} PROCESSED
                    {a.aiNeedsReview > 0 && ` · ${a.aiNeedsReview} REVIEW`}
                    {a.aiExtracting > 0 && ` · ${a.aiExtracting} RUNNING`}
                    {a.aiFailed > 0 && ` · ${a.aiFailed} FAILED`}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* REV (max) */}
      <td style={{ ...tdBase, ...mono, fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textAlign: "center" }}>
        R{a.maxRev}
      </td>

      {/* Stage aggregate — progress bar */}
      <td style={tdBase}>
        <StageBar stageCounts={a.stageCounts} total={a.total} />
      </td>

      {/* Submitted (earliest) */}
      <td style={{ ...tdBase, ...mono, fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap", ...hideOnCompact }}>
        {a.earliestSubmitted || "—"}
      </td>

      {/* Due (earliest) */}
      <td style={{ ...tdBase, ...mono, fontSize: 10, color: overdueActive ? "var(--status-error)" : "var(--text-muted)", whiteSpace: "nowrap", fontWeight: overdueActive ? 700 : 500 }}>
        {a.earliestDue || "—"}
      </td>

      {/* Reviewer — dropped from the register table */}
      <td style={{ display: "none" }}>—</td>

      {/* Approval */}
      <td style={tdBase}>
        {a.aggregateStatus ? (
          <span style={{
            ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
            padding: "2px 7px", borderRadius: "var(--radius-badge)",
            color:
              a.aggregateStatus === "approved"       ? "var(--status-success)"
            : a.aggregateStatus === "rejected"       ? "var(--status-error)"
            : a.aggregateStatus === "pending_review" ? "var(--status-warning)"
            :                                          "var(--text-muted)",
            background:
              a.aggregateStatus === "approved"       ? "color-mix(in srgb, var(--status-success) 12%, transparent)"
            : a.aggregateStatus === "rejected"       ? "color-mix(in srgb, var(--status-error) 12%, transparent)"
            : a.aggregateStatus === "pending_review" ? "color-mix(in srgb, var(--status-warning) 14%, transparent)"
            : a.aggregateStatus === "superseded"     ? "var(--bg-surface-high)"
            :                                          "var(--bg-surface-high)",
            border: `1px solid ${
              a.aggregateStatus === "approved"       ? "color-mix(in srgb, var(--status-success) 25%, transparent)"
            : a.aggregateStatus === "rejected"       ? "color-mix(in srgb, var(--status-error) 25%, transparent)"
            : a.aggregateStatus === "pending_review" ? "color-mix(in srgb, var(--status-warning) 40%, transparent)"
            : a.aggregateStatus === "superseded"     ? "var(--border-default)"
            :                                          "var(--border-default)"
            }`,
            textTransform: "uppercase",
          }}>
            {a.aggregateStatus === "pending_review" ? "PENDING" : a.aggregateStatus}
          </span>
        ) : !group.isUngrouped ? (
          <button
            onClick={() => onSetApproval(group)}
            style={{
              ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", padding: "2px 7px",
              borderRadius: "var(--radius-badge)",
              background: "none", border: "1px dashed var(--border-strong)", color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            REVIEW SET
          </button>
        ) : (
          <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>—</span>
        )}
      </td>

      {/* Actions cell — set-level rename + delete + mark-titleblock.
          Offered for all named sets (with or without child sheets).
          UNGROUPED sheets don't belong to a drawing_sets row so there's
          nothing to rename/delete/template. */}
      <td style={tdBase}>
        {!group.isUngrouped && (onRenameSet || onDeleteSet || onMarkTitleblock || onPackageReport) && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            {onPackageReport && (
              <ActionButton
                label="✦ Impact Report"
                primary
                title={`AI Revision Impact Report for set "${group.name}" — what changed across all revised sheets`}
                onClick={() => onPackageReport(group)}
              />
            )}
            {onMarkTitleblock && (
              <ActionButton
                label={hasTemplate ? "✓ Titleblock" : "Mark Titleblock"}
                title={hasTemplate
                  ? `Update title + sheet# rectangles for set "${group.name}"`
                  : `Mark where title and sheet number live in this set's titleblock — pulled directly from there on every new sheet`}
                onClick={() => onMarkTitleblock(group)}
              />
            )}
            {onRenameSet && (
              <ActionButton
                label="Rename"
                title={`Rename set "${group.name}"`}
                onClick={() => onRenameSet(group)}
              />
            )}
            {onDeleteSet && (
              <ActionButton
                label="Delete Set"
                danger
                title={a.total > 0 ? `Delete entire set "${group.name}" and all ${a.total} sheet${a.total === 1 ? "" : "s"}` : `Delete set "${group.name}"`}
                onClick={() => onDeleteSet(group)}
              />
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

/**
 * Child row shown when a set-level-only group (one imported from the Drive
 * BFA walk, with no per-sheet rows yet) is expanded. Renders the revision
 * history timeline stored on the parent drawing_sets row so the user can
 * see the round-trip events even though there's no per-sheet detail.
 */
function readStageCounts(metadata: Json | null): Record<string, string | number> | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const stageCounts = metadata.stage_counts;
  if (!stageCounts || typeof stageCounts !== "object" || Array.isArray(stageCounts)) return null;
  return Object.fromEntries(
    Object.entries(stageCounts).filter((entry): entry is [string, string | number] => (
      typeof entry[1] === "string" || typeof entry[1] === "number"
    )),
  );
}

export function SetOnlyInfoRow({ group }: { group: DrawingGroup }) {
  const parent = group.parent;
  if (!parent) return null;
  const history = parent.revision_history || "";
  const driveUrl = parent.file_url || null;
  const stageCounts = readStageCounts(parent.metadata);
  return (
    <tr style={{ background: "color-mix(in srgb, var(--status-info) 3%, transparent)" }}>
      <td style={tdBase}></td>
      <td colSpan={10} style={{ ...tdBase, padding: "14px 18px 14px 44px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{
            ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
            color: "var(--text-muted)", textTransform: "uppercase",
          }}>
            Round-trip timeline
          </div>
          {history ? (
            <div style={{
              fontFamily: "var(--font-body)", fontSize: 12,
              color: "var(--text-primary)", lineHeight: 1.6,
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
              {history}
            </div>
          ) : (
            <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
              No event history recorded on this set.
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 4 }}>
            {parent.issued_date && (
              <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
                INITIAL OFA: <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{parent.issued_date}</span>
              </span>
            )}
            {parent.set_approved_date && (
              <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
                LATEST EVENT: <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{parent.set_approved_date}</span>
              </span>
            )}
            {stageCounts && Object.keys(stageCounts).length > 0 && (
              <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
                STAGES: <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>
                  {Object.entries(stageCounts).map(([k, n]) => `${k}:${n}`).join(" ")}
                </span>
              </span>
            )}
          </div>

          <div style={{
            display: "flex", alignItems: "center", gap: 10, marginTop: 4,
            paddingTop: 10, borderTop: "1px dashed var(--border-default)",
          }}>
            <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
              Individual sheets not yet loaded
            </span>
            {driveUrl && (
              <a
                href={driveUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                  color: "var(--accent)", textDecoration: "none",
                  padding: "3px 9px", borderRadius: 4,
                  border: "1px solid var(--accent-border)",
                  background: "var(--accent-muted)",
                }}
              >
                OPEN DRIVE FOLDER ↗
              </a>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

export interface DrawingContextMenuState {
  x: number;
  y: number;
  drawing: Drawing;
}

interface SheetRowProps {
  d: Drawing;
  isSel: boolean;
  onToggleSelect: (id: string) => void;
  onEdit?: ((drawing: Drawing) => void) | null;
  onDelete?: ((id: string) => void) | null;
  onAdvance: (drawing: Drawing) => void;
  onView: (drawing: Drawing) => void;
  setContextMenu: (menu: DrawingContextMenuState) => void;
  rfiMap: Record<string, object>;
  isChild: boolean;
  hideOnCompact?: CSSProperties;
}

export function SheetRow({
  d, isSel, onToggleSelect, onEdit, onDelete, onAdvance, onView,
  setContextMenu, rfiMap, isChild, hideOnCompact,
}: SheetRowProps) {
  const overdueInput = {
    due_date: d.due_date ?? undefined,
    stage: d.stage ?? undefined,
    is_superseded: d.is_superseded ?? undefined,
    set_approval_status: d.set_approval_status ?? undefined,
  };
  const overdue = isOverdue(overdueInput);
  const late = daysLate(overdueInput);
  const urgency = urgencyClass(late);

  // F21: per-row kebab menu. Right-click has been the only way to reach
  // the context actions (View / Edit / Advance / Set Approval / Delete)
  // which is unusable on touch and poor for keyboard users. The kebab
  // button opens the same popover from a keyboard-focusable target.
  const openKebabMenu = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setContextMenu({
      x: rect.right - 180, // align menu right-edge under the button
      y: rect.bottom + 2,
      drawing: d,
    });
  };

  return (
    <tr
      className={urgency}
      onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, drawing: d }); }}
      style={{
        // Selection wins over overdue tint; otherwise a clearly-red wash for
        // overdue sheets so the row reads as urgent at a glance instead of
        // relying on the small red badges in cells.
        background: isSel ? "color-mix(in srgb, var(--accent) 6%, transparent)" : overdue ? "color-mix(in srgb, var(--status-error) 10%, transparent)" : "none",
        cursor: "default",
        borderLeft: overdue ? "4px solid var(--status-error)" : "4px solid transparent",
      }}
    >
      <td style={tdBase}>
        <input type="checkbox" checked={isSel} onChange={() => onToggleSelect(d.id)} style={{ cursor: "pointer" }} />
      </td>

      {/* Sheet number + priority (indented if child) */}
      <td style={{ ...tdBase, ...mono, fontSize: 12, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap", paddingLeft: isChild ? 40 : 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {isChild && (
            <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)", opacity: 0.45 }}>└</span>
          )}
          <PriorityDot active={Boolean(d.priority_flag)} />
          {d.sheet_number || "—"}
        </div>
      </td>

      {/* Title + badges */}
      <td style={{ ...tdBase, maxWidth: 280 }}>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {d.title}
          {/* Hide stale AI extraction badges on completed sheets — they're
              upload-process artifacts, not approval status indicators.
              Post-migration-077: drawings past IFC are considered done
              for AI-extraction badge purposes. */}
          {d.stage !== "Released" && d.stage !== "IFC" && (
            <AIStatusBadge status={d.ai_extraction_status} uploadStatus={d.upload_status} error={d.ai_extraction_error} />
          )}
        </div>
        <RFILinkBadge linkedIds={d.linked_rfi_ids ?? ""} rfiMap={rfiMap} />
        {(d.is_superseded || d.set_approval_status === "superseded") && (
          <div style={{ marginTop: 3 }}><SupersededBadge /></div>
        )}
      </td>

      {/* DISCIPLINE — dropped from the register table (still on the discipline chips) */}
      <td style={{ display: "none" }}>{d.discipline}</td>
      <td style={{ ...tdBase, ...mono, fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textAlign: "center" }}>R{d.revision_number ?? "0"}</td>
      <td style={tdBase}><StageChip stage={d.stage ?? ""} size="lg" /></td>
      <td style={{ ...tdBase, ...mono, fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap", ...hideOnCompact }}>{d.submitted_date || "—"}</td>

      {/* Due date / days late */}
      <td style={{ ...tdBase, whiteSpace: "nowrap" }}>
        {overdue && late > 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ ...mono, fontSize: 11, fontWeight: 800, color: "var(--status-error)" }}>
              {late}d late
            </span>
            <OverdueBadge />
          </div>
        ) : (
          <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>{d.due_date || "—"}</span>
        )}
      </td>

      {/* REVIEWER — dropped from the register table */}
      <td style={{ display: "none" }}>{d.reviewer || "—"}</td>

      {/* Approval status (per-sheet) */}
      <td style={tdBase}>
        {d.set_approval_status ? (
          <span style={{
            ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", padding: "2px 7px", borderRadius: "var(--radius-badge)",
            color: d.set_approval_status === "approved" ? "var(--status-success)" : d.set_approval_status === "rejected" ? "var(--status-error)" : "var(--text-muted)",
            background: d.set_approval_status === "approved" ? "color-mix(in srgb, var(--status-success) 12%, transparent)" : d.set_approval_status === "rejected" ? "color-mix(in srgb, var(--status-error) 12%, transparent)" : "var(--bg-surface-high)",
            border: `1px solid ${d.set_approval_status === "approved" ? "color-mix(in srgb, var(--status-success) 25%, transparent)" : d.set_approval_status === "rejected" ? "color-mix(in srgb, var(--status-error) 25%, transparent)" : "var(--border-default)"}`,
            textTransform: "uppercase",
          }}>
            {d.set_approval_status}
          </span>
        ) : (
          <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>—</span>
        )}
      </td>

      {/* Row actions. Delete is visually isolated behind a 14px gap + divider
          so it cannot be mis-clicked next to Next. See F6 in audit. The
          kebab (F21) opens the same context menu as right-click so touch
          and keyboard users can reach it without a pointer. */}
      <td style={tdBase}>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <ActionButton label="View" onClick={() => onView(d)} />
          <ActionButton label="Edit" onClick={() => onEdit?.(d)} />
          <ActionButton label="Next" title="Advance stage" onClick={() => onAdvance(d)} disabled={d.stage === "Released"} />
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 1,
              height: 18,
              margin: "0 9px 0 9px",
              background: "var(--border-default)",
              opacity: 0.7,
            }}
          />
          <ActionButton label="Delete" onClick={() => onDelete?.(d.id)} title="Delete this sheet" danger />
          <button
            type="button"
            onClick={openKebabMenu}
            title="More actions"
            aria-label="More actions"
            style={{
              ...mono,
              fontSize: 14,
              fontWeight: 800,
              lineHeight: 1,
              padding: "2px 6px",
              marginLeft: 4,
              borderRadius: "var(--radius-badge)",
              border: "1px solid var(--border-default)",
              background: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              minHeight: 26,
              minWidth: 26,
            }}
          >
            ⋮
          </button>
        </div>
      </td>
    </tr>
  );
}
