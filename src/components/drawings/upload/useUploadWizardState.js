import { useState, useRef, useCallback } from "react";

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
  const reviewGenerationRef               = useRef(0);
  const [step, setStep]                   = useState(0);
  const [files, updateFiles]              = useState([]);
  const [meta, updateMeta]                = useState({
    setName: "", setNumber: "", discipline: "Structural", defaultStage: "Not Started",
    revision: "0",
    issueDate: "", issuedBy: "", notes: "",
  });
  const [processingStatus, setProcessingStatus] = useState({ steps: [], currentStepId: null, progress: 0, message: "" });
  const [sheets, updateSheets]            = useState([]);
  const [fileResults, updateFileResults]  = useState([]);
  // Synchronous review invalidation also covers edits while source verification awaits.
  const setFiles = useCallback(next => { reviewGenerationRef.current++; updateFiles(next); }, []);
  const setMeta = useCallback(next => { reviewGenerationRef.current++; updateMeta(next); }, []);
  const setSheets = useCallback(next => { reviewGenerationRef.current++; updateSheets(next); }, []);
  const setFileResults = useCallback(next => { reviewGenerationRef.current++; updateFileResults(next); }, []);
  const [createdCount, setCreatedCount]   = useState(0);
  const [processError, setProcessError]   = useState(null);
  const [supersedeResult, setSupersedeResult] = useState(null); // cross-set supersede { superseded, failed, skipped }
  const [aiFilledFields, setAiFilledFields] = useState({}); // { setName: true, ... }
  const [uploadBatchId, setUploadBatchId] = useState(null); // set once per upload attempt
  const cancelledRef                      = useRef(false);

  const reset = useCallback(() => {
    reviewGenerationRef.current++;
    cancelledRef.current = true;  // abort any in-progress operation
    setStep(0); setFiles([]); setSheets([]); setFileResults([]); setCreatedCount(0);
    setProcessError(null);
    setSupersedeResult(null);
    setAiFilledFields({});
    setUploadBatchId(null);
    setProcessingStatus({ steps: [], currentStepId: null, progress: 0, message: "" });
    setMeta({ setName: "", setNumber: "", discipline: "Structural", defaultStage: "Not Started", revision: "0", issueDate: "", issuedBy: "", notes: "" });
  }, [setFiles, setSheets, setFileResults, setMeta]);

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
    supersedeResult, setSupersedeResult,
    aiFilledFields, setAiFilledFields,
    uploadBatchId, setUploadBatchId,
    cancelledRef,
    reviewGenerationRef,
    reset,
    handleClose,
  };
}
