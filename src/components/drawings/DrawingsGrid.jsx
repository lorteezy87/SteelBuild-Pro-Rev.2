import React, { useEffect, useMemo, useRef, useState } from "react";
import { STAGE_MAP, mono } from "./drawingsConfig";
import StageChip from "./StageChip";
import { OverdueBadge, RFILinkBadge, SupersededBadge } from "./DrawingBadges";
import { isOverdue } from "./drawingsUtils";
import { compareDrawingSetPackages, formatDrawingSetNumber, getDrawingSetNumber } from "@/lib/drawingSetOrdering";

const UNGROUPED_KEY = "__ungrouped__";
const UNGROUPED_LABEL = "UNGROUPED SHEETS";
const EXPAND_LS_KEY = "sbp-drawings-grid-expanded-sets";

function ActionBtn({ label, onClick, danger, disabled, title }) {
  const [hovered, setHovered] = React.useState(false);
  const baseColor = danger ? "var(--status-error)" : "var(--text-muted)";
  const hoverBg = danger ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.04)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...mono,
        fontSize: 9,
        fontWeight: 700,
        padding: "3px 7px",
        borderRadius: 6,
        border: `1px solid ${hovered && !disabled ? `${baseColor}60` : danger ? "rgba(239,68,68,0.3)" : "var(--border-default)"}`,
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
  } catch {
    // noop
  }
}

function buildGroups(drawings, drawingSets) {
  const drawingSetMap = {};
  (drawingSets || []).forEach((set) => {
    if (set?.id) drawingSetMap[set.id] = set;
  });

  const buckets = new Map();
  (drawings || []).forEach((drawing) => {
    const setId = drawing.drawing_set_id || null;
    const legacyName = (drawing.drawing_set_name || "").trim();
    const key = setId ? `id:${setId}` : legacyName ? `name:${legacyName}` : UNGROUPED_KEY;
    if (!buckets.has(key)) {
      const parent = setId ? drawingSetMap[setId] : null;
      buckets.set(key, {
        key,
        setId,
        name: (parent?.set_name || legacyName || UNGROUPED_LABEL).trim(),
        setNumber: getDrawingSetNumber(parent || { name: legacyName }),
        parent,
        isUngrouped: key === UNGROUPED_KEY,
        sheets: [],
      });
    }
    buckets.get(key).sheets.push(drawing);
  });

  Object.values(drawingSetMap).forEach((parent) => {
    const key = `id:${parent.id}`;
    if (buckets.has(key)) return;
    buckets.set(key, {
      key,
      setId: parent.id,
      name: (parent.set_name || "").trim() || UNGROUPED_LABEL,
      setNumber: getDrawingSetNumber(parent),
      parent,
      isUngrouped: false,
      sheets: [],
    });
  });

  return [...buckets.values()]
    .map((group) => {
      const sheets = [...group.sheets].sort((a, b) =>
        String(a.sheet_number || "").localeCompare(String(b.sheet_number || ""), undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      );
      const overdueCount = sheets.filter((sheet) => isOverdue(sheet)).length;
      const approval = group.parent?.set_approval_status
        || sheets.find((sheet) => sheet.set_approval_status)?.set_approval_status
        || null;
      return {
        ...group,
        sheets,
        aggregates: {
          total: sheets.length,
          overdueCount,
          approval,
          sheetCount: Number(group.parent?.sheet_count) || sheets.length,
          processed: Number(group.parent?.processed_count) || 0,
          needsReview: Number(group.parent?.needs_review_count) || 0,
          failed: Number(group.parent?.failed_count) || 0,
          revision: group.parent?.revision || null,
          issuedDate: group.parent?.issued_date || null,
          issuedBy: group.parent?.issued_by || null,
          fileUrl: group.parent?.file_url || null,
        },
      };
    })
    .sort((a, b) => {
      if (a.isUngrouped && !b.isUngrouped) return 1;
      if (!a.isUngrouped && b.isUngrouped) return -1;
      return compareDrawingSetPackages(a, b);
    });
}

function ApprovalPill({ approval }) {
  if (!approval) return null;
  const tone =
    approval === "approved"
      ? {
          color: "#10B981",
          background: "rgba(16,185,129,0.12)",
          border: "rgba(16,185,129,0.25)",
        }
      : approval === "rejected"
        ? {
            color: "var(--status-error)",
            background: "var(--danger-muted)",
            border: "var(--danger-border)",
          }
        : approval === "pending_review"
          ? {
              color: "var(--status-warning)",
              background: "rgba(245,158,11,0.14)",
              border: "rgba(245,158,11,0.25)",
            }
          : {
              color: "var(--text-muted)",
              background: "var(--bg-surface-high)",
              border: "var(--border-default)",
            };

  return (
    <span
      style={{
        ...mono,
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: "0.08em",
        padding: "2px 6px",
        borderRadius: 6,
        color: tone.color,
        background: tone.background,
        border: `1px solid ${tone.border}`,
        textTransform: "uppercase",
      }}
    >
      {approval}
    </span>
  );
}

function SheetCard({
  drawing,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
  onAdvance,
  onView,
  onSetApproval,
  rfiMap,
}) {
  const overdue = isOverdue(drawing);
  const isSel = selected.has(drawing.id);
  const stage = STAGE_MAP[drawing.stage] || STAGE_MAP["Not Started"];

  return (
    <div
      onClick={() => onToggleSelect(drawing.id)}
      style={{
        background: "var(--bg-surface)",
        border: `1px solid ${isSel ? "var(--accent)" : "var(--border-default)"}`,
        borderRadius: 10,
        overflow: "hidden",
        cursor: "pointer",
        position: "relative",
        transition: "border-color 0.15s",
      }}
    >
      <div style={{ height: 3, background: stage.color }} />

      {drawing.priority_flag && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--status-error)",
          }}
        />
      )}

      <div style={{ padding: "12px 14px" }}>
        <div
          style={{
            ...mono,
            fontSize: 15,
            fontWeight: 800,
            color: "var(--text-primary)",
            letterSpacing: "-0.01em",
            marginBottom: 4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {drawing.sheet_number}
        </div>

        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 11,
            color: "var(--text-muted)",
            marginBottom: 10,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            lineHeight: 1.4,
          }}
        >
          {drawing.title}
        </div>

        <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
          <StageChip stage={drawing.stage} />
          <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>R{drawing.revision_number ?? "0"}</span>
          {overdue && <OverdueBadge />}
          {(drawing.is_superseded || drawing.set_approval_status === "superseded") && <SupersededBadge />}
        </div>

        <RFILinkBadge linkedIds={drawing.linked_rfi_ids} rfiMap={rfiMap} />

        {drawing.due_date && (
          <div style={{ ...mono, fontSize: 9, color: overdue ? "var(--status-error)" : "var(--text-muted)", marginTop: 4 }}>
            DUE {drawing.due_date}
          </div>
        )}

        <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 4, opacity: 0.6 }}>
          {drawing.discipline}
        </div>

        {drawing.set_approval_status && (
          <div style={{ marginTop: 6 }}>
            <ApprovalPill approval={drawing.set_approval_status} />
          </div>
        )}
      </div>

      <div
        style={{
          borderTop: "1px solid var(--border-default)",
          padding: "7px 10px",
          display: "flex",
          gap: 5,
          justifyContent: "flex-end",
          flexWrap: "wrap",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <ActionBtn label="View" onClick={() => onView(drawing)} />
        <ActionBtn label="Edit" onClick={() => onEdit(drawing)} />
        {drawing.drawing_set_name?.trim() && !drawing.set_approval_status && (
          <ActionBtn label="Approve" onClick={() => onSetApproval(drawing)} />
        )}
        <ActionBtn label="Next" title="Advance stage" onClick={() => onAdvance(drawing)} disabled={drawing.stage === "Released"} />
        <ActionBtn label="Del" onClick={() => onDelete(drawing.id)} title="Delete" danger />
      </div>
    </div>
  );
}

function SetSection({
  group,
  expanded,
  onToggle,
  onRenameSet,
  onDeleteSet,
  onSetApproval,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
  onAdvance,
  onView,
  rfiMap,
}) {
  const { aggregates } = group;
  const headerBorder = expanded ? "var(--accent-border)" : "var(--border-default)";
  const badgeTone = group.isUngrouped ? "var(--text-muted)" : "var(--accent)";
  const badgeBg = group.isUngrouped ? "var(--bg-surface-high)" : "var(--accent-muted)";

  return (
    <section
      style={{
        background: "var(--bg-surface)",
        border: `1px solid ${headerBorder}`,
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          padding: "14px 16px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", gap: 12, minWidth: 0, flex: 1 }}>
          <span
            style={{
              ...mono,
              fontSize: 12,
              fontWeight: 800,
              color: badgeTone,
              transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.15s ease",
              lineHeight: 1.5,
              flexShrink: 0,
            }}
          >
            ▸
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  ...mono,
                  fontSize: 8,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: badgeTone,
                  padding: "2px 6px",
                  borderRadius: 999,
                  border: `1px solid ${group.isUngrouped ? "var(--border-default)" : "var(--accent-border)"}`,
                  background: badgeBg,
                }}
              >
                {group.isUngrouped ? "Sheet Group" : "Drawing Set"}
              </span>
              {!group.isUngrouped && (
                <span
                  title="Drawing set number"
                  style={{
                    ...mono,
                    fontSize: 8,
                    fontWeight: 800,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--accent)",
                    padding: "2px 6px",
                    borderRadius: 999,
                    border: "1px solid var(--accent-border)",
                    background: "var(--accent-muted)",
                  }}
                >
                  SET # {formatDrawingSetNumber(group)}
                </span>
              )}
              <ApprovalPill approval={aggregates.approval} />
            </div>

            <div
              style={{
                ...mono,
                fontSize: 15,
                fontWeight: 800,
                color: "var(--text-primary)",
                letterSpacing: "0.03em",
                textTransform: "uppercase",
                marginTop: 8,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {group.name}
            </div>

            <div
              style={{
                ...mono,
                fontSize: 9,
                color: "var(--text-muted)",
                marginTop: 6,
                letterSpacing: "0.08em",
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <span>{aggregates.sheetCount} SHEET{aggregates.sheetCount === 1 ? "" : "S"}</span>
              {aggregates.overdueCount > 0 && <span style={{ color: "var(--status-error)" }}>{aggregates.overdueCount} OVERDUE</span>}
              {aggregates.revision && <span>REV {aggregates.revision}</span>}
              {aggregates.issuedDate && <span>ISSUED {aggregates.issuedDate}</span>}
            </div>
          </div>
        </div>

        {!group.isUngrouped && (
          <div
            style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}
            onClick={(event) => event.stopPropagation()}
          >
            {!aggregates.approval && onSetApproval && (
              <ActionBtn label="Approve" onClick={() => onSetApproval(group)} />
            )}
            {onRenameSet && <ActionBtn label="Rename" onClick={() => onRenameSet(group)} />}
            {onDeleteSet && <ActionBtn label="Delete Set" onClick={() => onDeleteSet(group)} danger />}
          </div>
        )}
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--border-default)", padding: 16 }}>
          {group.sheets.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
              {group.sheets.map((drawing) => (
                <SheetCard
                  key={drawing.id}
                  drawing={drawing}
                  selected={selected}
                  onToggleSelect={onToggleSelect}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onAdvance={onAdvance}
                  onView={onView}
                  onSetApproval={onSetApproval}
                  rfiMap={rfiMap}
                />
              ))}
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: 12,
                alignItems: "start",
              }}
            >
              <Stat label="Sheets" value={aggregates.sheetCount} />
              <Stat label="Processed" value={aggregates.processed} />
              <Stat label="Needs Review" value={aggregates.needsReview} accent={aggregates.needsReview > 0 ? "var(--status-warning)" : null} />
              <Stat label="Failed" value={aggregates.failed} accent={aggregates.failed > 0 ? "var(--status-error)" : null} />
              <div style={{ gridColumn: "1 / -1", marginTop: 4 }}>
                <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
                  {aggregates.issuedDate ? `ISSUED ${aggregates.issuedDate}` : "NO ISSUE METADATA RECORDED"}
                  {aggregates.issuedBy ? ` · by ${aggregates.issuedBy}` : ""}
                </div>
                {aggregates.fileUrl && (
                  <div style={{ marginTop: 10 }}>
                    <ActionBtn label="Open PDF" onClick={() => window.open(aggregates.fileUrl, "_blank", "noopener")} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div>
      <div
        style={{
          ...mono,
          fontSize: 8,
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div style={{ ...mono, fontSize: 15, fontWeight: 700, color: accent || "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

export default function DrawingsGrid({
  drawings,
  drawingSets = [],
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
  onAdvance,
  onView,
  onSetApproval,
  onRenameSet,
  onDeleteSet,
  rfiMap,
}) {
  const groups = useMemo(() => buildGroups(drawings, drawingSets), [drawings, drawingSets]);

  const [expanded, setExpanded] = useState(() => {
    const persisted = loadExpanded();
    if (persisted) return persisted;
    return new Set(groups.map((group) => group.key));
  });

  const seenKeysRef = useRef(null);
  if (seenKeysRef.current === null) {
    seenKeysRef.current = new Set(groups.map((group) => group.key));
  }

  useEffect(() => {
    const seen = seenKeysRef.current;
    const brandNew = groups.filter((group) => !seen.has(group.key));
    if (brandNew.length === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      brandNew.forEach((group) => next.add(group.key));
      saveExpanded(next);
      return next;
    });
    brandNew.forEach((group) => seen.add(group.key));
  }, [groups]);

  const toggleExpand = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveExpanded(next);
      return next;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {groups.map((group) => (
        <SetSection
          key={group.key}
          group={group}
          expanded={expanded.has(group.key)}
          onToggle={() => toggleExpand(group.key)}
          onRenameSet={onRenameSet}
          onDeleteSet={onDeleteSet}
          onSetApproval={onSetApproval}
          selected={selected}
          onToggleSelect={onToggleSelect}
          onEdit={onEdit}
          onDelete={onDelete}
          onAdvance={onAdvance}
          onView={onView}
          rfiMap={rfiMap}
        />
      ))}
    </div>
  );
}
