import React, { useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { FileText, Flag, PenLine, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

const STAGES = ["Not Started", "OFA", "BFA", "OFS", "BFS", "FFF", "Released"];

// Stage priority — higher index = further along
const STAGE_ORDER = Object.fromEntries(STAGES.map((s, i) => [s, i]));

const STAGE_ACCENT = {
  "Not Started": { color: "var(--text-muted)", bg: "var(--bg-surface-high)", border: "var(--border-strong)" },
  OFA:           { color: "var(--accent)", bg: "var(--accent-muted)", border: "var(--accent-border)" },
  BFA:           { color: "var(--accent)", bg: "var(--accent-muted)", border: "var(--accent-border)" },
  OFS:           { color: "var(--accent)", bg: "var(--accent-muted)", border: "var(--accent-border)" },
  BFS:           { color: "var(--accent)", bg: "var(--accent-muted)", border: "var(--accent-border)" },
  FFF:           { color: "var(--status-success)", bg: "var(--success-muted)", border: "var(--success-border)" },
  Released:      { color: "var(--status-success)", bg: "var(--success-muted)", border: "var(--success-border)" },
};

// A set's effective stage = lowest stage among its sheets (the bottleneck)
function getSetStage(sheets) {
  if (!sheets.length) return "Not Started";
  return sheets.reduce((worst, s) => {
    return STAGE_ORDER[s.stage] < STAGE_ORDER[worst] ? s.stage : worst;
  }, sheets[0].stage);
}

// Group drawings into sets; drawings without a set name get their own entry
function groupIntoSets(drawings) {
  const map = {};
  drawings.forEach(d => {
    const key = d.drawing_set_name?.trim() || `__solo__${d.id}`;
    if (!map[key]) map[key] = { key, setName: d.drawing_set_name?.trim() || null, sheets: [], fileUrl: null };
    map[key].sheets.push(d);
    if (d.file_url) map[key].fileUrl = d.file_url;
  });
  return Object.values(map);
}

// Approval status badge color
const APPROVAL_COLOR = {
  approved: "var(--status-success)",
  rejected: "var(--status-error)",
  pending: "var(--status-warning)",
  superseded: "var(--text-muted)",
};

function SetCard({ setGroup, index, onEdit, onAnnotate }) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);

  const { setName, sheets, fileUrl } = setGroup;
  const effectiveStage = getSetStage(sheets);
  const a = STAGE_ACCENT[effectiveStage] || STAGE_ACCENT["Not Started"];

  // Worst approval status
  const hasRejected = sheets.some(s => s.set_approval_status === "rejected");
  const allApproved = sheets.every(s => s.set_approval_status === "approved");
  const hasPending = sheets.some(s => s.set_approval_status === "pending");

  const overallApproval = hasRejected ? "rejected" : allApproved ? "approved" : hasPending ? "pending" : null;

  const isOverdue = sheets.some(s => s.due_date && new Date(s.due_date) < new Date() && s.stage !== "Released");

  const priorityCount = sheets.filter(s => s.priority_flag).length;

  return (
    <Draggable draggableId={setGroup.key} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            background: snapshot.isDragging ? "var(--bg-surface-high)" : hovered ? "var(--bg-surface-mid)" : "var(--bg-surface-low)",
            border: `1px solid ${snapshot.isDragging ? "var(--warning-border)" : hasRejected ? "rgba(255,61,61,0.30)" : isOverdue ? "rgba(255,61,61,0.20)" : "var(--bg-surface-high)"}`,
            borderLeft: hasRejected ? "3px solid var(--status-error)" : allApproved ? `3px solid var(--status-success)` : `1px solid var(--bg-surface-high)`,
            borderRadius: 8,
            padding: "9px 10px",
            marginBottom: 7,
            cursor: snapshot.isDragging ? "grabbing" : "grab",
            boxShadow: snapshot.isDragging ? "0 8px 24px rgba(0,0,0,0.6), 0 0 0 1px var(--warning-border)" : "none",
            transition: snapshot.isDragging ? "none" : "background 0.1s, border 0.1s",
            userSelect: "none",
            ...provided.draggableProps.style,
          }}
        >
          {/* Set name row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
              {priorityCount > 0 && <Flag style={{ width: 8, height: 8, color: "var(--status-error)", flexShrink: 0 }} />}
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                color: "var(--accent)", letterSpacing: "0.04em",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
              }}>
                {setName || sheets[0]?.sheet_number || "Unknown"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
              {overallApproval && (
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 7,
                  background: `${APPROVAL_COLOR[overallApproval]}18`,
                  border: `1px solid ${APPROVAL_COLOR[overallApproval]}40`,
                  color: APPROVAL_COLOR[overallApproval],
                  borderRadius: 3, padding: "1px 5px", letterSpacing: "0.06em",
                  textTransform: "uppercase"
                }}>
                  {overallApproval === "approved" ? "✓" : overallApproval === "rejected" ? "✗" : "~"} {overallApproval}
                </span>
              )}
              {fileUrl && (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 16, height: 16, borderRadius: 3,
                    background: "var(--accent-muted)", border: "1px solid var(--accent-border)",
                    color: "var(--accent)", textDecoration: "none"
                  }}
                >
                  <FileText style={{ width: 8, height: 8 }} />
                </a>
              )}
            </div>
          </div>

          {/* Rejection warning */}
          {hasRejected && (
            <div style={{
              display: "flex", alignItems: "center", gap: 4, marginBottom: 5,
              background: "var(--danger-muted)", border: "1px solid var(--danger-border)",
              borderRadius: 4, padding: "3px 6px"
            }}>
              <AlertTriangle style={{ width: 8, height: 8, color: "var(--status-error)", flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--status-error)", letterSpacing: "0.04em" }}>
                PACKAGE REJECTED — ALL SHEETS FAIL
              </span>
            </div>
          )}

          {/* Sheet count + expand toggle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(x => !x); }}
              style={{
                display: "flex", alignItems: "center", gap: 3,
                background: "none", border: "none", cursor: "pointer", padding: 0,
                fontFamily: "var(--font-mono)", fontSize: 7,
                color: "var(--text-muted)", letterSpacing: "0.08em"
              }}
            >
              {expanded ? <ChevronDown style={{ width: 9, height: 9 }} /> : <ChevronRight style={{ width: 9, height: 9 }} />}
              {sheets.length} SHEET{sheets.length !== 1 ? "S" : ""}
            </button>
            {isOverdue && !hasRejected && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--status-error)", fontWeight: 700 }}>⚠ OVERDUE</span>
            )}
            {/* Stage of bottleneck */}
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.06em",
              color: a.color, background: a.bg, border: `1px solid ${a.border}`,
              borderRadius: 3, padding: "1px 5px"
            }}>{effectiveStage.toUpperCase()}</span>
          </div>

          {/* Expanded sheet list */}
          {expanded && (
            <div style={{ marginTop: 6, borderTop: "1px solid var(--divider)", paddingTop: 6 }}>
              {sheets.map(s => {
                const sa = STAGE_ACCENT[s.stage] || STAGE_ACCENT["Not Started"];
                return (
                  <div key={s.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "3px 0", borderBottom: "1px solid var(--hover-bg)"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                      {s.priority_flag && <Flag style={{ width: 7, height: 7, color: "var(--status-error)", flexShrink: 0 }} />}
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-secondary)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                      }}>{s.sheet_number}</span>
                      <span style={{
                        fontFamily: "var(--font-body)", fontSize: 9, color: "var(--text-muted)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                      }}>{s.title}</span>
                    </div>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 7, color: sa.color,
                      flexShrink: 0, marginLeft: 4
                    }}>{s.stage}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Hover actions */}
          {hovered && (
            <div style={{ display: "flex", gap: 4, marginTop: 7 }}>
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(sheets[0]); }}
                style={{
                  flex: 1, padding: "3px 0",
                  background: "var(--accent-muted)", border: "1px solid var(--accent-border)",
                  borderRadius: 4, color: "var(--accent)",
                  fontFamily: "var(--font-mono)", fontSize: 7,
                  letterSpacing: "0.08em", cursor: "pointer"
                }}
              >EDIT SET</button>
              {fileUrl && (
                <button
                  onClick={(e) => { e.stopPropagation(); onAnnotate(sheets[0]); }}
                  style={{
                    flex: 1, padding: "3px 0",
                    background: "rgba(139,92,246,0.10)", border: "1px solid rgba(139,92,246,0.22)",
                    borderRadius: 4, color: "#A78BFA",
                    fontFamily: "var(--font-mono)", fontSize: 7,
                    letterSpacing: "0.08em", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 3
                  }}
                >
                  <PenLine style={{ width: 8, height: 8 }} /> MARKUP
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
}

function KanbanColumn({ stage, setGroups, onEdit, onAnnotate }) {
  const a = STAGE_ACCENT[stage] || STAGE_ACCENT["Not Started"];
  const totalSheets = setGroups.reduce((n, g) => n + g.sheets.length, 0);

  return (
    <div style={{ flexShrink: 0, width: 220, display: "flex", flexDirection: "column", maxHeight: "100%" }}>
      {/* Column header */}
      <div style={{
        padding: "8px 12px",
        background: a.bg,
        border: `1px solid ${a.border}`,
        borderBottom: "none",
        borderRadius: "8px 8px 0 0",
        borderTop: `2px solid ${a.color}`,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: a.color, letterSpacing: "0.12em" }}>
            {stage.toUpperCase()}
          </span>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 8,
              background: "var(--bg-surface-high)", border: "1px solid var(--bg-surface-high)",
              borderRadius: 10, padding: "1px 7px", color: "var(--text-muted)"
            }}>{setGroups.length} sets</span>
            {totalSheets > 0 && setGroups.length !== totalSheets && (
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 7,
                color: "var(--text-muted)"
              }}>{totalSheets} sheets</span>
            )}
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <Droppable droppableId={stage}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "8px 6px",
              background: snapshot.isDraggingOver ? "var(--accent-muted)" : "var(--hover-bg)",
              border: `1px solid ${snapshot.isDraggingOver ? a.border : "var(--divider)"}`,
              borderTop: "none",
              borderRadius: "0 0 8px 8px",
              minHeight: 80,
              transition: "background 0.15s, border 0.15s",
            }}
          >
            {setGroups.map((g, i) => (
              <SetCard key={g.key} setGroup={g} index={i} onEdit={onEdit} onAnnotate={onAnnotate} />
            ))}
            {provided.placeholder}
            {setGroups.length === 0 && !snapshot.isDraggingOver && (
              <div style={{
                textAlign: "center", padding: "20px 8px",
                fontFamily: "var(--font-mono)", fontSize: 8,
                color: "var(--text-muted)", letterSpacing: "0.10em"
              }}>DROP HERE</div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
}

export default function DrawingKanban({ drawings, onStageChange, onEdit, onAnnotate }) {
  const navigate = useNavigate();
  const handleAnnotate = onAnnotate || ((d) => navigate(createPageUrl(`DrawingViewer?drawingId=${d.id}&from=Drawings`)));

  const [localDrawings, setLocalDrawings] = useState(drawings);

  React.useEffect(() => {
    setLocalDrawings(drawings);
  }, [drawings]);

  // Build set groups, then bucket by set's effective stage
  const allSets = groupIntoSets(localDrawings);

  const byStage = STAGES.reduce((acc, s) => {
    acc[s] = allSets.filter(g => getSetStage(g.sheets) === s);
    return acc;
  }, {});

  const handleDragEnd = async (result) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newStage = destination.droppableId;
    const setGroup = allSets.find(g => g.key === draggableId);
    if (!setGroup) return;

    // Optimistic: move all sheets in the set to the new stage
    setLocalDrawings(prev =>
      prev.map(d => {
        const belongsToSet = setGroup.setName
          ? d.drawing_set_name?.trim() === setGroup.setName
          : d.id === setGroup.sheets[0]?.id;
        return belongsToSet ? { ...d, stage: newStage } : d;
      })
    );

    // Persist all sheets in the set
    await Promise.all(setGroup.sheets.map(d => onStageChange(d, newStage)));
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div style={{
        display: "flex",
        gap: 10,
        padding: "12px 16px",
        overflowX: "auto",
        overflowY: "hidden",
        height: "100%",
        alignItems: "flex-start",
      }}>
        {STAGES.map(stage => (
          <KanbanColumn
            key={stage}
            stage={stage}
            setGroups={byStage[stage] || []}
            onEdit={onEdit}
            onAnnotate={handleAnnotate}
          />
        ))}
      </div>
    </DragDropContext>
  );
}