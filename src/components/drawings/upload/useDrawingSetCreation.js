import { useEffect, useRef, useState } from "react";
import { invalidateEntities } from "@/services/cacheRegistry";
import { getDrawingCommandCapabilities } from "@/api/client/drawingCommands";
import { buildCreateSetRequest } from "@/lib/drawingCommands/requestBuilders";
import { useDrawingCommand } from "@/lib/drawingCommands/useDrawingCommand";
import { getActiveOrgGeneration, getActiveOrgId } from "@/lib/activeOrg";
import { validatePdfPage } from "@/lib/pdfSheetExtractor";

export const CROSS_SET_HELD = "Cross-set supersession is unavailable until its reviewed server command is released. Existing sets remain live.";
export const SCHEDULE_HELD = "Drawings saved. Automatic schedule linking was not performed. Use Schedule to review and link tasks; do not re-upload these drawings.";

export function useDrawingSetCreation({ meta, activeProject, fileResults, onComplete, qc, state,
  owner = /** @type {import("@/lib/drawingCommands/types").DrawingCommandOwner | null} */ (null),
  sourceSnapshots = /** @type {Pick<ReturnType<typeof import("./useDrawingSourceSnapshots").useDrawingSourceSnapshots>, "ready" | "snapshots" | "verify"> | null} */ (null) }) {
  const { cancelledRef, setProcessError, setStep, setProcessingStatus, setCreatedCount } = state;
  const context = JSON.stringify(owner);
  const currentContext = useRef(context);
  const contextVisit = useRef(0);
  if (currentContext.current !== context) { currentContext.current = context; contextVisit.current++; }
  const activeAttempt = useRef(() => false);
  const committedAttempt = useRef(false);
  const capabilityProjectId = owner?.projectId;
  const busy = useRef(false);
  const [capability, setCapability] = useState({ context: "", ready: false });
  const [capabilityVisit, setCapabilityVisit] = useState(0);
  const [preparing, setPreparing] = useState(false);
  useEffect(() => {
    let current = true;
    if (!capabilityProjectId) return;
    const generation = getActiveOrgGeneration();
    getDrawingCommandCapabilities(capabilityProjectId).then(flags => {
      if (current && generation === getActiveOrgGeneration()) setCapability({ context, ready: flags.contract_version === 1
        && flags.new_set && flags.revision && flags.write_boundary && flags.source_protection && flags.receipt_lookup });
    }).catch(() => { if (current) setCapability({ context, ready: false }); });
    return () => { current = false; };
  }, [context, capabilityVisit, capabilityProjectId]);
  const available = capability.context === context && capability.ready;

  const command = useDrawingCommand(owner, { onCommitted: async (result, draft, fence) => {
    const currentAttempt = activeAttempt.current;
    const assertCurrent = () => {
      fence.assertCurrent?.();
      if (!currentAttempt()) throw new Error("Review closed; receipt retained.");
    };
    assertCurrent();
    committedAttempt.current = true;
    setCreatedCount(result.added);
    setProcessError(SCHEDULE_HELD);
    setStep(5);
    await invalidateEntities(qc, ["drawing", "drawingSet", "submittal", "drawing_revision"], draft.owner.projectId);
    assertCurrent();
    await onComplete?.();
    assertCurrent();
  } });

  const begin = () => {
    committedAttempt.current = false;
    cancelledRef.current = false;
    setProcessError(null);
    setStep(3);
    setCreatedCount(null);
    setProcessingStatus({ steps: [], currentStepId: null, progress: 0, message: "Checking the saved drawing command…" });
    const generation = getActiveOrgGeneration();
    const visit = contextVisit.current;
    const reviewGeneration = state.reviewGenerationRef?.current;
    const isCurrent = () => !cancelledRef.current && currentContext.current === context && visit === contextVisit.current
      && reviewGeneration === state.reviewGenerationRef?.current && generation === getActiveOrgGeneration()
      && (!owner || owner.orgId === getActiveOrgId());
    activeAttempt.current = isCurrent;
    return isCurrent;
  };
  const showOutcome = (outcome, isCurrent) => {
    if (!isCurrent()) return;
    if (outcome.kind === "rejected") {
      setCreatedCount(0);
      setProcessError(`Drawing save rejected; zero sheets committed by this attempt. ${outcome.error.message} The saved request is retained for receipt reconciliation.`);
    } else if (outcome.kind === "uncertain") {
      setProcessError("The drawing save may have committed. Its saved request remains recoverable. Reconcile the receipt before starting another upload.");
    }
  };

  const handleRecover = async () => {
    if (busy.current || command.draft?.operation !== "create_set") return;
    busy.current = true;
    const isCurrent = begin();
    try { showOutcome(await command.reconcile(), isCurrent); }
    catch { if (isCurrent()) setProcessError("The saved drawing request remains unresolved. Receipt recovery is unavailable; do not create another copy."); }
    finally { busy.current = false; }
  };

  const handleCreate = async (selectedSheets, { supersedeIds = /** @type {string[]} */ ([]) } = {}) => {
    if (busy.current) return;
    busy.current = true;
    setPreparing(true);
    const isCurrent = begin();
    let saved = false;
    try {
      if (supersedeIds.length) throw new Error(CROSS_SET_HELD);
      if (command.draft) throw new Error("A saved drawing request already exists. Reconcile that original request before preparing another.");
      if (!owner || activeProject?.id !== owner.projectId || !available || !["reviewing", "committed"].includes(command.state)) throw new Error("Atomic drawing intake is unavailable. Refresh readiness before saving; no legacy writes will run.");
      if (!sourceSnapshots?.ready) throw new Error("Source identity requires a fresh review.");
      if (!selectedSheets.length) throw new Error("Select at least one reviewed sheet.");
      for (const sheet of selectedSheets) {
        const count = fileResults.find(result => result.fileUrl === sheet.sourceFileUrl)?.pageCount;
        const page = validatePdfPage(sheet.pdfPage);
        const original = sourceSnapshots.snapshots.find(snapshot => snapshot.path === sheet.sourceFileUrl);
        if (page === null || !Number.isInteger(count) || count < 1 || page > count) throw new Error("Confirm an in-range PDF page against the source PDF before saving.");
        if (!sheet.reviewed || sheet.sourceReviewRequired) throw new Error("Explicitly review each selected sheet and physical PDF page before saving.");
        if (!original || sheet.sourceSnapshot?.path !== original.path || sheet.sourceSnapshot?.token !== original.token) throw new Error("The reviewed source identity changed. Start a fresh review.");
      }
      const paths = new Set(selectedSheets.map(sheet => sheet.sourceFileUrl));
      const payload = buildCreateSetRequest({
        project_id: owner.projectId, set_name: meta.setName, set_number: meta.setNumber || null,
        revision_label: meta.revision, discipline: meta.discipline || null, issued_date: meta.issueDate || null,
        issued_by: meta.issuedBy || null, notes: meta.notes || null, file_path: selectedSheets[0].sourceFileUrl,
        source_objects: sourceSnapshots.snapshots.filter(source => paths.has(source.path)),
        sheets: selectedSheets.map(sheet => ({ action: "added", sheet_number: sheet.sheetNumber,
          sheet_title: sheet.sheetTitle, revision_code: sheet.revision, discipline: sheet.discipline || null,
          file_path: sheet.sourceFileUrl, pdf_page: sheet.pdfPage, reviewed: true,
          extraction: {
            text: typeof sheet.extractedText === "string" ? { state: "harvested", value: sheet.extractedText } : { state: "unavailable" },
            callouts: Array.isArray(sheet.callouts) ? { state: "harvested", value: sheet.callouts } : { state: "unavailable" },
          },
        })),
      });
      if (!await sourceSnapshots.verify(sourceSnapshots.snapshots.map(source => source.path))) throw new Error("Source identity changed or could not be verified. Start a fresh review.");
      if (!isCurrent()) return;
      await command.prepare({ version: 1, requestId: crypto.randomUUID(), operation: "create_set", owner, payload });
      saved = true;
      if (!isCurrent()) return;
      showOutcome(await command.apply(), isCurrent);
    } catch (error) {
      if (isCurrent()) {
        if (!saved && !command.draft) setCreatedCount(0);
        setProcessError(saved ? "The saved drawing request remains unresolved. Reconcile its receipt; do not create another copy." : error.message);
      }
    } finally { busy.current = false; setPreparing(false); }
  };
  const handleDiscardSaved = async () => {
    if (busy.current || command.draft?.operation !== "create_set") return;
    busy.current = true;
    setPreparing(true);
    const isCurrent = begin();
    try {
      const discarded = await command.dismissSavedReview();
      if (discarded && isCurrent()) state.reset();
      else if (isCurrent() && !committedAttempt.current) setProcessError("The request was not discarded. Reconcile its receipt before starting another upload.");
    }
    catch { if (isCurrent()) setProcessError("The saved request could not be discarded. Its receipt remains unresolved."); }
    finally { busy.current = false; setPreparing(false); }
  };
  return { handleCreate, handleRecover, handleDiscardSaved, command, available, preparing, refreshReadiness: () => setCapabilityVisit(value => value + 1) };
}
