import { entities, integrations } from "@/api/supabaseClient";
import { EMPTY_SET_META, parseFilename } from "@/lib/pdfSheetExtractor";
import { withTimeout, newUploadBatchId } from "@/lib/drawingUploadUtils";
import { validateAndExtract, makeProgressSteps, mergeAiSetMetadata } from "../drawingSetUploadHelpers";

const UPLOAD_TIMEOUT_MS  = 90_000;
const EXTRACT_TIMEOUT_MS = 300_000;

export function useFileUploadAndExtract({ files, meta, activeProject, state }) {
  const {
    setProcessError, setStep, setUploadBatchId, setProcessingStatus,
    setMeta, setAiFilledFields, setSheets, setFileResults, cancelledRef,
  } = state;

  const handleUploadAndProcess = async () => {
    cancelledRef.current = false;
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
            integrations.Core.UploadFile({ file, workflow: "drawings" }),
            UPLOAD_TIMEOUT_MS,
            "File upload"
          );
          fileUrl = res?.file_url || res?.url;
          if (!fileUrl) throw new Error("Upload succeeded but no file URL was returned");
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
          const parsed = parseFilename(file.name);
          extractResult = {
            setMeta: { ...EMPTY_SET_META },
            sheets: [{
              sheetNumber: parsed.sheetNumber,
              sheetTitle: parsed.sheetNumber ? "" : file.name.replace(/\.pdf$/i, ""),
              discipline: meta.discipline, sheetType: "General",
              revision: parsed.revision || "0", scale: "", date: "",
              _note: `Extraction failed: ${err.message}.` + (parsed.sheetNumber ? ` Sheet # "${parsed.sheetNumber}" extracted from filename.` : " Please fill in manually."),
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

      setSheets(allSheets);
      setFileResults(results);
      await new Promise(r => setTimeout(r, 600));

      if (!cancelledRef.current) setStep(4);

    } catch (fatalErr) {
      console.error("Fatal upload error:", fatalErr);
      setProcessError(fatalErr.message || "An unexpected error occurred. Please try again.");
    }
  };

  return { handleUploadAndProcess };
}
