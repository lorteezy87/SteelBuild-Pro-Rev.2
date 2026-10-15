import React, { useState, useEffect } from "react";
import { entities, integrations } from "@/api/supabaseClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { validatePdfPage } from "@/lib/pdfSheetExtractor";
import {
  matchSheets,
  validateRevisionLabel,
  hasAmbiguousSheetMatches,
  isPdfFile,
} from "@/lib/drawingUploadUtils";
import { extractRevisionSheets, deriveVirtualSets, mergeSetDrawings } from "./revisionUploadHelpers";
import { dominantStage } from "@/lib/submittalStageMapping";
import { buildIntakeRecords } from "@/lib/docControl";
import { AuthContext } from "@/lib/AuthContext";
import { DocControlAttestationProvider, useDocControlAttestations } from "./DocControlReviewPanel";

/**
 * Load the live sheets for a set: by FK (`drawing_set_id`) first, then legacy
 * rows that only carry `drawing_set_name` (no FK at all).
 */
async function loadSetDrawings(projectId, set) {
  const byId = set?.id ? await entities.Drawing.filterAll({ project_id: projectId, drawing_set_id: set.id }, "id") : [];
  const byName = set?.set_name ? await entities.Drawing.filterAll({ project_id: projectId, drawing_set_name: set.set_name }, "id") : [];
  return mergeSetDrawings(byId, byName);
}

/**
 * `drawing_sets` has no `stage` column — derive the set's current stage from
 * its live sheets (dominant stage), falling back to the set-level approval
 * verdict (approved ⇒ post-IFC numeric revisions).
 */
function deriveSetStage(set, sheets) {
  const live = (sheets || []).filter((d) => !d.is_superseded && !d.is_deleted);
  const fromSheets = live.length ? dominantStage(live.map((d) => d.stage)) : "";
  if (fromSheets && fromSheets !== "Not Started") return fromSheets;
  if (String(set?.set_approval_status || "").toLowerCase() === "approved") return "IFC";
  return fromSheets || "";
}
import StepSelectSet from "./revisionUploadSteps/SelectSetStep";
import StepRevMeta from "./revisionUploadSteps/RevMetaStep";
import StepDropPDF from "./revisionUploadSteps/DropPdfStep";
import StepSheetComparison from "./revisionUploadSteps/SheetComparisonStep";
import StepProcessing from "./revisionUploadSteps/ProcessingStep";
import { MAX_PDF_SIZE_MB } from "./revisionUploadSteps/constants";

export default function RevisionUploadModal({ open, onClose, activeProject, preSelectedSet, drawingSets = [], initialPdfFile = null, initialAttestations = {}, initialReview = null }) {
  // This modal is also mounted by legacy drawing pages before their upload
  // step opens. An absent provider must not crash that entire register.
  const user = React.useContext(AuthContext)?.user;
  const attestationState = useDocControlAttestations(user?.full_name || user?.email || "", initialAttestations);
  const [derivedSets, setDerivedSets] = React.useState([]);
  useEffect(() => {
    if (!open || !activeProject?.id) return;
    entities.Drawing.filterAll({ project_id: activeProject.id }, "id").then(drawings => {
      const existingNames = new Set(drawingSets.map(ds => ds.set_name));
      setDerivedSets(deriveVirtualSets(drawings, existingNames));
    }).catch((e) => { console.error("Failed to load drawing sets:", e); });
  }, [open, activeProject?.id, drawingSets]);
  const [step, setStep] = useState("selectSet");
  const [selectedSet, setSelectedSet] = useState(preSelectedSet || null);
  const [revMeta, setRevMeta] = useState({
    revisionLabel: initialReview?.revisionLabel || "",
    issueDate: initialReview?.issueDate || new Date().toISOString().split("T")[0],
    issuedBy: initialReview?.issuedBy || "",
    notes: "",
    disposition: "superseded",
  });
  const [pdfFile, setPdfFile] = useState(initialPdfFile);
  const [matchedSheets, setMatchedSheets] = useState([]);
  const [supersedeUnlisted, setSupersedeUnlisted] = useState(false);
  const [processingMsg, setProcessingMsg] = useState("");
  const [processingPct, setProcessingPct] = useState(0);
  const [flowError, setFlowError] = useState("");
  // Cover-sheet metadata + text-layer flag from the extraction. Document Control
  // reads `scanned` to tell "the box was blank" from "the page was unreadable".
  const [extraction, setExtraction] = useState({ setMeta: null, scanned: false });
  useEffect(() => {
    if (preSelectedSet) { setSelectedSet(preSelectedSet); setStep("revMeta"); }
  }, [preSelectedSet]);

  useEffect(() => {
    if (open && !preSelectedSet) {
      setStep("selectSet");
      setSelectedSet(null);
    }
  }, [open, preSelectedSet]);

  const samePreflightPdf = !!initialPdfFile && pdfFile === initialPdfFile;
  const setReviewedPdfFile = (nextFile) => {
    if (initialPdfFile && nextFile !== initialPdfFile) {
      setFlowError("This review is tied to the PDF selected in Document Control. Return to Document Control to choose and review a different PDF.");
      return;
    }
    setFlowError("");
    setPdfFile(nextFile);
  };
  useEffect(() => {
    if (initialPdfFile && pdfFile && pdfFile !== initialPdfFile) attestationState.resetAttestations();
  }, [initialPdfFile, pdfFile, attestationState.resetAttestations]);

  const handleExtract = async () => {
    try {
      if (!pdfFile || !isPdfFile(pdfFile) || pdfFile.size > MAX_PDF_SIZE_MB * 1024 * 1024) {
        setFlowError(`Select a PDF under ${MAX_PDF_SIZE_MB} MB before extraction.`);
        return;
      }
      setFlowError("");
      setStep("processing");
      setProcessingMsg("Uploading PDF...");
      setProcessingPct(10);
      const res = await integrations.Core.UploadFile({ file: pdfFile, workflow: "drawings" });
      setProcessingMsg("AI is reading the drawing set...");
      setProcessingPct(40);
      setExtraction({ setMeta: null, scanned: false });
      // The preflight already extracted this exact File and let a person key
      // scanned title blocks. Reusing that reviewed snapshot avoids a second
      // model call and, critically, keeps human values on the save path.
      const newSheets = samePreflightPdf && Array.isArray(initialReview?.sheets)
        ? initialReview.sheets
        : await extractRevisionSheets(pdfFile, {
          onExtraction: setExtraction,
          titleblockTemplate: {
            titleRect:  selectedSet?.titleblock_title_rect  ?? null,
            numberRect: selectedSet?.titleblock_number_rect ?? null,
            revisionRect: selectedSet?.titleblock_revision_rect ?? null,
          },
        });
      if (samePreflightPdf && initialReview) {
        setExtraction({ setMeta: initialReview.setMeta ?? null, scanned: initialReview.scanned === true, pageCount: initialReview.pageCount ?? null });
      }
      setProcessingMsg("Comparing sheets...");
      setProcessingPct(80);

    let oldSheets = [];
    try {
      const existing = await loadSetDrawings(activeProject?.id, selectedSet);
      oldSheets = existing.filter(d => !d.is_superseded).map(d => ({
        sheetNumber: d.sheet_number,
        sheetTitle: d.title,
        fileUrl: d.file_url,
        // Carried for Document Control. The matcher ignores them; the change
        // summary cannot say anything true without them.
        id: d.id,
        revisionNumber: d.revision_number,
        drawingSetName: d.drawing_set_name,
        stage: d.stage,
        isSuperseded: d.is_superseded,
        callouts: d.callouts,
        extractedText: d.extracted_text,
      }));
    } catch (e) {
      console.error("Failed to fetch existing drawings:", e);
      setFlowError("Could not load the complete live set sheets for comparison. Retry before applying this revision.");
      setStep("dropPDF");
      return;
    }

      const matched = matchSheets(
        oldSheets,
        newSheets.map(s => ({
          sheetNumber: s.sheetNumber,
          sheetTitle:  s.sheetTitle,
          pdfPage:     s.pdfPage,
          discipline:  s.discipline,
          revision:    s.revision,
          date:        s.date,
          manual:      s.manual,
          extractedText: s.extractedText,
          callouts:    s.callouts,
        })),
      );
      matched.forEach(m => { if (m.newSheet) m.newSheet.fileUrl = res.file_url; m.newSheet && (m.newSheet.sourceFileUrl = res.file_url); });
      setMatchedSheets(matched);
      setSupersedeUnlisted(false);
      setProcessingPct(100);
      await new Promise(r => setTimeout(r, 400));
      setStep("comparison");
    } catch (error) {
      console.error("Revision extraction failed:", error);
      setFlowError(error?.message || "Unable to upload or parse this revision PDF.");
      setStep("dropPDF");
    }
  };

  const handleApply = async () => {
    try {
      setFlowError("");
      const invalidSource = matchedSheets.some(match => {
        if (!match.newSheet) return false;
        const page = validatePdfPage(match.newSheet.pdfPage);
        return !match.newSheet.sourceFileUrl || page === null || (extraction?.pageCount > 0 && page > extraction.pageCount);
      });
      if (invalidSource) {
        setFlowError("Every incoming sheet needs its source PDF and a confirmed in-range PDF page. Return to Document Control to review the source.");
        return;
      }
      const ambiguous = (matchedSheets || []).filter((m) => m.change === "ambiguous");
      if (hasAmbiguousSheetMatches(matchedSheets) || ambiguous.length) {
        const detail = ambiguous
          .map((m) => m.ambiguousReason || `Ambiguous sheet "${m.sheetNumber || "(blank)"}"`)
          .slice(0, 3)
          .join(" ");
        setFlowError(
          `Ambiguous sheet matches must be reviewed before applying. Exact sheet-number matching only — no automatic guessing. ${detail}`,
        );
        setStep("comparison");
        return;
      }
      const intakeRecords = buildIntakeRecords({
        matches: matchedSheets,
        setMeta: extraction?.setMeta ?? null,
        scanned: extraction?.scanned === true,
        revisionFromRect: !!selectedSet?.titleblock_revision_rect,
        existingSet: selectedSet ?? null,
        projectId: activeProject?.id ?? null,
        attestationsBySheetNumber: attestationState.attestationsBySheetNumber,
      });
      if (intakeRecords.some((record) => record.disposition === "hold")) {
        setFlowError("Document Control has a held sheet. Resolve the identified sheet or missing mark before applying this revision.");
        setStep("comparison");
        return;
      }
      let existingDrawings = [];
      try {
        existingDrawings = await loadSetDrawings(activeProject?.id, selectedSet);
      } catch (e) {
        console.error("Failed to fetch drawings for apply:", e);
        setFlowError("Could not refresh live set sheets. No set or sheet changes were applied. Retry the comparison.");
        setStep("comparison");
        return;
      }
      const currentStage = deriveSetStage(selectedSet, existingDrawings);
      const revisionCheck = validateRevisionLabel(revMeta.revisionLabel, currentStage);
      if (!revisionCheck.ok) {
        setFlowError(revisionCheck.reason);
        return;
      }
      if (selectedSet.id && String(selectedSet.revision || "").trim().toUpperCase() === String(revMeta.revisionLabel || "").trim().toUpperCase()) {
        setFlowError(`This set already records revision ${revMeta.revisionLabel}. Inspect the live register before starting another upload of the same revision.`);
        setStep("comparison");
        return;
      }
      // The legacy browser sequence committed current pointers, coordination,
      // parent sources and headers separately. Never fall back to those writes:
      // the reviewed transaction and direct-write cutover are not installed.
      setFlowError("The transactional revision service is not enabled. No drawing, revision, or approval records were changed. Close this review and use New Drawing Set with a unique name and a new submittal; explicitly review any old sheets to supersede.");
      setStep("comparison");
    } catch (error) {
      console.error("Revision apply failed:", error);
      setFlowError(error?.message || "Failed to apply revision changes.");
      setStep("comparison");
    }
  };

  const reset = () => {
    setStep(preSelectedSet ? "revMeta" : "selectSet");
    setSelectedSet(preSelectedSet || null);
    setRevMeta({ revisionLabel: "", issueDate: new Date().toISOString().split("T")[0], issuedBy: "", notes: "", disposition: "superseded" });
    setPdfFile(null); setMatchedSheets([]); setSupersedeUnlisted(false);
    attestationState.resetAttestations();
    setFlowError("");
  };

  const handleClose = () => { reset(); onClose(); };
  const STEP_ORDER = ["selectSet", "revMeta", "dropPDF", "comparison"];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sbd-card-strong" style={{ maxWidth: 620, maxHeight: "92vh", overflowY: "auto", background: "var(--bg-surface-low)", border: "1px solid var(--border-default)" }}>
        <DialogHeader>
          <DialogTitle>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>New Revision Upload</span>
              {step !== "processing" && (
                <div style={{ display: "flex", gap: 3, marginLeft: "auto" }}>
                  {STEP_ORDER.filter(s => s !== "processing").map((s, i) => (
                    <div key={s} style={{ width: 18, height: 4, borderRadius: 2, background: STEP_ORDER.indexOf(step) >= i ? "var(--accent)" : "var(--bg-surface-high)" }} />
                  ))}
                </div>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div style={{ paddingTop: 8 }}>
          <p role="note">In-place revision application is temporarily held for source/evidence integrity. You may review this PDF, or close and use New Drawing Set with a unique name and a new submittal. No revision changes will be applied here until the reviewed transaction service is enabled.</p>
          {samePreflightPdf && initialReview && step !== "success" && (
            <div style={{ marginBottom: 12, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--divider)", background: "var(--hover-bg)", fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--text-primary)" }}>Document Control review carried forward.</strong>
              {" "}Source: {initialPdfFile.name}. {Object.entries(initialReview.sourcePages || {}).map(([sheet, page]) => `${sheet} · PDF page ${page}`).join("; ")}.
              {" "}Confirm the set, extracted matches, and revision before applying. This review is tied to that PDF and does not grant IFC or fabrication release.
            </div>
          )}
          {flowError && step !== "processing" && (
            <div style={{ marginBottom: 12, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--danger-border)", background: "var(--danger-muted)", fontFamily: "var(--font-body)", fontSize: 11, color: "var(--danger)" }}>
              {flowError}
            </div>
          )}
          {step === "selectSet" && (
            <StepSelectSet drawingSets={[...drawingSets, ...derivedSets]} preSelectedSet={preSelectedSet} onSelect={s => { setSelectedSet(s); setRevMeta(p => ({ ...p, issuedBy: s.issued_by || "" })); setStep("revMeta"); }} onClose={handleClose} loading={false} error={null} />
          )}
          {step === "revMeta" && selectedSet && (
            <StepRevMeta selectedSet={selectedSet} revMeta={revMeta} setRevMeta={setRevMeta} onBack={() => preSelectedSet ? handleClose() : setStep("selectSet")} onNext={() => setStep("dropPDF")} />
          )}
          {step === "dropPDF" && (
            <StepDropPDF selectedSet={selectedSet} revMeta={revMeta} file={pdfFile} setFile={setReviewedPdfFile} onBack={() => setStep("revMeta")} onExtract={handleExtract} />
          )}
          {step === "processing" && <StepProcessing message={processingMsg} progress={processingPct} />}
          {step === "comparison" && (
            <DocControlAttestationProvider value={attestationState}>
              <StepSheetComparison selectedSet={selectedSet} revMeta={revMeta} extraction={extraction} activeProject={activeProject} matchedSheets={matchedSheets} setMatchedSheets={setMatchedSheets} supersedeUnlisted={supersedeUnlisted} setSupersedeUnlisted={setSupersedeUnlisted} onBack={() => setStep("dropPDF")} onConfirm={handleApply} />
            </DocControlAttestationProvider>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
