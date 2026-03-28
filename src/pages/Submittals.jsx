import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Pencil,
  Trash2,
  ChevronRight,
  Upload,
  FileText,
  ExternalLink,
  PenLine,
  RefreshCw,
} from "lucide-react";
import StatusBadge from "../components/shared/StatusBadge";
import DeleteDialog from "../components/shared/DeleteDialog";
import DrawingFormModal from "../components/drawings/DrawingFormModal";
import DrawingSetUploadModal from "../components/drawings/DrawingSetUploadModal";
import RevisionUploadModal from "../components/drawings/RevisionUploadModal";
import RevisionHistoryPanel from "../components/drawings/RevisionHistoryPanel";
import DrawingKanban from "../components/drawings/DrawingKanban";
import BulkActionBar from "../components/drawings/BulkActionBar";
import SetApprovalModal from "../components/drawings/SetApprovalModal";
import { formatDate, isOverdue } from "../components/shared/formatters";
import { useProjectContext } from "../components/shared/useProjectContext";
import { toast } from "sonner";

const STAGES = ["Not Started", "OFA", "BFA", "OFS", "BFS", "FFF", "Released"];
const STAGE_SEQUENCE = ["OFA", "BFA", "OFS", "BFS", "FFF", "Released"];
const GRID = "32px 88px 1fr 80px 44px 100px 72px 68px 52px 80px 68px";
const PDF_JS_SRC = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDF_JS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const thumbnailCache = new Map();
let pdfLoaderPromise = null;

const APPROVAL_BADGE = {
  approved: { bg: "rgba(0,214,143,0.10)", border: "rgba(0,214,143,0.25)", color: "#00D68F", label: "APPROVED" },
  pending: { bg: "rgba(255,180,0,0.10)", border: "rgba(255,180,0,0.25)", color: "#FFB020", label: "PENDING" },
  rejected: { bg: "rgba(255,61,61,0.10)", border: "rgba(255,61,61,0.25)", color: "#FF3D3D", label: "REJECTED" },
  superseded: { bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.10)", color: "var(--text-muted)", label: "SUPERSEDED" },
};

const STAGE_COLORS = {
  Released: "var(--status-success)",
  BFS: "var(--status-info)",
  OFS: "var(--status-info)",
  BFA: "var(--status-warning)",
  OFA: "var(--status-warning)",
  FFF: "var(--accent)",
  "Not Started": "var(--text-muted)",
};

const btnPrimary = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "0 12px",
  height: 30,
  borderRadius: "var(--radius-btn)",
  cursor: "pointer",
  background: "var(--accent)",
  border: "none",
  color: "var(--on-accent)",
  fontFamily: "var(--font-body)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const btnSecondary = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  padding: "0 10px",
  height: 30,
  borderRadius: "var(--radius-btn)",
  cursor: "pointer",
  background: "var(--bg-surface-high)",
  border: "1px solid var(--border-default)",
  color: "var(--text-secondary)",
  fontFamily: "var(--font-body)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const compactSelect = {
  background: "var(--bg-surface-high)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-input)",
  padding: "0 8px",
  height: 28,
  color: "var(--text-secondary)",
  fontFamily: "var(--font-body)",
  fontSize: 11,
  cursor: "pointer",
  outline: "none",
};

const compactHeaderBtn = {
  background: "var(--bg-surface-high)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-btn)",
  padding: "0 8px",
  height: 22,
  cursor: "pointer",
  color: "var(--text-muted)",
  fontFamily: "var(--font-body)",
  fontSize: 7,
  letterSpacing: "0.08em",
  whiteSpace: "nowrap",
  display: "flex",
  alignItems: "center",
  gap: 4,
};

function ensurePdfJs() {
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER;
    return Promise.resolve(window.pdfjsLib);
  }
  if (!pdfLoaderPromise) {
    pdfLoaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = PDF_JS_SRC;
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER;
        resolve(window.pdfjsLib);
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  return pdfLoaderPromise;
}

async function generateThumbnail(fileUrl, drawingId, scale = 0.35) {
  if (thumbnailCache.has(drawingId)) return thumbnailCache.get(drawingId);
  await ensurePdfJs();
  if (!window.pdfjsLib) return null;
  try {
    const pdf = await window.pdfjsLib.getDocument(fileUrl).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL();
    thumbnailCache.set(drawingId, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}

function getDaysUntil(dateValue) {
  if (!dateValue) return null;
  return Math.ceil((new Date(dateValue) - new Date()) / 86400000);
}

function isOverdueDrawingLocal(drawing) {
  if (!drawing?.due_date) return false;
  if (drawing.stage === "Released") return false;
  return new Date(drawing.due_date) < new Date();
}

function getApprovalTone(status) {
  return APPROVAL_BADGE[status] || { bg: "var(--accent-muted)", border: "var(--accent-border)", color: "var(--accent)", label: status || "OPEN" };
}

function getSetApprovalStatus(setDrawings) {
  const statuses = setDrawings.map((drawing) => drawing.set_approval_status).filter(Boolean);
  if (!statuses.length) return "open";
  if (statuses.every((status) => status === "approved")) return "approved";
  if (statuses.some((status) => status === "rejected")) return "rejected";
  if (statuses.some((status) => status === "pending")) return "pending";
  if (statuses.some((status) => status === "approved")) return "pending";
  return statuses[0] || "open";
}

function getMostAdvancedStage(setDrawings) {
  const stageIndex = setDrawings.reduce((max, drawing) => {
    const idx = STAGE_SEQUENCE.indexOf(drawing.stage);
    return Math.max(max, idx);
  }, -1);
  return stageIndex >= 0 ? STAGE_SEQUENCE[stageIndex] : "Not Started";
}

function getLatestSetRevision(setDrawings) {
  return setDrawings.reduce((max, drawing) => {
    const value = Number(drawing.revision_number);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
}

function getSetDiscipline(setDrawings) {
  const disciplines = [...new Set(setDrawings.map((drawing) => drawing.discipline).filter(Boolean))];
  if (!disciplines.length) return null;
  return disciplines.length === 1 ? disciplines[0] : disciplines.join(" / ");
}

function getSetDates(setDrawings) {
  const submitted = setDrawings.map((drawing) => drawing.submitted_date).filter(Boolean).sort().at(-1) || null;
  const returned = setDrawings.map((drawing) => drawing.return_date).filter(Boolean).sort().at(-1) || null;
  return { submitted, returned };
}

function getProgressPercent(stage) {
  const idx = STAGE_SEQUENCE.indexOf(stage);
  if (idx < 0) return 0;
  return ((idx + 1) / STAGE_SEQUENCE.length) * 100;
}

function HoverThumbnail({ thumb }) {
  if (!thumb) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: -132,
        top: "50%",
        transform: "translateY(-50%)",
        width: 120,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        borderRadius: 8,
        padding: 4,
        boxShadow: "0 10px 28px rgba(0,0,0,0.35)",
        zIndex: 20,
      }}
    >
      <img src={thumb} alt="Preview" style={{ width: "100%", display: "block", borderRadius: 4, background: "#fff" }} />
    </div>
  );
}

function DrawingThumbnailCard({ drawing, onEdit, onAnnotate, navigate, createPageUrl: createUrl }) {
  const [thumb, setThumb] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!drawing.file_url) return undefined;
    setLoading(true);
    generateThumbnail(drawing.file_url, drawing.id).then((url) => {
      if (!active) return;
      setThumb(url);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [drawing.file_url, drawing.id]);

  const overdue = drawing.due_date && drawing.stage !== "Released" && new Date(drawing.due_date) < new Date();

  return (
    <div
      onClick={() => {
        if (drawing.file_url) navigate(createUrl(`DrawingViewer?drawingId=${drawing.id}&from=Submittals`));
        else onEdit(drawing);
      }}
      style={{
        background: "var(--bg-surface)",
        border: overdue ? "1px solid var(--status-error)" : "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        transition: "all 0.15s",
        position: "relative",
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.border = "1px solid var(--accent)";
        event.currentTarget.style.transform = "translateY(-2px)";
        event.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.4)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.border = overdue ? "1px solid var(--status-error)" : "1px solid var(--border-default)";
        event.currentTarget.style.transform = "translateY(0)";
        event.currentTarget.style.boxShadow = "none";
      }}
    >
      {drawing.priority_flag && (
        <div style={{ position: "absolute", top: 6, left: 6, zIndex: 2, color: "var(--status-error)", fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.08em" }}>FLAG</div>
      )}

      {overdue && (
        <div style={{ position: "absolute", top: 6, right: 6, zIndex: 2, background: "var(--status-error)", color: "#fff", fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, padding: "2px 5px", borderRadius: 2, letterSpacing: "0.08em" }}>
          OVERDUE
        </div>
      )}

      <div style={{ width: "100%", paddingTop: "70%", position: "relative", background: "var(--bg-surface-low)", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {loading ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em" }}>LOADING...</div>
          ) : thumb ? (
            <img src={thumb} alt={drawing.sheet_number} style={{ width: "100%", height: "100%", objectFit: "contain", background: "#fff" }} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ fontSize: 24, opacity: 0.2 }}>[]</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.10em" }}>NO PREVIEW</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "8px 10px", borderTop: "1px solid var(--divider)", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.04em" }}>{drawing.sheet_number}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, color: STAGE_COLORS[drawing.stage] || "var(--text-muted)", background: `${STAGE_COLORS[drawing.stage] || "var(--text-muted)"}22`, padding: "2px 5px", borderRadius: 2, letterSpacing: "0.06em" }}>
            {drawing.stage || "Not Started"}
          </span>
        </div>

        <div style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>{drawing.title}</div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>Rev {drawing.revision_number ?? "0"}</span>
          {drawing.due_date && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: overdue ? 700 : 400, color: overdue ? "var(--status-error)" : "var(--text-muted)" }}>
              {new Date(drawing.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 4, marginTop: 2 }} onClick={(event) => event.stopPropagation()}>
          {drawing.file_url && (
            <button
              onClick={() => onAnnotate(drawing)}
              title="Markup"
            style={{ flex: 1, height: 22, background: "var(--accent-muted)", border: "1px solid var(--accent-border)", borderRadius: 3, color: "var(--accent)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, letterSpacing: "0.08em" }}
            >
              MARKUP
            </button>
          )}
          <button
            onClick={() => onEdit(drawing)}
            title="Edit"
            style={{ flex: 1, height: 22, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 3, color: "var(--text-muted)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, letterSpacing: "0.08em" }}
          >
            EDIT
          </button>
        </div>
      </div>
    </div>
  );
}

function ThumbnailGrid({ drawingsBySet, setKeys, onEdit, onAnnotate, navigate, createPageUrl: createUrl }) {
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
      {setKeys.map((setKey) => {
        const setDrawings = drawingsBySet[setKey] || [];
        const status = getSetApprovalStatus(setDrawings);
        const tone = getApprovalTone(status);
        return (
          <div key={setKey} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ position: "sticky", top: 0, zIndex: 3, background: "var(--bg-base)", paddingBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--divider)", paddingBottom: 8 }}>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{setKey === "__ungrouped__" ? "Individual Drawings" : setKey}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", background: "var(--bg-surface-high)", padding: "2px 6px", borderRadius: 999 }}>{setDrawings.length} SHEETS</span>
                <span style={{ background: tone.bg, border: `1px solid ${tone.border}`, color: tone.color, borderRadius: 999, padding: "2px 7px", fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, letterSpacing: "0.08em" }}>{tone.label}</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
              {setDrawings.map((drawing) => (
                <DrawingThumbnailCard key={drawing.id} drawing={drawing} onEdit={onEdit} onAnnotate={onAnnotate} navigate={navigate} createPageUrl={createUrl} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DrawingSetTrackerPanel({ setKeys, drawingsBySet, activeSetFilter, onSelectSet, onClearSet }) {
  const unsubmitteds = setKeys.filter((key) => key !== "__ungrouped__").filter((key) => !(drawingsBySet[key] || []).some((drawing) => drawing.submitted_date));

  return (
    <div style={{ width: 300, flexShrink: 0, borderRight: "1px solid var(--divider)", overflowY: "auto", background: "var(--bg-sidebar)", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.18em", color: "var(--text-muted)", textTransform: "uppercase" }}>Submission Log</div>
        {activeSetFilter && (
          <button onClick={onClearSet} style={{ ...compactHeaderBtn, marginTop: 8 }}>CLEAR SET FILTER</button>
        )}
      </div>

      {setKeys.filter((key) => key !== "__ungrouped__").map((setKey) => {
        const setDrawings = drawingsBySet[setKey] || [];
        const approvalStatus = getSetApprovalStatus(setDrawings);
        const tone = approvalStatus === "approved" ? "var(--status-success)" : approvalStatus === "pending" ? "var(--status-warning)" : approvalStatus === "rejected" ? "var(--status-error)" : "var(--accent)";
        const latestStage = getMostAdvancedStage(setDrawings);
        const discipline = getSetDiscipline(setDrawings);
        const revision = getLatestSetRevision(setDrawings);
        const { submitted, returned } = getSetDates(setDrawings);
        const daysOutstanding = submitted && approvalStatus !== "approved" ? Math.max(0, Math.ceil((new Date() - new Date(submitted)) / 86400000)) : null;
        const progress = getProgressPercent(latestStage);
        const cardActive = activeSetFilter === setKey;

        return (
          <button
            key={setKey}
            onClick={() => onSelectSet(setKey)}
            style={{
              textAlign: "left",
              width: "100%",
              background: cardActive ? "var(--accent-muted)" : "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderLeft: `4px solid ${tone}`,
              borderRadius: "var(--radius-card)",
              padding: 12,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{setKey}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", background: "var(--bg-surface-high)", borderRadius: 999, padding: "2px 6px" }}>{setDrawings.length} SHEETS</span>
                  {discipline && <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-secondary)", background: "rgba(255,255,255,0.04)", borderRadius: 999, padding: "2px 6px" }}>{discipline}</span>}
                </div>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", fontWeight: 700 }}>REV {revision}</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ background: `${tone}22`, color: tone, border: `1px solid ${tone}33`, borderRadius: 999, padding: "2px 7px", fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, letterSpacing: "0.08em" }}>{approvalStatus === "open" ? "OPEN" : approvalStatus.toUpperCase()}</span>
              <span style={{ background: "rgba(255,255,255,0.04)", color: STAGE_COLORS[latestStage] || "var(--text-muted)", borderRadius: 999, padding: "2px 7px", fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, letterSpacing: "0.08em" }}>{latestStage}</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
              <span>Submitted: {submitted ? formatDate(submitted) : "-"}</span>
              <span>Return: {returned ? formatDate(returned) : "-"}</span>
            </div>

            {daysOutstanding !== null && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: daysOutstanding > 14 ? "var(--status-error)" : "var(--status-warning)" }}>
                {daysOutstanding}d outstanding
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ position: "relative", height: 6, borderRadius: 999, overflow: "hidden", background: "rgba(255,255,255,0.06)" }}>
                <div style={{ width: `${progress}%`, height: "100%", background: tone }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
                {STAGE_SEQUENCE.map((stage) => (
                  <span key={stage}>{stage}</span>
                ))}
              </div>
            </div>
          </button>
        );
      })}

      {unsubmitteds.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.18em", color: "var(--status-warning)", textTransform: "uppercase" }}>Unsubmitted Sets</div>
          {unsubmitteds.map((setKey) => (
            <button
              key={setKey}
              onClick={() => onSelectSet(setKey)}
              style={{ textAlign: "left", width: "100%", background: "var(--bg-surface)", border: "1px solid rgba(255,176,32,0.3)", borderLeft: "4px solid var(--status-warning)", borderRadius: "var(--radius-card)", padding: 12, cursor: "pointer", display: "flex", flexDirection: "column", gap: 6 }}
            >
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{setKey}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--status-warning)", letterSpacing: "0.08em" }}>NOT YET SUBMITTED</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduleView({ setKeys, drawingsBySet, isOverdueDrawing }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "16px 0", background: "var(--bg-page)" }}>
      {setKeys.map((setKey) => {
        const setDrawings = drawingsBySet[setKey];
        const overdue = setDrawings.some((drawing) => isOverdueDrawing(drawing));
        const allReleased = setDrawings.every((drawing) => drawing.stage === "Released");
        const hasDue = setDrawings.some((drawing) => drawing.due_date);
        const earliestDue = hasDue ? setDrawings.filter((drawing) => drawing.due_date).sort((a, b) => new Date(a.due_date) - new Date(b.due_date))[0].due_date : null;
        const barColor = allReleased ? "var(--status-success)" : overdue ? "var(--status-error)" : "var(--status-warning)";
        const releasedCount = setDrawings.filter((drawing) => drawing.stage === "Released").length;
        const percentComplete = Math.round((releasedCount / setDrawings.length) * 100);

        return (
          <div key={setKey} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", background: "var(--bg-surface)", borderLeft: `3px solid ${barColor}`, borderBottom: "1px solid var(--divider)" }}>
            <div style={{ width: 200, flexShrink: 0 }}>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {setKey === "__ungrouped__" ? "Ungrouped" : setKey}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginTop: 2 }}>{setDrawings.length} sheets</div>
            </div>

            <div style={{ flex: 1, height: 24, background: "var(--bg-surface-high)", borderRadius: 2, overflow: "hidden", position: "relative" }}>
              <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${percentComplete}%`, background: barColor, opacity: 0.7, transition: "width 0.4s" }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", padding: "0 8px", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "#fff" }}>
                {allReleased ? "APPROVED" : overdue ? "OVERDUE" : earliestDue ? `DUE ${new Date(earliestDue).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "IN PROGRESS"}
              </div>
            </div>

            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: allReleased ? "var(--status-success)" : overdue ? "var(--status-error)" : "var(--text-muted)", fontWeight: 700, width: 60, textAlign: "right" }}>
              {percentComplete}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DrawingSetGroup({
  setKey,
  setDrawings,
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
  allFilteredArr,
  drawingSetRecord,
  onAnnotate,
  isOverdueDrawing,
  daysUntilDue,
}) {
  const isUngrouped = setKey === "__ungrouped__";
  const label = isUngrouped ? "Individual Drawings" : setKey;
  const sample = setDrawings[0];
  const approvalStatus = sample?.set_approval_status;
  const ab = APPROVAL_BADGE[approvalStatus];
  const allSelected = setDrawings.every((drawing) => selectedIds.has(drawing.id));

  let revCount = 1;
  if (drawingSetRecord?.revision_history) {
    try {
      revCount = JSON.parse(drawingSetRecord.revision_history).length + 1;
    } catch {}
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          height: 36,
          padding: "0 16px",
          background: "var(--bg-surface-low)",
          borderTop: "1px solid var(--divider)",
          borderBottom: "1px solid var(--divider)",
          borderLeft: "3px solid var(--accent)",
          cursor: "pointer",
          userSelect: "none",
          position: "sticky",
          top: 0,
          zIndex: 4,
        }}
        onClick={() => onToggleCollapse(setKey)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 12, color: "var(--accent)", transition: "transform 0.15s", transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", flexShrink: 0, display: "inline-block" }}>v</span>
          <span style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.03em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", background: "var(--bg-surface-high)", padding: "2px 7px", borderRadius: "var(--radius-badge)", flexShrink: 0 }}>{setDrawings.length} SHEETS</span>
          {sample?.discipline && <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, background: "var(--accent-muted)", color: "var(--accent)", borderRadius: "var(--radius-badge)", padding: "1px 6px", flexShrink: 0 }}>{sample.discipline.slice(0, 6).toUpperCase()}</span>}
          {!isUngrouped && (sample?.revision_number !== undefined || sample?.issue_date || sample?.issued_by) && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-secondary)", letterSpacing: "0.08em", flexShrink: 0, whiteSpace: "nowrap" }}>
              {sample?.revision_number !== undefined && `REV ${sample.revision_number}`}
              {sample?.issue_date && ` - ${new Date(sample.issue_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
              {sample?.issued_by && ` - ${sample.issued_by}`}
            </span>
          )}
          {ab && (
            <span style={{ background: ab.bg, border: `1px solid ${ab.border}`, color: ab.color, borderRadius: 4, padding: "1px 6px", fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, letterSpacing: "0.08em", flexShrink: 0 }}>
              {approvalStatus === "approved" ? `APPROVED${sample?.set_approval_revision ? ` Rev ${sample.set_approval_revision}` : ""}` : approvalStatus === "rejected" ? "REJECTED" : approvalStatus === "pending" ? "PENDING" : "SUPERSEDED"}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }} onClick={(event) => event.stopPropagation()}>
          {drawingSetRecord && (
            <button onClick={() => onOpenHistory(drawingSetRecord)} style={{ ...compactHeaderBtn, color: "var(--text-secondary)" }}>
              {revCount} REV{revCount !== 1 ? "S" : ""}
            </button>
          )}
          {!isUngrouped && (
            <button onClick={() => onNewRevision(drawingSetRecord)} style={{ ...compactHeaderBtn, background: "var(--warning-muted)", borderColor: "var(--warning-border)", color: "var(--status-warning)" }}>
              NEW REV
            </button>
          )}
          <button
            onClick={() => (allSelected ? onDeselectAll(setDrawings) : onSelectAll(setDrawings))}
            style={{ ...compactHeaderBtn, background: allSelected ? "var(--warning-muted)" : undefined, borderColor: allSelected ? "var(--warning-border)" : undefined, color: allSelected ? "var(--status-warning)" : undefined }}
          >
            {allSelected ? "DESELECT" : "SELECT ALL"}
          </button>
          {approvalStatus === "approved" ? (
            <button onClick={() => onOpenApproval(setKey, setDrawings)} style={{ ...compactHeaderBtn, background: "rgba(0,214,143,0.08)", borderColor: "rgba(0,214,143,0.20)", color: "#00D68F" }}>APPROVED</button>
          ) : (
            <button onClick={() => onOpenApproval(setKey, setDrawings)} style={{ ...compactHeaderBtn, background: "var(--warning-muted)", borderColor: "var(--warning-border)", color: "var(--status-warning)" }}>APPROVE</button>
          )}
          {sample?.file_url && (
            <a href={sample.file_url} target="_blank" rel="noopener noreferrer" style={{ ...compactHeaderBtn, textDecoration: "none", color: "#00B8D9", background: "rgba(0,184,217,0.08)", borderColor: "rgba(0,184,217,0.18)" }}>
              <ExternalLink style={{ width: 8, height: 8 }} /> PDF
            </a>
          )}
        </div>
      </div>

      {!collapsed && (
        <div style={{ paddingLeft: 4, borderLeft: "3px solid var(--accent-muted)" }}>
          {setDrawings.map((drawing) => {
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
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function DrawingRow({
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
}) {
  const [hovered, setHovered] = useState(false);
  const [thumb, setThumb] = useState(null);
  const overdue = isOverdue(d.due_date, d.stage, ["Released"]);

  useEffect(() => {
    let active = true;
    if (!hovered || !d.file_url) return undefined;
    generateThumbnail(d.file_url, d.id, 0.3).then((url) => {
      if (active) setThumb(url);
    });
    return () => {
      active = false;
    };
  }, [hovered, d.file_url, d.id]);

  return (
    <div
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: GRID,
        alignItems: "center",
        height: 30,
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
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onToggle(d.id, globalIdx, allArr, event.nativeEvent)}
          style={{ width: 13, height: 13, cursor: "pointer", accentColor: "var(--accent)" }}
        />
      </div>

      <span
        onClick={() => onEdit(d)}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 600,
          color: "var(--accent)",
          cursor: "pointer",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          letterSpacing: "0.03em",
        }}
      >
        {d.priority_flag && <span style={{ color: "#FF3D3D", marginRight: 3 }}>FLAG</span>}
        {d.sheet_number}
      </span>

      <span
        onClick={() => onEdit(d)}
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          color: "var(--text-secondary)",
          cursor: "pointer",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          paddingRight: 8,
        }}
      >
        {d.title}
      </span>

      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
        {d.discipline?.slice(0, 6).toUpperCase() || "-"}
      </span>

      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textAlign: "center" }}>
        {d.revision_number ?? "-"}
      </span>

      <div onClick={() => onEdit(d)} style={{ cursor: "pointer" }}>
        <StatusBadge status={d.stage} />
      </div>

      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
        {d.ifc_status || "-"}
      </span>

      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: d.set_approval_status === "approved" ? "var(--status-success)" : "var(--text-disabled)" }}>
        {d.set_approval_status === "approved" ? "APPV" : "-"}
      </span>

      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: overdue ? "var(--status-error)" : "var(--text-muted)", fontWeight: overdue ? 600 : 400 }}>
        {d.due_date ? new Date(d.due_date).toLocaleDateString("en-US", { month: "numeric", day: "numeric" }) : "-"}
      </span>

      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fontWeight: 600,
          color: (() => {
            const days = daysUntilDue(d);
            if (days === null) return "var(--text-muted)";
            if (days < 0) return "var(--status-error)";
            if (days <= 3) return "var(--status-error)";
            if (days <= 7) return "var(--status-warning)";
            return "var(--text-muted)";
          })(),
        }}
      >
        {(() => {
          const days = daysUntilDue(d);
          if (days === null) return "-";
          if (days < 0) return `${Math.abs(days)}d late`;
          return `${days}d`;
        })()}
      </div>

      <div
        style={{ display: "flex", gap: 3, opacity: hovered ? 1 : 0, transition: "opacity 0.1s", justifyContent: "flex-end" }}
        onClick={(event) => event.stopPropagation()}
      >
        {d.file_url && (
          <button
            onClick={() => onAnnotate(d)}
            title="Annotate PDF"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 4, background: "var(--accent-muted)", border: "1px solid var(--accent-border)", color: "var(--accent)", cursor: "pointer" }}
          >
            <PenLine style={{ width: 10, height: 10 }} />
          </button>
        )}
        {d.file_url && (
          <a
            href={d.file_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 4, background: "rgba(0,184,217,0.10)", border: "1px solid rgba(0,184,217,0.2)", color: "#00B8D9", textDecoration: "none" }}
          >
            <FileText style={{ width: 10, height: 10 }} />
          </a>
        )}
        {d.stage !== "Released" && (
          <button
            onClick={(event) => onAdvance(d, event)}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 4, background: "rgba(0,184,217,0.08)", border: "1px solid rgba(0,184,217,0.15)", color: "#00B8D9", cursor: "pointer" }}
          >
            <ChevronRight style={{ width: 10, height: 10 }} />
          </button>
        )}
        <button
          onClick={() => onEdit(d)}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 4, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(200,210,230,0.6)", cursor: "pointer" }}
        >
          <Pencil style={{ width: 10, height: 10 }} />
        </button>
        <button
          onClick={() => onDelete(d)}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 4, background: "rgba(255,61,61,0.08)", border: "1px solid rgba(255,61,61,0.18)", color: "#FF3D3D", cursor: "pointer" }}
        >
          <Trash2 style={{ width: 10, height: 10 }} />
        </button>
      </div>
    </div>
  );
}

export default function Submittals() {
  const { activeProject } = useProjectContext();
  const navigate = useNavigate();

  const [drawings, setDrawings] = useState([]);
  const [drawingSets, setDrawingSets] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [discFilter, setDiscFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [view, setView] = useState("TABLE");
  const [modalOpen, setModalOpen] = useState(false);
  const [uploadSetOpen, setUploadSetOpen] = useState(false);
  const [revisionUploadOpen, setRevisionUploadOpen] = useState(false);
  const [revisionPreselectedSet, setRevisionPreselectedSet] = useState(null);
  const [historyPanel, setHistoryPanel] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [collapsedSets, setCollapsedSets] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [lastCheckedIdx, setLastCheckedIdx] = useState(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [approvalModal, setApprovalModal] = useState(null);
  const [savingApproval, setSavingApproval] = useState(false);
  const [savingBulk, setSavingBulk] = useState(false);
  const [sortByDue, setSortByDue] = useState(false);
  const [overdueAlertDismissed, setOverdueAlertDismissed] = useState(false);
  const [activeSetFilter, setActiveSetFilter] = useState(null);

  const loadDrawings = async () => {
    if (!activeProject?.id) {
      setDrawings([]);
      setDrawingSets([]);
      return;
    }
    setLoading(true);
    try {
      const [data, sets] = await Promise.all([
        base44.entities.Drawing.filter({ project_id: activeProject.id }, "-created_date"),
        base44.entities.DrawingSet.filter({ project_id: activeProject.id }, "-created_date").catch(() => []),
      ]);
      setDrawings(data);
      setDrawingSets(sets);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDrawings();
    setSelectedIds(new Set());
    setActiveSetFilter(null);
  }, [activeProject?.id]);

  useEffect(() => {
    base44.entities.Project.list().then(setProjects);
  }, []);

  useEffect(() => {
    if (!drawings.length) return undefined;
    const createDrawingAlerts = async () => {
      try {
        const existing = await base44.entities.Alert.filter({ alert_type: "Drawing_Due" });
        const existingIds = new Set(existing.map((alert) => alert.related_record_id));
        const today = new Date();
        const in3 = new Date(today.getTime() + 3 * 86400000);
        for (const drawing of drawings) {
          if (drawing.stage === "Released") continue;
          if (!drawing.due_date) continue;
          const due = new Date(drawing.due_date);
          const isOD = due < today;
          const soon = !isOD && due <= in3;
          if (!isOD && !soon) continue;
          if (existingIds.has(drawing.id)) continue;
          await base44.entities.Alert.create({
            alert_type: "Drawing_Due",
            severity: isOD ? "Critical" : "High",
            title: isOD ? `Drawing ${drawing.sheet_number} OVERDUE` : `Drawing ${drawing.sheet_number} due in <=3 days`,
            message: `${drawing.sheet_number}: "${drawing.title}" - Stage: ${drawing.stage}. ${isOD ? `Was due ${drawing.due_date}.` : `Due ${drawing.due_date}.`}`,
            related_entity: "Drawing",
            related_record_id: drawing.id,
            project_id: drawing.project_id,
            project_name: activeProject?.name || "",
            is_read: false,
            is_dismissed: false,
          });
        }
      } catch (error) {
        console.warn("Drawing alert error:", error);
      }
    };
    const timer = setTimeout(createDrawingAlerts, 3000);
    return () => clearTimeout(timer);
  }, [drawings.length, activeProject?.name]);

  const openAnnotations = (drawing) => {
    navigate(createPageUrl(`DrawingViewer?drawingId=${drawing.id}&from=Submittals`));
  };

  const openNewRevision = (drawingSet, setKey) => {
    if (drawingSet) {
      setRevisionPreselectedSet(drawingSet);
    } else if (setKey && setKey !== "__ungrouped__") {
      const sheetsInSet = drawings.filter((drawing) => drawing.drawing_set_name === setKey && !drawing.is_superseded);
      const sample = sheetsInSet[0];
      setRevisionPreselectedSet({
        id: null,
        set_name: setKey,
        current_revision: sample?.revision_number != null ? String(sample.revision_number) : "-",
        current_issue_date: sample?.issue_date || null,
        current_issued_by: sample?.issued_by || "",
        current_file_url: sample?.file_url || null,
        sheet_count: sheetsInSet.length,
        revision_history: "[]",
      });
    } else {
      setRevisionPreselectedSet(null);
    }
    setRevisionUploadOpen(true);
  };

  const nextId = `DWG-${String((drawings.length || 0) + 1).padStart(3, "0")}`;

  const handleSave = async (drawing) => {
    try {
      if (editing) await base44.entities.Drawing.update(editing.id, drawing);
      else await base44.entities.Drawing.create({ ...drawing, drawing_id: nextId });
      setModalOpen(false);
      setEditing(null);
      toast.success(editing ? "Drawing updated" : "Drawing created");
      loadDrawings();
    } catch (error) {
      toast.error(error?.message || "Failed to save drawing");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    try {
      await base44.entities.Drawing.delete(deleteTarget.id);
      setDeleteTarget(null);
      toast.success("Drawing deleted");
      loadDrawings();
    } catch (error) {
      toast.error(error?.message || "Failed to delete drawing");
    }
  };

  const advanceStage = async (drawing, event) => {
    if (event) event.stopPropagation();
    const idx = STAGES.indexOf(drawing.stage);
    if (idx < STAGES.length - 1) {
      const newStage = STAGES[idx + 1];
      const data = { stage: newStage };
      if (newStage === "BFA" || newStage === "BFS") data.revision_number = (Number(drawing.revision_number) || 0) + 1;
      await base44.entities.Drawing.update(drawing.id, data);
      loadDrawings();
    }
  };

  const daysUntilDue = (drawing) => getDaysUntil(drawing.due_date);
  const isOverdueDrawing = (drawing) => isOverdueDrawingLocal(drawing);

  const filtered = drawings.filter((drawing) => {
    const term = search.toLowerCase();
    const matchSearch = !term || drawing.sheet_number?.toLowerCase().includes(term) || drawing.title?.toLowerCase().includes(term);
    const matchStage = stageFilter === "all" || drawing.stage === stageFilter;
    const matchDisc = discFilter === "all" || drawing.discipline === discFilter;
    const matchSuperseded = showSuperseded || !drawing.is_superseded;
    const matchSet = !activeSetFilter || (drawing.drawing_set_name || "__ungrouped__") === activeSetFilter;
    return matchSearch && matchStage && matchDisc && matchSuperseded && matchSet;
  });

  const displayDrawings = sortByDue
    ? [...filtered].sort((a, b) => {
        const da = a.due_date ? new Date(a.due_date) : new Date("9999-12-31");
        const db = b.due_date ? new Date(b.due_date) : new Date("9999-12-31");
        return da - db;
      })
    : filtered;

  const drawingsBySet = displayDrawings.reduce((acc, drawing) => {
    const key = drawing.drawing_set_name || "__ungrouped__";
    if (!acc[key]) acc[key] = [];
    acc[key].push(drawing);
    return acc;
  }, {});

  const setKeys = Object.keys(drawingsBySet).sort((a, b) => (a === "__ungrouped__" ? 1 : b === "__ungrouped__" ? -1 : a.localeCompare(b)));
  const allFilteredArr = setKeys.flatMap((key) => drawingsBySet[key]);

  const allDrawingsBySet = useMemo(() => {
    return drawings.reduce((acc, drawing) => {
      const key = drawing.drawing_set_name || "__ungrouped__";
      if (!acc[key]) acc[key] = [];
      acc[key].push(drawing);
      return acc;
    }, {});
  }, [drawings]);

  const trackerSetKeys = useMemo(() => Object.keys(allDrawingsBySet).sort((a, b) => (a === "__ungrouped__" ? 1 : b === "__ungrouped__" ? -1 : a.localeCompare(b))), [allDrawingsBySet]);

  const toggleSelect = (id, idx, arr, event) => {
    if (event?.shiftKey && lastCheckedIdx !== null) {
      const lo = Math.min(lastCheckedIdx, idx);
      const hi = Math.max(lastCheckedIdx, idx);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        arr.slice(lo, hi + 1).forEach((drawing) => next.add(drawing.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
    setLastCheckedIdx(idx);
  };

  const selectAll = (arr) => setSelectedIds((prev) => {
    const next = new Set(prev);
    arr.forEach((drawing) => next.add(drawing.id));
    return next;
  });

  const deselectAll = (arr) => setSelectedIds((prev) => {
    const next = new Set(prev);
    arr.forEach((drawing) => next.delete(drawing.id));
    return next;
  });

  const clearSelection = () => setSelectedIds(new Set());

  const applyBulkUpdate = async (field, value) => {
    const ids = [...selectedIds];
    if (!ids.length || savingBulk) return;
    setSavingBulk(true);
    try {
      await Promise.all(ids.map((id) => base44.entities.Drawing.update(id, { [field]: value })));
      toast.success(`Updated ${ids.length} drawings`);
      clearSelection();
      loadDrawings();
    } catch (error) {
      toast.error(error?.message || "Bulk update failed");
    } finally {
      setSavingBulk(false);
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (!ids.length || savingBulk) return;
    setSavingBulk(true);
    try {
      await Promise.all(ids.map((id) => base44.entities.Drawing.delete(id)));
      toast.success(`Deleted ${ids.length} drawings`);
      clearSelection();
      setBulkDeleteOpen(false);
      loadDrawings();
    } catch (error) {
      toast.error(error?.message || "Bulk delete failed");
    } finally {
      setSavingBulk(false);
    }
  };

  const openApprovalModal = (setKey, setDrawings) => {
    const sample = setDrawings[0];
    setApprovalModal({
      setKey,
      setName: setKey === "__ungrouped__" ? "Individual Drawings" : setKey,
      sheetCount: setDrawings.length,
      existingRevision: String(sample?.revision_number ?? ""),
      setDrawings,
    });
  };

  const handleApprovalConfirm = async ({ status, revision, approvedBy, approvalDate, applyToSheets, notes }) => {
    if (!approvalModal) return;
    setSavingApproval(true);
    try {
      await Promise.all(approvalModal.setDrawings.map((drawing) => {
        const patch = {
          set_approval_status: status,
          set_approved_by: approvedBy,
          set_approved_date: approvalDate,
          set_approval_notes: notes,
          set_approval_revision: revision,
        };
        if (applyToSheets && status === "approved") patch.stage = "Released";
        return base44.entities.Drawing.update(drawing.id, patch);
      }));
      toast.success(`Drawing set ${status} - ${approvalModal.sheetCount} sheets updated`);
      setApprovalModal(null);
      loadDrawings();
    } finally {
      setSavingApproval(false);
    }
  };

  if (!activeProject?.id) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>[]</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>Select a project to view drawings</div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>Use the project selector in the top right.</div>
      </div>
    );
  }

  const disciplines = [...new Set(drawings.map((drawing) => drawing.discipline).filter(Boolean))];
  const overdueDrawings = drawings.filter(isOverdueDrawing);
  const dueThisWeek = drawings.filter((drawing) => {
    const days = daysUntilDue(drawing);
    return days !== null && days >= 0 && days <= 7 && drawing.stage !== "Released";
  });
  const inReviewCount = drawings.filter((drawing) => ["BFA", "OFA", "BFS", "OFS"].includes(drawing.stage)).length;
  const pendingEorCount = drawings.filter((drawing) => ["BFA", "OFA"].includes(drawing.stage)).length;
  const approvedSets = Object.entries(allDrawingsBySet).filter(([key, setDrawings]) => key !== "__ungrouped__" && setDrawings.length > 0 && setDrawings.every((drawing) => drawing.set_approval_status === "approved")).length;
  const avgDaysOpen = (() => {
    const openDrawings = drawings.filter((drawing) => drawing.stage !== "Released" && drawing.submitted_date);
    if (!openDrawings.length) return 0;
    const total = openDrawings.reduce((sum, drawing) => sum + Math.max(0, Math.ceil((new Date() - new Date(drawing.submitted_date)) / 86400000)), 0);
    return Math.round(total / openDrawings.length);
  })();

  const kpis = [
    { label: "TOTAL SHEETS", value: drawings.length, color: "var(--text-primary)", onClick: () => { setStageFilter("all"); setActiveSetFilter(null); } },
    { label: "RELEASED", value: drawings.filter((drawing) => drawing.stage === "Released").length, color: "var(--status-success)", onClick: () => setStageFilter("Released") },
    { label: "IN REVIEW", value: inReviewCount, color: "var(--status-info)", onClick: () => setStageFilter("OFA") },
    { label: "OFA/BFA", value: pendingEorCount, color: "var(--status-warning)", onClick: () => setStageFilter("OFA") },
    { label: "OVERDUE", value: overdueDrawings.length, color: overdueDrawings.length ? "var(--status-error)" : "var(--text-muted)", onClick: () => setSortByDue(true) },
    { label: "DUE THIS WEEK", value: dueThisWeek.length, color: dueThisWeek.length ? "var(--status-warning)" : "var(--text-muted)", onClick: () => setSortByDue(true) },
    { label: "APPROVED SETS", value: approvedSets, color: approvedSets ? "var(--status-success)" : "var(--text-muted)", onClick: () => setActiveSetFilter(null) },
    { label: "AVG DAYS OPEN", value: avgDaysOpen, color: avgDaysOpen > 14 ? "var(--status-warning)" : "var(--text-primary)", onClick: () => setSortByDue(true) },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 92px)", overflow: "hidden", background: "var(--bg-page)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", height: 56, borderBottom: "1px solid var(--divider)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "'Space Grotesk', var(--font-display)", fontSize: 20, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Drawing Log</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", background: "var(--bg-surface-high)", padding: "2px 7px", borderRadius: "var(--radius-badge)" }}>{drawings.length} SHEETS</span>
          <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--accent)" }}>{activeProject.name}</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => { setEditing(null); setModalOpen(true); }} style={btnSecondary}>+ SINGLE</button>
          <button onClick={() => setUploadSetOpen(true)} style={btnPrimary}><Upload style={{ width: 12, height: 12 }} /> UPLOAD SET</button>
          <button onClick={loadDrawings} style={{ ...btnSecondary, padding: "0 8px", width: 32, justifyContent: "center" }} title="Refresh">
            <RefreshCw style={{ width: 12, height: 12 }} />
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, minmax(0, 1fr))", borderBottom: "1px solid var(--divider)", background: "var(--bg-sidebar)", flexShrink: 0 }}>
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            onClick={kpi.onClick}
            style={{
              padding: "10px 12px",
              border: "none",
              borderRight: "1px solid rgba(255,255,255,0.05)",
              background: "transparent",
              textAlign: "left",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase" }}>{kpi.label}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: kpi.color, lineHeight: 1 }}>{kpi.value}</span>
          </button>
        ))}
      </div>

      {!overdueAlertDismissed && overdueDrawings.length > 0 && (
        <div style={{ flexShrink: 0, padding: "10px 16px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 12px", background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderRadius: "var(--radius-card)" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--status-error)", letterSpacing: "0.08em" }}>
              {overdueDrawings.length} OVERDUE: {overdueDrawings.slice(0, 3).map((drawing) => drawing.sheet_number).join(", ")}{overdueDrawings.length > 3 ? " ..." : ""}
            </span>
            <button onClick={() => setOverdueAlertDismissed(true)} style={{ background: "transparent", border: "none", color: "var(--status-error)", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>X</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px", height: 40, borderBottom: "1px solid var(--divider)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg-surface-high)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-input)", padding: "0 10px", height: 28, flex: 1, maxWidth: 260 }}>
          <span style={{ fontSize: 12, opacity: 0.4, flexShrink: 0 }}>/</span>
          <input placeholder="Search drawings..." value={search} onChange={(event) => setSearch(event.target.value)} style={{ background: "transparent", border: "none", outline: "none", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 11, width: "100%", padding: 0 }} />
        </div>
        <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)} style={compactSelect}>
          <option value="all">All Stages</option>
          {STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
        </select>
        <select value={discFilter} onChange={(event) => setDiscFilter(event.target.value)} style={compactSelect}>
          <option value="all">All Disciplines</option>
          {disciplines.map((discipline) => <option key={discipline} value={discipline}>{discipline}</option>)}
        </select>
        <button onClick={() => setSortByDue((value) => !value)} style={{ padding: "0 10px", height: 28, borderRadius: 6, cursor: "pointer", background: sortByDue ? "var(--accent-muted)" : "rgba(255,255,255,0.04)", border: `1px solid ${sortByDue ? "var(--accent-border)" : "rgba(255,255,255,0.08)"}`, color: sortByDue ? "var(--accent)" : "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.08em", fontWeight: sortByDue ? 700 : 400 }}>
          SORT BY DUE
        </button>
        <button onClick={() => setShowSuperseded((value) => !value)} style={{ padding: "0 10px", height: 28, borderRadius: 6, cursor: "pointer", background: showSuperseded ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)", border: `1px solid ${showSuperseded ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.08)"}`, color: showSuperseded ? "var(--text-secondary)" : "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.08em" }}>
          {showSuperseded ? "SHOW ALL" : "HIDE SUPERSEDED"}
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", background: "var(--bg-surface-high)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-btn)", overflow: "hidden" }}>
          {["TABLE", "THUMBNAIL", "KANBAN", "SCHEDULE"].map((mode) => (
            <button key={mode} onClick={() => setView(mode)} style={{ padding: "0 10px", height: 28, background: view === mode ? "var(--accent-muted)" : "transparent", border: "none", color: view === mode ? "var(--accent)" : "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: 8, fontWeight: 700, cursor: "pointer", letterSpacing: "0.10em" }}>{mode}</button>
          ))}
        </div>
      </div>

      {selectedIds.size > 0 && <BulkActionBar count={selectedIds.size} onBulkUpdate={applyBulkUpdate} onBulkDelete={() => setBulkDeleteOpen(true)} onClear={clearSelection} />}

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <DrawingSetTrackerPanel setKeys={trackerSetKeys} drawingsBySet={allDrawingsBySet} activeSetFilter={activeSetFilter} onSelectSet={setActiveSetFilter} onClearSet={() => setActiveSetFilter(null)} />

        <div style={{ flex: 1, overflowY: view === "KANBAN" ? "hidden" : "auto", overflowX: "hidden", display: "flex", flexDirection: "column" }}>
          {view === "TABLE" && displayDrawings.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", padding: "0 16px", height: 28, flexShrink: 0, background: "var(--bg-sidebar)", borderBottom: "1px solid var(--divider)", position: "sticky", top: 0, zIndex: 5 }}>
              <div>
                <input
                  type="checkbox"
                  checked={allFilteredArr.length > 0 && allFilteredArr.every((drawing) => selectedIds.has(drawing.id))}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate = allFilteredArr.some((drawing) => selectedIds.has(drawing.id)) && !allFilteredArr.every((drawing) => selectedIds.has(drawing.id));
                    }
                  }}
                  onChange={(event) => event.target.checked ? selectAll(allFilteredArr) : clearSelection()}
                  style={{ width: 13, height: 13, cursor: "pointer", accentColor: "var(--accent)" }}
                />
              </div>
              {["#", "TITLE", "DISC", "REV", "STAGE", "IFC", "APPV", "DUE", "DAYS", ""].map((col, index) => (
                <div key={index} style={{ fontFamily: "var(--font-body)", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", userSelect: "none", whiteSpace: "nowrap", textTransform: "uppercase" }}>{col}</div>
              ))}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: "center", padding: 40, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.12em" }}>Loading drawings...</div>
          ) : view === "KANBAN" ? (
            <DrawingKanban
              drawings={filtered}
              onStageChange={async (drawing, newStage) => {
                const data = { stage: newStage };
                if (newStage === "BFA" || newStage === "BFS") data.revision_number = (Number(drawing.revision_number) || 0) + 1;
                await base44.entities.Drawing.update(drawing.id, data);
                loadDrawings();
              }}
              onEdit={(drawing) => { setEditing(drawing); setModalOpen(true); }}
            />
          ) : displayDrawings.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 24px" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>[]</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>No drawings found</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginBottom: 18 }}>Upload a drawing set PDF to auto-populate the log</div>
              <button onClick={() => setUploadSetOpen(true)} style={{ ...btnPrimary, display: "inline-flex" }}>
                <Upload style={{ width: 12, height: 12 }} /> UPLOAD DRAWING SET
              </button>
            </div>
          ) : view === "THUMBNAIL" ? (
            <ThumbnailGrid drawingsBySet={drawingsBySet} setKeys={setKeys} onEdit={(drawing) => { setEditing(drawing); setModalOpen(true); }} onAnnotate={openAnnotations} navigate={navigate} createPageUrl={createPageUrl} />
          ) : view === "SCHEDULE" ? (
            <ScheduleView setKeys={setKeys} drawingsBySet={drawingsBySet} isOverdueDrawing={isOverdueDrawing} />
          ) : (
            setKeys.map((setKey) => (
              <DrawingSetGroup
                key={setKey}
                setKey={setKey}
                setDrawings={drawingsBySet[setKey]}
                collapsed={!!collapsedSets[setKey]}
                onToggleCollapse={(key) => setCollapsedSets((prev) => ({ ...prev, [key]: !prev[key] }))}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onSelectAll={selectAll}
                onDeselectAll={deselectAll}
                onEdit={(drawing) => { setEditing(drawing); setModalOpen(true); }}
                onDelete={setDeleteTarget}
                onAdvance={advanceStage}
                onOpenApproval={openApprovalModal}
                onOpenHistory={(drawingSet) => setHistoryPanel(drawingSet)}
                onNewRevision={(drawingSet) => openNewRevision(drawingSet, setKey)}
                drawingSetRecord={drawingSets.find((drawingSet) => drawingSet.set_name === setKey)}
                allFilteredArr={allFilteredArr}
                onAnnotate={openAnnotations}
                isOverdueDrawing={isOverdueDrawing}
                daysUntilDue={daysUntilDue}
              />
            ))
          )}
        </div>
      </div>

      <DrawingFormModal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} onSave={handleSave} drawing={editing} projects={projects} nextId={nextId} />
      <DeleteDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="Delete Drawing" description={`Delete ${deleteTarget?.sheet_number}?`} />
      <DeleteDialog open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} onConfirm={handleBulkDelete} title={`Delete ${selectedIds.size} drawings?`} description="This cannot be undone." />
      <DrawingSetUploadModal open={uploadSetOpen} onClose={() => setUploadSetOpen(false)} onComplete={() => { loadDrawings(); setUploadSetOpen(false); }} activeProject={activeProject} onNewRevision={() => { setUploadSetOpen(false); setRevisionPreselectedSet(null); setRevisionUploadOpen(true); }} />
      <RevisionUploadModal open={revisionUploadOpen} onClose={() => { setRevisionUploadOpen(false); setRevisionPreselectedSet(null); }} onComplete={() => { loadDrawings(); setRevisionUploadOpen(false); setRevisionPreselectedSet(null); }} activeProject={activeProject} preSelectedSet={revisionPreselectedSet} drawingSets={drawingSets} />
      {historyPanel && <RevisionHistoryPanel drawingSet={historyPanel} onClose={() => setHistoryPanel(null)} onUploadNewRevision={(drawingSet) => { setHistoryPanel(null); setRevisionPreselectedSet(drawingSet); setRevisionUploadOpen(true); }} />}
      {approvalModal && <SetApprovalModal open={!!approvalModal} onClose={() => setApprovalModal(null)} setName={approvalModal.setName} sheetCount={approvalModal.sheetCount} existingRevision={approvalModal.existingRevision} onConfirm={handleApprovalConfirm} saving={savingApproval} />}
    </div>
  );
}
