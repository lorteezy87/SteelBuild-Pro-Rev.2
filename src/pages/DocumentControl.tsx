/**
 * DocumentControl — standalone intake desk for incoming construction documents.
 *
 * Drop a drawing PDF and get the Document Control read on it BEFORE it is
 * logged, transmitted or released: the five title-block fields, where each
 * sheet sits in the project's Master Document Register, what changed against
 * the sheet of record, the seal / signature state, and the database-ready
 * ingestion payload.
 *
 * The page is READ-ONLY on purpose. It uploads nothing and writes nothing —
 * extraction happens in the browser. It is the place to answer "what is this
 * document and is it safe to accept" without the answer being an irreversible
 * act. Logging a revision into a set is still the revision-upload wizard's job.
 *
 * Its register scope is the whole project, which is what makes it different
 * from the wizard: the wizard asks "is this sheet in THIS set", this page asks
 * "is this sheet anywhere on this job".
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { FileUp, Loader2, RefreshCw } from "lucide-react";
import { entities } from "@/api/supabaseClient";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useProjectId } from "@/hooks/useProjectId";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/services/permissions";
import { isPdfFile } from "@/lib/drawingUploadUtils";
import { extractSheetsFromPdf, type PdfExtractionStatus } from "@/lib/pdfSheetExtractor";
import { readPdfPageTexts } from "@/lib/pdfPageText";
import { readPdfPageCount } from "@/lib/docControl/pdfPageCount";
import { hubHref } from "@/pages/drawingSubmittalHub/hubLinks";
import { buildDocControlRecord, nextActionForRecord, normalizeCallouts, toMdrEntry, type DocControlRecord, type MdrEntry } from "@/lib/docControl";
import DocControlReviewPanel, {
  useDocControlAttestations,
} from "@/components/drawings/DocControlReviewPanel";
import type { RevisionUploadHandoffProps } from "@/components/drawings/revisionUploadHandoff";
const RevisionUploadModal = lazy(() => import("@/components/drawings/RevisionUploadModal")) as unknown as ComponentType<RevisionUploadHandoffProps>;

type DrawingRow = {
  id?: string | null;
  sheet_number?: string | null;
  title?: string | null;
  revision_number?: string | null;
  drawing_set_name?: string | null;
  drawing_set_id?: string | null;
  project_id?: string | null;
  stage?: string | null;
  is_superseded?: boolean | null;
  callouts?: unknown;
  extracted_text?: string | null;
};

type DrawingSetRow = {
  id?: string | null;
  set_name?: string | null;
  project_id?: string | null;
  revision?: string | null;
  [key: string]: unknown;
};

type ManualTitleBlock = {
  projectName?: string;
  sheetNumber?: string;
  revision?: string;
  issueDate?: string;
  authorizingEngineer?: string;
};

type ExtractionState = {
  setMeta: {
    projectName?: string;
    revision?: string;
    issueDate?: string;
    issuedBy?: string;
    authorizingEngineer?: string;
  } | null;
  sheets: Array<{
    sheetNumber?: string;
    sheetTitle?: string;
    revision?: string;
    date?: string;
    pdfPage?: unknown;
    extractedText?: string;
    callouts?: unknown;
    manual?: ManualTitleBlock;
  }>;
  scanned: boolean;
  extractionFailed?: boolean;
  pageTexts: Record<number, string>;
  fileName: string;
};

type InterruptedReview = {
  version: 1;
  projectId: string;
  reviewerId: string;
  savedAt: number;
  fileName: string;
  fileSize: number;
  partialSave?: boolean;
  saveAttempted?: boolean;
  sheets: Array<{ sheetNumber: string; pdfPage: number | null; revision: string | null; seal: string | null; signature: string | null }>;
};

function reviewStorageKey(projectId: string, reviewerId: string): string {
  return `sbp:doc-control-review:${encodeURIComponent(projectId)}:${encodeURIComponent(reviewerId)}`;
}

function readInterruptedReview(projectId: string | null, reviewerId: string): InterruptedReview | null {
  if (!projectId || !reviewerId || typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(reviewStorageKey(projectId, reviewerId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as InterruptedReview;
    if (draft.version !== 1 || draft.projectId !== projectId || draft.reviewerId !== reviewerId ||
        !Number.isFinite(draft.savedAt) || Date.now() - draft.savedAt > 24 * 60 * 60 * 1000 ||
        typeof draft.fileName !== "string" || !Array.isArray(draft.sheets)) return null;
    return draft;
  } catch {
    return null;
  }
}

export default function DocumentControl() {
  const projectId = useProjectId();
  return <DocumentControlProject key={projectId ?? "no-project"} projectId={projectId} />;
}

function DocumentControlProject({ projectId }: { projectId: string | null }) {
  const navigate = useNavigate();
  const { activeProject: activeProjectRaw } = useProjectContext();
  const activeProject = activeProjectRaw as { id?: string | null; name?: string | null } | null;
  const { can } = usePermissions();
  const canEditShopDrawings = can("edit", "drawing");
  const { user } = useAuth();
  const reviewerName = user?.full_name || user?.email || "";
  const reviewerId = user?.id || user?.email || "";

  const [phase, setPhase] = useState<"idle" | "reading" | "done" | "error">("idle");
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [extraction, setExtraction] = useState<ExtractionState | null>(null);
  const [source, setSource] = useState<"shop" | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourcePdfUrl, setSourcePdfUrl] = useState<string | null>(null);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionSaved, setRevisionSaved] = useState(false);
  const [partialSave, setPartialSave] = useState(false);
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");
  const [pdfPageCount, setPdfPageCount] = useState<number | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualError, setManualError] = useState("");
  const [manual, setManual] = useState({ pdfPage: "1", sheetNumber: "", sheetTitle: "", revision: "", issueDate: "", projectName: "", authorizingEngineer: "" });
  const [interruptedReview, setInterruptedReview] = useState<InterruptedReview | null>(() => readInterruptedReview(projectId, reviewerId));

  useEffect(() => {
    if (!sourceFile || typeof URL.createObjectURL !== "function") {
      setSourcePdfUrl(null);
      return;
    }
    const url = URL.createObjectURL(sourceFile);
    setSourcePdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sourceFile]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const intakeGeneration = useRef(0);

  const registerQuery = useQuery({
    queryKey: ["doc-control-register", projectId],
    enabled: !!projectId,
    staleTime: 60_000,
    queryFn: async (): Promise<DrawingRow[]> => {
      const rows = await entities.Drawing.filterAll({ project_id: projectId }, "id");
      return Array.isArray(rows) ? (rows as DrawingRow[]) : [];
    },
  });

  const drawingSetsQuery = useQuery({
    queryKey: ["doc-control-shop-sets", projectId],
    enabled: !!projectId,
    staleTime: 60_000,
    queryFn: async (): Promise<DrawingSetRow[]> => {
      const sets = await entities.DrawingSet.filterAll({ project_id: projectId }, "id");
      return Array.isArray(sets) ? sets as DrawingSetRow[] : [];
    },
  });

  const rows = useMemo(() => registerQuery.data ?? [], [registerQuery.data]);

  const register = useMemo<MdrEntry[]>(
    () => rows.filter((row) => !row?.is_superseded).map(toMdrEntry),
    [rows],
  );

  // filterAll pages to completion and throws on an incomplete page; a failed
  // query cannot establish that a sheet is new or identify a unique set.
  const registerComplete = registerQuery.isSuccess;

  const { attestationsBySheetNumber, attest, resetAttestations } = useDocControlAttestations(reviewerName);

  const records = useMemo(() => {
    if (!extraction) return [];
    return extraction.sheets.map((sheet) => {
      const pdfPage = Number(sheet.pdfPage);
      const pageText = Number.isFinite(pdfPage) ? extraction.pageTexts[pdfPage] ?? null : null;
      const sheetKey = String(sheet.sheetNumber ?? "").trim();
      return buildDocControlRecord({
        projectId,
        titleBlock: {
          scanned: extraction.scanned,
          setMeta: extraction.setMeta,
          manual: sheet.manual,
          sheet: {
            sheetNumber: sheet.sheetNumber ?? "",
            revision: sheet.revision ?? "",
            date: sheet.date ?? "",
          },
        },
        attestationSource: { scanned: extraction.scanned, pageText },
        attestationOverrides: sheetKey ? attestationsBySheetNumber[sheetKey] : undefined,
        register,
        registerComplete,
        incoming: {
          title: sheet.sheetTitle ?? null,
          // The sheet's OWN text from the extractor — the same column-aware
          // line format the register stores — so the diff compares like with
          // like. Note this is NOT `pageTexts` below: that copy is whitespace-
          // collapsed for seal detection and would report every sheet as
          // wholly rewritten if it were diffed against a stored page.
          extractedText: typeof sheet.extractedText === "string" ? sheet.extractedText : null,
          callouts: normalizeCallouts(sheet.callouts),
        },
      });
    });
  }, [extraction, projectId, register, registerComplete, attestationsBySheetNumber]);

  const sourcePages = useMemo(() => Object.fromEntries(
    (extraction?.sheets ?? [])
      .filter((sheet) => String(sheet.sheetNumber ?? "").trim() && Number.isInteger(Number(sheet.pdfPage)))
      .map((sheet) => [String(sheet.sheetNumber).trim(), Number(sheet.pdfPage)]),
  ), [extraction]);

  const handoff = useMemo(() => resolveShopRevisionTarget(
    records,
    rows,
    drawingSetsQuery.data ?? [],
    registerComplete,
    drawingSetsQuery.isSuccess,
    projectId,
  ), [records, rows, drawingSetsQuery.data, drawingSetsQuery.isSuccess, registerComplete, projectId]);

  useEffect(() => {
    if (!projectId || !reviewerId || !sourceFile || !extraction || revisionSaved || typeof sessionStorage === "undefined") return;
    const draft: InterruptedReview = {
      version: 1,
      projectId,
      reviewerId,
      savedAt: Date.now(),
      fileName: sourceFile.name,
      fileSize: sourceFile.size,
      partialSave,
      saveAttempted,
      sheets: records.map((record, index) => ({
        sheetNumber: record.titleBlock.sheetNumber.value || "unidentified",
        pdfPage: Number.isInteger(Number(extraction.sheets[index]?.pdfPage)) ? Number(extraction.sheets[index].pdfPage) : null,
        revision: record.titleBlock.revisionNumber.value,
        seal: record.attestations.stamp.provenance === "human" ? record.attestations.stamp.state : null,
        signature: record.attestations.signature.provenance === "human" ? record.attestations.signature.state : null,
      })),
    };
    try { sessionStorage.setItem(reviewStorageKey(projectId, reviewerId), JSON.stringify(draft)); } catch { /* Storage can be disabled. The in-page review remains available. */ }
  }, [projectId, reviewerId, sourceFile, extraction, records, revisionSaved, partialSave, saveAttempted]);

  const discardInterruptedReview = () => {
    if (projectId && reviewerId && typeof sessionStorage !== "undefined") {
      try { sessionStorage.removeItem(reviewStorageKey(projectId, reviewerId)); } catch { /* Ignore unavailable storage. */ }
    }
    setInterruptedReview(null);
  };

  const runIntake = useCallback(async (file: File) => {
    const generation = ++intakeGeneration.current;
    const isCurrent = () => intakeGeneration.current === generation;
    setErrorText("");
    if (!isPdfFile(file)) {
      setExtraction(null);
      setSourceFile(null);
      setPdfPageCount(null);
      setPhase("error");
      setErrorText("That is not a PDF. Document Control reads drawing PDFs.");
      return;
    }

    setPhase("reading");
    setStatusText("Reading the document…");
    setExtraction(null);
    setSourceFile(file);
    setPdfPageCount(null);
    setPartialSave(false);
    setSaveAttempted(false);
    setSaveNotice("");
    setInterruptedReview(null);
    setManualOpen(false);
    resetAttestations();

    try {
      // Page text first: it is local, and if the language-model call is
      // rate-limited we have still read something.
      const pageTexts = await readPdfPageTexts(file);
      if (!isCurrent()) return;

      const result = await extractSheetsFromPdf(file, {
        onStatus: (status: PdfExtractionStatus) => {
          if (!isCurrent()) return;
          if (status.phase === "rate-limit-wait") {
            setStatusText(`Rate limited — retrying in ${status.remainingSec}s…`);
          } else {
            setStatusText("Reading title blocks…");
          }
        },
      });
      if (!isCurrent()) return;
      // The extractor already parsed the PDF in the normal path. Only re-open
      // it when extraction stopped before it could report the page count.
      const pageCount = Number.isInteger(result?.pageCount) && (result?.pageCount ?? 0) > 0
        ? result.pageCount!
        : await readPdfPageCount(file);
      if (!isCurrent()) return;
      setPdfPageCount(pageCount);

      if (result?.extractFailed) {
        setPhase("error");
        setErrorText(result.error || "Could not read this PDF.");
        setExtraction({ setMeta: null, sheets: [], scanned: true, extractionFailed: true, pageTexts, fileName: file.name });
        return;
      }

      setExtraction({
        setMeta: result?.setMeta ?? null,
        sheets: Array.isArray(result?.sheets) ? result.sheets : [],
        scanned: result?.scanned === true,
        pageTexts,
        fileName: file.name,
      });
      setStatusText("");
      setPhase("done");
    } catch (err) {
      if (!isCurrent()) return;
      const pageCount = await readPdfPageCount(file);
      if (!isCurrent()) return;
      setPdfPageCount(pageCount);
      setPhase("error");
      setErrorText((err as Error)?.message || "Could not read this PDF.");
      setExtraction({ setMeta: null, sheets: [], scanned: true, extractionFailed: true, pageTexts: {}, fileName: file.name });
    }
  }, [resetAttestations]);

  const saveManualSheet = () => {
    const pdfPage = Number(manual.pdfPage);
    if (!Number.isInteger(pdfPage) || pdfPage < 1 || !manual.sheetNumber.trim()) {
      setManualError("Enter a sheet number and a positive source PDF page.");
      return;
    }
    if (!pdfPageCount) {
      setManualError("The PDF page count could not be verified. Reopen a readable PDF before saving a keyed sheet.");
      return;
    }
    if (pdfPage > pdfPageCount) {
      setManualError(`This PDF has only ${pdfPageCount} page${pdfPageCount === 1 ? "" : "s"}. Choose a source page in the file.`);
      return;
    }
    const manualValues: ManualTitleBlock = Object.fromEntries(
      (["projectName", "sheetNumber", "revision", "issueDate", "authorizingEngineer"] as const)
        .filter((key) => manual[key].trim())
        .map((key) => [key, manual[key].trim()]),
    );
    setExtraction((current) => {
      if (!current) return current;
      const sheet = {
        sheetNumber: manual.sheetNumber.trim(),
        sheetTitle: manual.sheetTitle.trim(),
        revision: manual.revision.trim(),
        date: manual.issueDate.trim(),
        pdfPage,
        manual: manualValues,
      };
      const sheets = current.sheets.filter((existing) => Number(existing.pdfPage) !== pdfPage);
      return { ...current, sheets: [...sheets, sheet].sort((a, b) => Number(a.pdfPage) - Number(b.pdfPage)) };
    });
    setManualError("");
    setManualOpen(false);
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) void runIntake(file);
  };

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Clear the input so re-picking the same file fires change again.
    event.target.value = "";
    if (file) void runIntake(file);
  };

  const blockers = records.filter((r) => r.disposition === "hold").length;
  const nextActions = useMemo(
    () => records.map((record) => ({
      sheetNumber: record.titleBlock.sheetNumber.value || "Unidentified sheet",
      action: nextActionForRecord(record, registerComplete),
    })),
    [records, registerComplete],
  );

  return (
    <div style={pageStyle}>
      <div style={headerRowStyle}>
        <div>
          <h1 style={titleStyle}>Document Control</h1>
          <p style={subtitleStyle}>
            Review a shop drawing before intake. This preflight reads locally; only the controlled
            upload workflow can save a revision. GC issuances use their own register.
          </p>
        </div>
        {extraction && (
          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={() => {
              intakeGeneration.current++;
              setExtraction(null);
              setSourceFile(null);
              setPdfPageCount(null);
              setSource(null);
              setPhase("idle");
              setErrorText("");
              setRevisionSaved(false);
              setPartialSave(false);
              setSaveAttempted(false);
              setSaveNotice("");
              discardInterruptedReview();
              resetAttestations();
            }}
          >
            <RefreshCw size={12} aria-hidden="true" /> New document
          </button>
        )}
      </div>

      {!projectId && (
        <div style={noticeStyle}>
          Pick a project first — a sheet number means nothing without a register to place it in.
        </div>
      )}

      {revisionSaved && <div role="status" style={noticeStyle}>Revision upload completed. Refresh the register to review its current state.</div>}
      {saveNotice && <div role="alert" style={noticeStyle}>{saveNotice}</div>}

      {interruptedReview && !extraction && (
        <section aria-label="Unfinished Document Control review" style={noticeStyle}>
          <strong style={{ color: "var(--text-primary)" }}>Unfinished review: {interruptedReview.fileName}</strong>
          <p style={{ margin: "6px 0" }}>{interruptedReview.saveAttempted
            ? "A revision upload was started but not confirmed complete. Inspect the live register before retrying; the PDF is not stored here, so reselect it and reconfirm the marks."
            : "No drawing was saved. The PDF is not stored here; reselect the PDF and reconfirm the marks before continuing."}</p>
          {interruptedReview.sheets.map((sheet, index) => (
            <div key={`${sheet.sheetNumber}-${index}`} style={monoStyle}>
              {sheet.sheetNumber}{sheet.pdfPage ? ` · PDF page ${sheet.pdfPage}` : ""}{sheet.revision ? ` · revision ${sheet.revision}` : ""}
              {sheet.seal ? `: seal marked ${sheet.seal}` : ""}{sheet.signature ? ` · signature marked ${sheet.signature}` : ""}
            </div>
          ))}
          <button type="button" style={{ ...secondaryButtonStyle, marginTop: 8 }} onClick={discardInterruptedReview}>Discard review note</button>
        </section>
      )}

      {projectId && !source && (
        <section aria-label="Choose incoming document source" style={sourceChoiceStyle}>
          <div style={monoStyle}>What arrived?</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            <button type="button" style={sourceButtonStyle} onClick={() => setSource("shop")}>Shop drawing or revision</button>
            <button type="button" style={sourceButtonStyle} onClick={() => navigate(hubHref("gc"), { state: { gcPdfIntake: true } })}>GC-issued drawing or document</button>
          </div>
          <p style={{ ...subtitleStyle, marginTop: 8 }}>Equal sheet numbers in these two sources do not identify the same record.</p>
        </section>
      )}

      {registerQuery.isError && (
        <div role="alert" style={noticeStyle}>Drawing register read failed: {(registerQuery.error as Error)?.message || "reload before comparing sheets"}</div>
      )}
      {drawingSetsQuery.isError && (
        <div role="alert" style={noticeStyle}>Shop set list read failed: {(drawingSetsQuery.error as Error)?.message || "reload before choosing a target"}</div>
      )}

      {projectId && source === "shop" && !extraction && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a drawing PDF to run Document Control"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click();
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          style={{
            ...dropZoneStyle,
            borderColor: dragging ? "var(--accent)" : "var(--divider)",
            background: dragging ? "var(--hover-bg)" : "transparent",
          }}
        >
          {phase === "reading" ? (
            <>
              <Loader2 size={20} aria-hidden="true" />
              <div style={dropTitleStyle}>{statusText || "Reading…"}</div>
              <div style={dropHintStyle}>
                Title blocks are read by the extractor, which is rate limited — a large set can take
                a minute.
              </div>
            </>
          ) : (
            <>
              <FileUp size={20} aria-hidden="true" />
              <div style={dropTitleStyle}>Drop a drawing PDF</div>
              <div style={dropHintStyle}>
                {registerQuery.isError
                  ? "Register unavailable. Retry before comparing sheets."
                  : registerQuery.isLoading
                  ? "Loading the register…"
                  : `Checked against ${register.length} live sheet${register.length === 1 ? "" : "s"} on this project.`}
              </div>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={onPick}
            style={{ display: "none" }}
          />
        </div>
      )}

      {phase === "error" && errorText && (
        <div style={{ ...noticeStyle, borderColor: "var(--status-error)" }}>{errorText}</div>
      )}

      {extraction && (
        <>
          <div style={fileRowStyle}>
            <span style={monoStyle}>{extraction.fileName}</span>
            <span style={{ ...monoStyle, color: "var(--text-muted)" }}>
              {records.length} sheet{records.length === 1 ? "" : "s"}
            </span>
            {extraction.scanned && !extraction.extractionFailed && (
              <span style={{ ...monoStyle, color: "var(--status-warning-bright)" }}>
                image-only — nothing could be read from the text layer
              </span>
            )}
            {!registerComplete && (
              <span style={{ ...monoStyle, color: "var(--status-warning-bright)" }}>
                register unavailable or incomplete — a miss does not mean the sheet is new
              </span>
            )}
            {blockers > 0 && (
              <span style={{ ...monoStyle, color: "var(--status-error-bright)" }}>
                {blockers} on hold
              </span>
            )}
          </div>

          {(extraction.scanned || extraction.extractionFailed) && (
            <section aria-label="Manual PDF review" style={{ ...noticeStyle, marginBottom: 12 }}>
              <div>Text extraction could not place every title block. Keep the source PDF open and key each unread sheet from its numbered PDF page.</div>
              <button type="button" style={{ ...secondaryButtonStyle, marginTop: 8 }} onClick={() => setManualOpen((open) => !open)}>Add sheet manually</button>
              {manualOpen && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8, marginTop: 10 }}>
                  <label>Source PDF page<input aria-label="Source PDF page" type="number" min="1" value={manual.pdfPage} onChange={(event) => setManual((value) => ({ ...value, pdfPage: event.target.value }))} /></label>
                  <label>Sheet number<input aria-label="Manual sheet number" value={manual.sheetNumber} onChange={(event) => setManual((value) => ({ ...value, sheetNumber: event.target.value }))} /></label>
                  <label>Sheet title<input aria-label="Manual sheet title" value={manual.sheetTitle} onChange={(event) => setManual((value) => ({ ...value, sheetTitle: event.target.value }))} /></label>
                  <label>Revision<input aria-label="Manual revision" value={manual.revision} onChange={(event) => setManual((value) => ({ ...value, revision: event.target.value }))} /></label>
                  <label>Issue date<input aria-label="Manual issue date" placeholder="MM/DD/YYYY" value={manual.issueDate} onChange={(event) => setManual((value) => ({ ...value, issueDate: event.target.value }))} /></label>
                  <label>Project<input aria-label="Manual project name" value={manual.projectName} onChange={(event) => setManual((value) => ({ ...value, projectName: event.target.value }))} /></label>
                  <label>Authorizing engineer<input aria-label="Manual authorizing engineer" value={manual.authorizingEngineer} onChange={(event) => setManual((value) => ({ ...value, authorizingEngineer: event.target.value }))} /></label>
                  <div style={{ alignSelf: "end" }}><button type="button" style={secondaryButtonStyle} onClick={saveManualSheet}>Save reviewed sheet</button></div>
                  {manualError && <div role="alert" style={{ color: "var(--status-error-bright)" }}>{manualError}</div>}
                </div>
              )}
            </section>
          )}

          {records.length === 0 ? (
            <div style={noticeStyle}>
              No sheets were identified in this PDF. If it is a scan, the title blocks have to be
              keyed in by hand.
            </div>
          ) : (
            <>
              <DocControlReviewPanel records={records} onAttest={attest} sourcePages={sourcePages} sourcePdfUrl={sourcePdfUrl} />
              {records.some((record) => record.register.status === "revision-of-record") && handoff.reason && (
                <div role="alert" style={noticeStyle}>{handoff.reason}</div>
              )}
              <section aria-label="Document Control next actions" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                <div style={{ ...monoStyle, color: "var(--text-muted)" }}>Next actions — reviewed handoff</div>
                {nextActions.map(({ sheetNumber, action }, index) => (
                  <div key={`${sheetNumber}-${index}`} aria-label={`Next action for ${sheetNumber}`} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--divider)", background: "var(--hover-bg)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ minWidth: 180, flex: 1 }}>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{action.label}</div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{action.detail}</div>
                    </div>
                    {action.href ? (
                      <button
                        type="button"
                        style={secondaryButtonStyle}
                        disabled={action.kind === "start_revision_upload" && (!handoff.set || !canEditShopDrawings || !sourceFile)}
                        title={action.kind === "start_revision_upload" ? handoff.reason || "Review the selected set before applying any revision" : undefined}
                        onClick={() => {
                          if (action.kind === "start_revision_upload") {
                            setSaveAttempted(true);
                            setRevisionOpen(true);
                          }
                          else if (action.href) navigate(action.href);
                        }}
                      >
                        {action.label}
                      </button>
                    ) : (
                      <span style={{ ...monoStyle, color: "var(--status-warning-bright)" }}>Human review required</span>
                    )}
                  </div>
                ))}
              </section>
            </>
          )}
        </>
      )}
      {revisionOpen && handoff.set && sourceFile && projectId && (
        <Suspense fallback={<div role="status" style={noticeStyle}>Opening revision review…</div>}>
          <RevisionUploadModal
            open
            onClose={() => {
              setRevisionOpen(false);
              if (revisionSaved) {
                setExtraction(null);
                setSourceFile(null);
                setPdfPageCount(null);
                setPhase("idle");
                resetAttestations();
              }
              if (partialSave || revisionSaved) {
                void registerQuery.refetch();
                void drawingSetsQuery.refetch();
              }
            }}
            onComplete={(result: { complete?: boolean; failed?: number; historyFailed?: number; setWriteFailed?: boolean }) => {
              if (result?.complete !== true) {
                setPartialSave(true);
                const failures = [
                  result?.setWriteFailed ? "set header write failed" : null,
                  result?.failed ? `${result.failed} sheet write(s) failed` : null,
                  result?.historyFailed ? `${result.historyFailed} history write(s) failed` : null,
                ].filter(Boolean).join("; ") || "save outcome was incomplete";
                setSaveNotice(`Partial revision upload: ${failures}. Inspect the live register before retrying; your review remains available.`);
                return;
              }
              setRevisionSaved(true);
              setSaveNotice("");
              discardInterruptedReview();
            }}
            activeProject={{ ...activeProject, id: projectId }}
            preSelectedSet={handoff.set}
            drawingSets={drawingSetsQuery.data ?? []}
            initialPdfFile={sourceFile}
            initialAttestations={attestationsBySheetNumber}
            initialReview={{
              sourcePages,
              sheets: extraction?.sheets ?? [],
              setMeta: extraction?.setMeta ?? null,
              scanned: extraction?.scanned === true,
              revisionLabel: oneObservedValue(records.map((record) => record.titleBlock.revisionNumber.value)),
              issueDate: oneObservedValue(records.map((record) => record.titleBlock.issueDate.value)),
              issuedBy: extraction?.setMeta?.issuedBy ?? "",
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

function oneObservedValue(values: Array<string | null>): string {
  const normalized = [...new Set(values.filter((value): value is string => !!value))];
  return normalized.length === 1 && values.every((value) => value === normalized[0]) ? normalized[0] : "";
}

/** Resolve one exact shop-set target. A different set or incomplete read stops the handoff. */
function resolveShopRevisionTarget(
  records: DocControlRecord[],
  rows: DrawingRow[],
  sets: DrawingSetRow[],
  registerComplete: boolean,
  setsComplete: boolean,
  projectId: string | null,
): { set: DrawingSetRow | null; reason: string } {
  const fail = (reason: string): { set: DrawingSetRow | null; reason: string } => ({ set: null, reason });
  if (!projectId || !registerComplete || !setsComplete) return fail("The project register or set list is incomplete. Reload before choosing a revision target.");
  if (!records.length) return fail("Review at least one identified sheet first.");
  if (records.some((record) => record.disposition === "hold")) return fail("Resolve the held sheet or missing mark before starting a revision upload.");
  if (records.some((record) => !["revision-of-record", "new-to-register"].includes(record.register.status))) {
    return fail("An unidentified or ambiguous sheet must be resolved before matching a shop set.");
  }
  if (records.some((record) => record.register.status === "new-to-register")) {
    return fail("A new sheet in this PDF has no proven shop set. Assign it explicitly through Upload Set before handing off a revision.");
  }
  const incomingNumbers = records.map((record) => record.titleBlock.sheetNumber.value?.trim() ?? "");
  if (new Set(incomingNumbers).size !== incomingNumbers.length) return fail("The PDF repeats a sheet number. Resolve the duplicate before upload.");
  const matched = records.filter((record) => record.register.status === "revision-of-record");
  if (!matched.length) return fail("No existing shop sheet identifies a revision target. Use Upload Set for a new set.");
  const targets = matched.map((record) => {
    const row = rows.find((candidate) => candidate.id === record.register.matched?.id);
    if (!row || (row.project_id && row.project_id !== projectId)) return null;
    if (row.drawing_set_id) return sets.find((set) => set.id === row.drawing_set_id && (!set.project_id || set.project_id === projectId)) ?? null;
    const byName = sets.filter((set) => set.set_name && set.set_name === row.drawing_set_name && (!set.project_id || set.project_id === projectId));
    return byName.length === 1 ? byName[0] : null;
  });
  if (targets.some((set) => !set?.id)) return fail("A matched sheet has no unique shop drawing set. Resolve the set link in the register first.");
  if (new Set(targets.map((set) => set?.id)).size !== 1) return fail("This PDF matches different shop drawing sets. Split or resolve it before uploading a revision.");
  return { set: targets[0], reason: "" };
}

// ── styles — CSS variables only ──────────────────────────────────────
const pageStyle: React.CSSProperties = { padding: "16px 20px", maxWidth: 1100, margin: "0 auto" };

const headerRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
};

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  color: "var(--text-primary)",
  margin: 0,
};

const subtitleStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 12,
  color: "var(--text-secondary)",
  margin: "4px 0 0",
  maxWidth: 620,
};

const monoStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-secondary)",
};

const noticeStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 12,
  color: "var(--text-secondary)",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--divider)",
  background: "var(--hover-bg)",
  marginBottom: 12,
};

const sourceChoiceStyle: React.CSSProperties = {
  ...noticeStyle,
  padding: "16px 18px",
  background: "var(--bg-surface)",
};

const sourceButtonStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 12,
  fontWeight: 700,
  padding: "9px 14px",
  borderRadius: 7,
  border: "1px solid var(--divider)",
  background: "var(--hover-bg)",
  color: "var(--text-primary)",
  cursor: "pointer",
};

const dropZoneStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "40px 20px",
  borderRadius: 10,
  border: "1px dashed var(--divider)",
  color: "var(--text-secondary)",
  cursor: "pointer",
  marginBottom: 12,
};

const dropTitleStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text-primary)",
};

const dropHintStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 11,
  color: "var(--text-muted)",
  textAlign: "center",
  maxWidth: 420,
};

const fileRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 10,
};

const secondaryButtonStyle: React.CSSProperties = {
  ...monoStyle,
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--divider)",
  background: "transparent",
  color: "var(--text-secondary)",
  cursor: "pointer",
};
