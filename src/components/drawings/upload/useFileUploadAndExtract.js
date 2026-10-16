import { useCallback, useEffect, useRef } from "react";
import { entities } from "@/api/supabaseClient";
import { UploadDrawingFile } from "@/api/client/uploads";
import { EMPTY_SET_META } from "@/lib/pdfSheetExtractor";
import { getActiveOrgGeneration, subscribeActiveOrgChange } from "@/lib/activeOrg";
import { useDrawingSourceSnapshots } from "./useDrawingSourceSnapshots";
import { readPdfPageCount } from "@/lib/docControl/pdfPageCount";
import { withTimeout, newUploadBatchId } from "@/lib/drawingUploadUtils";
import { validateAndExtract, makeProgressSteps, mergeAiSetMetadata } from "../drawingSetUploadHelpers";

const UPLOAD_TIMEOUT_MS  = 90_000;
const EXTRACT_TIMEOUT_MS = 300_000;

export function useFileUploadAndExtract({ files, meta, activeProject, state }) {
  const sourceSnapshots = useDrawingSourceSnapshots(activeProject?.id);
  const { reset: resetSourceSnapshots } = sourceSnapshots;
  const {
    setProcessError, setStep, setUploadBatchId, setProcessingStatus,
    setMeta, setAiFilledFields, setSheets, setFileResults, cancelledRef,
  } = state;
  const processingGeneration = useRef(0);
  const selectedContext = useRef({ projectId: activeProject?.id, files: [...files] });
  const contextChanged = selectedContext.current.projectId !== activeProject?.id
    || selectedContext.current.files.length !== files.length
    || files.some((file, index) => file !== selectedContext.current.files[index]);
  // Invalidate synchronously on render, before any old promise continuation.
  if (contextChanged) {
    processingGeneration.current++;
    selectedContext.current = { projectId: activeProject?.id, files: [...files] };
  }
  const resetProcessingSources = useCallback(() => {
    processingGeneration.current++;
    cancelledRef.current = true;
    resetSourceSnapshots();
    setSheets([]);
    setFileResults([]);
  }, [cancelledRef, resetSourceSnapshots, setSheets, setFileResults]);
  useEffect(() => {
    if (contextChanged) resetProcessingSources();
  });
  useEffect(() => subscribeActiveOrgChange(resetProcessingSources), [resetProcessingSources]);
  useEffect(() => () => { processingGeneration.current++; }, []);

  const handleUploadAndProcess = async () => {
    const projectId = activeProject?.id;
    const runFiles = [...files];
    if (projectId !== selectedContext.current.projectId || runFiles.length !== selectedContext.current.files.length
      || runFiles.some((file, index) => file !== selectedContext.current.files[index])) return;
    const generation = ++processingGeneration.current;
    const orgGeneration = getActiveOrgGeneration();
    const isCurrent = () => generation === processingGeneration.current && !cancelledRef.current
      && orgGeneration === getActiveOrgGeneration() && projectId === selectedContext.current.projectId
      && runFiles.length === selectedContext.current.files.length
      && runFiles.every((file, index) => file === selectedContext.current.files[index]);
    cancelledRef.current = false;
    resetSourceSnapshots();
    setSheets([]);
    setFileResults([]);
    setProcessError(null);
    setStep(3);
    const batchId = newUploadBatchId();
    setUploadBatchId(batchId);
    const allSheets  = [];
    const results    = [];
    const totalFiles = runFiles.length;
    const aggregateSetMeta = { ...EMPTY_SET_META };
    const aiFilled = {};

    let titleblockTemplate = null;
    try {
      const setName = (meta.setName || "").trim();
      if (setName && activeProject?.id) {
        const existing = await entities.DrawingSet.filter({
          project_id: activeProject.id,
          set_name:   setName,
        });
        if (!isCurrent()) return;
        if (Array.isArray(existing) && existing.length > 0) {
          const tRect = existing[0].titleblock_title_rect;
          const nRect = existing[0].titleblock_number_rect;
          const rRect = existing[0].titleblock_revision_rect;
          if (tRect && nRect) {
            titleblockTemplate = { titleRect: tRect, numberRect: nRect, revisionRect: rRect || null };
          }
        }
      }
    } catch (e) {
      if (!isCurrent()) return;
      console.warn("Titleblock template lookup failed — extraction will use LLM fallback:", e);
    }

    try {
      for (let i = 0; i < runFiles.length; i++) {
        if (!isCurrent()) return;
        const file = runFiles[i];

        setProcessingStatus({
          steps: makeProgressSteps("upload", []),
          currentStepId: "upload",
          progress: Math.round((i / totalFiles) * 15),
          message: `Uploading ${file.name}… (${i + 1} of ${totalFiles})`,
        });

        let fileUrl;
        try {
          const res = await withTimeout(
            UploadDrawingFile({ file, projectId, pathId: crypto.randomUUID(), assertActive: () => {
              if (!isCurrent()) throw new Error("Drawing upload project or review changed.");
            } }),
            UPLOAD_TIMEOUT_MS,
            "File upload"
          );
          if (!isCurrent()) return;
          fileUrl = res?.path;
          if (!fileUrl) throw new Error("Upload succeeded but no source path was returned");
        } catch (err) {
          if (!isCurrent()) return;
          results.push({ fileName: file.name, sheetCount: 0, status: "failed", error: err.message });
          continue;
        }

        if (!isCurrent()) return;

        const baseProgress = Math.round(((i + 0.2) / totalFiles) * 90);

        setProcessingStatus({
          steps: makeProgressSteps("encode", ["upload"]),
          currentStepId: "encode",
          progress: baseProgress + 5,
          message: `Preparing ${file.name} for AI…`,
        });

        setProcessingStatus({
          steps: makeProgressSteps("extract", ["upload", "encode"]),
          currentStepId: "extract",
          progress: baseProgress + 10,
          message: `Claude is reading ${file.name}… (${i + 1} of ${totalFiles})`,
        });

        const sizeMB = file.size / (1024 * 1024);
        let extractResult;
        try {
          extractResult = await withTimeout(
            validateAndExtract(file, {
              ...(titleblockTemplate ? { titleblockTemplate } : {}),
              onStatus: (status) => {
                if (!isCurrent()) return;
                if (status.phase === 'rate-limit-wait') {
                  setProcessingStatus(prev => isCurrent() ? ({
                    ...prev,
                    message: `Rate limit cooldown — ${status.remainingSec}s before reading ${file.name}… (${i + 1} of ${totalFiles})`,
                  }) : prev);
                } else if (status.phase === 'llm-calling') {
                  setProcessingStatus(prev => isCurrent() ? ({
                    ...prev,
                    message: `Claude is reading ${file.name}… (${i + 1} of ${totalFiles})`,
                  }) : prev);
                }
              },
            }),
            EXTRACT_TIMEOUT_MS,
            "AI extraction"
          );
        } catch (err) {
          if (!isCurrent()) return;
          const physicalPageCount = await readPdfPageCount(file);
          if (!isCurrent()) return;
          extractResult = {
            pageCount: physicalPageCount,
            setMeta: { ...EMPTY_SET_META },
            sheets: [{
              sheetNumber: "",
              sheetTitle: "",
              discipline: meta.discipline, sheetType: "General",
              revision: "", scale: "", date: "", pdfPage: null,
              extractedText: null, callouts: null,
              _note: `Extraction unavailable: ${err.message}. Enter and review the sheet number, revision code and physical PDF page manually.`,
            }],
            scanned: false,
            extractFailed: true,
            error: physicalPageCount ? err.message : "The PDF page count could not be verified. Re-upload a readable PDF before reviewing physical pages.",
          };
        }

        if (!isCurrent()) return;

        setProcessingStatus({
          steps: makeProgressSteps("parse", ["upload", "encode", "extract"], extractResult.scanned ? { extract: true } : {}),
          currentStepId: "parse",
          progress: baseProgress + 20,
          message: `Building sheet list for ${file.name}…`,
        });

        const extractedSetMeta = extractResult.setMeta || {};
        for (const key of Object.keys(aggregateSetMeta)) {
          const v = String(extractedSetMeta[key] ?? "").trim();
          if (v && !aggregateSetMeta[key]) aggregateSetMeta[key] = v;
        }

        const tagged = extractResult.sheets.map(s => ({
          ...s,
          discipline:    s.discipline || meta.discipline,
          sourceFile:    file.name,
          sourceFileUrl: fileUrl,
          selected:      true,
        }));

        allSheets.push(...tagged);
        results.push({
          fileName:      file.name,
          fileUrl,
          sheetCount:    extractResult.sheets.length,
          status:        "success",
          scanned:       extractResult.scanned       || false,
          tooLarge:      extractResult.tooLarge      || false,
          extractFailed: extractResult.extractFailed || false,
          pageCount:     extractResult.pageCount ?? null,
          error:         extractResult.error || null,
          sizeMB,
        });

        if (i < runFiles.length - 1) {
          await new Promise(r => setTimeout(r, 200));
        }
      }

      if (!isCurrent()) return;

      if (allSheets.length === 0) {
        setFileResults(results);
        setProcessError("No drawing sheets were extracted. Check the failed file details and try again.");
        setStep(3);
        return;
      }

      // One bounded source read before rendering review. Preserve these tokens
      // on the file and each sheet; confirmation must compare, never recapture.
      const snapshots = await sourceSnapshots.capture(results.filter(result => result.status === "success").map(result => result.fileUrl));
      if (!isCurrent()) return;
      const snapshotByPath = new Map(snapshots.map(snapshot => [snapshot.path, snapshot]));
      const reviewedSheets = allSheets.map(sheet => ({ ...sheet, sourceSnapshot: snapshotByPath.get(sheet.sourceFileUrl) }));
      const reviewedResults = results.map(result => ({ ...result, sourceSnapshot: snapshotByPath.get(result.fileUrl) ?? null }));

      setMeta(prev => {
        if (!isCurrent()) return prev;
        const { merged, aiFilled: prevAiFilled } = mergeAiSetMetadata(prev, aggregateSetMeta, undefined);
        Object.assign(aiFilled, prevAiFilled);
        return merged;
      });
      setAiFilledFields(aiFilled);

      setProcessingStatus({
        steps: makeProgressSteps(null, ["upload", "encode", "extract", "parse", "done"]),
        currentStepId: null,
        progress: 100,
        message: `Found ${allSheets.length} sheets across ${results.filter(r => r.status === "success").length} file(s)`,
      });

      setSheets(reviewedSheets);
      setFileResults(reviewedResults);
      await new Promise(r => setTimeout(r, 600));

      if (isCurrent()) setStep(4);

    } catch (fatalErr) {
      if (!isCurrent()) return;
      console.error("Fatal upload error:", fatalErr);
      setProcessError(fatalErr.message || "An unexpected error occurred. Please try again.");
    }
  };

  // Task 8 wires this setter into ReviewStep. Page edits retain the PDF token
  // but require explicit review of the new page with no inherited evidence.
  const setReviewedSheets = (next) => {
    const previous = state.sheets || [];
    const updated = typeof next === "function" ? next(previous) : next;
    let changed = false;
    const reviewed = updated.map((sheet, index) => {
      const prior = previous[index];
      if (!prior) return sheet;
      const fileChanged = sheet.sourceFileUrl !== prior.sourceFileUrl || sheet.sourceFile !== prior.sourceFile;
      if (!fileChanged && sheet.pdfPage === prior.pdfPage) return sheet;
      changed = true;
      if (fileChanged) sourceSnapshots.invalidate();
      return { ...sheet, sourceSnapshot: prior.sourceSnapshot, extractedText: null, callouts: null, hyperlinks: null, reviewed: false, sourceReviewRequired: true };
    });
    if (changed) state.resetAttestations?.();
    setSheets(reviewed);
  };

  return { handleUploadAndProcess, sourceSnapshots: { ...sourceSnapshots, reset: resetProcessingSources }, setReviewedSheets };
}
