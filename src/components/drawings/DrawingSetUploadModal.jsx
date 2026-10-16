import React, { useCallback, useContext, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ChoiceStep from "./uploadSteps/ChoiceStep";
import SetInfoStep from "./uploadSteps/SetInfoStep";
import FileDropStep from "./uploadSteps/FileDropStep";
import ProcessingStep from "./uploadSteps/ProcessingStep";
import ReviewStep from "./uploadSteps/ReviewStep";
import SuccessStep from "./uploadSteps/SuccessStep";
import { useUploadWizardState } from "./upload/useUploadWizardState";
import { useFileUploadAndExtract } from "./upload/useFileUploadAndExtract";
import { useDrawingSetCreation } from "./upload/useDrawingSetCreation";
import { usePermissions } from "@/services/permissions";
import { AuthContext } from "@/lib/AuthContext";
import { useOptionalOrg } from "@/components/shared/OrgContext";
import { Button } from "@/components/ui/button";

// ─── Main Modal ──────────────────────────────────────────────────────
//
// Wizard flow (new parent/child model):
//   0: Choice         — new drawing set vs new revision
//   1: SetInfo        — set name (required) + optional defaults
//   2: FileDrop       — drag/drop multi-file picker
//   3: Processing     — upload + AI extraction (auto-started, no extra click)
//   4: Review         — verify AI-extracted sheets
//   5: Success        — report with per-file status
//
export default function DrawingSetUploadModal({
  open,
  onClose,
  onComplete,
  activeProject,
  onNewRevision,
  existingDrawings = [],
  existingSetNames = [],
}) {
  const qc = useQueryClient();
  const state = useUploadWizardState({ onClose });
  const { can } = usePermissions();
  const user = useContext(AuthContext)?.user ?? null;
  const currentOrg = useOptionalOrg()?.currentOrg ?? null;
  const owner = open && user?.id && currentOrg?.id && activeProject?.id
    ? { actorId: user.id, orgId: currentOrg.id, projectId: activeProject.id } : null;
  const {
    step, setStep,
    files, setFiles,
    meta, setMeta,
    processingStatus,
    sheets,
    fileResults,
    createdCount,
    processError,
    aiFilledFields,
    reset: resetState,
  } = state;

  const { handleUploadAndProcess, sourceSnapshots, setReviewedSheets } = useFileUploadAndExtract({ files, meta, activeProject, state });
  const { handleCreate, handleRecover, handleDiscardSaved, command, available, preparing, refreshReadiness } = useDrawingSetCreation({ meta, activeProject, fileResults, onComplete, qc, state, owner, sourceSnapshots });
  const resetSources = sourceSnapshots.reset;
  const reset = useCallback(() => { resetSources(); resetState(); }, [resetSources, resetState]);
  const handleClose = () => { reset(); onClose(); };
  const ownerKey = JSON.stringify(owner);
  const previousOwner = useRef(ownerKey);
  useEffect(() => {
    if (previousOwner.current !== ownerKey) { previousOwner.current = ownerKey; reset(); }
  }, [ownerKey, reset]);
  const savedDraft = command.draft;
  const showRecovery = !!savedDraft && step !== 5;
  const saveBusy = preparing || command.state === "pending";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sbd-card-strong" style={{ maxWidth: 640, maxHeight: "90vh", overflowY: "auto" }}>
        <DialogHeader>
          <DialogTitle>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>Upload Drawing Set</span>
              {step !== 3 && (
                <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
                  {[0, 1, 2, 4, 5].map(s => (
                    <div key={s} style={{ width: 18, height: 4, borderRadius: 2, background: step >= s ? "var(--accent)" : "var(--bg-surface-high)" }} />
                  ))}
                </div>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div style={{ paddingTop: 8 }}>
          {showRecovery && <section aria-label="Saved drawing request">
            <h3>{command.state === "committed" ? "Drawing save committed" : "Saved drawing request requires reconciliation"}</h3>
            <p>The original reviewed request is retained. Closing this window does not cancel a dispatched save.</p>
            <p>Request {savedDraft.requestId} · {savedDraft.operation} · {savedDraft.payload.sheets.length} sheets</p>
            <details><summary>Original reviewed request</summary><pre style={{ maxHeight: 240, overflow: "auto", whiteSpace: "pre-wrap" }}>{JSON.stringify(savedDraft.payload, null, 2)}</pre></details>
            {(processError || command.error) && <p role="alert">{processError || command.error.message}</p>}
            {savedDraft.operation === "create_set"
              ? <Button disabled={saveBusy} onClick={handleRecover}>Reconcile saved request</Button>
              : <p>Resolve this saved revision in New Revision before creating a set.</p>}
            {savedDraft.operation === "create_set" && <>
              <p>Discard removes this local review only after a receipt check. It does not cancel a server request or guarantee an already-sent save cannot commit.</p>
              <Button disabled={saveBusy} variant="outline" onClick={handleDiscardSaved}>Check receipt and discard local review</Button>
            </>}
            <Button variant="outline" onClick={handleClose}>Close and retain request</Button>
          </section>}
          {(!available || command.state === "unavailable") && <p role="status">Atomic drawing intake is held until the complete server package and local recovery storage are available. Reopen this window after restoring browser recovery storage. <button type="button" onClick={refreshReadiness}>Refresh readiness</button></p>}
          {!showRecovery && step === 0 && <ChoiceStep onNewSet={() => setStep(1)} onNewRevision={() => { handleClose(); if (onNewRevision) onNewRevision(); }} onClose={handleClose} />}
          {!showRecovery && step === 1 && <SetInfoStep meta={meta} setMeta={setMeta} onBack={() => setStep(0)} onNext={() => setStep(2)} projectName={activeProject?.name} existingSetNames={existingSetNames} />}
          {!showRecovery && step === 2 && <FileDropStep files={files} setFiles={setFiles} onBack={() => setStep(1)} onUpload={handleUploadAndProcess} setName={meta.setName} />}
          {!showRecovery && step === 3 && <ProcessingStep processingStatus={processingStatus} onCancel={preparing ? handleClose : reset} error={processError} recoverable={preparing} />}
          {!showRecovery && step === 4 && <ReviewStep sheets={sheets} setSheets={setReviewedSheets} fileResults={fileResults} meta={meta} setMeta={setMeta} aiFilledFields={aiFilledFields} onBack={() => setStep(2)} onCreate={handleCreate} existingDrawings={existingDrawings} projectId={activeProject?.id ?? null} commandAvailable={available && ["reviewing", "committed"].includes(command.state) && can("create", "drawing")} />}
          {step === 5 && <SuccessStep createdCount={createdCount} fileResults={fileResults} processError={processError} commandWarning={command.error?.message} onViewLog={handleClose} onUploadAnother={savedDraft ? null : reset} onReconcile={savedDraft ? handleRecover : null} busy={saveBusy} />}

        </div>
      </DialogContent>
    </Dialog>
  );
}
