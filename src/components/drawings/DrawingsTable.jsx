import React, { useMemo, useState, useEffect } from "react";
import { mono } from "./drawingsConfig";
import { STAGE_MAP, STAGE_ORDER } from "./drawingsConfig";
import StageChip from "./StageChip";
import PriorityDot from "./PriorityDot";
import { OverdueBadge, RFILinkBadge, SupersededBadge } from "./DrawingBadges";
import { isOverdue, daysLate, urgencyClass } from "./drawingsUtils";

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
  const hoverBg = primary ? "rgba(200,155,32,0.12)" : danger ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.04)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...mono, fontSize: 9, fontWeight: 700, padding: "3px 7px", borderRadius: "var(--radius-badge)",
        border: `1px solid ${hovered && !disabled ? baseColor + "60" : danger ? "rgba(239,68,68,0.3)" : "var(--border-default)"}`,
        background: hovered && !disabled ? hoverBg : "none",
        color: baseColor,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.3 : 1,
        whiteSpace: "nowrap",
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
const EXPAND_LS_KEY = "sbp-drawings-expanded-sets";

/**
 * Group drawings by `drawing_set_name`. Sheets without a set name end up in
 * the UNGROUPED bucket. Returns an ordered array of groups, each with computed
 * aggregates used by the summary row.
 */
function groupByDrawingSet(drawings) {
  const buckets = new Map();
  drawings.forEach((d) => {
    const rawName = (d.drawing_set_name || "").trim();
    const key = rawName || UNGROUPED_KEY;
    if (!buckets.has(key)) {
      buckets.set(key, { key, name: rawName || UNGROUPED_LABEL, sheets: [] });
    }
    buckets.get(key).sheets.push(d);
  });

  // Compute aggregates for each group
  const groups = [];
  for (const group of buckets.values()) {
    const sheets = group.sheets.slice().sort((a, b) => {
      const an = (a.sheet_number || "").toString();
      const bn = (b.sheet_number || "").toString();
      return an.localeCompare(bn, undefined, { numeric: true, sensitivity: "base" });
    });

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
    const earliestSubmitted = submittedDates[0] || null;
    const earliestDue = dueDates[0] || null;

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
    const aggregateStatus = statuses.size === 1 ? [...statuses][0] : null;

    // Disciplines present
    const disciplines = new Set(sheets.map((s) => s.discipline).filter(Boolean));

    // Priority
    const hasPriority = sheets.some((s) => s.priority_flag);

    // Latest revision (numeric max)
    const revNums = sheets
      .map((s) => Number(String(s.revision_number || "0").replace(/[^\d]/g, "")))
      .filter((n) => !isNaN(n));
    const maxRev = revNums.length ? Math.max(...revNums) : 0;

    groups.push({
      key: group.key,
      name: group.name,
      isUngrouped: group.key === UNGROUPED_KEY,
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
      },
    });
  }

  // Order: named sets alphabetical, ungrouped last
  groups.sort((a, b) => {
    if (a.isUngrouped && !b.isUngrouped) return 1;
    if (!a.isUngrouped && b.isUngrouped) return -1;
    return a.name.localeCompare(b.name);
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
  onSetApproval, children,
}) {
  const a = group.aggregates;
  const accent = group.isUngrouped ? "var(--text-muted)" : "var(--accent)";
  const rowBg = group.isUngrouped
    ? "rgba(255,255,255,0.015)"
    : "linear-gradient(90deg, rgba(200,155,32,0.08), rgba(200,155,32,0.02) 65%, transparent)";

  return (
    <tr
      style={{
        background: rowBg,
        borderTop: "1px solid var(--border-default)",
        borderBottom: "1px solid var(--border-default)",
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
            }}>
              {group.name}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
                {a.total} SHEET{a.total === 1 ? "" : "S"}
              </span>
              <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>·</span>
              <span style={{ ...mono, fontSize: 9, color: accent, fontWeight: 700 }}>
                {a.releasedCount}/{a.total} IFC ({a.percentReleased}%)
              </span>
              {a.disciplines.length > 0 && (
                <>
                  <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>·</span>
                  <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
                    {a.disciplines.slice(0, 3).join(" / ")}
                    {a.disciplines.length > 3 ? ` +${a.disciplines.length - 3}` : ""}
                  </span>
                </>
              )}
              {a.overdueCount > 0 && (
                <>
                  <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>·</span>
                  <span style={{ ...mono, fontSize: 9, color: "var(--status-error)", fontWeight: 800 }}>
                    {a.overdueCount} OVERDUE{a.maxLate > 0 ? ` · MAX ${a.maxLate}D LATE` : ""}
                  </span>
                </>
              )}
              {/* AI processing rollup — only shown when there's something to flag */}
              {(a.aiExtracting > 0 || a.aiNeedsReview > 0 || a.aiFailed > 0) && (
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
      <td style={{ ...tdBase, ...mono, fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
        {a.earliestSubmitted || "—"}
      </td>

      {/* Due (earliest) */}
      <td style={{ ...tdBase, ...mono, fontSize: 10, color: a.overdueCount > 0 ? "var(--status-error)" : "var(--text-muted)", whiteSpace: "nowrap", fontWeight: a.overdueCount > 0 ? 700 : 500 }}>
        {a.earliestDue || "—"}
      </td>

      {/* Reviewer — n/a for group */}
      <td style={{ ...tdBase, ...mono, fontSize: 10, color: "var(--text-muted)" }}>—</td>

      {/* Approval */}
      <td style={tdBase}>
        {a.aggregateStatus ? (
          <span style={{
            ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
            padding: "2px 7px", borderRadius: "var(--radius-badge)",
            color: a.aggregateStatus === "approved" ? "#10B981" : a.aggregateStatus === "rejected" ? "var(--status-error)" : "var(--text-muted)",
            background: a.aggregateStatus === "approved" ? "rgba(16,185,129,0.12)" : a.aggregateStatus === "rejected" ? "rgba(239,68,68,0.12)" : "var(--bg-surface-high)",
            border: `1px solid ${a.aggregateStatus === "approved" ? "rgba(16,185,129,0.25)" : a.aggregateStatus === "rejected" ? "rgba(239,68,68,0.25)" : "var(--border-default)"}`,
            textTransform: "uppercase",
          }}>
            {a.aggregateStatus}
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

      {/* Actions cell — blank for summary */}
      <td style={tdBase}></td>
    </tr>
  );
}

function SheetRow({
  d, isSel, onToggleSelect, onEdit, onDelete, onAdvance, onView,
  setContextMenu, onSetApproval, rfiMap, isChild,
}) {
  const overdue = isOverdue(d);
  const late = daysLate(d);
  const urgency = urgencyClass(late);

  return (
    <tr
      className={urgency}
      onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, drawing: d }); }}
      style={{
        background: isSel ? "rgba(200,155,32,0.06)" : overdue ? "rgba(239,68,68,0.04)" : "none",
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
          <AIStatusBadge status={d.ai_extraction_status} uploadStatus={d.upload_status} error={d.ai_extraction_error} />
        </div>
        <RFILinkBadge linkedIds={d.linked_rfi_ids} rfiMap={rfiMap} />
        {(d.is_superseded || d.set_approval_status === "superseded") && (
          <div style={{ marginTop: 3 }}><SupersededBadge /></div>
        )}
      </td>

      <td style={{ ...tdBase, ...mono, fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{d.discipline}</td>
      <td style={{ ...tdBase, ...mono, fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textAlign: "center" }}>R{d.revision_number ?? "0"}</td>
      <td style={tdBase}><StageChip stage={d.stage} /></td>
      <td style={{ ...tdBase, ...mono, fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{d.submitted_date || "—"}</td>

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

      <td style={{ ...tdBase, ...mono, fontSize: 10, color: "var(--text-muted)" }}>{d.reviewer || "—"}</td>

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

      {/* Row actions */}
      <td style={tdBase}>
        <div style={{ display: "flex", gap: 4 }}>
          <ActionBtn label="View" onClick={() => onView(d)} />
          <ActionBtn label="Edit" onClick={() => onEdit(d)} />
          <ActionBtn label="Next" title="Advance stage" onClick={() => onAdvance(d)} disabled={d.stage === "Released"} />
          <ActionBtn label="Del" onClick={() => onDelete(d.id)} title="Delete" danger />
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
export default function DrawingsTable({
  drawings, selected, onToggleSelect, onToggleAll,
  onEdit, onDelete, onAdvance, onView,
  setContextMenu, onSetApproval, rfiMap,
}) {
  const groups = useMemo(() => groupByDrawingSet(drawings), [drawings]);

  // Initialize expand state — default all named sets expanded on first load
  const [expanded, setExpanded] = useState(() => {
    const persisted = loadExpanded();
    if (persisted) return persisted;
    const init = new Set(groups.map((g) => g.key));
    return init;
  });

  // Auto-add newly appearing groups to expanded set (but keep user collapses)
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;
      groups.forEach((g) => {
        // If group is brand new and never tracked, auto-expand it
        if (!next.has(g.key) && !prev.has(g.key)) {
          // Only auto-expand if there are visible filter matches
          // (assume caller already filtered)
        }
      });
      return changed ? next : prev;
    });
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

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-badge)", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: 36 }}>
              <input type="checkbox" checked={allSelected} onChange={onToggleAll} style={{ cursor: "pointer" }} />
            </th>
            <th style={thStyle}>SET / SHEET #</th>
            <th style={thStyle}>TITLE</th>
            <th style={thStyle}>DISCIPLINE</th>
            <th style={thStyle}>REV</th>
            <th style={thStyle}>STAGE</th>
            <th style={thStyle}>SUBMITTED</th>
            <th style={thStyle}>DUE DATE</th>
            <th style={thStyle}>REVIEWER</th>
            <th style={thStyle}>APPROVAL</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const isExpanded = expanded.has(group.key);
            const ids = group.sheets.map((s) => s.id);
            const selectedInGroup = ids.filter((id) => selected.has(id)).length;
            const groupAllSelected = selectedInGroup === ids.length && ids.length > 0;
            const groupIndeterminate = selectedInGroup > 0 && selectedInGroup < ids.length;

            return (
              <React.Fragment key={group.key}>
                <GroupRow
                  group={group}
                  expanded={isExpanded}
                  onToggleExpand={() => toggleExpand(group.key)}
                  groupSelected={groupAllSelected}
                  groupIndeterminate={groupIndeterminate}
                  onToggleGroupSelect={() => toggleGroupSelect(group)}
                  onSetApproval={onSetApproval}
                />
                {isExpanded && group.sheets.map((d) => (
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
                    isChild={!group.isUngrouped}
                  />
                ))}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
