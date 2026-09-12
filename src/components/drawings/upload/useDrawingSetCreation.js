import { entities } from "@/api/supabaseClient";
import { invalidateEntities } from "@/services/cacheRegistry";
import { autoCreateDetailingTasks } from "@/lib/autoScheduleDetailing";
import { sanitizeDrawingPayload, sanitizeDrawingSetPayload } from "@/lib/drawingEnums";
import { withDrawingSetNumberMetadata } from "@/lib/drawingSetOrdering";
import { newUploadBatchId } from "@/lib/drawingUploadUtils";
import { logActivity } from "@/services/auditLogger";
import { recordSheetSlipSheet } from "@/lib/drawingHub";
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
  detectMultiSheetSamePageRegression,
  planExistingSetSheetReplace,
} from "../drawingSetUploadHelpers";

// The wizard was reset while the supersede phase ran — the Success step is gone,
// so say what happened to the old pages in a toast instead.
function notifySupersedeAfterCancel(result) {
  const lines = groupSupersedeItemsBySet(result.superseded).map(describeSupersededSet);
  const problems = [...result.failed, ...result.skipped].map(describeSupersedeProblem);
  if (problems.length > 0) {
    toast.warning("Upload finished with problems", { description: [...lines, ...problems].join("\n") });
  } else if (lines.length > 0) {
    toast.success(lines.join("\n"));
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

    try {
      setProcessingStatus(prev => ({ ...prev, progress: 5, message: "Creating drawing set…" }));

      let parentSetId = null;
      let parentSetMetadata = null;
      const existing = await entities.DrawingSet.filter({
          project_id: activeProject?.id,
          set_name:   resolvedSetName,
      });
      if (Array.isArray(existing) && existing.length > 0) {
        parentSetId = existing[0].id;
        parentSetMetadata = existing[0].metadata;
      }

      if (!parentSetId) {
        const deleted = await entities.DrawingSet.filter({
            project_id: activeProject?.id,
            set_name:   resolvedSetName,
            is_deleted:  true,
        });
        if (Array.isArray(deleted) && deleted.length > 0) {
          parentSetId = deleted[0].id;
          parentSetMetadata = deleted[0].metadata;
          await entities.DrawingSet.update(parentSetId, {
            is_deleted: false,
            deleted_at: null,
          });
        }
      }

      const newFileUrl = selectedSheets.find((s) => s.sourceFileUrl)?.sourceFileUrl || null;

      if (parentSetId) {
        try {
          await entities.DrawingSet.update(parentSetId, {
              upload_batch_id: batchId,
              revision:        meta.revision || "",
              issued_date:     meta.issueDate || null,
              issued_by:       meta.issuedBy  || "",
              discipline:      meta.discipline || "",
              notes:           meta.notes || "",
              ...(newFileUrl ? { file_url: newFileUrl } : {}),
              ...(setNumber ? { metadata: withDrawingSetNumberMetadata(parentSetMetadata, setNumber) } : {}),
              updated_at:      new Date().toISOString(),
            });
          } catch (updErr) {
            throw new Error(`Could not update drawing set metadata: ${updErr?.message || "unknown error"}`);
        }
      }

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

          console.warn(
            `[DrawingSetUploadModal] race on set "${resolvedSetName}" — another session created it first; re-looking up.`,
          );
          const winner = await entities.DrawingSet.filter({
            project_id: activeProject?.id,
            set_name:   resolvedSetName,
          });
          if (Array.isArray(winner) && winner.length > 0) {
            parentSetId = winner[0].id;
            parentSetMetadata = winner[0].metadata;
          } else {
            throw new Error(
              `A drawing set named "${resolvedSetName}" already exists on this project but could not be loaded. ` +
              `Refresh the page and try again, or pick a different set name.`,
            );
          }
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
          `This looks like the multi-sheet pdf_page bug regressing — check that the extractor schema includes pdfPage and that assignPdfPages ran.`,
        );
      }

      setProcessingStatus(prev => ({
        ...prev,
        progress: 40,
        message:  `Saving ${records.length} drawing entries…`,
      }));

      const sanitizedRecords = records.map((r) => sanitizeDrawingPayload(r).record);
      const insertedRows = [];

      let existingLive = [];
      try {
        const existingSheets = await entities.Drawing.filter({
          project_id: activeProject?.id,
          drawing_set_id: parentSetId,
        });
        existingLive = (existingSheets || []).filter((d) => !d.is_superseded);
      } catch (listErr) {
        console.warn("[drawings] could not list existing set sheets — falling back to insert-only:", listErr);
      }

      const replacePlan = existingLive.length
        ? planExistingSetSheetReplace(existingLive, sanitizedRecords)
        : { toUpdate: [], toCreate: sanitizedRecords, toSupersede: [] };

      for (const { existing: liveSheet, record } of replacePlan.toUpdate) {
        if (cancelledRef.current) break;
        try {
          try {
            const slip = await recordSheetSlipSheet({
              drawing: liveSheet,
              newCode: record.revision_number || meta.revision || liveSheet.revision_number || "REV",
              newFileUrl: record.file_url,
              newPdfPage: record.pdf_page,
              issuedAt: meta.issueDate || null,
              notes: meta.notes || null,
              userId: null,
            });
            if (slip?.skipped && slip.revisionId) {
              await entities.DrawingRevision.update(slip.revisionId, {
                file_url: record.file_url,
                pdf_page: record.pdf_page,
              });
            }
          } catch (histErr) {
            console.warn(`[DrawingSetUploadModal] Slip-sheet history failed for "${record.sheet_number}":`, histErr);
          }
          const updated = await entities.Drawing.update(liveSheet.id, {
            title: record.title,
            revision_number: record.revision_number,
            file_url: record.file_url,
            pdf_page: record.pdf_page,
            discipline: record.discipline,
            upload_batch_id: batchId,
            upload_status: record.upload_status,
            ai_extraction_status: record.ai_extraction_status,
            last_extracted_at: now,
            drawing_set_id: parentSetId,
            drawing_set_name: resolvedSetName,
            is_superseded: false,
          });
          insertedRows.push(updated || { ...liveSheet, ...record });
          createdRows++;
        } catch (err) {
          console.error("Failed to replace sheet:", record.sheet_number, err);
          failedRows++;
        }
      }

      for (const liveSheet of replacePlan.toSupersede) {
        if (cancelledRef.current) break;
        try {
          await entities.Drawing.update(liveSheet.id, { is_superseded: true });
        } catch (err) {
          console.warn(`[DrawingSetUploadModal] Could not retire leftover sheet ${liveSheet.sheet_number}:`, err);
        }
      }

      if (replacePlan.toCreate.length > 0 && !cancelledRef.current) {
        try {
          const inserted = await entities.Drawing.bulkCreate(replacePlan.toCreate);
          if (Array.isArray(inserted)) insertedRows.push(...inserted);
          createdRows += Array.isArray(inserted) ? inserted.length : replacePlan.toCreate.length;
        } catch (bulkErr) {
          console.warn("[drawings] bulkCreate failed, falling back to per-row:", bulkErr);
          for (let i = 0; i < replacePlan.toCreate.length; i++) {
            if (cancelledRef.current) break;
            try {
              const row = await entities.Drawing.create(replacePlan.toCreate[i]);
              if (row) insertedRows.push(row);
              createdRows++;
            } catch (err) {
              console.error("Failed to create sheet:", replacePlan.toCreate[i]?.sheet_number, err);
              failedRows++;
            }
          }
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
          existingLive.length ? "updated" : "created",
          { id: parentSetId, project_id: activeProject?.id, name: resolvedSetName },
          {
            projectId: activeProject?.id,
            projectName: activeProject?.name,
            description:
              `${existingLive.length ? "Replaced" : "Imported"} ${createdRows} sheet${createdRows === 1 ? "" : "s"} in "${resolvedSetName}"` +
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
      setProcessError(`Failed to save drawings: ${err.message}`);
    }
  };

  return { handleCreate };
}
