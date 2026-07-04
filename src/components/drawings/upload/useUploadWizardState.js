import { useState, useRef } from "react";

// ── useUploadWizardState ─────────────────────────────────────────────
// Owns the DrawingSetUploadModal wizard's ~15 useState/useRef cluster plus
// reset() and handleClose. Extracted verbatim from the modal so the state
// lives in one place and the two big async handlers (useFileUploadAndExtract,
// useDrawingSetCreation) can be co-located hooks that consume this bundle.
//
// The returned object is the single state bundle the modal + both handler
// hooks read from and write to — same setters, same refs, same defaults,
// same reset/handleClose semantics as before.
export function useUploadWizardState({ onClose }) {
  const [step, setStep]                   = useState(0);
  const [files, setFiles]                 = useState([]);
  const [meta, setMeta]                   = useState({
    setName: "", setNumber: "", discipline: "Structural", defaultStage: "Not Started",
    revision: "0",
    issueDate: new Date().toISOString().split("T")[0], issuedBy: "", notes: "",
  });
  const [processingStatus, setProcessingStatus] = useState({ steps: [], currentStepId: null, progress: 0, message: "" });
  const [sheets, setSheets]               = useState([]);
  const [fileResults, setFileResults]     = useState([]);
  const [createdCount, setCreatedCount]   = useState(0);
  const [processError, setProcessError]   = useState(null);
  const [aiFilledFields, setAiFilledFields] = useState({}); // { setName: true, ... }
  const [uploadBatchId, setUploadBatchId] = useState(null); // set once per upload attempt
  const cancelledRef                      = useRef(false);

  const reset = () => {
    cancelledRef.current = true;  // abort any in-progress operation
    setStep(0); setFiles([]); setSheets([]); setFileResults([]); setCreatedCount(0);
    setProcessError(null);
    setAiFilledFields({});
    setUploadBatchId(null);
    setProcessingStatus({ steps: [], currentStepId: null, progress: 0, message: "" });
    setMeta({ setName: "", setNumber: "", discipline: "Structural", defaultStage: "Not Started", revision: "0", issueDate: new Date().toISOString().split("T")[0], issuedBy: "", notes: "" });
  };

  const handleClose = () => { reset(); onClose(); };

  return {
    step, setStep,
    files, setFiles,
    meta, setMeta,
    processingStatus, setProcessingStatus,
    sheets, setSheets,
    fileResults, setFileResults,
    createdCount, setCreatedCount,
    processError, setProcessError,
    aiFilledFields, setAiFilledFields,
    uploadBatchId, setUploadBatchId,
    cancelledRef,
    reset,
    handleClose,
  };
}
