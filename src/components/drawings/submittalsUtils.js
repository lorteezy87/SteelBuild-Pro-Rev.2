export const STAGES = ["Not Started", "OFA", "BFA", "OFS", "BFS", "FFF", "Released"];
export const STAGE_SEQUENCE = ["Not Started", "OFA", "BFA", "OFS", "BFS", "FFF", "Released"];
export const GRID = "32px 88px minmax(260px,1fr) 90px 56px 110px 76px 70px 74px 62px 118px";
export const UNASSIGNED_KEY = "__unassigned__";
export const monoFont = "'IBM Plex Mono', 'Space Grotesk', monospace";
export const displayFont = "'Space Grotesk', var(--font-display)";
export const bodyFont = "var(--font-body)";
export const VIEW_OPTIONS = ["TABLE", "THUMBNAIL", "KANBAN", "SCHEDULE", "CHARTS"];
export const PLACEHOLDER_SET_NAMES = new Set([
  "",
  "ungrouped",
  "individual drawings",
  "individual drawing",
  "misc",
  "misc drawings",
  "set name required",
  "unassigned",
]);

export const STAGE_CONFIG = {
  "Not Started": { color: "var(--text-muted)", bg: "var(--bg-hover)", short: "NOT STARTED", label: "Not Started" },
  OFA: { color: "var(--accent)", bg: "var(--accent-muted)", short: "OFA", label: "Out For Approval" },
  BFA: { color: "#8B5CF6", bg: "rgba(139,92,246,0.12)", short: "BFA", label: "Back From Approval" },
  OFS: { color: "var(--status-info)", bg: "var(--info-muted)", short: "OFS", label: "Out For Stamp" },
  BFS: { color: "#EC4899", bg: "rgba(236,72,153,0.12)", short: "BFS", label: "Back From Stamp" },
  FFF: { color: "var(--status-warning)", bg: "var(--warning-muted)", short: "FFF", label: "Fit For Fab" },
  Released: { color: "var(--status-success)", bg: "var(--success-muted)", short: "RELEASED", label: "Released" },
};

export const btnPrimary = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "0 12px",
  height: 30,
  borderRadius: 2,
  cursor: "pointer",
  background: "var(--accent)",
  border: "none",
  color: "#fff",
  fontFamily: monoFont,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

export const btnSecondary = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  padding: "0 10px",
  height: 30,
  borderRadius: 2,
  cursor: "pointer",
  background: "var(--bg-surface-high)",
  border: "1px solid var(--border-default)",
  color: "var(--text-secondary)",
  fontFamily: monoFont,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

export const compactSelect = {
  background: "var(--bg-surface-high)",
  border: "1px solid var(--border-default)",
  borderRadius: 2,
  padding: "0 8px",
  height: 28,
  color: "var(--text-secondary)",
  fontFamily: monoFont,
  fontSize: 11,
  cursor: "pointer",
  outline: "none",
};

export const compactHeaderBtn = {
  background: "var(--bg-surface-high)",
  border: "1px solid var(--border-default)",
  borderRadius: 2,
  padding: "0 8px",
  height: 22,
  cursor: "pointer",
  color: "var(--text-muted)",
  fontFamily: monoFont,
  fontSize: 7,
  letterSpacing: "0.08em",
  whiteSpace: "nowrap",
  display: "flex",
  alignItems: "center",
  gap: 4,
};

const PDF_JS_SRC = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDF_JS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const thumbnailCache = new Map();
const thumbnailPromiseCache = new Map();
let pdfLoaderPromise = null;
let thumbnailQueue = Promise.resolve();
const THUMBNAIL_QUEUE_DELAY_MS = 900;

export function ensurePdfJs() {
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

export async function generateThumbnail(fileUrl, drawingId, scale = 0.35) {
  if (thumbnailCache.has(drawingId)) return thumbnailCache.get(drawingId);
  if (thumbnailPromiseCache.has(drawingId)) return thumbnailPromiseCache.get(drawingId);
  await ensurePdfJs();
  if (!window.pdfjsLib) return null;
  const queuedPromise = thumbnailQueue.then(async () => {
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
    } finally {
      await new Promise((resolve) => window.setTimeout(resolve, THUMBNAIL_QUEUE_DELAY_MS));
      thumbnailPromiseCache.delete(drawingId);
    }
  });
  thumbnailPromiseCache.set(drawingId, queuedPromise);
  thumbnailQueue = queuedPromise.catch(() => null);
  return queuedPromise;
}

export function normalizeSetKey(value) {
  return (value || "").trim().toLowerCase();
}

export function normalizeAlphaNumeric(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizeFileUrlForMatch(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "").toLowerCase();
  } catch {
    return raw.split("?")[0].split("#")[0].replace(/\/+$/, "").toLowerCase();
  }
}

export function parseRevisionHistory(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return [parsed];
    return [];
  } catch {
    return [];
  }
}

function getAssignmentMapEntry(set) {
  return parseRevisionHistory(set?.revision_history).find((entry) => entry?.__assignment_map);
}

export function compareSetNames(a, b) {
  if (a === UNASSIGNED_KEY) return 1;
  if (b === UNASSIGNED_KEY) return -1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function getDrawingSetName(drawing, drawingSets = []) {
  const explicitSetName = drawing?.drawing_set_name?.trim();

  if (explicitSetName && !PLACEHOLDER_SET_NAMES.has(explicitSetName.toLowerCase())) {
    return explicitSetName;
  }

  const candidateSets = drawingSets.filter(
    (set) => set?.set_name && !PLACEHOLDER_SET_NAMES.has(String(set.set_name).trim().toLowerCase())
  );
  if (!candidateSets.length) return UNASSIGNED_KEY;

  const fileUrl = normalizeFileUrlForMatch(drawing?.file_url);
  const issueDate = String(drawing?.issue_date || "").trim();
  const revision = String(drawing?.revision_number ?? "").trim();
  const sheetNumber = normalizeAlphaNumeric(drawing?.sheet_number);
  const titleText = normalizeAlphaNumeric(drawing?.title);
  const drawingId = String(drawing?.id || "").trim();

  const assignmentMatch = candidateSets.filter((set) => {
    const assignmentEntry = getAssignmentMapEntry(set);
    if (!assignmentEntry) return false;
    const assignedIds = Array.isArray(assignmentEntry.drawing_ids) ? assignmentEntry.drawing_ids.map((id) => String(id)) : [];
    const assignedSheets = Array.isArray(assignmentEntry.sheet_numbers)
      ? assignmentEntry.sheet_numbers.map((sheet) => normalizeAlphaNumeric(sheet))
      : [];
    return (drawingId && assignedIds.includes(drawingId)) || (sheetNumber && assignedSheets.includes(sheetNumber));
  });
  if (assignmentMatch.length === 1) return assignmentMatch[0].set_name;

  const fileMatch = candidateSets.filter(
    (set) =>
      String(set.current_file_url || "").trim() &&
      normalizeFileUrlForMatch(set.current_file_url) === fileUrl
  );
  if (fileMatch.length === 1) return fileMatch[0].set_name;

  const revisionMatch = candidateSets.filter(
    (set) =>
      String(set.current_issue_date || "").trim() === issueDate &&
      String(set.current_revision ?? "").trim() === revision
  );
  if (revisionMatch.length === 1) return revisionMatch[0].set_name;

  const fuzzyMatch = candidateSets.filter((set) => {
    const setIssueDate = String(set.current_issue_date || "").trim();
    const setRevision = String(set.current_revision ?? "").trim();
    const sameIssueDate = issueDate && setIssueDate === issueDate;
    const sameRevision = revision && setRevision === revision;
    return sameIssueDate || sameRevision;
  });
  if (fuzzyMatch.length === 1) return fuzzyMatch[0].set_name;

  const sheetMatch = candidateSets.filter((set) => {
    const normalizedSetName = normalizeAlphaNumeric(set.set_name);
    if (!normalizedSetName) return false;
    return (
      (sheetNumber && (sheetNumber === normalizedSetName || sheetNumber.includes(normalizedSetName) || normalizedSetName.includes(sheetNumber))) ||
      (titleText && titleText.includes(normalizedSetName))
    );
  });
  if (sheetMatch.length === 1) return sheetMatch[0].set_name;

  if (candidateSets.length === 1) return candidateSets[0].set_name;

  return UNASSIGNED_KEY;
}

export function getStageTone(stage) {
  return STAGE_CONFIG[stage] || STAGE_CONFIG["Not Started"];
}

export function getNextStage(stage) {
  const index = STAGES.indexOf(stage);
  if (index < 0 || index >= STAGES.length - 1) return null;
  return STAGES[index + 1];
}

export function compareSheetNumbers(a, b) {
  return String(a?.sheet_number || "").localeCompare(String(b?.sheet_number || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function normalizeRevisionNumber(value, fallback = "0") {
  if (value == null || value === "") return fallback;
  return String(value).trim() || fallback;
}

export function incrementRevisionLabel(value) {
  const current = normalizeRevisionNumber(value, "0");
  if (/^\d+$/.test(current)) return String(Number(current) + 1);
  if (/^[A-Z]$/i.test(current)) {
    const code = current.toUpperCase().charCodeAt(0);
    return code >= 65 && code < 90 ? String.fromCharCode(code + 1) : `${current}-1`;
  }
  const numericTail = current.match(/^(.*?)(\d+)$/);
  if (numericTail) {
    const [, prefix, digits] = numericTail;
    return `${prefix}${String(Number(digits) + 1).padStart(digits.length, "0")}`;
  }
  return `${current} Rev 2`;
}

export function buildDrawingPayload(drawing, activeProject) {
  return {
    sheet_number: String(drawing.sheet_number || "").trim(),
    title: String(drawing.title || "").trim(),
    project_id: drawing.project_id || activeProject?.id || "",
    project_name: drawing.project_name || activeProject?.name || "",
    discipline: drawing.discipline || "",
    revision_number: normalizeRevisionNumber(drawing.revision_number),
    stage: drawing.stage || "Not Started",
    due_date: drawing.due_date || "",
    submitted_date: drawing.submitted_date || "",
    return_date: drawing.return_date || "",
    priority_flag: !!drawing.priority_flag,
    drawing_set_name: String(drawing.drawing_set_name || "").trim(),
    ifc_status: drawing.ifc_status || "",
    set_approval_status: drawing.set_approval_status || "",
    set_approval_revision: drawing.set_approval_revision || "",
    set_approved_by: drawing.set_approved_by || "",
    set_approved_date: drawing.set_approved_date || "",
    set_approval_notes: drawing.set_approval_notes || "",
    is_superseded: !!drawing.is_superseded,
    issue_date: drawing.issue_date || "",
    issued_by: drawing.issued_by || "",
    file_url: drawing.file_url || "",
  };
}

export function getDaysUntil(dateValue) {
  if (!dateValue) return null;
  return Math.ceil((new Date(dateValue) - new Date()) / 86400000);
}

export function isOverdueDrawingLocal(drawing) {
  if (!drawing?.due_date) return false;
  if (drawing.stage === "Released") return false;
  return new Date(drawing.due_date) < new Date();
}

export function getSetApprovalStatus(setDrawings) {
  const statuses = setDrawings.map((drawing) => drawing.set_approval_status).filter(Boolean);
  if (!statuses.length) return "open";
  if (statuses.every((status) => status === "approved")) return "approved";
  if (statuses.some((status) => status === "rejected")) return "rejected";
  if (statuses.some((status) => status === "pending")) return "pending";
  if (statuses.some((status) => status === "approved")) return "pending";
  return statuses[0] || "open";
}

export function getMostAdvancedStage(setDrawings) {
  const stageIndex = setDrawings.reduce((max, drawing) => {
    const idx = STAGE_SEQUENCE.indexOf(drawing.stage);
    return Math.max(max, idx);
  }, -1);
  return stageIndex >= 0 ? STAGE_SEQUENCE[stageIndex] : "Not Started";
}

export function getLatestSetRevision(setDrawings) {
  const latest = [...setDrawings]
    .map((drawing) => normalizeRevisionNumber(drawing.revision_number, ""))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    .at(-1);
  return latest || "0";
}

export function getSetDiscipline(setDrawings) {
  const disciplines = [...new Set(setDrawings.map((drawing) => drawing.discipline).filter(Boolean))];
  if (!disciplines.length) return null;
  return disciplines.length === 1 ? disciplines[0] : disciplines.join(" / ");
}

export function getSetDates(setDrawings) {
  const submitted = setDrawings.map((drawing) => drawing.submitted_date).filter(Boolean).sort().at(-1) || null;
  const returned = setDrawings.map((drawing) => drawing.return_date).filter(Boolean).sort().at(-1) || null;
  return { submitted, returned };
}

export function isSetUnsubmitted(setDrawings) {
  if (!setDrawings?.length) return false;

  const approvalStatus = getSetApprovalStatus(setDrawings);
  const allReleased = setDrawings.every((drawing) => drawing.stage === "Released");
  const hasSubmittedDate = setDrawings.some((drawing) => !!drawing.submitted_date);

  if (approvalStatus === "approved" || allReleased) return false;
  return !hasSubmittedDate;
}
