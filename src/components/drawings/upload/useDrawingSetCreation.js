import { entities } from "@/api/supabaseClient";
import { autoCreateDetailingTasks } from "@/lib/autoScheduleDetailing";
import { sanitizeDrawingPayload, sanitizeDrawingSetPayload } from "@/lib/drawingEnums";
import { withDrawingSetNumberMetadata } from "@/lib/drawingSetOrdering";
import { newUploadBatchId } from "@/lib/drawingUploadUtils";
import { logActivity } from "@/services/auditLogger";
import { buildDrawingRecord, detectMultiSheetSamePageRegression } from "../drawingSetUploadHelpers";

// ── useDrawingSetCreation ────────────────────────────────────────────
// Wraps handleCreate: parent drawing_sets find-or-create (active → soft-deleted
// restore → unique-constraint race re-query), bulk Drawing.bulkCreate with
// per-row fallback, autoCreateDetailingTasks, audit logging, and React-Query
// cache invalidation. Moved verbatim from DrawingSetUploadModal.jsx — the parent
// find-or-create does async DB reads so it stays here (not in the pure helpers).
export function useDrawingSetCreation({ meta, activeProject, fileResults, uploadBatchId, onComplete, qc, state }) {
  const {
    cancelledRef, setProcessError, setStep, setProcessingStatus, setCreatedCount,
  } = state;

  const handleCreate = async (selectedSheets) => {
    cancelledRef.current = false;
    setProcessError(null);
    setStep(3);
    setProcessingStatus({ steps: [], currentStepId: null, progress: 0, message: `Creating ${selectedSheets.length} drawing entries…` });

    const resolvedSetName = (meta.setName || "").trim() || meta.revision || "Drawing Set";
    const batchId = uploadBatchId || newUploadBatchId();
    const setNumber = (meta.setNumber || "").trim();

    try {
      // ─────────────────────────────────────────────────────────────
      // STEP 1 — Find or create the parent drawing_sets record.
      //
      // We check first so re-uploading into an existing named set just
      // appends children to the same parent (idempotent across sessions).
      // ─────────────────────────────────────────────────────────────
      setProcessingStatus(prev => ({ ...prev, progress: 5, message: "Creating drawing set…" }));

      let parentSetId = null;
      let parentSetMetadata = null;
      try {
        // First check active (non-deleted) sets
        const existing = await entities.DrawingSet.filter({
          project_id: activeProject?.id,
          set_name:   resolvedSetName,
        });
        if (Array.isArray(existing) && existing.length > 0) {
          parentSetId = existing[0].id;
          parentSetMetadata = existing[0].metadata;
        }

        // If none found, check for soft-deleted sets and restore them.
        // The DB unique index covers ALL rows (including is_deleted=true),
        // so creating a new row with the same name would violate the constraint.
        if (!parentSetId) {
          const deleted = await entities.DrawingSet.filter({
            project_id: activeProject?.id,
            set_name:   resolvedSetName,
            is_deleted:  true,
          });
          if (Array.isArray(deleted) && deleted.length > 0) {
            parentSetId = deleted[0].id;
            parentSetMetadata = deleted[0].metadata;
            // Restore the soft-deleted row
            await entities.DrawingSet.update(parentSetId, {
              is_deleted: false,
              deleted_at: null,
            });
          }
        }

        // Refresh the parent's metadata to reflect this upload
        if (parentSetId) {
          try {
            await entities.DrawingSet.update(parentSetId, {
              upload_batch_id: batchId,
              revision:        meta.revision || "",
              issued_date:     meta.issueDate || null,
              issued_by:       meta.issuedBy  || "",
              discipline:      meta.discipline || "",
              notes:           meta.notes || "",
              ...(setNumber ? { metadata: withDrawingSetNumberMetadata(parentSetMetadata, setNumber) } : {}),
              updated_at:      new Date().toISOString(),
            });
          } catch (updErr) {
            console.warn("Could not refresh existing drawing_set:", updErr);
          }
        }
      } catch (lookupErr) {
        console.warn("DrawingSet lookup failed, will create new:", lookupErr);
      }

      if (!parentSetId) {
        // The DB enforces UNIQUE(project_id, set_name) on drawing_sets
        // (migration 020 / see memory/supabase_drawings_constraints.md).
        // If a concurrent upload from another session wrote the same
        // set_name between our lookup above and this CREATE, Postgres
        // raises 23505 and the whole batch would die with a cryptic
        // error. Recover: on unique_violation, re-query and attach to
        // whichever row won the race. Only if even that lookup is empty
        // do we surface the error to the user.
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
            // Extremely unlikely: insert failed uniqueness but post-lookup
            // can't find the winner (e.g. it was soft-deleted between the
            // insert attempt and this query). Surface a clear message
            // instead of the raw Postgres error.
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

      // ─────────────────────────────────────────────────────────────
      // STEP 2 — Create every child drawing row with FK + status cols.
      //
      // Each child gets ai_extraction_status === 'Processed' because by
      // the time we reach this step, AI has already run and the user has
      // reviewed the results. Rows whose AI pass failed upstream get
      // marked 'NeedsReview' so the UI can flag them.
      //
      // F16: single bulk insert instead of N serial requests. An N-sheet
      // set used to mean N round-trips; now one. If the bulk insert fails
      // we fall back to the per-row loop so a single bad row still lets
      // the rest land — matching the original "never abort the batch"
      // acceptance criterion.
      // ─────────────────────────────────────────────────────────────
      const now = new Date().toISOString();

      let createdRows = 0;
      let failedRows  = 0;
      const records = selectedSheets.map((sheet) =>
        buildDrawingRecord({ sheet, fileResults, meta, activeProject, resolvedSetName, parentSetId, batchId, now }),
      );

      // Sanity check per source PDF: if a multi-page PDF ended up with
      // pdf_page=1 across every one of its sheets, that's the original
      // bug regressing. Log loud per source file so QA can spot it in
      // DevTools without inspecting every record.
      for (const { sourceFile, sheetCount, pageCount } of detectMultiSheetSamePageRegression(selectedSheets, records, fileResults)) {
        console.warn(
          `[DrawingSetUploadModal] All ${sheetCount} sheets from "${sourceFile}" (a ${pageCount}-page PDF) have pdf_page=1. ` +
          `This looks like the multi-sheet pdf_page bug regressing — check that the extractor schema includes pdfPage and that assignPdfPages ran.`,
        );
      }

      setProcessingStatus(prev => ({
        ...prev,
        progress: 40,
        message:  `Creating ${records.length} drawing entries…`,
      }));

      // Collect the inserted drawing rows (with DB IDs) so we can
      // fan out matching Detailing schedule tasks after.
      //
      // Defensive enum pass: every record's stage / upload_status /
      // ai_extraction_status is coerced to a DB-CHECK-valid value so a
      // typo / stale constant / future schema drift doesn't silently
      // fail the INSERT and lose the user's upload.
      const sanitizedRecords = records.map((r) => sanitizeDrawingPayload(r).record);

      const insertedRows = [];
      try {
        const inserted = await entities.Drawing.bulkCreate(sanitizedRecords);
        if (Array.isArray(inserted)) insertedRows.push(...inserted);
        createdRows = Array.isArray(inserted) ? inserted.length : sanitizedRecords.length;
      } catch (bulkErr) {
        // Bulk failed — fall back to per-row so one bad sheet doesn't lose
        // the whole batch. This is the slow path; the common case is the
        // bulk insert above succeeding.
        console.warn("[drawings] bulkCreate failed, falling back to per-row:", bulkErr);
        for (let i = 0; i < selectedSheets.length; i++) {
          if (cancelledRef.current) break;
          const sheet = selectedSheets[i];
          try {
            const row = await entities.Drawing.create(sanitizedRecords[i]);
            if (row) insertedRows.push(row);
            createdRows++;
          } catch (err) {
            console.error("Failed to create sheet:", sheet.sheetNumber, err);
            failedRows++;
          }
          setProcessingStatus(prev => ({
            ...prev,
            progress: 40 + Math.round(((createdRows + failedRows) / selectedSheets.length) * 50),
            message:  `Recovering… ${createdRows + failedRows} of ${selectedSheets.length}`,
          }));
        }
      }

      // Auto-create matching Detailing/Submittal schedule tasks. Idempotent —
      // re-running the upload won't double-insert because the helper dedupes
      // by drawing_id in metadata.
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
        message:  `Created ${createdRows} of ${selectedSheets.length} entries`,
      }));

      if (cancelledRef.current) return;
      setCreatedCount(createdRows);

      // Audit the AI-intake commit on the LIVE create path (importAnalyzedDrawings
      // is dead code; this modal is the real intake). Fire-and-forget — logActivity
      // swallows its own errors and never blocks the upload.
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
              `Imported ${createdRows} sheet${createdRows === 1 ? "" : "s"} into "${resolvedSetName}" from AI intake` +
              `${needsReviewCount ? ` (${needsReviewCount} flagged for review)` : ""}` +
              `${failedRows ? ` — ${failedRows} failed to save` : ""}`,
          },
        );
      }

      if (failedRows > 0) {
        setProcessError(`${failedRows} sheet(s) failed to save. ${createdRows} created successfully.`);
      }

      // The sync_drawing_set_counts() DB trigger auto-updates the parent
      // aggregate counts, so we just need to refresh the UI caches.
      qc.invalidateQueries({ queryKey: ["drawings"] });
      qc.invalidateQueries({ queryKey: ["drawing_sets"] });
      qc.invalidateQueries({ queryKey: ["drawing-sets"] }); // hub/FabRelease spelling
      setStep(5);
      if (onComplete) onComplete();
    } catch (err) {
      console.error("Create drawings error:", err);
      setProcessError(`Failed to save drawings: ${err.message}`);
    }
  };

  return { handleCreate };
}
