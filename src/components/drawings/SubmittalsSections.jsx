import React, { useEffect, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  History,
  PenLine,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import { formatDate } from "../shared/formatters";
import {
  STAGES,
  GRID,
  monoFont,
  displayFont,
  bodyFont,
  compactHeaderBtn,
  getStageTone,
  getNextStage,
  compareSheetNumbers,
} from "./submittalsUtils";

const APPROVAL_BADGE = {
  approved: { bg: "rgba(0,214,143,0.10)", border: "rgba(0,214,143,0.25)", color: "#00D68F", label: "APPROVED" },
  pending: { bg: "rgba(255,180,0,0.10)", border: "rgba(255,180,0,0.25)", color: "#FFB020", label: "PENDING" },
  rejected: { bg: "rgba(255,61,61,0.10)", border: "rgba(255,61,61,0.25)", color: "#FF3D3D", label: "REJECTED" },
  superseded: { bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.10)", color: "var(--text-muted)", label: "SUPERSEDED" },
};

function getApprovalTone(status) {
  return APPROVAL_BADGE[status] || { bg: "var(--accent-muted)", border: "var(--accent-border)", color: "var(--accent)", label: status || "OPEN" };
}

export function StagePill({ stage }) {
  const tone = getStageTone(stage);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 22,
        padding: "0 8px",
        borderRadius: 2,
        border: `1px solid ${tone.color}33`,
        background: tone.bg,
        color: tone.color,
        fontFamily: monoFont,
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {tone.short}
    </span>
  );
}

export function ApprovalPill({ status }) {
  const tone = getApprovalTone(status);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 20,
        padding: "0 7px",
        borderRadius: 2,
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.color,
        fontFamily: monoFont,
        fontSize: 7,
        fontWeight: 700,
        letterSpacing: "0.08em",
      }}
    >
      {tone.label}
    </span>
  );
}

export function MiniStagePipeline({ stageCount, height = 6, showLabels = false }) {
  const total = STAGES.reduce((sum, stage) => sum + (stageCount?.[stage] || 0), 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
      <div style={{ display: "flex", gap: 1, width: "100%", height, borderRadius: 2, overflow: "hidden", background: "rgba(255,255,255,0.04)" }}>
        {STAGES.map((stage) => {
          const count = stageCount?.[stage] || 0;
          const width = total ? `${Math.max((count / total) * 100, count ? 6 : 0)}%` : `${100 / STAGES.length}%`;
          const tone = getStageTone(stage);
          return (
            <div
              key={stage}
              title={`${stage}: ${count}`}
              style={{
                width,
                minWidth: count ? 8 : 0,
                background: count ? tone.color : "rgba(255,255,255,0.06)",
                opacity: count ? 0.95 : 0.4,
              }}
            />
          );
        })}
      </div>
      {showLabels && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${STAGES.length}, minmax(0,1fr))`, gap: 4 }}>
          {STAGES.map((stage) => (
            <div key={stage} title={getStageTone(stage).label} style={{ fontFamily: monoFont, fontSize: 7, color: getStageTone(stage).color, textAlign: "center" }}>
              {stageCount?.[stage] || 0}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HoverThumbnail({ thumb }) {
  if (!thumb) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: -168,
        top: "50%",
        transform: "translateY(-50%)",
        width: 156,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        borderRadius: 2,
        padding: 6,
        boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
        zIndex: 20,
      }}
    >
      <img src={thumb} alt="Preview" style={{ width: "100%", display: "block", borderRadius: 2, background: "#fff" }} />
    </div>
  );
}

export function SetHeader({
  setName,
  meta,
  collapsed,
  onToggleCollapse,
  onOpenApproval,
  onOpenHistory,
  onNewRevision,
  onSelectAll,
  onAdvanceAll,
  allSelected,
  fileUrl,
}) {
  const approvalStatus = meta?.approvalStatus || "open";
  const stageTone = getStageTone(meta?.mostAdvancedStage);
  const revActive = Number(meta?.revision ?? 0) > 0 && !meta?.allReleased;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) minmax(260px,0.95fr) auto",
        alignItems: "center",
        gap: 12,
        minHeight: 44,
        padding: "0 16px",
        background: "var(--bg-surface-mid)",
        borderTop: "1px solid var(--divider)",
        borderBottom: "1px solid var(--divider)",
        borderLeft: `3px solid ${meta?.isOverdue ? "var(--status-error)" : meta?.allReleased ? "var(--status-success)" : "var(--accent)"}`,
        position: "sticky",
        top: 0,
        zIndex: 4,
      }}
    >
      <button
        onClick={onToggleCollapse}
        style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
      >
        <ChevronDown style={{ width: 14, height: 14, color: "var(--accent)", transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.15s" }} />
        <span style={{ fontFamily: displayFont, fontSize: 13, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {setName}
        </span>
        <span style={{ fontFamily: monoFont, fontSize: 8, color: "var(--text-muted)", padding: "2px 6px", borderRadius: 999, background: "rgba(255,255,255,0.05)" }}>
          {meta?.sheets?.length || 0} SHEETS
        </span>
        {meta?.discipline && <span style={{ fontFamily: monoFont, fontSize: 7, color: "var(--text-secondary)", background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: 999 }}>{meta.discipline}</span>}
        <span style={{ fontFamily: monoFont, fontSize: 7, color: revActive ? "var(--status-warning)" : "var(--text-secondary)", background: revActive ? "var(--warning-muted)" : "rgba(255,255,255,0.04)", padding: "2px 6px", borderRadius: 999 }}>
          REV {meta?.revision ?? "-"}
        </span>
        <ApprovalPill status={approvalStatus} />
      </button>

      <div style={{ minWidth: 0 }}>
        <MiniStagePipeline stageCount={meta?.stageCount} showLabels />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {meta?.mostAdvancedStage !== "Released" && (
          <button onClick={onAdvanceAll} style={{ ...compactHeaderBtn, background: stageTone.bg, borderColor: `${stageTone.color}44`, color: stageTone.color }}>
            <ChevronRight style={{ width: 10, height: 10 }} /> ADVANCE ALL
          </button>
        )}
        <button onClick={onNewRevision} style={{ ...compactHeaderBtn, background: "var(--warning-muted)", borderColor: "var(--warning-border)", color: "var(--status-warning)" }}>
          <Upload style={{ width: 9, height: 9 }} /> NEW REV
        </button>
        <button onClick={onOpenApproval} style={{ ...compactHeaderBtn, background: approvalStatus === "approved" ? "var(--success-muted)" : "var(--bg-surface-high)", borderColor: approvalStatus === "approved" ? "var(--success-border)" : "var(--border-default)", color: approvalStatus === "approved" ? "var(--status-success)" : "var(--text-secondary)" }}>
          <Check style={{ width: 9, height: 9 }} /> {approvalStatus === "approved" ? "APPROVED" : "APPROVE"}
        </button>
        <button onClick={onOpenHistory} style={{ ...compactHeaderBtn }}>
          <History style={{ width: 9, height: 9 }} /> HISTORY
        </button>
        <button onClick={onSelectAll} style={{ ...compactHeaderBtn, color: allSelected ? "var(--accent)" : "var(--text-secondary)" }}>
          {allSelected ? "DESELECT" : "SELECT ALL"}
        </button>
        {fileUrl && (
          <a href={fileUrl} target="_blank" rel="noopener noreferrer" style={{ ...compactHeaderBtn, textDecoration: "none", color: "var(--status-info)", borderColor: "var(--info-border)" }}>
            <Eye style={{ width: 9, height: 9 }} /> PDF
          </a>
        )}
      </div>
    </div>
  );
}

export function DrawingThumbnailCard({ drawing, onEdit, onAnnotate, onAdvance, navigate, createPageUrl: createUrl, generateThumbnail, isOverdueDrawingLocal }) {
  const [thumb, setThumb] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef(null);
  const overdue = isOverdueDrawingLocal(drawing);
  const nextStage = getNextStage(drawing.stage);

  useEffect(() => {
    const node = cardRef.current;
    if (!node || isVisible) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: "240px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [isVisible]);

  useEffect(() => {
    let active = true;
    if (!drawing.file_url || !isVisible) return undefined;
    setLoading(true);
    generateThumbnail(drawing.file_url, drawing.id, 0.4)
      .then((url) => {
        if (active) {
          setThumb(url);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [drawing.file_url, drawing.id, generateThumbnail, isVisible]);

  return (
    <div
      ref={cardRef}
      onClick={() => {
        if (drawing.file_url) navigate(createUrl(`DrawingViewer?drawingId=${drawing.id}&from=Submittals`));
        else onEdit(drawing);
      }}
      style={{
        background: "var(--bg-surface)",
        border: `1px solid ${overdue ? "var(--danger-border)" : "var(--border-default)"}`,
        borderLeft: `3px solid ${overdue ? "var(--status-error)" : getStageTone(drawing.stage).color}`,
        borderRadius: 2,
        overflow: "hidden",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        transition: "transform 0.15s, box-shadow 0.15s, border-color 0.15s",
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.borderColor = "var(--accent)";
        event.currentTarget.style.transform = "translateY(-2px)";
        event.currentTarget.style.boxShadow = "0 12px 28px rgba(0,0,0,0.35)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.borderColor = overdue ? "var(--danger-border)" : "var(--border-default)";
        event.currentTarget.style.transform = "translateY(0)";
        event.currentTarget.style.boxShadow = "none";
      }}
    >
      {drawing.priority_flag && (
        <div style={{ position: "absolute", top: 8, left: 8, zIndex: 2, width: 18, height: 18, borderRadius: 2, background: "var(--danger-muted)", border: "1px solid var(--danger-border)", color: "var(--status-error)", display: "grid", placeItems: "center", fontFamily: monoFont, fontSize: 9, fontWeight: 700 }}>
          F
        </div>
      )}

      <div style={{ width: "100%", paddingTop: "72%", position: "relative", background: "#fff" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 10 }}>
          {loading ? (
            <div style={{ fontFamily: monoFont, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.1em" }}>LOADING...</div>
          ) : thumb ? (
            <img src={thumb} alt={drawing.sheet_number} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          ) : !isVisible ? (
            <div style={{ fontFamily: monoFont, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.1em" }}>PREVIEW READY</div>
          ) : drawing.file_url ? (
            <div style={{ fontFamily: monoFont, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.1em" }}>LOADING...</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <FileText style={{ width: 22, height: 22, color: "rgba(0,0,0,0.25)" }} />
              <div style={{ fontFamily: monoFont, fontSize: 8, color: "rgba(0,0,0,0.45)" }}>NO FILE</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--divider)", background: overdue ? "var(--danger-muted)" : "var(--bg-surface)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <span style={{ fontFamily: monoFont, fontSize: 10, fontWeight: 800, color: "var(--accent)" }}>{drawing.sheet_number}</span>
          <StagePill stage={drawing.stage || "Not Started"} />
        </div>
        <div style={{ fontFamily: bodyFont, fontSize: 10, color: "var(--text-secondary)", minHeight: 28, lineHeight: 1.35 }}>{drawing.title}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontFamily: monoFont, fontSize: 8, color: "var(--text-muted)" }}>
          <span>REV {drawing.revision_number ?? "0"}</span>
          <span>{drawing.due_date ? formatDate(drawing.due_date) : "-"}</span>
        </div>
        <div style={{ display: "flex", gap: 4 }} onClick={(event) => event.stopPropagation()}>
          {drawing.file_url && (
            <button onClick={() => onAnnotate(drawing)} style={{ ...compactHeaderBtn, flex: 1, justifyContent: "center", height: 24, color: "var(--status-info)", borderColor: "var(--info-border)" }}>
              MARKUP
            </button>
          )}
          <button onClick={() => onEdit(drawing)} style={{ ...compactHeaderBtn, flex: 1, justifyContent: "center", height: 24 }}>
            EDIT
          </button>
          <button disabled={!nextStage} onClick={() => nextStage && onAdvance(drawing)} style={{ ...compactHeaderBtn, flex: 1, justifyContent: "center", height: 24, color: nextStage ? getStageTone(nextStage).color : "var(--text-disabled)", borderColor: nextStage ? `${getStageTone(nextStage).color}44` : "var(--border-default)", background: nextStage ? getStageTone(nextStage).bg : "rgba(255,255,255,0.04)", opacity: nextStage ? 1 : 0.5 }}>
            {nextStage ? `-> ${getStageTone(nextStage).short}` : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ChartsView({ stageData, disciplineData, completionData, timelineData, onSelectSet }) {
  return (
    <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 16, overflow: "auto" }}>
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 2, padding: 16, minHeight: 280 }}>
        <div style={{ fontFamily: monoFont, fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", borderLeft: "3px solid var(--accent)", paddingLeft: 8, marginBottom: 16 }}>Sheets By Stage</div>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={stageData}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 10, fontFamily: monoFont }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10, fontFamily: monoFont }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                {stageData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 2, padding: 16, minHeight: 280 }}>
        <div style={{ fontFamily: monoFont, fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", borderLeft: "3px solid var(--accent)", paddingLeft: 8, marginBottom: 16 }}>Sheets By Discipline</div>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={disciplineData} dataKey="value" nameKey="name" innerRadius={54} outerRadius={84} stroke="none">
                {disciplineData.map((entry, index) => <Cell key={`${entry.name}-${index}`} fill={entry.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export function ThumbnailGrid({ setKeys, setMeta, onEdit, onAnnotate, onAdvance, navigate, createPageUrl: createUrl, onSelectAll, selectedIds, onOpenApproval, onOpenHistory, onNewRevision, onAdvanceAll, generateThumbnail, isOverdueDrawingLocal }) {
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
      {setKeys.map((setKey) => {
        const meta = setMeta[setKey];
        const setDrawings = [...(meta?.sheets || [])].sort(compareSheetNumbers);
        return (
          <div key={setKey} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <SetHeader
              setName={setKey}
              meta={meta}
              collapsed={false}
              onToggleCollapse={() => {}}
              onOpenApproval={() => onOpenApproval(setKey, setDrawings)}
              onOpenHistory={() => onOpenHistory(meta?.setRecord)}
              onNewRevision={() => onNewRevision(meta?.setRecord, setKey)}
              onSelectAll={() => onSelectAll(setDrawings)}
              onAdvanceAll={() => onAdvanceAll(setKey)}
              allSelected={setDrawings.length > 0 && setDrawings.every((drawing) => selectedIds.has(drawing.id))}
              fileUrl={meta?.fileUrl}
            />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12, padding: "0 16px 0" }}>
              {setDrawings.map((drawing) => (
                <DrawingThumbnailCard key={drawing.id} drawing={drawing} onEdit={onEdit} onAnnotate={onAnnotate} onAdvance={onAdvance} navigate={navigate} createPageUrl={createUrl} generateThumbnail={generateThumbnail} isOverdueDrawingLocal={isOverdueDrawingLocal} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DrawingSetTrackerPanel({ setKeys, setMeta, activeSetFilter, onSelectSet, onClearSet, unassignedDrawings, onEditUnassigned }) {
  return (
    <div style={{ width: 280, flexShrink: 0, borderRight: "1px solid var(--divider)", overflowY: "auto", background: "var(--bg-sidebar)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontFamily: monoFont, fontSize: 9, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase", borderLeft: "3px solid var(--accent)", paddingLeft: 8 }}>
          Submission Sets
        </div>
        {activeSetFilter && (
          <button onClick={onClearSet} style={{ ...compactHeaderBtn, height: 20 }}>
            CLEAR
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {setKeys.map((setKey) => {
          const meta = setMeta[setKey];
          const active = activeSetFilter === setKey;
          const dueColor = meta?.isOverdue ? "var(--status-error)" : meta?.dueIn7 ? "var(--status-warning)" : "var(--text-muted)";
          const borderLeft = meta?.allReleased ? "var(--status-success)" : meta?.isOverdue ? "var(--status-error)" : "var(--accent)";
          return (
            <button
              key={setKey}
              onClick={() => onSelectSet(setKey)}
              style={{
                textAlign: "left",
                width: "100%",
                background: active ? "var(--accent-muted)" : "transparent",
                border: "none",
                borderBottom: "1px solid var(--divider)",
                borderLeft: `3px solid ${borderLeft}`,
                padding: "10px 14px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: bodyFont, fontSize: 12, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{setKey}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                    <span style={{ fontFamily: monoFont, fontSize: 8, color: "var(--text-muted)", background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: 999 }}>{meta?.sheets?.length || 0} SHEETS</span>
                    {meta?.discipline && <span style={{ fontFamily: monoFont, fontSize: 8, color: "var(--text-secondary)", background: "rgba(255,255,255,0.04)", padding: "2px 6px", borderRadius: 999 }}>{meta.discipline}</span>}
                  </div>
                </div>
                <span style={{ fontFamily: monoFont, fontSize: 9, color: meta?.allReleased ? "var(--status-success)" : "var(--accent)", fontWeight: 700 }}>
                  REV {meta?.revision ?? "-"}
                </span>
              </div>

              <MiniStagePipeline stageCount={meta?.stageCount} />

              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <ApprovalPill status={meta?.approvalStatus || "open"} />
                <StagePill stage={meta?.mostAdvancedStage || "Not Started"} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontFamily: monoFont, fontSize: 8, color: "var(--text-muted)" }}>
                <span>Submitted: {meta?.submitted ? formatDate(meta.submitted) : "-"}</span>
                <span style={{ color: dueColor }}>Due: {meta?.due ? formatDate(meta.due) : "-"}</span>
                <span>Returned: {meta?.returned ? formatDate(meta.returned) : "-"}</span>
                <span>{meta?.isOverdue ? "OVERDUE" : meta?.allReleased ? "RELEASED" : "ACTIVE"}</span>
              </div>
            </button>
          );
        })}
      </div>

      {unassignedDrawings?.length > 0 && (
        <div style={{ borderTop: "1px solid var(--divider)", padding: "12px 14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontFamily: monoFont, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--status-warning)", borderLeft: "3px solid var(--status-warning)", paddingLeft: 8 }}>
            UNASSIGNED DRAWINGS
          </div>
          {unassignedDrawings.map((drawing) => (
            <div key={drawing.id} style={{ background: "var(--warning-muted)", border: "1px solid var(--warning-border)", borderLeft: "3px solid var(--status-warning)", borderRadius: 2, padding: "8px 10px", display: "grid", gap: 6 }}>
              <div style={{ fontFamily: monoFont, fontSize: 9, fontWeight: 700, color: "var(--accent)" }}>{drawing.sheet_number || "NO SHEET #"}</div>
              <div style={{ fontFamily: bodyFont, fontSize: 11, color: "var(--text-secondary)" }}>{drawing.title || "Untitled Drawing"}</div>
              <button onClick={() => onEditUnassigned(drawing)} style={{ ...compactHeaderBtn, justifyContent: "center", height: 22, color: "var(--status-warning)", borderColor: "var(--warning-border)" }}>
                {"ASSIGN ->"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ScheduleView({ setKeys, setMeta }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "16px 0", background: "var(--bg-page)" }}>
      {setKeys.map((setKey) => {
        const meta = setMeta[setKey];
        const overdue = meta?.isOverdue;
        const allReleased = meta?.allReleased;
        const barColor = allReleased ? "var(--status-success)" : overdue ? "var(--status-error)" : "var(--accent)";
        const releasedCount = meta?.stageCount?.Released || 0;
        const percentComplete = meta?.sheets?.length ? Math.round((releasedCount / meta.sheets.length) * 100) : 0;

        return (
          <div key={setKey} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", background: "var(--bg-surface)", borderLeft: `3px solid ${barColor}`, borderBottom: "1px solid var(--divider)" }}>
            <div style={{ width: 200, flexShrink: 0 }}>
              <div style={{ fontFamily: bodyFont, fontSize: 12, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {setKey}
              </div>
              <div style={{ fontFamily: monoFont, fontSize: 8, color: "var(--text-muted)", marginTop: 2 }}>{meta?.sheets?.length || 0} sheets</div>
            </div>

            <div style={{ flex: 1, display: "grid", gap: 6 }}>
              <MiniStagePipeline stageCount={meta?.stageCount} />
              <div style={{ fontFamily: monoFont, fontSize: 8, color: overdue ? "var(--status-error)" : "var(--text-muted)" }}>
                {allReleased ? "APPROVED" : overdue ? `OVERDUE · DUE ${meta?.due ? formatDate(meta.due) : "-"}` : meta?.due ? `DUE ${formatDate(meta.due)}` : "NO DUE DATE"}
              </div>
            </div>

            <div style={{ fontFamily: monoFont, fontSize: 9, color: allReleased ? "var(--status-success)" : overdue ? "var(--status-error)" : "var(--text-muted)", fontWeight: 700, width: 60, textAlign: "right" }}>
              {percentComplete}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DrawingSetGroup({
  setKey,
  setDrawings,
  setMeta,
  collapsed,
  onToggleCollapse,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  onEdit,
  onDelete,
  onAdvance,
  onOpenApproval,
  onOpenHistory,
  onNewRevision,
  onAdvanceAll,
  allFilteredArr,
  onAnnotate,
  isOverdueDrawing,
  daysUntilDue,
  generateThumbnail,
}) {
  const meta = setMeta[setKey];
  const allSelected = setDrawings.every((drawing) => selectedIds.has(drawing.id));

  return (
    <div style={{ marginTop: 10 }}>
      <SetHeader
        setName={setKey}
        meta={meta}
        collapsed={collapsed}
        onToggleCollapse={() => onToggleCollapse(setKey)}
        onOpenApproval={() => onOpenApproval(setKey, setDrawings)}
        onOpenHistory={() => meta?.setRecord && onOpenHistory(meta.setRecord)}
        onNewRevision={() => onNewRevision(meta?.setRecord, setKey)}
        onSelectAll={() => (allSelected ? onDeselectAll(setDrawings) : onSelectAll(setDrawings))}
        onAdvanceAll={() => onAdvanceAll(setKey)}
        allSelected={allSelected}
        fileUrl={meta?.fileUrl}
      />

      {!collapsed && (
        <div style={{ paddingLeft: 4, borderLeft: "3px solid var(--accent-muted)" }}>
          {[...setDrawings].sort(compareSheetNumbers).map((drawing) => {
            const globalIdx = allFilteredArr.findIndex((item) => item.id === drawing.id);
            return (
              <DrawingRow
                key={drawing.id}
                d={drawing}
                selected={selectedIds.has(drawing.id)}
                globalIdx={globalIdx}
                allArr={allFilteredArr}
                onToggle={onToggleSelect}
                onEdit={onEdit}
                onDelete={onDelete}
                onAdvance={onAdvance}
                onAnnotate={onAnnotate}
                isOverdueDrawing={isOverdueDrawing}
                daysUntilDue={daysUntilDue}
                generateThumbnail={generateThumbnail}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DrawingRow({
  d,
  selected,
  globalIdx,
  allArr,
  onToggle,
  onEdit,
  onDelete,
  onAdvance,
  onAnnotate,
  isOverdueDrawing,
  daysUntilDue,
  generateThumbnail,
}) {
  const [hovered, setHovered] = useState(false);
  const [thumb, setThumb] = useState(null);
  const overdue = isOverdueDrawing(d);
  const nextStage = getNextStage(d.stage);

  useEffect(() => {
    let active = true;
    if (!hovered || !d.file_url) return undefined;
    generateThumbnail(d.file_url, d.id, 0.3).then((url) => {
      if (active) setThumb(url);
    });
    return () => {
      active = false;
    };
  }, [hovered, d.file_url, d.id, generateThumbnail]);

  return (
    <div
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: GRID,
        alignItems: "center",
        minHeight: 34,
        padding: "0 16px",
        borderBottom: "1px solid var(--divider)",
        borderLeft: isOverdueDrawing(d) ? "3px solid var(--status-error)" : "3px solid transparent",
        background: selected ? "var(--accent-muted)" : overdue ? "var(--danger-muted)" : hovered ? "var(--bg-row-hover)" : "transparent",
        transition: "background 0.08s",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && thumb && <HoverThumbnail thumb={thumb} />}

      <div onClick={(event) => event.stopPropagation()}>
        <input type="checkbox" checked={selected} onChange={(event) => onToggle(d.id, globalIdx, allArr, event.nativeEvent)} style={{ width: 13, height: 13, cursor: "pointer", accentColor: "var(--accent)" }} />
      </div>

      <span onClick={() => onEdit(d)} style={{ fontFamily: monoFont, fontSize: 10, fontWeight: 700, color: "var(--accent)", cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "0.03em" }}>
        {d.priority_flag && <span style={{ color: "#FF3D3D", marginRight: 3 }}>FLAG</span>}
        {d.sheet_number}
      </span>

      <span onClick={() => onEdit(d)} style={{ fontFamily: bodyFont, fontSize: 11, color: "var(--text-secondary)", cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 8 }}>
        {d.title}
      </span>

      <span style={{ fontFamily: monoFont, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{d.discipline?.slice(0, 6).toUpperCase() || "-"}</span>
      <span style={{ fontFamily: monoFont, fontSize: 9, color: "var(--text-muted)", textAlign: "center" }}>{d.revision_number ?? "-"}</span>
      <div onClick={() => onEdit(d)} style={{ cursor: "pointer" }}>
        <StagePill stage={d.stage || "Not Started"} />
      </div>
      <span style={{ fontFamily: monoFont, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.06em" }}>{d.ifc_status || "-"}</span>
      <span style={{ fontFamily: monoFont, fontSize: 8, color: d.set_approval_status === "approved" ? "var(--status-success)" : "var(--text-disabled)" }}>{d.set_approval_status === "approved" ? "APPV" : "-"}</span>
      <span style={{ fontFamily: monoFont, fontSize: 9, color: overdue ? "var(--status-error)" : "var(--text-muted)", fontWeight: overdue ? 700 : 400 }}>
        {d.due_date ? new Date(d.due_date).toLocaleDateString("en-US", { month: "numeric", day: "numeric" }) : "-"}
      </span>

      <div style={{ fontFamily: monoFont, fontSize: 9, fontWeight: 600, color: (() => {
        const days = daysUntilDue(d);
        if (days === null) return "var(--text-muted)";
        if (days < 0) return "var(--status-error)";
        if (days <= 3) return "var(--status-error)";
        if (days <= 7) return "var(--status-warning)";
        return "var(--text-muted)";
      })() }}>
        {(() => {
          const days = daysUntilDue(d);
          if (days === null) return "-";
          if (days < 0) return `${Math.abs(days)}d late`;
          return `${days}d`;
        })()}
      </div>

      <div style={{ display: "flex", gap: 4, opacity: 1, transition: "opacity 0.1s", justifyContent: "flex-end" }} onClick={(event) => event.stopPropagation()}>
        <button
          disabled={!nextStage}
          onClick={(event) => onAdvance(d, event)}
          style={{
            height: 22,
            padding: "0 8px",
            borderRadius: 2,
            border: `1px solid ${nextStage ? getStageTone(nextStage).color : "rgba(255,255,255,0.08)"}`,
            background: nextStage ? getStageTone(nextStage).bg : "rgba(255,255,255,0.04)",
            color: nextStage ? getStageTone(nextStage).color : "var(--text-disabled)",
            cursor: nextStage ? "pointer" : "not-allowed",
            fontFamily: monoFont,
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            opacity: nextStage ? 1 : 0.5,
          }}
        >
          {nextStage ? `-> ${getStageTone(nextStage).short}` : "OK"}
        </button>
        {d.file_url && (
          <button onClick={() => onAnnotate(d)} title="Annotate PDF" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 4, background: "var(--accent-muted)", border: "1px solid var(--accent-border)", color: "var(--accent)", cursor: "pointer" }}>
            <PenLine style={{ width: 10, height: 10 }} />
          </button>
        )}
        {d.file_url && (
          <a href={d.file_url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 4, background: "rgba(0,184,217,0.10)", border: "1px solid rgba(0,184,217,0.2)", color: "#00B8D9", textDecoration: "none" }}>
            <FileText style={{ width: 10, height: 10 }} />
          </a>
        )}
        <button onClick={() => onEdit(d)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 4, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(200,210,230,0.6)", cursor: "pointer" }}>
          <Pencil style={{ width: 10, height: 10 }} />
        </button>
        <button onClick={() => onDelete(d)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 4, background: "rgba(255,61,61,0.08)", border: "1px solid rgba(255,61,61,0.18)", color: "#FF3D3D", cursor: "pointer" }}>
          <Trash2 style={{ width: 10, height: 10 }} />
        </button>
      </div>
    </div>
  );
}
