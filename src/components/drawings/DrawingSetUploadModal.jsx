import React from "react";
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
  const {
    step, setStep,
    files, setFiles,
    meta, setMeta,
    processingStatus,
    sheets, setSheets,
    fileResults,
    createdCount,
    processError,
    aiFilledFields,
    uploadBatchId,
    reset,
    handleClose,
  } = state;

  const { handleUploadAndProcess } = useFileUploadAndExtract({ files, meta, activeProject, state });
  const { handleCreate } = useDrawingSetCreation({ meta, activeProject, fileResults, uploadBatchId, onComplete, qc, state });

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
          {step === 0 && <ChoiceStep onNewSet={() => setStep(1)} onNewRevision={() => { handleClose(); if (onNewRevision) onNewRevision(); }} onClose={handleClose} />}
          {step === 1 && <SetInfoStep meta={meta} setMeta={setMeta} onBack={() => setStep(0)} onNext={() => setStep(2)} projectName={activeProject?.name} existingSetNames={existingSetNames} />}
          {step === 2 && <FileDropStep files={files} setFiles={setFiles} onBack={() => setStep(1)} onUpload={handleUploadAndProcess} setName={meta.setName} />}
          {step === 3 && <ProcessingStep processingStatus={processingStatus} onCancel={reset} error={processError} />}
          {step === 4 && <ReviewStep sheets={sheets} setSheets={setSheets} fileResults={fileResults} meta={meta} setMeta={setMeta} aiFilledFields={aiFilledFields} onBack={() => setStep(2)} onCreate={handleCreate} existingDrawings={existingDrawings} />}
          {step === 5 && <SuccessStep createdCount={createdCount} fileResults={fileResults} onViewLog={handleClose} onUploadAnother={reset} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
