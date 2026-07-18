import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StepChoice from "./upload/StepChoice";
import StepFiles from "./upload/StepFiles";
import StepMeta from "./upload/StepMeta";
import StepProcessing from "./upload/StepProcessing";
import StepReview from "./upload/StepReview";
import StepSuccess from "./upload/StepSuccess";
import { useUploadWizardState } from "./upload/useUploadWizardState";
import { useFileUploadAndExtract } from "./upload/useFileUploadAndExtract";
import { useDrawingSetCreation } from "./upload/useDrawingSetCreation";

// ─── Main Modal ──────────────────────────────────────────────────────
//
// Wizard flow (new parent/child model):
//   0: Choice         — new drawing set vs new revision
//   1: Meta           — set name (required) + optional defaults
//   2: Files          — drag/drop multi-file picker
//   3: Processing     — upload + AI extraction (auto-started, no extra click)
//   4: Review         — verify AI-extracted sheets
//   5: Success        — report with per-file status
//
// On commit (handleCreate) we:
//   1. Create a single parent `drawing_sets` row via DrawingSet.create(...)
//   2. Create each child `drawings` row with drawing_set_id FK + upload_batch_id
//      + upload_status + ai_extraction_status set accurately
//   3. The DB trigger sync_drawing_set_counts() keeps parent aggregates fresh.
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
          {step === 0 && <StepChoice onNewSet={() => setStep(1)} onNewRevision={() => { handleClose(); if (onNewRevision) onNewRevision(); }} onClose={handleClose} />}
          {step === 1 && <StepMeta meta={meta} setMeta={setMeta} onBack={() => setStep(0)} onNext={() => setStep(2)} projectName={activeProject?.name} existingSetNames={existingSetNames} />}
          {step === 2 && <StepFiles files={files} setFiles={setFiles} onBack={() => setStep(1)} onUpload={handleUploadAndProcess} setName={meta.setName} />}
          {step === 3 && <StepProcessing processingStatus={processingStatus} onCancel={reset} error={processError} />}
          {step === 4 && <StepReview sheets={sheets} setSheets={setSheets} fileResults={fileResults} meta={meta} setMeta={setMeta} aiFilledFields={aiFilledFields} onBack={() => setStep(2)} onCreate={handleCreate} existingDrawings={existingDrawings} />}
          {step === 5 && <StepSuccess createdCount={createdCount} fileResults={fileResults} onViewLog={handleClose} onUploadAnother={reset} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
