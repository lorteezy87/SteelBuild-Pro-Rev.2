import React, { useState, useEffect } from "react";
import { entities } from "@/api/supabaseClient";
import { UploadDrawingFile } from "@/api/client/uploads";
import { useDrawingSourceSnapshots } from "./upload/useDrawingSourceSnapshots";
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
import { useOptionalOrg } from '@/components/shared/OrgContext';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateEntities } from '@/services/cacheRegistry';
import { getDrawingCommandCapabilities } from '@/api/client/drawingCommands';
import { useDrawingCommand } from '@/lib/drawingCommands/useDrawingCommand';
import { getActiveOrgGeneration, getActiveOrgId } from '@/lib/activeOrg';
import { readPdfPageCount } from '@/lib/docControl/pdfPageCount';
import { buildReviewedRevisionPayload } from './revisionUploadHandoff';
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
import StepSuccess from './revisionUploadSteps/SuccessStep';
import { MAX_PDF_SIZE_MB } from "./revisionUploadSteps/constants";
const EMPTY_SETS = [];

export default function RevisionUploadModal({ open, onClose, onComplete = undefined, activeProject, preSelectedSet, drawingSets = EMPTY_SETS, initialPdfFile = null, initialAttestations = {}, initialReview = null }) {
  // This modal is also mounted by legacy drawing pages before their upload
  // step opens. An absent provider must not crash that entire register.
  const user = React.useContext(AuthContext)?.user;
  const currentOrg = useOptionalOrg()?.currentOrg;
  const qc = useQueryClient();
  const owner = open && user?.id && currentOrg?.id && activeProject?.id
    ? { actorId: user.id, orgId: currentOrg.id, projectId: activeProject.id } : null;
  const context = JSON.stringify(owner);
  const currentContext = React.useRef(context);
  currentContext.current = context;
  const [capability, setCapability] = useState({ context: '', ready: false });
  const [capabilityVisit, setCapabilityVisit] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = React.useRef(false);
  const [roster, setRoster] = useState(null);
  const [sourcePages, setSourcePages] = useState({});
  const activeAttempt = React.useRef(() => false);
  const notifiedRequest = React.useRef(null);
  const committedReview = React.useRef(null);
  useEffect(() => {
    let current = true;
    if (!owner) return;
    const generation = getActiveOrgGeneration();
    getDrawingCommandCapabilities(owner.projectId).then(flags => {
      if (current && generation === getActiveOrgGeneration()) setCapability({ context, ready: flags.contract_version === 1
        && flags.new_set && flags.revision && flags.write_boundary && flags.source_protection && flags.receipt_lookup });
    }).catch(() => { if (current) setCapability({ context, ready: false }); });
    return () => { current = false; };
  }, [context, capabilityVisit]);
  const available = capability.context === context && capability.ready;
  const command = useDrawingCommand(owner, { onCommitted: async (result, draft, fence) => {
    fence.assertCurrent?.();
    const isCurrent = activeAttempt.current;
    if (!isCurrent()) throw new Error('Review closed; receipt retained.');
    committedReview.current = { context, setId: result.set_id, revisionLabel: draft.payload.revision_label,
      setName: roster?.set?.id === result.set_id ? roster.set.set_name : undefined };
    setStep('success'); setFlowError('');
    await invalidateEntities(qc, ['drawing', 'drawingSet', 'drawing_revision', 'submittal'], draft.owner.projectId);
    fence.assertCurrent?.();
    if (!isCurrent()) throw new Error('Review closed; receipt retained.');
  } });
  const attestationState = useDocControlAttestations(user?.full_name || user?.email || "", initialAttestations);
  const [derivedSets, setDerivedSets] = React.useState([]);
  useEffect(() => {
    if (!open || !activeProject?.id) return;
    let current = true;
    entities.Drawing.filterAll({ project_id: activeProject.id }, "id").then(drawings => {
      if (!current) return;
      const existingNames = new Set(drawingSets.map(ds => ds.set_name));
      setDerivedSets(deriveVirtualSets(drawings, existingNames));
    }).catch((e) => { console.error("Failed to load drawing sets:", e); });
    return () => { current = false; };
  }, [open, activeProject?.id, drawingSets]);
  const [step, setStep] = useState("selectSet");
  const [selectedSet, setSelectedSet] = useState(preSelectedSet || null);
  const [revMeta, setRevMeta] = useState({
    revisionLabel: initialReview?.revisionLabel || "",
    issueDate: initialReview?.issueDate || "",
    issuedBy: initialReview?.issuedBy || "",
    notes: "",
    disposition: "superseded",
  });
  const [pdfFile, setPdfFile] = useState(initialPdfFile);
  const sourceSnapshots = useDrawingSourceSnapshots(activeProject?.id);
  const activeReview = React.useRef({ projectId: activeProject?.id, file: pdfFile, generation: 0 });
  const reviewContext = React.useRef(context);
  activeReview.current.projectId = activeProject?.id;
  activeReview.current.file = pdfFile;
  useEffect(() => () => { activeReview.current.generation++; }, []);
  useEffect(() => {
    activeReview.current.generation++;
    setRoster(null); setMatchedSheets([]); setSourcePages({});
    setStep(preSelectedSet ? 'revMeta' : 'selectSet');
    setFlowError('');
    if (reviewContext.current !== context) attestationState.resetAttestations();
    reviewContext.current = context;
    sourceSnapshots.reset();
  }, [context]);
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
    if (nextFile !== pdfFile) {
      activeReview.current.generation++;
      sourceSnapshots.reset();
      setMatchedSheets([]);
      setExtraction({ setMeta: null, scanned: false });
      attestationState.resetAttestations();
    }
    setPdfFile(nextFile);
  };
  const handleExtract = async () => {
    if (busyRef.current || command.draft) return;
    busyRef.current = true; setBusy(true);
    const capturedContext = context;
    const orgGeneration = getActiveOrgGeneration();
    const generation = ++activeReview.current.generation;
    const isCurrent = () => currentContext.current === capturedContext && getActiveOrgGeneration() === orgGeneration && activeReview.current.generation === generation;
    try {
      if (!pdfFile || !isPdfFile(pdfFile) || pdfFile.size > MAX_PDF_SIZE_MB * 1024 * 1024) {
        setFlowError(`Select a PDF under ${MAX_PDF_SIZE_MB} MB before extraction.`);
        return;
      }
      setFlowError("");
      setStep("processing");
      setProcessingMsg("Uploading PDF...");
      setProcessingPct(10);
      sourceSnapshots.reset();
      const projectId = activeProject?.id;
      const file = pdfFile;
      const assertActive = () => {
        if (!isCurrent() || activeReview.current.projectId !== projectId || activeReview.current.file !== file) {
          throw new Error("The drawing source review changed. Start a fresh source review.");
        }
      };
      const res = await UploadDrawingFile({ file, projectId, pathId: crypto.randomUUID(), assertActive });
      assertActive();
      setProcessingMsg("AI is reading the drawing set...");
      setProcessingPct(40);
      setExtraction({ setMeta: null, scanned: false });
      // The preflight already extracted this exact File and let a person key
      // scanned title blocks. Reusing that reviewed snapshot avoids a second
      // model call and, critically, keeps human values on the save path.
      let physicalPageCount = samePreflightPdf ? initialReview?.pageCount : null;
      let newSheets;
      try {
        newSheets = samePreflightPdf && Array.isArray(initialReview?.sheets) ? initialReview.sheets : await extractRevisionSheets(pdfFile, {
          onExtraction: value => { assertActive(); physicalPageCount = value.pageCount; setExtraction(value); },
          titleblockTemplate: {
            titleRect:  selectedSet?.titleblock_title_rect  ?? null,
            numberRect: selectedSet?.titleblock_number_rect ?? null,
            revisionRect: selectedSet?.titleblock_revision_rect ?? null,
          },
        });
      } catch {
        assertActive();
        physicalPageCount = await readPdfPageCount(pdfFile);
        assertActive();
        // A blank manual row is intentional: never infer a page, code or mark.
        newSheets = [{ sheetNumber: '', sheetTitle: '', revision: '', pdfPage: null }];
        setExtraction({ setMeta: null, scanned: true, pageCount: physicalPageCount });
        setFlowError('Extraction unavailable. Inspect the PDF and enter each sheet, revision code and physical page manually.');
      }
      if (samePreflightPdf && initialReview) {
        setExtraction({ setMeta: initialReview.setMeta ?? null, scanned: initialReview.scanned === true, pageCount: initialReview.pageCount ?? null });
      }
      assertActive();
      setProcessingMsg("Comparing sheets...");
      setProcessingPct(80);

    let oldSheets = [];
    try {
      const [reviewedSet, existing] = await Promise.all([
        selectedSet?.id ? entities.DrawingSet.get(selectedSet.id) : Promise.resolve(selectedSet),
        loadSetDrawings(projectId, selectedSet),
      ]);
      assertActive();
      const activeSheets = existing.filter(d => !d.is_superseded && !d.is_deleted && !d.deleted_at);
      if (activeSheets.length > 250) throw new Error('The complete roster exceeds the reviewed command limit.');
      const histories = activeSheets.length ? await entities.DrawingRevision.filterAll({ project_id: projectId, drawing_id: activeSheets.map(d => d.id), is_current: true }, 'id') : [];
      assertActive();
      const frozenSheets = activeSheets.map(d => {
        const current = histories.filter(history => history.drawing_id === d.id && history.is_current);
        if (current.length > 1 || current.some(history => history.archived_at || history.project_id !== projectId)) throw new Error('Unsupported current revision topology.');
        return { ...d, expected_revision_id: current[0]?.id ?? null };
      });
      setRoster({ set: { ...reviewedSet }, sheets: frozenSheets });
      oldSheets = frozenSheets.map(d => ({
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
      assertActive();
      console.error("Failed to fetch existing drawings:", e);
      setFlowError("Could not load the complete live set sheets and current revision roster. Retry before applying this revision.");
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
          reviewed: false,
        })),
      );
      assertActive();
      const snapshots = await sourceSnapshots.capture([res.path]);
      assertActive();
      matched.forEach(m => {
        // Duplicate groups retain every incoming page, not only the displayed first member.
        (m.newSheets || (m.newSheet ? [m.newSheet] : [])).forEach(sheet => {
          sheet.fileUrl = res.path;
          sheet.sourceFileUrl = res.path;
          sheet.sourceSnapshot = snapshots[0];
          sheet.reviewed = false;
        });
      });
      setMatchedSheets(matched);
      setSourcePages({ [res.path]: physicalPageCount });
      setSupersedeUnlisted(false);
      setProcessingPct(100);
      await new Promise(r => setTimeout(r, 400));
      assertActive();
      setStep("comparison");
    } catch (error) {
      if (!isCurrent()) return;
      console.error("Revision extraction failed:", error);
      setFlowError(error?.message || "Unable to upload or parse this revision PDF.");
      setStep("dropPDF");
    } finally { busyRef.current = false; setBusy(false); }
  };

  const handleApply = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    const generation = activeReview.current.generation;
    const orgGeneration = getActiveOrgGeneration();
    const isCurrent = () => currentContext.current === context && generation === activeReview.current.generation && orgGeneration === getActiveOrgGeneration();
    activeAttempt.current = isCurrent;
    try {
      setFlowError("");
      if (command.draft) throw new Error('Reconcile or explicitly dismiss the saved review before preparing another.');
      if (matchedSheets.some(match => match.newSheet?.sourceReviewRequired)) {
        setFlowError("The PDF page or file changed. Complete a fresh source review before confirming this revision.");
        return;
      }
      if (!sourceSnapshots.ready) {
        setFlowError("The PDF page or file changed. Start a fresh source review before confirming this revision.");
        return;
      }
      const invalidSource = matchedSheets.some(match => {
        if (!match.newSheet) return false;
        const page = validatePdfPage(match.newSheet.pdfPage);
        const count = sourcePages[match.newSheet.sourceFileUrl];
        return !match.newSheet.sourceFileUrl || page === null || !Number.isInteger(count) || count < 1 || page > count;
      });
      if (invalidSource) {
        setFlowError("Every incoming sheet needs its source PDF and a confirmed in-range PDF page. Return to Document Control to review the source.");
        return;
      }
      const paths = [...new Set(matchedSheets.filter(match => match.newSheet).map(match => match.newSheet.sourceFileUrl))];
      if (!await sourceSnapshots.verify(paths)) {
        setFlowError("The source identity is unavailable or changed. Start a fresh source review before confirming this revision.");
        return;
      }
      if (!isCurrent()) return;
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
      const currentStage = deriveSetStage(roster?.set, roster?.sheets);
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
      if (!owner || !available || !['reviewing', 'committed'].includes(command.state)) throw new Error('The transactional revision service is unavailable. Refresh readiness before applying; no legacy writes will run.');
      const payload = buildReviewedRevisionPayload({ projectId: owner.projectId, roster, matches: matchedSheets,
        removeUnlisted: supersedeUnlisted, revisionLabel: revMeta.revisionLabel, issueDate: revMeta.issueDate,
        issuedBy: revMeta.issuedBy, notes: revMeta.notes, sources: sourceSnapshots.snapshots, sourcePages });
      if (!isCurrent()) return;
      await command.prepare({ version: 1, requestId: crypto.randomUUID(), operation: 'revise_set', owner, payload });
      if (!isCurrent()) return;
      showOutcome(await command.apply(), isCurrent);
    } catch (error) {
      if (!isCurrent()) return;
      console.error("Revision apply failed:", error);
      setFlowError(error?.message || "Failed to apply revision changes.");
      setStep("comparison");
    } finally { busyRef.current = false; setBusy(false); }
  };

  const showOutcome = (outcome, isCurrent) => {
    if (!isCurrent()) return;
    if (outcome.kind === 'committed') { setStep('success'); setFlowError(''); }
    else if (outcome.kind === 'rejected') setFlowError(`Revision rejected; zero sheets committed by this attempt. ${outcome.error.code}. Reconcile or dismiss this saved review, then reopen comparison before trying changed input.`);
    else setFlowError('The revision may have committed. Reconcile the saved receipt before starting another review.');
  };
  const handleRecovery = async (discard = false) => {
    if (busyRef.current || command.draft?.operation !== 'revise_set') return;
    busyRef.current = true; setBusy(true);
    const generation = activeReview.current.generation;
    const orgGeneration = getActiveOrgGeneration();
    const isCurrent = () => currentContext.current === context && generation === activeReview.current.generation && orgGeneration === getActiveOrgGeneration();
    activeAttempt.current = isCurrent;
    try {
      if (discard) {
        if (await command.dismissSavedReview() && isCurrent()) reset();
      } else showOutcome(await command.reconcile(), isCurrent);
    } catch {
      if (isCurrent() && command.outcome?.kind !== 'committed') setFlowError('The saved revision remains unresolved. Receipt recovery is unavailable; do not create another copy.');
    } finally { busyRef.current = false; setBusy(false); }
  };

  const setReviewedMatchedSheets = (next) => {
    if (busyRef.current || command.draft) return;
    activeReview.current.generation++;
    const updated = typeof next === "function" ? next(matchedSheets) : next;
    const sourceEdited = updated.some((match, index) => {
      const previous = matchedSheets[index]?.newSheet;
      const incoming = match.newSheet;
      return incoming && previous && (incoming.pdfPage !== previous.pdfPage || incoming.sourceFileUrl !== previous.sourceFileUrl || incoming.fileUrl !== previous.fileUrl);
    });
    if (sourceEdited) {
      const fileEdited = updated.some((match, index) => match.newSheet && matchedSheets[index]?.newSheet
        && (match.newSheet.sourceFileUrl !== matchedSheets[index].newSheet.sourceFileUrl || match.newSheet.fileUrl !== matchedSheets[index].newSheet.fileUrl));
      if (fileEdited) sourceSnapshots.invalidate();
      attestationState.resetAttestations();
      setExtraction(previous => ({ setMeta: null, scanned: false, pageCount: fileEdited ? null : previous.pageCount ?? null }));
      setMatchedSheets(updated.map((match, index) => match.newSheet ? { ...match, newSheet: { ...match.newSheet, sourceSnapshot: matchedSheets[index]?.newSheet?.sourceSnapshot, extractedText: null, callouts: null, hyperlinks: null, manual: undefined, reviewed: false, sourceReviewRequired: true } } : match));
      setFlowError("The PDF page or file changed. Start a fresh source review.");
    } else {
      const numberEdited = updated.some((match, index) => match.newSheet?.sheetNumber !== matchedSheets[index]?.newSheet?.sheetNumber);
      if (numberEdited) {
        attestationState.resetAttestations();
        // The editable first member may differ from newSheets[0]. Keep its edit
        // AND every remaining member; collapsing a duplicate must never omit a page.
        setMatchedSheets(matchSheets(
          matchedSheets.flatMap(match => match.oldSheets || (match.oldSheet ? [match.oldSheet] : [])),
          updated.flatMap(match => match.newSheet ? [match.newSheet, ...(match.newSheets?.slice(1) || [])] : []),
        ));
      } else setMatchedSheets(updated);
    }
  };

  const reset = () => {
    activeReview.current.generation++;
    sourceSnapshots.reset();
    setStep(preSelectedSet ? "revMeta" : "selectSet");
    setSelectedSet(preSelectedSet || null);
    setRevMeta({ revisionLabel: "", issueDate: "", issuedBy: "", notes: "", disposition: "superseded" });
    setPdfFile(null); setMatchedSheets([]); setSupersedeUnlisted(false);
    setRoster(null); setSourcePages({});
    attestationState.resetAttestations();
    setFlowError("");
  };

  const closeModal = () => { reset(); onClose(); };
  const handleSuccessClose = async () => {
    const result = command.outcome?.kind === 'committed' ? command.outcome.result : null;
    if (!result || command.draft || busyRef.current) return;
    const isCurrent = activeAttempt.current;
    if (!isCurrent() || !owner || currentContext.current !== context || getActiveOrgId() !== owner.orgId) return;
    if (result.set_id !== selectedSet?.id) { closeModal(); return; }
    if (notifiedRequest.current === result.request_id) { closeModal(); return; }
    notifiedRequest.current = result.request_id;
    const reviewed = committedReview.current;
    try {
      await onComplete?.({ complete: true, failed: 0, historyFailed: 0, setId: result.set_id,
        ...(reviewed?.context === context && reviewed.setId === result.set_id ? { setName: reviewed.setName, revisionLabel: reviewed.revisionLabel } : {}) });
      if (isCurrent()) closeModal();
    } catch {
      if (isCurrent()) setFlowError('Revision saved and acknowledged. The parent screen could not finish its navigation or refresh. Close and reload the register; do not apply again.');
    }
  };
  const handleClose = () => {
    if (command.outcome?.kind === 'committed' && !command.draft) void handleSuccessClose();
    else closeModal();
  };
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
          {!available && <p role="note">Atomic revision readiness checks are incomplete. Review may continue, but no legacy writes will run. <button onClick={() => setCapabilityVisit(value => value + 1)} disabled={busy}>Refresh readiness</button></p>}
          {command.draft && <div role="status">
            <p>{command.outcome?.kind === 'committed' ? 'Revision committed. Follow-up remains incomplete; the saved receipt is retained.' : 'A saved drawing review remains unresolved. Closing does not cancel a dispatched command.'}</p>
            {command.draft.operation === 'revise_set' ? <>
              <button disabled={busy} onClick={() => handleRecovery()}>Reconcile saved receipt</button>
              <button disabled={busy} onClick={() => handleRecovery(true)}>{command.outcome?.kind === 'committed' ? 'Finish saved follow-up' : 'Check receipt and dismiss review'}</button>
            </> : <p>Open New Drawing Set to reconcile its saved request.</p>}
          </div>}
          {command.error && <p role="alert">{command.error.message}</p>}
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
          {step === "success" && command.outcome?.kind === 'committed' && <StepSuccess result={command.outcome.result}
            differentSet={command.outcome.result.set_id !== selectedSet?.id} busy={busy || !!command.draft} onClose={handleSuccessClose} />}
          {!command.draft && step === "selectSet" && (
            <StepSelectSet drawingSets={[...drawingSets, ...derivedSets]} preSelectedSet={preSelectedSet} onSelect={s => { setSelectedSet(s); setRevMeta(p => ({ ...p, issuedBy: s.issued_by || "" })); setStep("revMeta"); }} onClose={handleClose} loading={false} error={null} />
          )}
          {!command.draft && step === "revMeta" && selectedSet && (
            <StepRevMeta selectedSet={selectedSet} revMeta={revMeta} setRevMeta={setRevMeta} onBack={() => preSelectedSet ? handleClose() : setStep("selectSet")} onNext={() => setStep("dropPDF")} />
          )}
          {!command.draft && step === "dropPDF" && (
            <StepDropPDF selectedSet={selectedSet} revMeta={revMeta} file={pdfFile} setFile={setReviewedPdfFile} onBack={() => setStep("revMeta")} onExtract={handleExtract} />
          )}
          {step === "processing" && <StepProcessing message={processingMsg} progress={processingPct} />}
          {!command.draft && step === "comparison" && (
            <DocControlAttestationProvider value={attestationState}>
              <StepSheetComparison selectedSet={selectedSet} revMeta={revMeta} extraction={extraction} activeProject={activeProject} matchedSheets={matchedSheets} setMatchedSheets={setReviewedMatchedSheets} supersedeUnlisted={supersedeUnlisted} setSupersedeUnlisted={setSupersedeUnlisted} onBack={() => setStep("dropPDF")} onConfirm={handleApply} busy={busy} />
            </DocControlAttestationProvider>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
