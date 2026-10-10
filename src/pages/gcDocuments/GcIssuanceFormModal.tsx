/**
 * GcIssuanceFormModal — log or edit one GC issuance.
 *
 * No <form> tag and no Radix Dialog (both are banned project-wide); the shared
 * design-system Modal owns the chrome and Escape handling.
 *
 * Deliberately NOT collecting a steel-impact disposition at log time. Logging
 * is "this arrived"; deciding whether it hits steel is a separate act by a
 * person who has read it, and defaulting that dropdown during intake is how
 * every issuance ends up silently marked "no impact".
 */

import { useEffect, useRef, useState } from "react";
import { Modal, Button } from "./dsPrimitives";
import { isPdfFile } from "@/lib/drawingUploadUtils";
import { assertUploadAllowed } from "@/lib/uploadValidation";
import { readPdfPageCount } from "@/lib/docControl/pdfPageCount";
import { extractSheetsFromPdf, type PdfExtractionResult } from "@/lib/pdfSheetExtractor";
import {
  GC_DOC_TYPES,
  GC_DOC_TYPE_HINTS,
  GC_DOC_TYPE_LABELS,
  GC_SET_CATEGORIES,
  GC_SET_CATEGORY_LABELS,
  coerceGcDocType,
  coerceGcSetCategory,
  type GcDocType,
} from "@/lib/gcDocuments/gcDocTypes";
import type { GcDrawingSetRow } from "./gcDocumentsPageDerive";
import { gcPdfSheetRows, gcPdfSuggestions, validateGcPdfSheets, type GcPdfSheetDraft } from "./gcPdfIntake";

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginBottom: 4,
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid var(--border-default)",
  background: "var(--bg-surface-low)",
  color: "var(--text-primary)",
  fontSize: 13,
  outline: "none",
};

export interface GcIssuanceFormValues {
  set_name: string;
  doc_type: GcDocType;
  doc_number: string;
  category: string;
  discipline: string;
  issued_by: string;
  issued_date: string;
  received_date: string;
  revision: string;
  description: string;
}

function toFormValues(initial: GcDrawingSetRow | null): GcIssuanceFormValues {
  return {
    set_name: String(initial?.set_name ?? ""),
    doc_type: coerceGcDocType(initial?.doc_type),
    doc_number: String(initial?.doc_number ?? ""),
    category: coerceGcSetCategory(initial?.category),
    discipline: String(initial?.discipline ?? ""),
    issued_by: String(initial?.issued_by ?? ""),
    issued_date: String(initial?.issued_date ?? ""),
    received_date: String(initial?.received_date ?? ""),
    revision: String(initial?.revision ?? ""),
    description: String(initial?.description ?? ""),
  };
}

export default function GcIssuanceFormModal({
  open,
  initial = null,
  initialSource = null,
  saving = false,
  onSave,
  onClose,
}: {
  open: boolean;
  initial?: GcDrawingSetRow | null;
  initialSource?: "pdf" | null;
  saving?: boolean;
  onSave: (values: Record<string, unknown>, intake?: { file: File | null; sheets: Array<Record<string, unknown>>; uploadedPath?: string; supersede: boolean }) => void | Promise<void>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<GcIssuanceFormValues>(() => toFormValues(initial));
  const [error, setError] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<"pdf" | "metadata" | null>(initial ? "metadata" : initialSource);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState<number | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfStatus, setPdfStatus] = useState<"idle" | "reading" | "review" | "manual">("idle");
  const [pdfNote, setPdfNote] = useState("");
  const [pdfSheets, setPdfSheets] = useState<GcPdfSheetDraft[]>([]);
  const [previewPage, setPreviewPage] = useState(1);
  const [reviewed, setReviewed] = useState(false);
  const [unmappedReviewed, setUnmappedReviewed] = useState(false);
  const [supersedePrior, setSupersedePrior] = useState(false);
  const [uploadedPath, setUploadedPath] = useState<string | undefined>();
  const [partialSetId, setPartialSetId] = useState<string | null>(null);
  const [creationUncertain, setCreationUncertain] = useState(false);
  const generation = useRef(0);
  const saveInFlight = useRef(false);

  // Re-seed whenever the modal opens or the target changes, so editing a
  // second issuance never shows the first one's values.
  useEffect(() => {
    if (open) {
      setValues(toFormValues(initial));
      setError(null);
      setSourceMode(initial ? "metadata" : initialSource);
      setPdfFile(null);
      setPdfPageCount(null);
      setPdfStatus("idle");
      setPdfNote("");
      setPdfSheets([]);
      setPreviewPage(1);
      setReviewed(false);
      setUnmappedReviewed(false);
      setSupersedePrior(false);
      setUploadedPath(undefined);
      setPartialSetId(null);
      setCreationUncertain(false);
      saveInFlight.current = false;
      generation.current += 1;
    }
  }, [open, initial, initialSource]);

  useEffect(() => {
    if (!pdfFile || typeof URL.createObjectURL !== "function") {
      setPdfUrl(null);
      return;
    }
    const url = URL.createObjectURL(pdfFile);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pdfFile]);

  const set = <K extends keyof GcIssuanceFormValues>(key: K, value: GcIssuanceFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const selectPdf = async (file: File | null) => {
    const current = ++generation.current;
    setPdfFile(null);
    setPdfPageCount(null);
    setPdfSheets([]);
    setPreviewPage(1);
    setReviewed(false);
    setUnmappedReviewed(false);
    setSupersedePrior(false);
    setUploadedPath(undefined);
    setPartialSetId(null);
    setCreationUncertain(false);
    setError(null);
    if (!file) { setPdfStatus("idle"); setPdfNote(""); return; }
    if (!isPdfFile(file)) {
      setPdfStatus("idle");
      setError("Choose a PDF issued by the GC or design team.");
      return;
    }
    try { assertUploadAllowed(file, "drawings"); }
    catch (uploadError) {
      setPdfStatus("idle");
      setError((uploadError as Error).message);
      return;
    }
    setPdfFile(file);
    setPdfStatus("reading");
    setPdfNote("Reading the source pages. Extracted fields will remain suggestions until you check them.");
    let result: PdfExtractionResult | null = null;
    try {
      result = await extractSheetsFromPdf(file);
    } catch { /* A scanned or rate-limited file can still be keyed manually. */ }
    if (generation.current !== current) return;
    const extractedCount = Number(result?.pageCount);
    const pageCount = Number.isInteger(extractedCount) && extractedCount > 0
      ? extractedCount
      : await readPdfPageCount(file);
    if (generation.current !== current) return;
    if (!pageCount) {
      setPdfStatus("manual");
      setError("The PDF page count could not be verified. Choose a readable PDF before saving.");
      return;
    }
    setPdfPageCount(pageCount);
    if (!result) {
      setPdfStatus("manual");
      setPdfNote("Extraction was unavailable. Continue with manual page mapping against the original PDF.");
      return;
    }
    try {
      if (generation.current !== current) return;
      if (result.extractFailed || result.scanned || !result.sheets.length) {
        setPdfStatus("manual");
        setPdfNote("No trustworthy title-block mapping was found. Use manual page mapping while viewing the source PDF.");
        setPdfSheets(result.extractFailed ? [] : gcPdfSuggestions(result, pageCount));
      } else {
        setPdfStatus("review");
        setPdfNote("Suggested title blocks. Compare every number, revision and page with the original PDF.");
        setPdfSheets(gcPdfSuggestions(result, pageCount));
      }
      const firstPage = Number(result.sheets[0]?.pdfPage);
      if (Number.isInteger(firstPage) && firstPage >= 1 && firstPage <= pageCount) setPreviewPage(firstPage);
    } catch {
      if (generation.current !== current) return;
      setPdfStatus("manual");
      setPdfNote("Extraction was unavailable. Continue with manual page mapping against the original PDF.");
    }
  };

  const updateSheet = (key: string, patch: Partial<GcPdfSheetDraft>) => {
    setPdfSheets((current) => current.map((sheet) => sheet.key === key ? { ...sheet, ...patch } : sheet));
    setReviewed(false);
    setUnmappedReviewed(false);
  };

  const handleSave = async () => {
    if (saveInFlight.current) return;
    // gc_drawing_sets_set_name_not_blank rejects a blank name at the database,
    // so catch it here rather than surfacing a raw constraint name.
    if (!values.set_name.trim()) {
      setError("Give the issuance a name — the database rejects a blank one.");
      return;
    }
    if (
      values.issued_date &&
      values.received_date &&
      values.received_date < values.issued_date
    ) {
      setError("Received date is before the issued date. Check the dates.");
      return;
    }
    if (!initial && !sourceMode) {
      setError("Choose PDF source or metadata only before logging this issuance.");
      return;
    }
    if (!initial && sourceMode === "pdf") {
      if (!pdfFile || pdfStatus === "reading") {
        setError("Choose a GC-issued PDF and wait for the source pages to finish reading.");
        return;
      }
      const sheetError = validateGcPdfSheets(pdfSheets, pdfPageCount, values.doc_type);
      if (sheetError) { setError(sheetError); return; }
      if (!reviewed) {
        setError("Check the source PDF and confirm the reviewed sheet/page mapping before saving.");
        return;
      }
      const coveredPages = new Set(pdfSheets.map((sheet) => Number(sheet.pdfPage)));
      if (coveredPages.size < pdfPageCount! && !unmappedReviewed) {
        setError("Review the remaining PDF pages and confirm no additional GC sheet rows are needed.");
        return;
      }
    }
    if (partialSetId || creationUncertain) {
      setError(partialSetId
        ? `Issuance ${partialSetId} already exists. Inspect its sheets in the register before trying again.`
        : "The create result could not be verified. Inspect the GC register before trying again.");
      return;
    }
    setError(null);
    // Empty strings become NULL: a blank date column must be unknown, not "".
    const setValues: Record<string, unknown> = {
      set_name: values.set_name.trim(),
      doc_type: values.doc_type,
      doc_number: values.doc_number.trim() || null,
      category: values.category,
      discipline: values.discipline.trim() || null,
      issued_by: values.issued_by.trim() || null,
      issued_date: values.issued_date || null,
      received_date: values.received_date || null,
      revision: values.revision.trim() || null,
      description: values.description.trim() || null,
    };
    if (!initial && sourceMode === "pdf" && pdfFile) {
      setValues.metadata = {
        intake_source: "reviewed_gc_pdf",
        source_file_name: pdfFile.name,
        source_page_count: pdfPageCount,
        mapped_sheet_count: pdfSheets.length,
        reviewed_at: new Date().toISOString(),
      };
    }
    saveInFlight.current = true;
    try {
      if (initial || sourceMode === "metadata") {
        await onSave(setValues);
      } else {
        await onSave(setValues, {
          file: pdfFile,
          sheets: gcPdfSheetRows(pdfSheets),
          uploadedPath,
          supersede: supersedePrior,
        });
      }
    } catch (saveError) {
      const issue = saveError as Error & { setId?: string; uploadedPath?: string; creationUncertain?: boolean };
      if (issue.uploadedPath) setUploadedPath(issue.uploadedPath);
      if (issue.setId) setPartialSetId(issue.setId);
      if (issue.creationUncertain) setCreationUncertain(true);
      setError(issue.setId
        ? `The issuance was created, but its sheet save did not finish. Record ${issue.setId} is in the register. Close this form and inspect it before retrying.`
        : issue.creationUncertain
          ? "The database create outcome is uncertain. The PDF reached private storage; inspect the GC register before trying again to avoid a duplicate."
        : issue.uploadedPath
          ? "The PDF reached private storage, but the issuance was not logged. Your next save will reuse that upload."
          : issue.message || "The issuance could not be saved.");
    } finally {
      saveInFlight.current = false;
    }
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="GC DOCUMENTS"
      title={initial ? "Edit issuance" : "Log issuance"}
      width={sourceMode === "pdf" ? 880 : 680}
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          {error && (
            <span role="alert" style={{ flex: 1, fontSize: 12, color: "var(--status-error)" }}>
              {error}
            </span>
          )}
          <Button variant="ghost" onClick={onClose} disabled={saving}>CANCEL</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving || !!partialSetId || creationUncertain || pdfStatus === "reading"}>
            {saving ? "SAVING…" : initial ? "SAVE" : "LOG ISSUANCE"}
          </Button>
        </div>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        {!initial && (
          <section aria-label="GC issuance source" style={{ padding: 12, border: "1px solid var(--border-default)", borderRadius: 8, background: "var(--bg-surface-low)" }}>
            <div style={labelStyle}>What arrived from the GC or design team?</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button type="button" className="sbd-btn" aria-pressed={sourceMode === "pdf"} onClick={() => { setSourceMode("pdf"); setError(null); }}>PDF source</button>
              <button type="button" className="sbd-btn" aria-pressed={sourceMode === "metadata"} disabled={!!uploadedPath || !!partialSetId || creationUncertain} onClick={() => { setSourceMode("metadata"); setError(null); }}>Metadata only</button>
            </div>
            <p style={{ margin: "8px 0 0", color: "var(--text-muted)", fontSize: 12 }}>
              GC issuances stay separate from shop drawings. Logging one does not approve a shop set or release steel.
            </p>
          </section>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <div>
            <label style={labelStyle} htmlFor="gc-doc-type">Document type</label>
            <select
              id="gc-doc-type"
              style={fieldStyle}
              value={values.doc_type}
              onChange={(e) => set("doc_type", coerceGcDocType(e.target.value))}
            >
              {GC_DOC_TYPES.map((t) => (
                <option key={t} value={t}>{GC_DOC_TYPE_LABELS[t]}</option>
              ))}
            </select>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.45 }}>
              {GC_DOC_TYPE_HINTS[values.doc_type]}
            </p>
          </div>
          <div>
            <label style={labelStyle} htmlFor="gc-doc-number">Their number</label>
            <input
              id="gc-doc-number"
              style={fieldStyle}
              value={values.doc_number}
              placeholder="ASI 012"
              onChange={(e) => set("doc_number", e.target.value)}
            />
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.45 }}>
              The issuing party&rsquo;s own reference. We never mint this.
            </p>
          </div>
        </div>

        <div>
          <label style={labelStyle} htmlFor="gc-set-name">Name</label>
          <input
            id="gc-set-name"
            style={fieldStyle}
            value={values.set_name}
            placeholder="ASI 012 — Canopy framing revisions"
            onChange={(e) => set("set_name", e.target.value)}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <div>
            <label style={labelStyle} htmlFor="gc-issued-date">Issued date</label>
            <input
              id="gc-issued-date"
              type="date"
              style={fieldStyle}
              value={values.issued_date}
              onChange={(e) => set("issued_date", e.target.value)}
            />
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
              The date printed on the document.
            </p>
          </div>
          <div>
            <label style={labelStyle} htmlFor="gc-received-date">Received date</label>
            <input
              id="gc-received-date"
              type="date"
              style={fieldStyle}
              value={values.received_date}
              onChange={(e) => set("received_date", e.target.value)}
            />
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
              The day it reached us. The gap is the notice we actually got.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          <div>
            <label style={labelStyle} htmlFor="gc-issued-by">Issued by</label>
            <input
              id="gc-issued-by"
              style={fieldStyle}
              value={values.issued_by}
              placeholder="Architect / GC / EOR"
              onChange={(e) => set("issued_by", e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="gc-category">Discipline</label>
            <select
              id="gc-category"
              style={fieldStyle}
              value={values.category}
              onChange={(e) => set("category", e.target.value)}
            >
              {GC_SET_CATEGORIES.map((c) => (
                <option key={c} value={c}>{GC_SET_CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor="gc-revision">Their revision</label>
            <input
              id="gc-revision"
              style={fieldStyle}
              value={values.revision}
              placeholder="Rev 3"
              onChange={(e) => set("revision", e.target.value)}
            />
          </div>
        </div>

        <div>
          <label style={labelStyle} htmlFor="gc-description">Notes</label>
          <textarea
            id="gc-description"
            style={{ ...fieldStyle, minHeight: 72, resize: "vertical" }}
            value={values.description}
            placeholder="What changed, and where."
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
        {!initial && sourceMode === "pdf" && (
          <section aria-label="Review GC source PDF" style={{ display: "grid", gap: 10, padding: 12, border: "1px solid var(--border-default)", borderRadius: 8 }}>
            <div style={labelStyle}>Source PDF · page evidence</div>
            <input
              aria-label="GC source PDF"
              type="file"
              accept="application/pdf,.pdf"
              disabled={!!uploadedPath || !!partialSetId || creationUncertain}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = "";
                void selectPdf(file);
              }}
            />
            {pdfFile && (
              <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                {pdfFile.name} · {pdfPageCount ? `${pdfPageCount} verified PDF page${pdfPageCount === 1 ? "" : "s"}` : "checking page count"}
              </div>
            )}
            {pdfStatus !== "idle" && <div role="status" style={{ color: "var(--text-secondary)", fontSize: 12 }}>{pdfNote}</div>}
            {pdfStatus === "reading" && <div role="status" style={{ color: "var(--text-muted)", fontSize: 12 }}>Reading title blocks…</div>}
            {(pdfStatus === "review" || pdfStatus === "manual") && pdfPageCount && (
              <>
                <div style={{ color: "var(--text-muted)", fontSize: 11, lineHeight: 1.5 }}>
                  {pdfStatus === "manual" ? "Manual page mapping is required for unreadable or scanned pages." : "These are suggestions. The original PDF governs every value."}
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {pdfSheets.map((sheet, index) => (
                    <div key={sheet.key} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 6, alignItems: "end" }}>
                      <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Number
                        <input aria-label={`GC sheet number ${index + 1}`} style={fieldStyle} value={sheet.drawingNumber} onChange={(e) => updateSheet(sheet.key, { drawingNumber: e.target.value })} />
                      </label>
                      <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Title
                        <input aria-label={`GC sheet title ${index + 1}`} style={fieldStyle} value={sheet.title} onChange={(e) => updateSheet(sheet.key, { title: e.target.value })} />
                      </label>
                      <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Revision
                        <input aria-label={`GC sheet revision ${index + 1}`} style={fieldStyle} value={sheet.revision} onChange={(e) => updateSheet(sheet.key, { revision: e.target.value })} />
                      </label>
                      <label style={{ fontSize: 11, color: "var(--text-muted)" }}>PDF page
                        <input aria-label={`Source page ${index + 1}`} type="number" min="1" max={pdfPageCount} style={fieldStyle} value={sheet.pdfPage} onChange={(e) => { updateSheet(sheet.key, { pdfPage: e.target.value }); setPreviewPage(Number(e.target.value) || 1); }} />
                      </label>
                      <button type="button" className="sbd-btn" aria-label={`Remove GC sheet ${index + 1}`} onClick={() => { setPdfSheets((current) => current.filter((row) => row.key !== sheet.key)); setReviewed(false); setUnmappedReviewed(false); }}>Remove</button>
                      {pdfUrl && sheet.pdfPage && Number(sheet.pdfPage) >= 1 && Number(sheet.pdfPage) <= pdfPageCount && (
                        <a href={`${pdfUrl}#page=${sheet.pdfPage}`} target="_blank" rel="noopener noreferrer" aria-label={`View source page ${sheet.pdfPage}`} style={{ gridColumn: "1 / -1", color: "var(--accent)", fontSize: 11 }} onClick={() => setPreviewPage(Number(sheet.pdfPage))}>
                          Source page {sheet.pdfPage} · open original
                        </a>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" className="sbd-btn" style={{ justifySelf: "start" }} onClick={() => { setPdfSheets((current) => [...current, { key: `manual-${crypto.randomUUID()}`, drawingNumber: "", title: "", revision: "", pdfPage: "", source: "manual" }]); setReviewed(false); setUnmappedReviewed(false); }}>
                  Add sheet from page
                </button>
                {pdfSheets.length === 0 && <div style={{ color: "var(--text-muted)", fontSize: 11 }}>Document-only issuances can retain the PDF without sheet rows. GC drawing and revision issuances need reviewed sheets.</div>}
                {pdfUrl && (
                  <iframe
                    title={`GC source PDF preview page ${previewPage}`}
                    src={`${pdfUrl}#page=${previewPage}`}
                    style={{ width: "100%", height: 280, border: "1px solid var(--border-default)", borderRadius: 6, background: "#fff" }}
                  />
                )}
                <label style={{ color: "var(--text-primary)", fontSize: 12, lineHeight: 1.5 }}>
                  <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} style={{ marginRight: 7 }} />
                  I checked each listed sheet and source PDF page against the original file.
                </label>
                {new Set(pdfSheets.map((sheet) => Number(sheet.pdfPage)).filter((page) => Number.isInteger(page) && page >= 1 && page <= pdfPageCount)).size < pdfPageCount && (
                  <label style={{ color: "var(--text-primary)", fontSize: 12, lineHeight: 1.5 }}>
                    <input type="checkbox" checked={unmappedReviewed} onChange={(e) => setUnmappedReviewed(e.target.checked)} style={{ marginRight: 7 }} />
                    I reviewed the remaining PDF pages and confirmed no additional GC sheet rows are needed.
                  </label>
                )}
                {pdfSheets.length > 0 && (
                  <label style={{ color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.5 }}>
                    <input type="checkbox" checked={supersedePrior} onChange={(e) => setSupersedePrior(e.target.checked)} style={{ marginRight: 7 }} />
                    Mark uniquely matching prior GC sheet numbers superseded after saving. Ambiguous matches remain untouched.
                  </label>
                )}
              </>
            )}
            {uploadedPath && !partialSetId && <div role="status" style={{ color: "var(--status-review)", fontSize: 12 }}>The prior upload is retained for retry; this save will reuse it.</div>}
            {partialSetId && <div role="alert" style={{ color: "var(--status-error)", fontSize: 12 }}>Partial issuance {partialSetId} exists. Close this form and inspect that record before any new upload.</div>}
            {creationUncertain && <div role="alert" style={{ color: "var(--status-error)", fontSize: 12 }}>The issuance create outcome is uncertain. Inspect the GC register before trying again.</div>}
          </section>
        )}
      </div>
    </Modal>
  );
}
