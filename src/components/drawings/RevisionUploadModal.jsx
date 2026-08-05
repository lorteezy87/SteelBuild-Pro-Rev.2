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
import { extractRevisionSheets, deriveVirtualSets, buildRevisionSnapshot, REVISION_UPLOAD_STEP_ORDER as STEP_ORDER } from "./revisionUploadHelpers";
import StepSelectSet from "./revisionUploadSteps/SelectSetStep";
import StepRevMeta from "./revisionUploadSteps/RevMetaStep";
import StepDropPDF from "./revisionUploadSteps/DropPdfStep";
import StepSheetComparison from "./revisionUploadSteps/SheetComparisonStep";
import StepProcessing from "./revisionUploadSteps/ProcessingStep";
import StepSuccess from "./revisionUploadSteps/SuccessStep";

// ── Main Modal ─────────────────────────────────────────────────────
export default function RevisionUploadModal({ open, onClose, onComplete, activeProject, preSelectedSet, drawingSets = [] }) {
  const qc = useQueryClient();
  // Derive virtual sets from drawings if drawingSets is sparse
  const [derivedSets, setDerivedSets] = React.useState([]);
  useEffect(() => {
    if (!open || !activeProject?.id) return;
    entities.Drawing.filter({ project_id: activeProject.id }).then(drawings => {
      // Build virtual set objects for any set_name not already in drawingSets
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
  // Full re-issue (retire sheets not in this upload) is OPT-IN. Default OFF so a
  // partial revision upload never silently supersedes the rest of the set.
  const [supersedeUnlisted, setSupersedeUnlisted] = useState(false);
  const [processingMsg, setProcessingMsg] = useState("");
  const [processingPct, setProcessingPct] = useState(0);
  const [flowError, setFlowError] = useState("");
  const [applyStats, setApplyStats] = useState({ updated: 0, added: 0, removed: 0 });
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
      // Forward the set's saved titleblock template (if any) so the
      // extractor pulls title + sheet# from the user-marked rectangles
      // instead of asking the LLM to guess. Sets without a template
      // pass NULL on both sides; the extractor falls through to its
      // existing LLM-only path.
      const newSheets = await extractRevisionSheets(pdfFile, {
        titleblockTemplate: {
          titleRect:  selectedSet?.titleblock_title_rect  ?? null,
          numberRect: selectedSet?.titleblock_number_rect ?? null,
        },
      });
      setProcessingMsg("Comparing sheets...");
      setProcessingPct(80);

    // Get old sheets from existing Drawing records
    let oldSheets = [];
    try {
      const existing = await entities.Drawing.filter({ project_id: activeProject?.id, drawing_set_name: selectedSet.set_name });
      oldSheets = existing.filter(d => !d.is_superseded).map(d => ({ sheetNumber: d.sheet_number, sheetTitle: d.title, fileUrl: d.file_url }));
    } catch (e) { console.error("Failed to fetch existing drawings:", e); }

      // Carry pdfPage and discipline/revision through matchSheets so the
      // apply step can write per-sheet pdf_page on every revised/added
      // drawing — without this the new revision keeps the file_url but
      // every row points at page 1 of the new master PDF.
      const matched = matchSheets(
        oldSheets,
        newSheets.map(s => ({
          sheetNumber: s.sheetNumber,
          sheetTitle:  s.sheetTitle,
          pdfPage:     s.pdfPage,
          discipline:  s.discipline,
          revision:    s.revision,
        })),
      );
      // Store uploaded fileUrl on each new sheet match
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
      const currentStage = selectedSet?.stage || selectedSet?.stage_summary || (selectedSet?.set_approval_status === "approved" ? "IFC" : "");
      const revisionCheck = validateRevisionLabel(revMeta.revisionLabel, currentStage);
      if (!revisionCheck.ok) {
        setFlowError(revisionCheck.reason);
        return;
      }
      setStep("processing");
      setProcessingMsg("Updating drawing set...");
      setProcessingPct(10);

    // Snapshot current revision into history
    let history = [];
    try { history = JSON.parse(selectedSet.revision_history || "[]"); } catch {}
    history.push(buildRevisionSnapshot(selectedSet, revMeta.disposition));

    const newSheetCount = matchedSheets.filter(m => m.newSheet).length;
    const newFileUrl = matchedSheets.find(m => m.newSheet?.sourceFileUrl)?.newSheet?.sourceFileUrl || selectedSet.file_url;

    // Update DrawingSet (only if a real DrawingSet record exists)
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

    // Load existing drawings for this set
    let existingDrawings = [];
    try {
      existingDrawings = await entities.Drawing.filter({ project_id: activeProject?.id, drawing_set_name: selectedSet.set_name });
    } catch (e) { console.error("Failed to fetch drawings for apply:", e); }

    // Per-sheet auditable history (drawing_revisions): every revised sheet
    // gets its OLD file/page snapshotted as a superseded revision and the
    // new one minted as current — this is what powers per-sheet history +
    // the overlay compare. History failures never block the slip-sheet
    // itself; they surface as a warning.
    let historyFailed = 0;

    let updated = 0, added = 0, removed = 0, failed = 0;
    for (const match of matchedSheets) {
      try {
        const existing = findExactLiveDrawing(existingDrawings, match.sheetNumber);
        if (match.change !== "added" && match.change !== "removed" && match.sheetNumber && !existing && existingDrawings.some((d) => !d.is_superseded && String(d.sheet_number || "").trim() === String(match.sheetNumber || "").trim())) {
          // Multiple live rows share this exact number — refuse to guess.
          failed++;
          console.error(`[RevisionUploadModal] Ambiguous live sheet "${match.sheetNumber}" — skipped`);
          continue;
        }
        if (match.change === "removed") {
          // A sheet that isn't in this upload is only retired when the user
          // explicitly opted into a full re-issue. The default (partial
          // revision) leaves it current and untouched — a partial upload must
          // never silently supersede the rest of the set.
          if (!supersedeUnlisted) { continue; }
          if (existing) {
            await entities.Drawing.update(existing.id, { is_superseded: true });
            removed++;
            // Keep an archived revision row so the dropped sheet's last
            // file/page stays reachable from history.
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
          if (addedPage === null) {
            console.warn(
              `[RevisionUploadModal] Added sheet "${match.sheetNumber}" has invalid pdfPage=${JSON.stringify(match.newSheet?.pdfPage)} — defaulting to 1.`,
            );
          }
          const createdSheet = await entities.Drawing.create({
            sheet_number: match.newSheet.sheetNumber,
            title: match.newSheet.sheetTitle,
            project_id: activeProject?.id,
            project_name: activeProject?.name,
            discipline: match.newSheet.discipline || selectedSet.discipline || "Structural",
            revision_number: normalizeRevisionNumber(match.newSheet.revision ?? revMeta.revisionLabel),
            stage: "Not Started",
            issue_date: revMeta.issueDate,
            issued_by: revMeta.issuedBy,
            file_url: newFileUrl,
            pdf_page: addedPage ?? 1,
            drawing_set_name: selectedSet.set_name,
            // Carry the parent set FK so added sheets aren't orphaned from the
            // count-sync trigger / fab gate / health score / 3D coloring (all
            // key on drawing_set_id). Omitted for derived/virtual sets (no row).
            ...(selectedSet.id ? { drawing_set_id: selectedSet.id } : {}),
            ifc_status: revMeta.revisionLabel.toUpperCase().includes("IFC") ? "IFC" : undefined,
            is_superseded: false,
          });
          added++;
          // Mint the v1 history row for the brand-new sheet (carries the
          // new file/page refs).
          try {
            if (createdSheet?.id) await ensureCurrentRevision({ drawing: createdSheet, userId: null });
          } catch (histErr) {
            historyFailed++;
            console.warn(`[RevisionUploadModal] History mint failed for added sheet "${match.sheetNumber}":`, histErr);
          }
        } else {
          if (existing) {
            // Per-sheet pdf_page MUST be re-derived from the new PDF —
            // the old value pointed at a page in the *previous* master
            // PDF, which is no longer the file behind file_url. If the
            // extractor didn't surface a page for this sheet, fall back
            // to 1 with a warning so the user can hand-fix.
            const updatedPage = validatePdfPage(match.newSheet?.pdfPage);
            if (updatedPage === null) {
              console.warn(
                `[RevisionUploadModal] Updated sheet "${match.sheetNumber}" has invalid pdfPage=${JSON.stringify(match.newSheet?.pdfPage)} — defaulting to 1.`,
              );
            }
            // Snapshot the OLD file/page as a superseded revision and mint
            // the new one BEFORE the drawings row is overwritten in place.
            // Idempotent on the revision code; failure → warn, never block.
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
              // When the new revision code already existed, recordSheetSlipSheet
              // skips minting AND skips updating that current revision row — point the
              // authoritative current drawing_revisions row at the new PDF/page, else
              // the register/viewer keep rendering the OLD file while drawings shows new.
              if (slip?.skipped && slip.revisionId) {
                await entities.DrawingRevision.update(slip.revisionId, { file_url: newFileUrl, pdf_page: updatedPage ?? 1 });
              }
            } catch (histErr) {
              historyFailed++;
              console.warn(`[RevisionUploadModal] Slip-sheet history failed for "${match.sheetNumber}":`, histErr);
            }
            await entities.Drawing.update(existing.id, {
              revision_number: normalizeRevisionNumber(match.newSheet?.revision ?? revMeta.revisionLabel ?? existing.revision_number),
              issue_date: revMeta.issueDate,
              issued_by: revMeta.issuedBy || existing.issued_by,
              file_url: newFileUrl,
              pdf_page: updatedPage ?? 1,
              // Backfill the parent set FK in case this sheet predates the FK
              // being set, so it stays attached to the real set (not orphaned).
              ...(selectedSet.id ? { drawing_set_id: selectedSet.id } : {}),
              is_superseded: false,
            });
            updated++;
          }
        }
      } catch (err) {
        console.error("Failed to process sheet:", match.sheetNumber, err);
        failed++;
      }
      setProcessingPct(30 + Math.round((updated + added + removed + failed) / matchedSheets.length * 60));
    }

      setApplyStats({ updated, added, removed });
      // Route through the registry so EVERY drawing/revision-reading cache —
      // including the Doc Control register view (["drawing-register", projectId])
      // — is invalidated from one place. Without the register key the register
      // grid served a stale current revision until a manual page reload.
      await invalidateEntity(qc, "drawing", activeProject?.id);
      await invalidateEntity(qc, "drawing_revision", activeProject?.id);
      // When a real drawing_sets row was updated above (revision label, sheet
      // count, set_approval_status), invalidate the drawingSet family too so
      // set-list surfaces (hub, FabRelease, CommandCenter) reflect the new
      // revision/count instead of serving the old values until a manual reload.
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

  // progress dots use STEP_ORDER from revisionUploadHelpers

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
            <div style={{
              marginBottom: 12,
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--danger-border)",
              background: "var(--danger-muted)",
              fontFamily: "var(--font-body)",
              fontSize: 11,
              color: "var(--danger)"
            }}>
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
            <StepSheetComparison selectedSet={selectedSet} revMeta={revMeta} matchedSheets={matchedSheets} setMatchedSheets={setMatchedSheets} supersedeUnlisted={supersedeUnlisted} setSupersedeUnlisted={setSupersedeUnlisted} onBack={() => setStep("dropPDF")} onConfirm={handleApply} />
          )}
          {step === "success" && (
            <StepSuccess selectedSet={selectedSet} revMeta={revMeta} stats={applyStats} onClose={handleClose} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
