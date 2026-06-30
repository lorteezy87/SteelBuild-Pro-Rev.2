import React, { useMemo, useState, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { mono } from "./drawingsConfig";
import { STAGE_MAP, STAGE_ORDER } from "./drawingsConfig";
import StageChip from "./StageChip";
import PriorityDot from "./PriorityDot";
import { OverdueBadge, RFILinkBadge, SupersededBadge } from "./DrawingBadges";
import { isOverdue, daysLate, urgencyClass } from "./drawingsUtils";
import { hasTitleblockTemplate } from "@/lib/titleblock";
import { compareDrawingSetPackages, formatDrawingSetNumber, getDrawingSetNumber } from "@/lib/drawingSetOrdering";
import { Lock } from "lucide-react";

// ─── AI extraction / upload status badge ───────────────────────────────────
//
// Shown inline next to the sheet title so the user can see at a glance
// whether a child row is mid-processing, needs review, or failed to extract.
// Processed rows render nothing (no chrome) to keep the log clean.
const AI_STATUS_META = {
  Pending:     { label: "QUEUED",    color: "#94A3B8", bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.30)", title: "Queued for AI extraction" },
  Extracting:  { label: "✦ READING", color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.35)",  title: "Claude is reading this sheet" },
  NeedsReview: { label: "REVIEW",    color: "#F97316", bg: "rgba(249,115,22,0.12)",  border: "rgba(249,115,22,0.35)",  title: "AI finished but found something to verify" },
  Failed:      { label: "✗ FAILED",  color: "#EF4444", bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.35)",   title: "AI extraction failed — click to retry" },
};

function AIStatusBadge({ status, uploadStatus, error }) {
  // Failed upload always wins — it's more severe than any AI state.
  if (uploadStatus === "Failed") {
    return (
      <span title={error || "File upload failed"} style={{
        ...mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.08em",
        padding: "1px 5px", borderRadius: 4, marginLeft: 6,
        color: "#EF4444", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)",
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
        color: "#3B82F6", background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.35)",
        verticalAlign: "middle",
      }}>
        ↑ UPLOADING
      </span>
    );
  }
  const meta = AI_STATUS_META[status];
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

// ─── Small UI primitives ────────────────────────────────────────────────────

function ActionBtn({ label, onClick, danger, disabled, title, primary }) {
  const [hovered, setHovered] = React.useState(false);
  const baseColor = primary ? "var(--accent)" : danger ? "var(--status-error)" : "var(--text-muted)";
  // Danger buttons get a visible tinted background at rest (not just on hover)
  // so they can never be mistaken for a neutral "Next"/"Edit"/"View" button
  // sitting next to them. This is the F6 mis-click fix from the audit.
  const baseBg = danger ? "rgba(239,68,68,0.10)" : "none";
  const hoverBg = primary ? "rgba(200,155,32,0.18)" : danger ? "rgba(239,68,68,0.22)" : "rgba(255,255,255,0.04)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...mono,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.06em",
        padding: danger ? "4px 10px" : "4px 9px",
        borderRadius: "var(--radius-badge)",
        border: `1px solid ${
          hovered && !disabled
            ? baseColor + "80"
            : danger
              ? "rgba(239,68,68,0.55)"
              : "var(--border-default)"
        }`,
        background: hovered && !disabled ? hoverBg : baseBg,
        color: baseColor,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.3 : 1,
        whiteSpace: "nowrap",
        minHeight: 26,
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}

export function ContextMenuItem({ label, onClick, danger }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "block", width: "100%", textAlign: "left", padding: "8px 16px",
        background: hovered ? (danger ? "rgba(239,68,68,0.08)" : "var(--hover-bg)") : "none",
        border: "none", cursor: "pointer", ...mono, fontSize: 10,
        fontWeight: 700, letterSpacing: "0.08em",
        color: danger ? "var(--status-error)" : "var(--text-primary)",
        transition: "background 0.1s",
      }}
    >
      {label}
    </button>
  );
}

// ─── Grouping + aggregate helpers ───────────────────────────────────────────

const UNGROUPED_KEY = "__ungrouped__";
const UNGROUPED_LABEL = "UNGROUPED SHEETS";
// v2: the default is now all-collapsed (rolled up). Bumping the key discards
// the old persisted "everything expanded" state so the new default takes effect
// for existing users; their future expand/collapse choices persist under v2.
const EXPAND_LS_KEY = "sbp-drawings-expanded-sets-v2";

/**
 * Group drawings into drawing sets. Identity is the FK `drawing_set_id` when
 * present; legacy rows that only carry the text `drawing_set_name` fall back
 * to a synthetic `name:<trimmed>` key. Sheets with neither go to UNGROUPED.
 *
 * Display names come from `drawingSetMap[id].set_name` when we have the
 * parent row; otherwise we use the legacy text column. This is the F8 fix
 * from the audit: source-of-truth is now the parent FK, not the denormalized
 * string on the child row.
 *
 * Set-level-only rows (drawing_sets records with zero child drawings — e.g.
 * BFA submittal round-trips imported from Drive at the set level) are seeded
 * as groups from `drawingSetMap` after the drawings pass, so they appear in
 * the list with parent-derived aggregates (stage_summary, set_approval_status,
 * issued_date, set_approved_date, file_url).
 */
function groupByDrawingSet(drawings, drawingSetMap = {}) {
  const buckets = new Map();
  drawings.forEach((d) => {
    const setId = d.drawing_set_id || null;
    const legacyName = (d.drawing_set_name || "").trim();
    const key = setId ? `id:${setId}` : legacyName ? `name:${legacyName}` : UNGROUPED_KEY;
    if (!buckets.has(key)) {
      const parent = setId ? drawingSetMap[setId] : null;
      const displayName = (parent?.set_name || legacyName || "").trim();
      buckets.set(key, {
        key,
        setId,
        name: displayName || UNGROUPED_LABEL,
        parent,
        sheets: [],
      });
    }
    buckets.get(key).sheets.push(d);
  });

  // Seed empty buckets for any drawing_sets record with no child drawings.
  // These are the set-level-only rows imported from the Drive BFA folder
  // walk — they have no per-sheet rows yet (Phase 2 work), but still need
  // to appear in the list so the user can see submittal round-trip state
  // (approved / pending / stage_summary) and jump to the Drive folder.
  Object.values(drawingSetMap).forEach((parent) => {
    if (!parent?.id) return;
    const key = `id:${parent.id}`;
    if (buckets.has(key)) return;
    buckets.set(key, {
      key,
      setId: parent.id,
      name: (parent.set_name || "").trim() || UNGROUPED_LABEL,
      parent,
      sheets: [],
    });
  });

  // Compute aggregates for each group
  const groups = [];
  for (const group of buckets.values()) {
    const sheets = group.sheets.slice().sort((a, b) => {
      const an = (a.sheet_number || "").toString();
      const bn = (b.sheet_number || "").toString();
      return an.localeCompare(bn, undefined, { numeric: true, sensitivity: "base" });
    });

    const parent = group.parent || null;
    const setOnly = sheets.length === 0 && !!parent;

    // Stage rollup
    const stageCounts = {};
    STAGE_ORDER.forEach((k) => { stageCounts[k] = 0; });
    sheets.forEach((s) => {
      const k = s.stage || "Not Started";
      stageCounts[k] = (stageCounts[k] || 0) + 1;
    });
    const releasedCount = stageCounts["Released"] || 0;

    // Date rollups
    const submittedDates = sheets.map((s) => s.submitted_date).filter(Boolean).sort();
    const dueDates = sheets.map((s) => s.due_date).filter(Boolean).sort();
    let earliestSubmitted = submittedDates[0] || null;
    let earliestDue = dueDates[0] || null;

    // Overdue rollup
    const overdueCount = sheets.filter((s) => isOverdue(s)).length;
    const maxLate = sheets.reduce((m, s) => Math.max(m, daysLate(s) || 0), 0);

    // AI extraction rollup — used for "X of Y processed" summary badges.
    // Rows without the new status column are treated as already processed
    // (legacy rows) so migration doesn't make the UI look broken.
    const aiProcessed = sheets.filter((s) => !s.ai_extraction_status || s.ai_extraction_status === "Processed").length;
    const aiNeedsReview = sheets.filter((s) => s.ai_extraction_status === "NeedsReview").length;
    const aiExtracting = sheets.filter((s) => s.ai_extraction_status === "Extracting" || s.ai_extraction_status === "Pending").length;
    const aiFailed = sheets.filter((s) => s.ai_extraction_status === "Failed" || s.upload_status === "Failed").length;

    // Approval rollup — all sheets in the set should share status if bulk-approved
    const statuses = new Set(sheets.map((s) => s.set_approval_status).filter(Boolean));
    let aggregateStatus = statuses.size === 1 ? [...statuses][0] : null;

    // Disciplines present
    const disciplines = new Set(sheets.map((s) => s.discipline).filter(Boolean));

    // Priority
    const hasPriority = sheets.some((s) => s.priority_flag);

    // Latest revision (numeric max)
    const revNums = sheets
      .map((s) => Number(String(s.revision_number || "0").replace(/[^\d]/g, "")))
      .filter((n) => !isNaN(n));
    let maxRev = revNums.length ? Math.max(...revNums) : 0;

    // Parent-derived fallbacks for set-level-only rows (no child sheets).
    // We pull from the drawing_sets row so the group summary shows something
    // real instead of a row full of em-dashes.
    let stageSummary = null;
    let driveUrl = null;
    let revisionHistory = null;
    let eventCount = null;
    if (setOnly) {
      aggregateStatus = parent.set_approval_status || null;
      stageSummary = parent.stage_summary || null;
      driveUrl = parent.file_url || null;
      revisionHistory = parent.revision_history || null;
      eventCount = parent.metadata?.event_count ?? null;
      if (parent.discipline) disciplines.add(parent.discipline);
      if (!earliestSubmitted && parent.issued_date) earliestSubmitted = parent.issued_date;
      if (!earliestDue && parent.set_approved_date) earliestDue = parent.set_approved_date;
    }

    groups.push({
      key: group.key,
      setId: group.setId,
      name: group.name,
      setNumber: getDrawingSetNumber(parent || group),
      isUngrouped: group.key === UNGROUPED_KEY,
      setOnly,
      parent,
      sheets,
      aggregates: {
        total: sheets.length,
        stageCounts,
        releasedCount,
        percentReleased: sheets.length > 0 ? Math.round((releasedCount / sheets.length) * 100) : 0,
        earliestSubmitted,
        earliestDue,
        overdueCount,
        maxLate,
        aggregateStatus,
        disciplines: [...disciplines],
        hasPriority,
        maxRev,
        aiProcessed,
        aiNeedsReview,
        aiExtracting,
        aiFailed,
        stageSummary,
        driveUrl,
        revisionHistory,
        eventCount,
      },
    });
  }

  // Action-first default ordering: sets needing attention (overdue, priority,
  // failed or needs-review AI extraction) float to the top so the register
  // answers "what needs action?" at a glance. Package order (drawing-set /
  // package number, then natural name) is preserved WITHIN each partition, and
  // ungrouped loose sheets always stay last.
  const setNeedsAction = (g) => {
    if (g.isUngrouped) return false;
    const a = g.aggregates;
    return a.overdueCount > 0 || a.hasPriority || a.aiNeedsReview > 0 || a.aiFailed > 0;
  };
  groups.sort((x, y) => {
    if (x.isUngrouped !== y.isUngrouped) return x.isUngrouped ? 1 : -1;
    const ax = setNeedsAction(x);
    const ay = setNeedsAction(y);
    if (ax !== ay) return ax ? -1 : 1;
    return compareDrawingSetPackages(x, y);
  });

  return groups;
}

// ─── Persistence for expand/collapse ────────────────────────────────────────

function loadExpanded() {
  try {
    const raw = localStorage.getItem(EXPAND_LS_KEY);
    if (!raw) return null;
    return new Set(JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveExpanded(set) {
  try {
    localStorage.setItem(EXPAND_LS_KEY, JSON.stringify([...set]));
  } catch { /* noop */ }
}

// ─── Row renderers ──────────────────────────────────────────────────────────

const tdBase = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--divider)",
  verticalAlign: "middle",
};

function StageBar({ stageCounts, total }) {
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

function GroupRow({
  group, expanded, onToggleExpand,
  groupSelected, groupIndeterminate, onToggleGroupSelect,
  onSetApproval, onDeleteSet, onRenameSet, onMarkTitleblock, onPackageReport, hideOnCompact,
  // { total, open } | undefined. When present (and total > 0), we
  // render a "N SUBMITTALS" chip in the group meta line so you can
  // see at a glance which sets have transmittal activity.
  submittalCounts,
}) {
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
    ["Partially Released", "Released for Erection"].includes(group.parent?.detailing_state);
  // Late only when past due AND not done. Three-state row coloring makes
  // late vs. done vs. in-progress obvious at a glance.
  const overdueActive = a.overdueCount > 0 && !setDone;
  const isGroupOverdue = overdueActive && !group.isUngrouped;
  const rowBg = isGroupOverdue
    ? "linear-gradient(90deg, rgba(239,68,68,0.14), rgba(239,68,68,0.04) 65%, transparent)"   // red = late
    : group.isUngrouped
      ? "rgba(255,255,255,0.015)"
      : setDone
        ? "linear-gradient(90deg, rgba(16,185,129,0.10), rgba(16,185,129,0.02) 65%, transparent)" // green = done
        : "linear-gradient(90deg, rgba(200,155,32,0.08), rgba(200,155,32,0.02) 65%, transparent)"; // amber = in progress

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
                    background: "rgba(245, 158, 11, 0.15)",
                    border: "1px solid rgba(245, 158, 11, 0.4)",
                    color: "#f59e0b",
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
                      color: "#60A5FA", background: "rgba(96,165,250,0.12)",
                      border: "1px solid rgba(96,165,250,0.35)",
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
                          border: "1px solid var(--accent-border, rgba(200,155,32,0.35))",
                          background: "rgba(200,155,32,0.08)",
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
                      color: submittalCounts.open > 0 ? "#0D9488" : "var(--text-muted)",
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
                  <span style={{ ...mono, fontSize: 9, color: "#F59E0B", fontWeight: 700 }}>
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
              a.aggregateStatus === "approved"       ? "rgba(16,185,129,0.12)"
            : a.aggregateStatus === "rejected"       ? "rgba(239,68,68,0.12)"
            : a.aggregateStatus === "pending_review" ? "rgba(245,158,11,0.14)"
            : a.aggregateStatus === "superseded"     ? "rgba(148,163,184,0.12)"
            :                                          "var(--bg-surface-high)",
            border: `1px solid ${
              a.aggregateStatus === "approved"       ? "rgba(16,185,129,0.25)"
            : a.aggregateStatus === "rejected"       ? "rgba(239,68,68,0.25)"
            : a.aggregateStatus === "pending_review" ? "rgba(245,158,11,0.40)"
            : a.aggregateStatus === "superseded"     ? "rgba(148,163,184,0.30)"
            :                                          "var(--border-default)"
            }`,
            textTransform: "uppercase",
          }}>
            {a.aggregateStatus === "pending_review" ? "PENDING" : a.aggregateStatus}
          </span>
        ) : !group.isUngrouped ? (
          <button
            onClick={() => onSetApproval(group.name)}
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
              <ActionBtn
                label="✦ Impact Report"
                primary
                title={`AI Revision Impact Report for set "${group.name}" — what changed across all revised sheets`}
                onClick={() => onPackageReport(group)}
              />
            )}
            {onMarkTitleblock && (
              <ActionBtn
                label={hasTemplate ? "✓ Titleblock" : "Mark Titleblock"}
                title={hasTemplate
                  ? `Update title + sheet# rectangles for set "${group.name}"`
                  : `Mark where title and sheet number live in this set's titleblock — pulled directly from there on every new sheet`}
                onClick={() => onMarkTitleblock(group)}
              />
            )}
            {onRenameSet && (
              <ActionBtn
                label="Rename"
                title={`Rename set "${group.name}"`}
                onClick={() => onRenameSet(group)}
              />
            )}
            {onDeleteSet && (
              <ActionBtn
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
function SetOnlyInfoRow({ group }) {
  const parent = group.parent;
  if (!parent) return null;
  const history = parent.revision_history || "";
  const driveUrl = parent.file_url || null;
  const meta = parent.metadata || {};
  const stageCounts = meta.stage_counts || null;
  return (
    <tr style={{ background: "rgba(96,165,250,0.03)" }}>
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
                  border: "1px solid var(--accent-border, rgba(200,155,32,0.35))",
                  background: "rgba(200,155,32,0.08)",
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

function SheetRow({
  d, isSel, onToggleSelect, onEdit, onDelete, onAdvance, onView,
  setContextMenu, rfiMap, isChild, hideOnCompact,
}) {
  const overdue = isOverdue(d);
  const late = daysLate(d);
  const urgency = urgencyClass(late);

  // F21: per-row kebab menu. Right-click has been the only way to reach
  // the context actions (View / Edit / Advance / Set Approval / Delete)
  // which is unusable on touch and poor for keyboard users. The kebab
  // button opens the same popover from a keyboard-focusable target.
  const openKebabMenu = (e) => {
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
        background: isSel ? "rgba(200,155,32,0.06)" : overdue ? "rgba(239,68,68,0.10)" : "none",
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
          <PriorityDot active={d.priority_flag} />
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
        <RFILinkBadge linkedIds={d.linked_rfi_ids} rfiMap={rfiMap} />
        {(d.is_superseded || d.set_approval_status === "superseded") && (
          <div style={{ marginTop: 3 }}><SupersededBadge /></div>
        )}
      </td>

      {/* DISCIPLINE — dropped from the register table (still on the discipline chips) */}
      <td style={{ display: "none" }}>{d.discipline}</td>
      <td style={{ ...tdBase, ...mono, fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textAlign: "center" }}>R{d.revision_number ?? "0"}</td>
      <td style={tdBase}><StageChip stage={d.stage} size="lg" /></td>
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
            color: d.set_approval_status === "approved" ? "#10B981" : d.set_approval_status === "rejected" ? "var(--status-error)" : "var(--text-muted)",
            background: d.set_approval_status === "approved" ? "rgba(16,185,129,0.12)" : d.set_approval_status === "rejected" ? "rgba(239,68,68,0.12)" : "var(--bg-surface-high)",
            border: `1px solid ${d.set_approval_status === "approved" ? "rgba(16,185,129,0.25)" : d.set_approval_status === "rejected" ? "rgba(239,68,68,0.25)" : "var(--border-default)"}`,
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
          <ActionBtn label="View" onClick={() => onView(d)} />
          <ActionBtn label="Edit" onClick={() => onEdit(d)} />
          <ActionBtn label="Next" title="Advance stage" onClick={() => onAdvance(d)} disabled={d.stage === "Released"} />
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
          <ActionBtn label="Delete" onClick={() => onDelete(d.id)} title="Delete this sheet" danger />
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

// ─── Main table component ───────────────────────────────────────────────────

/**
 * Drawings list view organized by Drawing Set.
 * Each drawing_set_name appears as a collapsible summary row; the individual
 * sheets live underneath as child rows. Sheets without a set go to UNGROUPED.
 */
// F20: fields the user can click the header to sort on. Keyed by the data
// field (or a pseudo-field like "overdue") and given a comparator that knows
// how to handle the type. Keeping this out of the component body so it's a
// stable reference and doesn't churn the memo on every render.
const SORTABLE_FIELDS = {
  sheet_number:    { label: "SET / SHEET #", cmp: (a, b) => String(a.sheet_number || "").localeCompare(String(b.sheet_number || ""), undefined, { numeric: true, sensitivity: "base" }) },
  title:           { label: "TITLE",        cmp: (a, b) => String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base" }) },
  discipline:      { label: "DISCIPLINE",   cmp: (a, b) => String(a.discipline || "").localeCompare(String(b.discipline || ""), undefined, { sensitivity: "base" }) },
  revision_number: { label: "REV",          cmp: (a, b) => (Number(a.revision_number) || 0) - (Number(b.revision_number) || 0) },
  stage:           { label: "STAGE",        cmp: (a, b) => STAGE_ORDER.indexOf(a.stage || "") - STAGE_ORDER.indexOf(b.stage || "") },
  submitted_date:  { label: "SUBMITTED",    cmp: (a, b) => String(a.submitted_date || "").localeCompare(String(b.submitted_date || "")) },
  due_date:        { label: "DUE DATE",     cmp: (a, b) => String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")) },
  reviewer:        { label: "REVIEWER",     cmp: (a, b) => String(a.reviewer || "").localeCompare(String(b.reviewer || ""), undefined, { sensitivity: "base" }) },
};

// F23: below this container width (in px) we collapse the less-critical
// columns so the table still fits on laptops + tablets without a horizontal
// scrollbar eating the rest of the page.
const COMPACT_WIDTH_PX = 1200;

export default function DrawingsTable({
  drawings, selected, onToggleSelect, onToggleAll,
  onEdit, onDelete, onAdvance, onView,
  setContextMenu, onSetApproval, onDeleteSet, onRenameSet, onMarkTitleblock, onPackageReport, rfiMap,
  drawingSetMap = {},
  // submittalsBySetId: { [drawingSetId]: { total, open } } — used to
  // surface a "N SUBMITTALS" chip on each set's group header row.
  // Optional; when omitted, no chip is rendered.
  submittalsBySetId = {},
}) {
  // F20: sort state. null means "use the default by-sheet-number order
  // established inside groupByDrawingSet". Clicking a header toggles
  // asc → desc → off (null).
  const [sort, setSort] = useState(null); // { field, dir: 'asc'|'desc' } | null

  // F23: track our own width so we can hide columns on narrow viewports.
  // ResizeObserver on the outer div is cheaper than a window listener and
  // catches container-driven resizes (sidebar collapse, split pane drag).
  const containerRef = useRef(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = e.contentRect?.width ?? el.clientWidth;
        setCompact(w < COMPACT_WIDTH_PX);
      }
    });
    ro.observe(el);
    // Initial read (ResizeObserver only fires on change after observe)
    setCompact(el.clientWidth < COMPACT_WIDTH_PX);
    return () => ro.disconnect();
  }, []);

  const groups = useMemo(
    () => groupByDrawingSet(drawings, drawingSetMap),
    [drawings, drawingSetMap],
  );

  // Apply the active sort to each group's sheet list. Groups themselves stay
  // in alphabetical order; sheets within a group reorder. We apply sorting
  // after grouping (instead of to the flat input) so the group rollups keep
  // using the full child list.
  const sortedGroups = useMemo(() => {
    if (!sort) return groups;
    const { field, dir } = sort;
    const cmp = SORTABLE_FIELDS[field]?.cmp;
    if (!cmp) return groups;
    const sign = dir === "desc" ? -1 : 1;
    return groups.map((g) => ({
      ...g,
      sheets: [...g.sheets].sort((a, b) => sign * cmp(a, b)),
    }));
  }, [groups, sort]);

  const handleSort = (field) => {
    setSort((prev) => {
      if (!prev || prev.field !== field) return { field, dir: "asc" };
      if (prev.dir === "asc") return { field, dir: "desc" };
      return null;
    });
  };

  // Initialize expand state — default all sets COLLAPSED (rolled up) on first
  // load. The rolled-up view is the scannable set-level list; the user expands
  // only the sets they care about, and that choice persists (under the v2 key).
  const [expanded, setExpanded] = useState(() => {
    const persisted = loadExpanded();
    if (persisted) return persisted;
    return new Set();
  });

  // Track which group keys we've already seen so we can distinguish "brand
  // new group the user just uploaded" from "group the user deliberately
  // collapsed". Seeded with the initial group set from first render.
  const seenKeysRef = useRef(null);
  if (seenKeysRef.current === null) {
    seenKeysRef.current = new Set(groups.map((g) => g.key));
  }

  // Auto-expand newly-appearing groups so the user's fresh upload is visible
  // without scrolling+clicking. We only auto-expand keys we've never seen
  // before — keys the user explicitly collapsed stay collapsed.
  useEffect(() => {
    const seen = seenKeysRef.current;
    const brandNew = groups.filter((g) => !seen.has(g.key));
    if (brandNew.length === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      brandNew.forEach((g) => next.add(g.key));
      saveExpanded(next);
      return next;
    });
    brandNew.forEach((g) => seen.add(g.key));
  }, [groups]);

  const toggleExpand = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      saveExpanded(next);
      return next;
    });
  };

  const toggleGroupSelect = (group) => {
    const ids = group.sheets.map((s) => s.id);
    const allSelected = ids.every((id) => selected.has(id));
    // Mimic external controlled set by firing one toggle per id
    ids.forEach((id) => {
      if (allSelected) {
        if (selected.has(id)) onToggleSelect(id);
      } else {
        if (!selected.has(id)) onToggleSelect(id);
      }
    });
  };

  const allSelected = selected.size === drawings.length && drawings.length > 0;

  const thStyle = {
    ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.15em",
    color: "var(--text-muted)", textTransform: "uppercase", padding: "10px 12px",
    textAlign: "left", borderBottom: "1px solid var(--border-default)",
    whiteSpace: "nowrap", background: "var(--bg-surface)",
  };

  // F20: sortable header renderer. Falls through to a plain static TH when
  // no field is passed (e.g. APPROVAL / ACTIONS columns).
  const SortableTh = ({ field, label, extraStyle }) => {
    if (!field) return <th style={{ ...thStyle, ...extraStyle }}>{label}</th>;
    const isActive = sort?.field === field;
    const arrow = !isActive ? "" : sort.dir === "asc" ? " ▲" : " ▼";
    return (
      <th
        style={{
          ...thStyle,
          ...extraStyle,
          cursor: "pointer",
          userSelect: "none",
          color: isActive ? "var(--accent)" : thStyle.color,
        }}
        onClick={() => handleSort(field)}
        title={`Sort by ${label.toLowerCase()}`}
      >
        {label}{arrow}
      </th>
    );
  };

  // F23: style builder for columns that collapse out of view on narrow
  // screens. Returning display:none keeps the column count stable so we
  // don't have to juggle colSpan — every row just silently hides the cell.
  const hideOnCompact = compact ? { display: "none" } : undefined;

  // ── Flatten groups into a virtual row list ───────────────────────────
  const flatRows = useMemo(() => {
    const rows = [];
    for (const group of sortedGroups) {
      const isExpanded = expanded.has(group.key);
      rows.push({ type: "group", group, isExpanded });
      if (isExpanded && group.setOnly) {
        rows.push({ type: "setOnlyInfo", group });
      }
      if (isExpanded && !group.setOnly) {
        for (const d of group.sheets) {
          rows.push({ type: "sheet", drawing: d, group });
        }
      }
    }
    return rows;
  }, [sortedGroups, expanded]);

  const scrollRef = useRef(null);
  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => flatRows[i].type === "group" ? 62 : flatRows[i].type === "setOnlyInfo" ? 120 : 48,
    overscan: 12,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0
    ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
    : 0;

  return (
    <div
      ref={containerRef}
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-badge)", overflowX: "auto" }}
    >
      <div
        ref={scrollRef}
        style={{ maxHeight: "calc(100vh - 260px)", overflow: "auto" }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--bg-surface)" }}>
            <tr>
              <th style={{ ...thStyle, width: 36 }}>
                <input type="checkbox" checked={allSelected} onChange={onToggleAll} style={{ cursor: "pointer" }} />
              </th>
              <SortableTh field="sheet_number"    label="SET / SHEET #" />
              <SortableTh field="title"           label="TITLE" />
              <SortableTh field="discipline"      label="DISCIPLINE" extraStyle={{ display: "none" }} />
              <SortableTh field="revision_number" label="REV" />
              <SortableTh field="stage"           label="STAGE" />
              <SortableTh field="submitted_date"  label="SUBMITTED" extraStyle={hideOnCompact} />
              <SortableTh field="due_date"        label="DUE DATE" />
              <SortableTh field="reviewer"        label="REVIEWER" extraStyle={{ display: "none" }} />
              <SortableTh field={null}            label="APPROVAL" />
              <SortableTh field={null}            label="" />
            </tr>
          </thead>
          <tbody>
            {paddingTop > 0 && (
              <tr><td style={{ height: paddingTop, padding: 0, border: "none" }} /></tr>
            )}
            {virtualItems.map((vItem) => {
              const row = flatRows[vItem.index];
              if (row.type === "group") {
                const group = row.group;
                const ids = group.sheets.map((s) => s.id);
                const selectedInGroup = ids.filter((id) => selected.has(id)).length;
                const groupAllSelected = selectedInGroup === ids.length && ids.length > 0;
                const groupIndeterminate = selectedInGroup > 0 && selectedInGroup < ids.length;
                return (
                  <GroupRow
                    key={group.key}
                    group={group}
                    expanded={row.isExpanded}
                    onToggleExpand={() => toggleExpand(group.key)}
                    groupSelected={groupAllSelected}
                    groupIndeterminate={groupIndeterminate}
                    onToggleGroupSelect={() => toggleGroupSelect(group)}
                    onSetApproval={onSetApproval}
                    onDeleteSet={onDeleteSet}
                    onRenameSet={onRenameSet}
                    onMarkTitleblock={onMarkTitleblock}
                    onPackageReport={onPackageReport}
                    hideOnCompact={hideOnCompact}
                    submittalCounts={group.setId ? submittalsBySetId[group.setId] : undefined}
                  />
                );
              }
              if (row.type === "setOnlyInfo") {
                return (
                  <SetOnlyInfoRow key={`${row.group.key}-info`} group={row.group} />
                );
              }
              const d = row.drawing;
              return (
                <SheetRow
                  key={d.id}
                  d={d}
                  isSel={selected.has(d.id)}
                  onToggleSelect={onToggleSelect}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onAdvance={onAdvance}
                  onView={onView}
                  setContextMenu={setContextMenu}
                  onSetApproval={onSetApproval}
                  rfiMap={rfiMap}
                  isChild={!row.group.isUngrouped}
                  hideOnCompact={hideOnCompact}
                />
              );
            })}
            {paddingBottom > 0 && (
              <tr><td style={{ height: paddingBottom, padding: 0, border: "none" }} /></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
