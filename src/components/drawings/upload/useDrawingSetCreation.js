import React from "react";
import { entities } from "@/api/supabaseClient";
import { invalidateEntities } from "@/services/cacheRegistry";
import { autoCreateDetailingTasks } from "@/lib/autoScheduleDetailing";
import { sanitizeDrawingPayload, sanitizeDrawingSetPayload } from "@/lib/drawingEnums";
import { withDrawingSetNumberMetadata } from "@/lib/drawingSetOrdering";
import { newUploadBatchId } from "@/lib/drawingUploadUtils";
import { validatePdfPage } from "@/lib/pdfSheetExtractor";
import { logActivity } from "@/services/auditLogger";
import { toast } from "sonner";
import {
  applyCrossSetSupersede,
  describeSupersedeActivity,
  describeSupersedeProblem,
  describeSupersededSet,
  groupSupersedeItemsBySet,
  resolveUploadSetName,
} from "@/lib/crossSetSupersede";
import { fetchCrossSetSource } from "@/lib/crossSetSupersedeRepository";
import {
  buildDrawingRecord,
  buildInitialRevisionRecords,
  detectMultiSheetSamePageRegression,
} from "../drawingSetUploadHelpers";

// sonner renders toast text with white-space: normal, so "\n" would run the
// lines together; give each line its own block instead.
const toastLines = (lines) =>
  React.createElement("div", null, lines.map((line, i) => React.createElement("div", { key: i }, line)));

// The wizard was reset while the supersede phase ran — the Success step is gone,
// so say what happened to the old pages in a toast instead, one line per item.
function notifySupersedeAfterCancel(result) {
  const lines = groupSupersedeItemsBySet(result.superseded).map(describeSupersededSet);
  const problems = [...result.failed, ...result.skipped].map(describeSupersedeProblem);
  if (problems.length > 0) {
    toast.warning("Upload finished with problems", { description: toastLines([...lines, ...problems]) });
  } else if (lines.length > 0) {
    toast.success(toastLines(lines));
  }
}

export function useDrawingSetCreation({ meta, activeProject, fileResults, uploadBatchId, onComplete, qc, state, canSupersede = false }) {
  const {
    cancelledRef, setProcessError, setStep, setProcessingStatus, setCreatedCount, setSupersedeResult,
  } = state;

  const invalidateAfterSave = async (supersedeResult) => {
    await invalidateEntities(qc, ["drawing", "drawingSet", "submittal", "drawing_revision"], activeProject?.id);
    if (supersedeResult?.superseded?.length) {
      // Piece approval and the canonical release gate both read is_superseded.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["piece-register", activeProject?.id] }),
        qc.invalidateQueries({ queryKey: ["canonical-release-gate"] }),
      ]);
    }
  };

  // supersedeIds: old drawings in OTHER sets the user left ticked in Review.
  // supersedeLabels: their preview sheet numbers / set names, used only to name
  // them if the commit-time re-read fails.
  /**
   * @param {Array<Record<string, unknown>>} selectedSheets
   * @param {{ supersedeIds?: string[], supersedeLabels?: Record<string, { sheetNumber?: string, setName?: string }> | null }} [options]
   */
  const handleCreate = async (selectedSheets, { supersedeIds = [], supersedeLabels = null } = {}) => {
    cancelledRef.current = false;
    setProcessError(null);
    if (setSupersedeResult) setSupersedeResult(null);
    setStep(3);
    setProcessingStatus({ steps: [], currentStepId: null, progress: 0, message: `Creating ${selectedSheets.length} drawing entries…` });

    const resolvedSetName = resolveUploadSetName(meta);
    const batchId = uploadBatchId || newUploadBatchId();
    const setNumber = (meta.setNumber || "").trim();
    let parentSetId = null;

    try {
      if (!activeProject?.id || selectedSheets.length === 0) throw new Error("Choose a project and at least one reviewed sheet.");
      for (const sheet of selectedSheets) {
        const page = validatePdfPage(sheet.pdfPage);
        const count = fileResults.find(result => result.fileName === sheet.sourceFile)?.pageCount;
        if (!sheet.sourceFileUrl || !String(sheet.sheetNumber || "").trim() || page === null || (count > 0 && page > count)) {
          throw new Error(`Sheet "${sheet.sheetNumber || "unnamed"}" needs its source PDF and a confirmed in-range PDF page before saving.`);
        }
      }
      setProcessingStatus(prev => ({ ...prev, progress: 5, message: "Creating drawing set…" }));

      const existingNameError = () => new Error(
        `A drawing set named "${resolvedSetName}" already exists. Choose a unique new set name and a new submittal. New Revision application is temporarily held pending the transactional service.`,
      );
      const existing = await entities.DrawingSet.filter({
          project_id: activeProject?.id,
          set_name:   resolvedSetName,
      });
      if (Array.isArray(existing) && existing.length > 0) {
        throw existingNameError();
      }

      if (!parentSetId) {
        const deleted = await entities.DrawingSet.filter({
            project_id: activeProject?.id,
            set_name:   resolvedSetName,
            is_deleted:  true,
        });
        if (Array.isArray(deleted) && deleted.length > 0) {
          throw existingNameError();
        }
      }

      const newFileUrl = selectedSheets.find((s) => s.sourceFileUrl)?.sourceFileUrl || null;



      if (!parentSetId) {
        const { record: sanitizedSet } = sanitizeDrawingSetPayload({
          project_id:      activeProject?.id,
          project_name:    activeProject?.name,
          set_name:        resolvedSetName,
          revision:        meta.revision || "",
          discipline:      meta.discipline || "",
          issued_date:     meta.issueDate || null,
          issued_by:       meta.issuedBy || "",
          status:          "Active",
          notes:           meta.notes || "",
          metadata:        withDrawingSetNumberMetadata({}, setNumber),
          upload_batch_id: batchId,
          ...(newFileUrl ? { file_url: newFileUrl } : {}),
          sheet_count:        0,
          processed_count:    0,
          needs_review_count: 0,
          failed_count:       0,
        });
        try {
          const created = await entities.DrawingSet.create(sanitizedSet);
          parentSetId = created?.id;
        } catch (createErr) {
          const msg = String(createErr?.message || createErr || "").toLowerCase();
          const isUniqueViolation =
            msg.includes("duplicate key") ||
            msg.includes("unique constraint") ||
            msg.includes("uq_drawing_sets_project_set_name") ||
            msg.includes("23505");
          if (!isUniqueViolation) throw createErr;
          // Never attach this upload to another session's newly-created set.
          throw existingNameError();
        }

        if (!parentSetId) {
          throw new Error("Drawing set was created but no id returned — cannot attach children.");
        }
      }

      const now = new Date().toISOString();

      let createdRows = 0;
      let failedRows  = 0;
      const records = selectedSheets.map((sheet) =>
        buildDrawingRecord({ sheet, fileResults, meta, activeProject, resolvedSetName, parentSetId, batchId, now }),
      );

      for (const { sourceFile, sheetCount, pageCount } of detectMultiSheetSamePageRegression(selectedSheets, records, fileResults)) {
        console.warn(
          `[DrawingSetUploadModal] All ${sheetCount} sheets from "${sourceFile}" (a ${pageCount}-page PDF) have pdf_page=1. ` +
          `Review the physical PDF pages before confirming; shared pages can be legitimate and must not be reassigned by row order.`,
        );
      }

      setProcessingStatus(prev => ({
        ...prev,
        progress: 40,
        message:  `Saving ${records.length} drawing entries…`,
      }));

      const sanitizedRecords = records.map((r) => sanitizeDrawingPayload(r).record);
      const insertedRows = [];
      const newlyCreatedRows = [];

      // New Set never adopts or rewrites a previously existing roster.
      const replacePlan = { toCreate: sanitizedRecords };

      if (replacePlan.toCreate.length > 0 && !cancelledRef.current) {
        try {
          const inserted = await entities.Drawing.bulkCreate(replacePlan.toCreate);
          if (Array.isArray(inserted)) {
            insertedRows.push(...inserted);
            newlyCreatedRows.push(...inserted);
          }
          createdRows += Array.isArray(inserted) ? inserted.length : replacePlan.toCreate.length;
        } catch (bulkErr) {
          console.warn("[drawings] bulkCreate failed, falling back to per-row:", bulkErr);
          for (let i = 0; i < replacePlan.toCreate.length; i++) {
            if (cancelledRef.current) break;
            try {
              const row = await entities.Drawing.create(replacePlan.toCreate[i]);
              if (row) {
                insertedRows.push(row);
                newlyCreatedRows.push(row);
              }
              createdRows++;
            } catch (err) {
              console.error("Failed to create sheet:", replacePlan.toCreate[i]?.sheet_number, err);
              failedRows++;
            }
          }
        }
      }

      // A sheet is not fully imported until its initial, source-bound revision
      // exists. Previously the wizard stopped after creating `drawings`, so the
      // PDF and extracted text were in the database while revision-driven UI
      // made the upload look missing. Keep this as one bulk statement and fail
      // loudly if the complete ledger was not returned.
      if (newlyCreatedRows.length > 0) {
        setProcessingStatus(prev => ({
          ...prev,
          progress: 82,
          message: `Recording ${newlyCreatedRows.length} current revision${newlyCreatedRows.length === 1 ? "" : "s"}…`,
        }));
        const revisionRecords = buildInitialRevisionRecords(newlyCreatedRows);
        const createdRevisions = await entities.DrawingRevision.bulkCreate(revisionRecords);
        if (!Array.isArray(createdRevisions) || createdRevisions.length !== revisionRecords.length) {
          throw new Error(
            `Drawing pages were stored, but revision tracking completed for only ${createdRevisions?.length || 0} of ${revisionRecords.length} sheets. Refresh before retrying.`,
          );
        }
      }

      // ── Cross-set supersede ─────────────────────────────────────────
      // The pages this upload replaces in OTHER sets of the project. Runs only
      // after the new rows are written, only for ids the user confirmed, and
      // only for users who may write drawings. Cancel is checked once, here —
      // a started phase always finishes, so no page is left half-done.
      let supersedeResult = null;
      const confirmedIds = Array.isArray(supersedeIds) ? supersedeIds.filter(Boolean) : [];
      if (canSupersede && confirmedIds.length > 0 && !cancelledRef.current) {
        setProcessingStatus(prev => ({
          ...prev,
          progress: 88,
          message: `Marking ${confirmedIds.length} replaced page${confirmedIds.length === 1 ? "" : "s"} superseded…`,
        }));
        supersedeResult = await applyCrossSetSupersede({
          confirmedIds,
          labels: supersedeLabels,
          savedRows: insertedRows,
          parentSetId,
          resolvedSetName,
          batchId,
          now,
          fetchSource: () => fetchCrossSetSource(activeProject?.id),
          update: (id, patch) => entities.Drawing.update(id, patch),
        });
        for (const summary of groupSupersedeItemsBySet(supersedeResult.superseded)) {
          void logActivity(
            "drawing",
            "updated",
            { id: summary.setId, project_id: activeProject?.id, name: summary.setName },
            {
              projectId: activeProject?.id,
              projectName: activeProject?.name,
              description: describeSupersedeActivity(summary, resolvedSetName),
            },
          );
        }
      }

      if (insertedRows.length > 0 && !cancelledRef.current) {
        setProcessingStatus(prev => ({
          ...prev,
          progress: 92,
          message:  `Linking ${insertedRows.length} schedule tasks…`,
        }));
        try {
          const { created: taskCount } = await autoCreateDetailingTasks(
            insertedRows,
            { projectName: insertedRows[0]?.project_name }
          );
          if (taskCount > 0) {
            qc.invalidateQueries({ queryKey: ["schedule-tasks"] });
          }
        } catch (err) {
          console.warn("[drawings] auto-schedule tasks failed:", err);
        }
      }

      setProcessingStatus(prev => ({
        ...prev,
        progress: 95,
        message:  `Saved ${createdRows} of ${selectedSheets.length} entries`,
      }));

      if (cancelledRef.current) {
        // Reset while saving. If the supersede phase ran, its writes landed:
        // refresh the caches and report it in a toast.
        if (supersedeResult) {
          await invalidateAfterSave(supersedeResult);
          notifySupersedeAfterCancel(supersedeResult);
        }
        return;
      }
      setCreatedCount(createdRows);
      if (setSupersedeResult) setSupersedeResult(supersedeResult);

      if (createdRows > 0) {
        const needsReviewCount = sanitizedRecords.filter((r) => r.ai_extraction_status === "NeedsReview").length;
        void logActivity(
          "drawing",
          "created",
          { id: parentSetId, project_id: activeProject?.id, name: resolvedSetName },
          {
            projectId: activeProject?.id,
            projectName: activeProject?.name,
            description:
              `Imported ${createdRows} sheet${createdRows === 1 ? "" : "s"} in "${resolvedSetName}"` +
              `${needsReviewCount ? ` (${needsReviewCount} flagged for review)` : ""}` +
              `${failedRows ? ` — ${failedRows} failed to save` : ""}`,
          },
        );
      }

      if (failedRows > 0) {
        setProcessError(`${failedRows} sheet(s) failed to save. ${createdRows} saved successfully.`);
      }

      await invalidateAfterSave(supersedeResult);
      setStep(5);
      if (onComplete) onComplete();
    } catch (err) {
      console.error("Create drawings error:", err);
      if (parentSetId) {
        try { await invalidateAfterSave(null); }
        catch (refreshError) { console.warn("Could not refresh incomplete drawing intake:", refreshError); }
        setProcessError(`Drawing set "${resolvedSetName}" (${parentSetId}) has an incomplete import: ${err.message}. Inspect the register and revision tracking; do not re-upload under the same name or delete the source PDF automatically.`);
      } else {
        setProcessError(`Failed to save drawings: ${err.message}`);
      }
    }
  };

  return { handleCreate };
}
