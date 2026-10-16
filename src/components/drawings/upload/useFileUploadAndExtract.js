import { useEffect, useRef } from "react";
import { entities } from "@/api/supabaseClient";
import { UploadDrawingFile } from "@/api/client/uploads";
import { EMPTY_SET_META } from "@/lib/pdfSheetExtractor";
import { useDrawingSourceSnapshots } from "./useDrawingSourceSnapshots";
import { withTimeout, newUploadBatchId } from "@/lib/drawingUploadUtils";
import { validateAndExtract, makeProgressSteps, mergeAiSetMetadata } from "../drawingSetUploadHelpers";

const UPLOAD_TIMEOUT_MS  = 90_000;
const EXTRACT_TIMEOUT_MS = 300_000;

export function useFileUploadAndExtract({ files, meta, activeProject, state }) {
  const sourceSnapshots = useDrawingSourceSnapshots(activeProject?.id);
  const selectedFiles = useRef(files);
  const selectedProject = useRef(activeProject?.id);
  selectedProject.current = activeProject?.id;
  useEffect(() => {
    if (selectedFiles.current.length !== files.length || files.some((file, index) => file !== selectedFiles.current[index])) {
      selectedFiles.current = files;
      sourceSnapshots.reset();
      state.cancelledRef.current = true;
      state.setSheets([]);
      state.setFileResults([]);
    }
  });
  const {
    setProcessError, setStep, setUploadBatchId, setProcessingStatus,
    setMeta, setAiFilledFields, setSheets, setFileResults, cancelledRef,
  } = state;

  const handleUploadAndProcess = async () => {
    cancelledRef.current = false;
    sourceSnapshots.reset();
    setSheets([]);
    setFileResults([]);
    setProcessError(null);
    setStep(3);
    const batchId = newUploadBatchId();
    setUploadBatchId(batchId);
    const allSheets  = [];
    const results    = [];
    const totalFiles = files.length;
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
      console.warn("Titleblock template lookup failed — extraction will use LLM fallback:", e);
    }

    try {
      for (let i = 0; i < files.length; i++) {
        if (cancelledRef.current) break;
        const file = files[i];

        setProcessingStatus({
          steps: makeProgressSteps("upload", []),
          currentStepId: "upload",
          progress: Math.round((i / totalFiles) * 15),
          message: `Uploading ${file.name}… (${i + 1} of ${totalFiles})`,
        });

        let fileUrl;
        try {
          const res = await withTimeout(
            UploadDrawingFile({ file, projectId: activeProject?.id, pathId: crypto.randomUUID(), assertActive: () => {
              if (cancelledRef.current || selectedProject.current !== activeProject?.id) throw new Error("Drawing upload project or review changed.");
            } }),
            UPLOAD_TIMEOUT_MS,
            "File upload"
          );
          fileUrl = res?.path;
          if (!fileUrl) throw new Error("Upload succeeded but no source path was returned");
        } catch (err) {
          results.push({ fileName: file.name, sheetCount: 0, status: "failed", error: err.message });
          continue;
        }

        if (cancelledRef.current) break;

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
                if (status.phase === 'rate-limit-wait') {
                  setProcessingStatus(prev => ({
                    ...prev,
                    message: `Rate limit cooldown — ${status.remainingSec}s before reading ${file.name}… (${i + 1} of ${totalFiles})`,
                  }));
                } else if (status.phase === 'llm-calling') {
                  setProcessingStatus(prev => ({
                    ...prev,
                    message: `Claude is reading ${file.name}… (${i + 1} of ${totalFiles})`,
                  }));
                }
              },
            }),
            EXTRACT_TIMEOUT_MS,
            "AI extraction"
          );
        } catch (err) {
          extractResult = {
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
            error: err.message,
          };
        }

        if (cancelledRef.current) break;

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

        if (i < files.length - 1) {
          await new Promise(r => setTimeout(r, 200));
        }
      }

      if (cancelledRef.current) return;

      if (allSheets.length === 0) {
        setFileResults(results);
        setProcessError("No drawing sheets were extracted. Check the failed file details and try again.");
        setStep(3);
        return;
      }

      // One bounded source read before rendering review. Preserve these tokens
      // on the file and each sheet; confirmation must compare, never recapture.
      const snapshots = await sourceSnapshots.capture(results.filter(result => result.status === "success").map(result => result.fileUrl));
      if (cancelledRef.current) return;
      const snapshotByPath = new Map(snapshots.map(snapshot => [snapshot.path, snapshot]));
      const reviewedSheets = allSheets.map(sheet => ({ ...sheet, sourceSnapshot: snapshotByPath.get(sheet.sourceFileUrl) }));
      const reviewedResults = results.map(result => ({ ...result, sourceSnapshot: snapshotByPath.get(result.fileUrl) ?? null }));

      const defaultIssueDate = new Date().toISOString().split("T")[0];
      setMeta(prev => {
        const { merged, aiFilled: prevAiFilled } = mergeAiSetMetadata(prev, aggregateSetMeta, defaultIssueDate);
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

      if (!cancelledRef.current) setStep(4);

    } catch (fatalErr) {
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

  return { handleUploadAndProcess, sourceSnapshots, setReviewedSheets };
}
