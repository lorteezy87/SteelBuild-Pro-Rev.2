import React, { useState, useEffect } from "react";
import { entities, integrations } from "@/api/supabaseClient";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateEntity } from "@/services/cacheRegistry";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { validatePdfPage } from "@/lib/pdfSheetExtractor";
import { ensureCurrentRevision, recordSheetSlipSheet } from "@/lib/drawingHub";
import {
  normalizeRevisionNumber,
  matchSheets,
  validateRevisionLabel,
  hasAmbiguousSheetMatches,
  findExactLiveDrawing,
} from "@/lib/drawingUploadUtils";
import { extractRevisionSheets, deriveVirtualSets, buildRevisionSnapshot, mergeSetDrawings } from "./revisionUploadHelpers";
import { dominantStage } from "@/lib/submittalStageMapping";

/**
 * Load the live sheets for a set: by FK (`drawing_set_id`) first, then legacy
 * rows that only carry `drawing_set_name` (no FK at all).
 */
async function loadSetDrawings(projectId, set) {
  const byId = set?.id ? await entities.Drawing.filter({ project_id: projectId, drawing_set_id: set.id }) : [];
  const byName = set?.set_name ? await entities.Drawing.filter({ project_id: projectId, drawing_set_name: set.set_name }) : [];
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
import StepSuccess from "./revisionUploadSteps/SuccessStep";

export default function RevisionUploadModal({ open, onClose, onComplete, activeProject, preSelectedSet, drawingSets = [] }) {
  const qc = useQueryClient();
  const [derivedSets, setDerivedSets] = React.useState([]);
  useEffect(() => {
    if (!open || !activeProject?.id) return;
    entities.Drawing.filter({ project_id: activeProject.id }).then(drawings => {
      const existingNames = new Set(drawingSets.map(ds => ds.set_name));
      setDerivedSets(deriveVirtualSets(drawings, existingNames));
    }).catch((e) => { console.error("Failed to load drawing sets:", e); });
  }, [open, activeProject?.id, drawingSets]);
  const [step, setStep] = useState("selectSet");
  const [selectedSet, setSelectedSet] = useState(preSelectedSet || null);
  const [revMeta, setRevMeta] = useState({
    revisionLabel: "",
    issueDate: new Date().toISOString().split("T")[0],
    issuedBy: "",
    notes: "",
    disposition: "superseded",
  });
  const [pdfFile, setPdfFile] = useState(null);
  const [matchedSheets, setMatchedSheets] = useState([]);
  const [supersedeUnlisted, setSupersedeUnlisted] = useState(false);
  const [processingMsg, setProcessingMsg] = useState("");
  const [processingPct, setProcessingPct] = useState(0);
  const [flowError, setFlowError] = useState("");
  const [applyStats, setApplyStats] = useState({ updated: 0, added: 0, removed: 0 });
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

  const handleExtract = async () => {
    try {
      setFlowError("");
      setStep("processing");
      setProcessingMsg("Uploading PDF...");
      setProcessingPct(10);
      const res = await integrations.Core.UploadFile({ file: pdfFile, workflow: "drawings" });
      setProcessingMsg("AI is reading the drawing set...");
      setProcessingPct(40);
      setExtraction({ setMeta: null, scanned: false });
      const newSheets = await extractRevisionSheets(pdfFile, {
        onExtraction: setExtraction,
        titleblockTemplate: {
          titleRect:  selectedSet?.titleblock_title_rect  ?? null,
          numberRect: selectedSet?.titleblock_number_rect ?? null,
          revisionRect: selectedSet?.titleblock_revision_rect ?? null,
        },
      });
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
    } catch (e) { console.error("Failed to fetch existing drawings:", e); }

      const matched = matchSheets(
        oldSheets,
        newSheets.map(s => ({
          sheetNumber: s.sheetNumber,
          sheetTitle:  s.sheetTitle,
          pdfPage:     s.pdfPage,
          discipline:  s.discipline,
          revision:    s.revision,
          date:        s.date,
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
      let existingDrawings = [];
      try {
        existingDrawings = await loadSetDrawings(activeProject?.id, selectedSet);
      } catch (e) { console.error("Failed to fetch drawings for apply:", e); }
      const currentStage = deriveSetStage(selectedSet, existingDrawings);
      const revisionCheck = validateRevisionLabel(revMeta.revisionLabel, currentStage);
      if (!revisionCheck.ok) {
        setFlowError(revisionCheck.reason);
        return;
      }
      setStep("processing");
      setProcessingMsg("Updating drawing set...");
      setProcessingPct(10);

    let history = [];
    try { history = JSON.parse(selectedSet.revision_history || "[]"); } catch {}
    history.push(buildRevisionSnapshot(selectedSet, revMeta.disposition));

    const newSheetCount = matchedSheets.filter(m => m.newSheet).length;
    const newFileUrl = matchedSheets.find(m => m.newSheet?.sourceFileUrl)?.newSheet?.sourceFileUrl || selectedSet.file_url;

    if (selectedSet.id) {
      await entities.DrawingSet.update(selectedSet.id, {
        revision: revMeta.revisionLabel,
        issued_date: revMeta.issueDate,
        issued_by: revMeta.issuedBy || selectedSet.issued_by,
        file_url: newFileUrl,
        sheet_count: newSheetCount,
        revision_history: JSON.stringify(history),
        set_approval_status: "pending_review",
        notes: revMeta.notes || selectedSet.notes,
      });
    }
    setProcessingPct(30);
    setProcessingMsg("Updating drawing records...");

    let historyFailed = 0;
    let updated = 0, added = 0, removed = 0, failed = 0;
    for (const match of matchedSheets) {
      try {
        const existing = findExactLiveDrawing(existingDrawings, match.sheetNumber);
        if (match.change !== "added" && match.change !== "removed" && match.sheetNumber && !existing && existingDrawings.some((d) => !d.is_superseded && String(d.sheet_number || "").trim() === String(match.sheetNumber || "").trim())) {
          failed++;
          console.error(`[RevisionUploadModal] Ambiguous live sheet "${match.sheetNumber}" — skipped`);
          continue;
        }
        if (match.change === "removed") {
          if (!supersedeUnlisted) { continue; }
          if (existing) {
            await entities.Drawing.update(existing.id, { is_superseded: true });
            removed++;
            try {
              const rev = await ensureCurrentRevision({ drawing: existing, userId: null });
              if (rev?.id) {
                await entities.DrawingRevision.update(rev.id, { archived_at: new Date().toISOString() });
              }
            } catch (histErr) {
              historyFailed++;
              console.warn(`[RevisionUploadModal] History archive failed for removed sheet "${match.sheetNumber}":`, histErr);
            }
          }
        } else if (match.change === "added") {
          const addedPage = validatePdfPage(match.newSheet?.pdfPage);
          const createdSheet = await entities.Drawing.create({
            sheet_number: match.newSheet.sheetNumber,
            title: match.newSheet.sheetTitle,
            project_id: activeProject?.id,
            project_name: activeProject?.name,
            discipline: match.newSheet.discipline || selectedSet.discipline || "Structural",
            revision_number: normalizeRevisionNumber(match.newSheet.revision ?? revMeta.revisionLabel),
            stage: "Not Started",
            file_url: newFileUrl,
            pdf_page: addedPage ?? 1,
            drawing_set_name: selectedSet.set_name,
            ...(selectedSet.id ? { drawing_set_id: selectedSet.id } : {}),
            ifc_status: revMeta.revisionLabel.toUpperCase().includes("IFC") ? "IFC" : undefined,
            is_superseded: false,
            // Only write when the page was actually harvested. `undefined`
            // leaves the column alone; writing null would record "read, and
            // blank" for a page nobody read.
            ...(typeof match.newSheet?.extractedText === "string"
              ? { extracted_text: match.newSheet.extractedText }
              : {}),
            ...(Array.isArray(match.newSheet?.callouts)
              ? { callouts: match.newSheet.callouts }
              : {}),
          });
          added++;
          try {
            if (createdSheet?.id) await ensureCurrentRevision({ drawing: createdSheet, userId: null });
          } catch (histErr) {
            historyFailed++;
            console.warn(`[RevisionUploadModal] History mint failed for added sheet "${match.sheetNumber}":`, histErr);
          }
        } else if (existing) {
            const updatedPage = validatePdfPage(match.newSheet?.pdfPage);
            try {
              const slip = await recordSheetSlipSheet({
                drawing: existing,
                newCode: normalizeRevisionNumber(match.newSheet?.revision ?? revMeta.revisionLabel ?? existing.revision_number),
                newFileUrl,
                newPdfPage: updatedPage ?? 1,
                issuedAt: revMeta.issueDate || null,
                notes: revMeta.notes || null,
                userId: null,
              });
              if (slip?.skipped && slip.revisionId) {
                await entities.DrawingRevision.update(slip.revisionId, { file_url: newFileUrl, pdf_page: updatedPage ?? 1 });
              }
            } catch (histErr) {
              historyFailed++;
              console.warn(`[RevisionUploadModal] Slip-sheet history failed for "${match.sheetNumber}":`, histErr);
            }
            await entities.Drawing.update(existing.id, {
              revision_number: normalizeRevisionNumber(match.newSheet?.revision ?? revMeta.revisionLabel ?? existing.revision_number),
              file_url: newFileUrl,
              pdf_page: updatedPage ?? 1,
              // Refresh the stored text to THIS revision's page. Leaving the
              // prior revision's text behind would make the next revision diff
              // against a sheet that is no longer the sheet of record.
              ...(typeof match.newSheet?.extractedText === "string"
                ? { extracted_text: match.newSheet.extractedText }
                : {}),
              // Refresh with THIS revision's references. A revision that drops
              // a detail callout must stop showing a jump to it.
              ...(Array.isArray(match.newSheet?.callouts)
                ? { callouts: match.newSheet.callouts }
                : {}),
              ...(selectedSet.id ? { drawing_set_id: selectedSet.id } : {}),
              is_superseded: false,
            });
            updated++;
        }
      } catch (err) {
        console.error("Failed to process sheet:", match.sheetNumber, err);
        failed++;
      }
      setProcessingPct(30 + Math.round((updated + added + removed + failed) / matchedSheets.length * 60));
    }

      setApplyStats({ updated, added, removed });
      await invalidateEntity(qc, "drawing", activeProject?.id);
      await invalidateEntity(qc, "drawing_revision", activeProject?.id);
      if (selectedSet.id) await invalidateEntity(qc, "drawingSet", activeProject?.id);
      if (failed > 0) {
        setFlowError(`${failed} sheet(s) failed to process. ${updated + added + removed} succeeded.`);
      } else if (historyFailed > 0) {
        setFlowError(`Sheets updated, but revision history could not be written for ${historyFailed} sheet(s) — compare/restore for those revisions may be unavailable.`);
      }
      setProcessingPct(100);
      await new Promise(r => setTimeout(r, 500));
      setStep("success");
      if (onComplete) {
        onComplete({
          setId: selectedSet?.id || null,
          setName: selectedSet?.name || selectedSet?.set_name || selectedSet?.title || null,
          revisionLabel: revMeta?.revisionLabel || null,
        });
      }
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
    setFlowError("");
  };

  const handleClose = () => { reset(); onClose(); };
  const STEP_ORDER = ["selectSet", "revMeta", "dropPDF", "comparison", "success"];

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
            <StepDropPDF selectedSet={selectedSet} revMeta={revMeta} file={pdfFile} setFile={setPdfFile} onBack={() => setStep("revMeta")} onExtract={handleExtract} />
          )}
          {step === "processing" && <StepProcessing message={processingMsg} progress={processingPct} />}
          {step === "comparison" && (
            <StepSheetComparison selectedSet={selectedSet} revMeta={revMeta} extraction={extraction} activeProject={activeProject} matchedSheets={matchedSheets} setMatchedSheets={setMatchedSheets} supersedeUnlisted={supersedeUnlisted} setSupersedeUnlisted={setSupersedeUnlisted} onBack={() => setStep("dropPDF")} onConfirm={handleApply} />
          )}
          {step === "success" && (
            <StepSuccess selectedSet={selectedSet} revMeta={revMeta} stats={applyStats} onClose={handleClose} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
