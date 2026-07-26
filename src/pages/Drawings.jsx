/**
 * Drawings.jsx — Drawings & Submittals page orchestrator
 *
 * Thin composition shell. All presentation lives in:
 *   components/drawings/DrawingsTable.jsx   — list view
 *   components/drawings/DrawingsGrid.jsx    — card grid view
 *   components/drawings/DrawingsToolbar.jsx — stats, filters, bulk actions
 *   components/drawings/StagePipeline.jsx   — chevron pipeline
 *   components/drawings/SheetFormModal.jsx  — create/edit modal
 *   components/drawings/AlertBanner.jsx     — revision-control alerts
 *   components/drawings/drawingsConfig.js   — constants & shared styles
 *   components/drawings/drawingsUtils.js    — pure helper functions
 */

import React, { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { entities } from "@/api/supabaseClient";
import { invalidateEntity } from "@/services/cacheRegistry";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { toast } from "sonner";
import {
  buildDrawingCreatePayload,
  formatDeleteSetSuccessMessage,
  formatDrawingWriteError,
} from "./drawings/drawingMutationHelpers";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { batchProcess } from "@/utils/batchProcess";
import { autoCreateDetailingTasks } from "@/lib/autoScheduleDetailing";
import { usePermissions } from "@/services/permissions";

// ── Domain config & utils ───────────────────────────────────────────────────
import {
  STAGE_ORDER, DISCIPLINES, EMPTY_FORM,
  mono, surface, stageUpdatePatch,
} from "@/components/drawings/drawingsConfig";
import {
  exportTransmittal, computeStatsFromSubmittals, computeDisciplineCounts, buildRevisionAlerts,
  validateStageTransition, classifyDrawingStageMutation, buildRfiMap, buildSubmittalsBySetId, filterDrawings,
  groupByDrawingSetName, computeExistingSetNames, buildDrawingSetMap, computeSelectedSetName,
  computeStagePipeline,
} from "@/components/drawings/drawingsUtils";
import { stageToSubmittalStatus } from "@/lib/submittalStageMapping";
import { TERMINAL_APPROVED_STATUSES } from "@/hooks/useSubmittals";
import { useFlag } from "@/hooks/useFeatureFlag";

// ── Presentation components ─────────────────────────────────────────────────
import DrawingsTable from "@/components/drawings/DrawingsTable";
import DrawingsGrid from "@/components/drawings/DrawingsGrid";
import { DisciplineChips, FilterBar, BulkActionsBar } from "@/components/drawings/DrawingsToolbar";
import AlertBanner from "@/components/drawings/AlertBanner";
import ActiveFilterPills from "@/components/drawings/ActiveFilterPills";
import DrawingContextMenu from "@/components/drawings/DrawingContextMenu";
import SheetFormModal from "@/components/drawings/SheetFormModal";
import SetApprovalModal from "@/components/drawings/SetApprovalModal";
import AdvanceStageDialog from "@/components/drawings/AdvanceStageDialog";
import RenameSetModal from "@/components/drawings/RenameSetModal";
import TitleblockMarkerModal from "@/components/drawings/TitleblockMarkerModal";
import BulkEditModal from "@/components/drawings/BulkEditModal";
import DrawingSetUploadModal from "@/components/drawings/DrawingSetUploadModal";
import DrawingLogImportModal from "@/components/drawings/DrawingLogImportModal";
import RevisionUploadModal from "@/components/drawings/RevisionUploadModal";
import RevisionCompareModal from "@/components/drawings/RevisionCompareModal";
import RevisionImpactReportModal from "@/components/drawings/RevisionImpactReportModal";
import ExportFabReleaseModal from "@/components/drawings/ExportFabReleaseModal";
import AttachRevisionToSubmittalModal from "@/components/submittals/AttachRevisionToSubmittalModal";
import {
  ensureSetLinked,
  openLinkedSubmittalsForSet,
} from "@/lib/submittalLinkGlue";
import DeleteDialog from "@/components/shared/DeleteDialog";
import ListTruncationNotice from "@/components/shared/ListTruncationNotice";

// ── Design-system chrome (Claude Design redesign) ─────────────────────────
import {
  CommandBar,
  KpiTile,
  PhaseChevron,
  Button,
} from "@/components/design-system";

// ─────────────────────────────────────────────────────────────────────────────

export default function Drawings({ embedded = false } = {}) {
  const { activeProject } = useProjectContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = activeProject?.id;
  const { can } = usePermissions();

  // ── UI state ──────────────────────────────────────────────────────────────
  const [view, setView] = useState("list");
  const [search, setSearch] = useState(searchParams.get("search") || searchParams.get("sheet") || "");
  const [discipline, setDiscipline] = useState("ALL");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [selected, setSelected] = useState(new Set());
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [bulkStage, setBulkStage] = useState("");
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [advanceTarget, setAdvanceTarget] = useState(null); // { drawingId, setId, currentStage, targetStage }
  const [approvalSet, setApprovalSet] = useState(null);
  const [savingApproval, setSavingApproval] = useState(false);
  const [renameSet, setRenameSet] = useState(null);   // { setId, setName, sheets }
  const [savingRename, setSavingRename] = useState(false);
  // Titleblock marker modal target. Holds the merged set record (parent
  // drawing_sets row + the group's sheets) so the modal can render the
  // PDF preview and persist the rectangles via DrawingSet.update().
  const [markerSet, setMarkerSet] = useState(null);
  const [uploadSetOpen, setUploadSetOpen] = useState(false);
  const [logImportOpen, setLogImportOpen] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  /** Event glue: after revision upload, optional attach-to-open-submittal prompt. */
  const [attachPrompt, setAttachPrompt] = useState(null);
  const [attachBusy, setAttachBusy] = useState(false);
  // Overlay compare — the sheet whose revisions are being diffed (or null).
  const [compareDrawing, setCompareDrawing] = useState(null);
  const [reportSet, setReportSet] = useState(null);
  const revisionAiEnabled = useFlag("revision_ai_diff");
  // Sprint 4 — package export modal. `kind` is "fab_release" | "turnover" | "claims".
  const [exportPkgKind, setExportPkgKind] = useState(null);
  // F18: replace window.confirm() with a styled DeleteDialog. Shape:
  //   { title, description, run: () => void }
  // run() is what fires when the user hits "Delete" in the dialog.
  const [confirmState, setConfirmState] = useState(null);
  const contextRef = useRef(null);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: drawings = [], isLoading } = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: () => projectId ? entities.Drawing.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 30000,
  });

  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis", projectId],
    queryFn: () => projectId ? entities.RFI.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 60000,
  });

  // Submittals — read-only here; we just want a per-set count to
  // surface "N SUBMITTALS" on each drawing-set group header. Doesn't
  // need to refetch aggressively, so a long staleTime is fine.
  const { data: submittals = [] } = useQuery({
    queryKey: ["submittals", projectId],
    queryFn: () => projectId ? entities.Submittal.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 60000,
  });

  // Parent drawing_sets rows — used for aggregate badges (sheet_count,
  // processed_count, etc.) and to keep set names in sync with the upload modal.
  const { data: drawingSetRecords = [] } = useQuery({
    queryKey: ["drawing_sets", projectId],
    queryFn: () => projectId ? entities.DrawingSet.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 30000,
  });

  // Reconciliation now handled server-side by reconcile_stuck_extractions()
  // (migration 076). The Postgres function flips any row stuck in
  // 'Extracting' for >5 minutes back to 'Failed' regardless of whether
  // a user has the page open. Migration 20260516003546 schedules it
  // through pg_cron every 5 minutes.

  // H9: keep the search box in sync with ?sheet= / ?search= query params.
  // Without this, in-app deep links (e.g. PCC → /drawings?sheet=S-001) just
  // change the URL without remounting the page, so the useState initializer
  // above would never re-read the new param.
  useEffect(() => {
    const next = searchParams.get("search") || searchParams.get("sheet") || "";
    setSearch(next);
     
  }, [searchParams]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const rfiMap = useMemo(() => buildRfiMap(rfis), [rfis]);

  // Reverse index: drawing_set_id -> { total, open, latestStatus, latestId }.
  // The submittal table holds the link as a uuid[] column
  // (drawing_set_ids), so each submittal can fan out into multiple sets.
  // We tally both total and "open" (not Approved/Approved-as-Noted/Void)
  // so the group header can call out work-in-flight without a
  // click-through. `latestStatus` is the status of the most recently
  // touched (-submitted_date order in the query) submittal that
  // references the set, so the table badge can show the live workflow
  // state — submittals are workflow source of truth post-Sprint 1.
  const submittalsBySetId = useMemo(
    () => buildSubmittalsBySetId(submittals, TERMINAL_APPROVED_STATUSES),
    [submittals],
  );

  const filtered = useMemo(
    () => filterDrawings(drawings, { search, discipline, stageFilter }),
    [drawings, search, discipline, stageFilter],
  );

  // Sprint 5: KPI tiles read submittal status (RELEASED, IN REVIEW) where
  // a submittal exists, falling back to dominant sheet.stage for
  // legacy sets without a submittal yet. PACKAGES / PRIORITY / OVERDUE
  // remain sheet-derived (document facets, not workflow assertions).
  const stats = useMemo(
    () => computeStatsFromSubmittals(drawings, drawingSetRecords, submittals),
    [drawings, drawingSetRecords, submittals],
  );
  const disciplineCounts = useMemo(() => computeDisciplineCounts(drawings, DISCIPLINES), [drawings]);
  const revisionAlerts = useMemo(() => buildRevisionAlerts(drawings, rfiMap), [drawings, rfiMap]);

  // ── Drawing set grouping ──────────────────────────────────────────────────
  const drawingSets = useMemo(() => groupByDrawingSetName(drawings), [drawings]);

  // Names from real drawing_sets parent rows + legacy string column on drawings,
  // deduped. The upload modal uses this for autocomplete + duplicate detection.
  const existingSetNames = useMemo(
    () => computeExistingSetNames(drawingSets, drawingSetRecords),
    [drawingSets, drawingSetRecords],
  );

  // id → parent set record lookup. DrawingsTable groups by drawing_set_id and
  // pulls display names from this map so the FK is the source of truth for
  // grouping, not the legacy denormalized drawing_set_name string. (F8)
  const drawingSetMap = useMemo(() => buildDrawingSetMap(drawingSetRecords), [drawingSetRecords]);

  const selectedSetName = useMemo(() => computeSelectedSetName(selected, drawings), [selected, drawings]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  // Any drawings mutation must also invalidate the parent drawing_sets query,
  // because a child INSERT/UPDATE/DELETE fires the sync_drawing_set_counts
  // trigger which updates sheet_count / processed_count / needs_review_count
  // / failed_count on the parent row. Without invalidating both, the group
  // summary badge lies for up to staleTime (30s) after every action.
  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["drawings", projectId] }),
      // Sets are read under both "drawing_sets" and "drawing-sets" keys across
      // the app; the registry handles both spellings plus the register view.
      invalidateEntity(qc, "drawingSet", projectId),
      invalidateEntity(qc, "submittal", projectId),
    ]);
  };

  const createMut = useMutation({
    mutationFn: (data) => entities.Drawing.create(
      buildDrawingCreatePayload(data, projectId, activeProject?.name),
    ),
    onSuccess: async (created) => {
      await invalidate();
      toast.success("Sheet added");
      setShowModal(false);
      // Always auto-create the matching Detailing/Submittal schedule task.
      // Dates are optional — missing dates render as "—" in the schedule.
      if (created?.id) {
        const { created: n, failed } = await autoCreateDetailingTasks(
          [created],
          { projectName: activeProject?.name }
        );
        if (n > 0) {
          qc.invalidateQueries({ queryKey: ["schedule-tasks"] });
          toast.success("Schedule task auto-created");
        } else if (failed) {
          toast.error("Schedule task failed to create");
        }
      }
    },
    onError: (e) => toast.error(formatDrawingWriteError(e, "add")),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => entities.Drawing.update(id, data),
    // Close the modal AND clear editing on success — leaving the modal
    // open while editing was cleared caused a second save click to route
    // into the create path with the edited row's id still in form state,
    // triggering a drawings_pkey duplicate.
    onSuccess: async () => {
      await invalidate();
      toast.success("Sheet updated");
      setEditing(null);
      setShowModal(false);
    },
    onError: (e) => toast.error(formatDrawingWriteError(e, "update")),
  });

  // F19: soft-delete with undo. The id is a single drawing row; we can flip
  // is_deleted=false to restore it. The sonner toast exposes an "Undo"
  // action button that does exactly that.
  const deleteMut = useMutation({
    mutationFn: (id) => entities.Drawing.delete(id),
    onSuccess: async (_data, id) => {
      await invalidate();
      setSelected(new Set());
      toast.success("Sheet deleted", {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await entities.Drawing.update(id, { is_deleted: false, deleted_at: null });
              await invalidate();
              toast.success("Sheet restored");
            } catch (err) {
              toast.error(formatDrawingWriteError(err, "restore"));
            }
          },
        },
      });
    },
    onError: (e) => toast.error(formatDrawingWriteError(e, "delete")),
  });

  // Cascade-delete an entire drawing set (parent + all child sheets) in one
  // transaction via the delete_drawing_set(p_set_id) RPC shipped in migration
  // 022. Falls back to a client-side loop if the child sheets reference the
  // set only by legacy drawing_set_name (no FK yet).
  const deleteSetMut = useMutation({
    mutationFn: async ({ setId, sheetIds }) => {
      // Set-only (parent row, no child sheets): soft-delete parent directly
      if (setId && sheetIds.length === 0) {
        await entities.DrawingSet.delete(setId);
        return { deleted: 0, parentOnly: true };
      }
      // Normal cascade: parent + children in one transaction
      if (setId) {
        const result = await entities.DrawingSet.deleteCascade(setId);
        return { deleted: result.deletedChildCount ?? sheetIds.length };
      }
      // Legacy fallback: no parent row, just sweep the children.
      const { succeeded, failed } = await batchProcess(sheetIds, (id) => entities.Drawing.delete(id));
      return { deleted: succeeded.length, deletedSheetIds: succeeded, failed };
    },
    onSuccess: async ({ deleted, parentOnly, deletedSheetIds = [], failed = [] }, { setId, sheetIds, setName }) => {
      await invalidate();
      setSelected(failed.length > 0 ? new Set(failed) : new Set());
      const toastInfo = formatDeleteSetSuccessMessage({
        setName,
        deleted,
        parentOnly,
        failedCount: failed.length,
      });
      toast[toastInfo.level](toastInfo.message, {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              if (setId) {
                await entities.DrawingSet.update(setId, { is_deleted: false, deleted_at: null });
              }
              const restoreIds = setId ? sheetIds : deletedSheetIds;
              if (restoreIds.length > 0) {
                const restore = await batchProcess(restoreIds, (id) =>
                  entities.Drawing.update(id, { is_deleted: false, deleted_at: null })
                );
                if (restore.failed.length > 0) {
                  setSelected(new Set(restore.failed));
                  throw new Error(`${restore.failed.length} row(s) could not be restored`);
                }
              }
              await invalidate();
              toast.success(`Restored "${setName}"`);
            } catch (err) {
              toast.error(formatDrawingWriteError(err, "restore"));
            }
          },
        },
      });
    },
    onError: (e) => toast.error(formatDrawingWriteError(e, "delete set")),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSave = async (form) => {
    setSaving(true);
    try {
      if (editing?.id) {
        await updateMut.mutateAsync({ id: editing.id, ...form });
      } else {
        await createMut.mutateAsync(form);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id) => {
    setContextMenu(null);
    const d = drawings.find(x => x.id === id);
    const label = d?.sheet_number ? `"${d.sheet_number}"` : "this sheet";
    setConfirmState({
      title: `Delete ${label}?`,
      description: "The sheet will be removed from the project. You can undo this from the toast that appears after deletion.",
      run: () => deleteMut.mutate(id),
    });
  };

  const handleDeleteSet = (group) => {
    if (group.isUngrouped) return;
    const total = group.sheets.length;
    // For set-only groups (imported from Drive, no child sheets yet) the
    // parent id lives on group.setId or group.parent.id directly.
    // For groups with child sheets, derive from the children's FK.
    const setIdCandidates = group.sheets.map(s => s.drawing_set_id).filter(Boolean);
    const setId = setIdCandidates[0] || group.setId || group.parent?.id || null;
    const sheetIds = group.sheets.map(s => s.id);
    const desc = total > 0
      ? `The set and all ${total} sheet${total === 1 ? "" : "s"} inside it will be removed. You can undo this from the toast that appears after deletion.`
      : "This drawing set will be removed. You can undo this from the toast that appears after deletion.";
    setConfirmState({
      title: `Delete drawing set "${group.name}"?`,
      description: desc,
      run: () => deleteSetMut.mutate({ setId, sheetIds, setName: group.name }),
    });
  };

  const handleAdvanceStage = (drawing) => {
    const idx = STAGE_ORDER.indexOf(drawing.stage);
    if (idx < 0) {
      toast.error(`Cannot advance sheet: unknown current stage "${drawing.stage || "∅"}"`);
      setContextMenu(null);
      return;
    }
    if (idx >= STAGE_ORDER.length - 1) {
      toast.info("Already at final stage (IFC)");
      setContextMenu(null);
      return;
    }
    const target = STAGE_ORDER[idx + 1];
    const v = validateStageTransition(drawing.stage, target);
    if (!v.ok) { toast.error(v.reason); setContextMenu(null); return; }
    const stageMutation = classifyDrawingStageMutation(drawing, target, submittalsBySetId);
    setAdvanceTarget({
      drawingId: drawing.id,
      setId: drawing.drawing_set_id || null,
      currentStage: drawing.stage,
      targetStage: target,
      allowLegacy: stageMutation.allowed,
    });
    setContextMenu(null);
  };

  const handleBulkStageApply = async () => {
    if (!bulkStage || selected.size === 0) return;
    // Guard against typo'd or dropped stages before we touch the DB.
    if (!STAGE_ORDER.includes(bulkStage)) {
      toast.error(`Cannot apply unknown stage "${bulkStage}"`);
      return;
    }
    const ids = [...selected];
    const decisions = ids.map((id) => {
      const drawing = drawings.find((d) => d.id === id);
      return {
        id,
        drawing,
        decision: drawing
          ? classifyDrawingStageMutation(drawing, bulkStage, submittalsBySetId)
          : { allowed: false, kind: "missing", reason: "Sheet not found." },
      };
    });
    const blocked = decisions.filter((row) => !row.decision.allowed);
    const allowedIds = decisions.filter((row) => row.decision.allowed).map((row) => row.id);

    if (blocked.length > 0) {
      const blockedSetIds = [...new Set(blocked.map((row) => row.decision.setId).filter(Boolean))];
      const setLabel = blockedSetIds
        .map((setId) => drawingSetMap[setId]?.set_name || "Linked set")
        .slice(0, 2)
        .join(", ");
      const status = blocked[0]?.decision?.latestStatus;
      const targetSetId = blockedSetIds[0] || null;
      const params = new URLSearchParams();
      if (targetSetId) params.set("targetSetId", targetSetId);
      const mapped = stageToSubmittalStatus(bulkStage);
      if (mapped?.status) params.set("prefilledStatus", mapped.status);

      toast.error(
        allowedIds.length === 0
          ? `${setLabel || "Selection"} still has an open linked submittal${status ? ` (${status})` : ""}. Advance the workflow from Submittals.`
          : `${blocked.length} sheet(s) blocked — open linked submittal on ${setLabel || "a linked set"}${status ? ` (${status})` : ""}.`,
        {
          duration: 8000,
          action: {
            label: "Open Submittals",
            onClick: () => navigate(`/Submittals${params.toString() ? `?${params.toString()}` : ""}`),
          },
        },
      );
      if (allowedIds.length === 0) return;
    }

    const syncingClosed = decisions.some((row) => row.decision.kind === "closed-set-sync");
    toast.info(
      syncingClosed
        ? "Syncing sheet stages for sets whose linked submittals are already closed."
        : "Applying legacy sheet-stage recovery to sets without open linked submittals.",
      { duration: 4000 },
    );
    const { succeeded, failed } = await batchProcess(
      allowedIds,
      (id) => {
        const current = drawings.find(d => d.id === id);
        if (current) {
          const v = validateStageTransition(current.stage, bulkStage);
          if (!v.ok) throw new Error(v.reason);
        }
        // When moving a sheet AWAY from "Released", stageUpdatePatch also clears
        // the deprecated legacy approval columns (§20-21). Otherwise a stale
        // set_approval_status="approved" re-derives the sheet as Released on the
        // next refetch and the manual stage change appears to revert. The
        // Set-Approval flow (useDrawings.approveSetMut) is untouched — it owns the
        // "approved" pills and is never reached from this stage-edit path.
        return entities.Drawing.update(id, stageUpdatePatch(bulkStage));
      },
    );
    await invalidate();
    if (failed.length > 0) {
      toast.warning(`${succeeded.length} updated, ${failed.length} failed`);
    } else {
      setSelected(new Set(blocked.map((row) => row.id)));
      if (blocked.length === 0) setBulkStage("");
      toast.success(`Updated ${succeeded.length} sheets`);
    }
  };

  const handleBulkDelete = () => {
    const count = selected.size;
    if (count === 0) return;
    setConfirmState({
      title: `Delete ${count} sheet${count === 1 ? "" : "s"}?`,
      description: "The selected sheets will be removed from the project. You can undo this from the toast that appears after deletion.",
      run: async () => {
        const ids = [...selected];
        const { succeeded, failed } = await batchProcess(ids, (id) => entities.Drawing.delete(id));
        await invalidate();
        if (failed.length > 0) {
          setSelected(new Set(failed));
          toast.warning(`${succeeded.length} deleted, ${failed.length} failed`);
        } else {
          setSelected(new Set());
          // F19: bulk undo. Restore every id we successfully soft-deleted.
          toast.success(`Deleted ${succeeded.length} sheet${succeeded.length === 1 ? "" : "s"}`, {
            action: {
              label: "Undo",
              onClick: async () => {
                try {
                  await batchProcess(succeeded, (id) =>
                    entities.Drawing.update(id, { is_deleted: false, deleted_at: null })
                  );
                    await invalidate();
                  toast.success(`Restored ${succeeded.length} sheet${succeeded.length === 1 ? "" : "s"}`);
                } catch (err) {
                  toast.error("Restore failed: " + (err?.message || "unknown"));
                }
              },
            },
          });
        }
      },
    });
  };

  const handleBulkEdit = async (payload) => {
    if (selected.size === 0 || Object.keys(payload).length === 0) return;
    setBulkEditOpen(false);
    const ids = [...selected];
    const fieldCount = Object.keys(payload).length;
    const { succeeded, failed } = await batchProcess(
      ids,
      (id) => entities.Drawing.update(id, payload),
    );
    await invalidate();
    if (failed.length > 0) {
      setSelected(new Set(failed));
      toast.warning(`${succeeded.length} updated, ${failed.length} failed (${fieldCount} field${fieldCount === 1 ? "" : "s"})`);
    } else {
      setSelected(new Set());
      toast.success(`Updated ${fieldCount} field${fieldCount === 1 ? "" : "s"} on ${succeeded.length} sheet${succeeded.length === 1 ? "" : "s"}`);
    }
  };

  const handleSetApproval = async ({ status, revision, _approvedBy, approvalDate, applyToSheets, notes }) => {
    if (!approvalSet) return;
    setSavingApproval(true);
    try {
      const effectiveDate = approvalDate || new Date().toISOString().split("T")[0];
      // F11: write approval state to the parent drawing_sets row so it's
      // stored in one canonical place. The per-sheet mirror below stays for
      // back-compat until migration 026 drops those columns.
      const parentSetId =
        approvalSet.setId ||
        approvalSet.sheets.map(s => s.drawing_set_id).find(Boolean);
      if (parentSetId) {
        await entities.DrawingSet.update(parentSetId, {
          set_approval_status: status,
          set_approved_date:   effectiveDate,
          set_approved_by:     _approvedBy || null,
          set_approval_notes:  notes || null,
          ...(revision ? { revision } : {}),
        });
      }

      const sheetsToUpdate = applyToSheets ? approvalSet.sheets : [approvalSet.sheets[0]];
      const { succeeded, failed } = await batchProcess(
        sheetsToUpdate,
        (s) => entities.Drawing.update(s.id, {
          set_approval_status: status,
          set_approved_date: effectiveDate,
          ...(revision ? { revision_number: revision } : {}),
          ...(notes ? { notes: (s.notes ? s.notes + "\n" : "") + `[${status.toUpperCase()}] ${notes}` } : {}),
        }),
      );
      // Locking is now driven by submittal status, not document-side
      // approval. When a submittal linked to this set reaches a
      // terminal-approved status, useSubmittals.ts will lock the set
      // automatically. The document-side approval here just records the
      // legacy set_approval_status mirror.
                  await invalidate();
      if (failed.length > 0) {
        toast.warning(`${succeeded.length} sheets updated, ${failed.length} failed`);
      } else {
        toast.success(`Set "${approvalSet.setName}" marked as ${status}`);
        setApprovalSet(null);
      }
    } catch (err) {
      toast.error("Approval update failed: " + (err?.message || "Unknown error"));
    } finally {
      setSavingApproval(false);
    }
  };

  const openSetApproval = (target) => {
    const normalized = typeof target === "string" ? { name: target } : (target || {});
    const setId = normalized.setId || normalized.drawing_set_id || null;
    const sheets = setId
      ? drawings.filter((d) => d.drawing_set_id === setId)
      : drawings.filter((d) => !d.drawing_set_id && d.drawing_set_name?.trim() === normalized.name?.trim());
    if (!sheets.length) return;
    const parentName = setId ? drawingSetMap[setId]?.set_name : null;
    setApprovalSet({ setName: parentName || normalized.name || sheets[0]?.drawing_set_name || "Drawing set", setId, sheets });
  };

  const openRenameSet = (group) => {
    // Group is what DrawingsTable passes to onDeleteSet — same shape works:
    //   { name, sheets, setId?, parent? }
    if (!group || group.isUngrouped) return;
    const setIdCandidates = (group.sheets || []).map(s => s.drawing_set_id).filter(Boolean);
    const setId = setIdCandidates[0] || group.setId || group.parent?.id || null;
    setRenameSet({ setId, setName: group.name, sheets: group.sheets || [] });
  };

  const openMarkTitleblock = (group) => {
    // Same shape resolution as openRenameSet — we need the setId so the
    // modal can persist the rectangles to drawing_sets, plus the sheets
    // and the parent's file_url so we can render a preview PDF.
    if (!group || group.isUngrouped) return;
    const setIdCandidates = (group.sheets || []).map(s => s.drawing_set_id).filter(Boolean);
    const setId = setIdCandidates[0] || group.setId || group.parent?.id || null;
    if (!setId) {
      toast.error("This group has no parent drawing-set record yet — upload it as a set first.");
      return;
    }
    setMarkerSet({
      id: setId,
      set_name: group.name,
      project_id: activeProject?.id || (group.sheets || [])[0]?.project_id || null,
      // Carry across what the parent row stores so the modal can pre-seed
      // existing rectangles + the source file URL.
      file_url: group.parent?.file_url || (group.sheets || [])[0]?.file_url || null,
      titleblock_title_rect:  group.parent?.titleblock_title_rect  ?? null,
      titleblock_number_rect: group.parent?.titleblock_number_rect ?? null,
      sheets: group.sheets || [],
    });
  };

  const handleRenameSet = async (newName) => {
    if (!renameSet) return;
    const { setId, setName: oldName, sheets } = renameSet;
    setSavingRename(true);
    try {
      // Update the parent drawing_sets row when one exists.
      if (setId) {
        await entities.DrawingSet.update(setId, { set_name: newName });
      }
      // Also update every child sheet's denormalized drawing_set_name so the
      // table grouping follows the rename even for legacy rows that don't
      // have a parent FK. Uses the same batch helper as bulk stage apply.
      const sheetIds = (sheets || []).map(s => s.id);
      if (sheetIds.length > 0) {
        const result = await batchProcess(sheetIds, (id) =>
          entities.Drawing.update(id, { drawing_set_name: newName })
        );
        if (result.failed.length > 0) {
          await invalidate();
          setSelected(new Set(result.failed));
          toast.warning(`Renamed parent, but ${result.failed.length} sheet${result.failed.length === 1 ? "" : "s"} failed`);
          return;
        }
      }
      await invalidate();
      toast.success(`Renamed "${oldName}" → "${newName}"`);
      setRenameSet(null);
    } catch (err) {
      toast.error("Rename failed: " + (err?.message || "Unknown error"));
    } finally {
      setSavingRename(false);
    }
  };

  const toggleSelect = (id) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const toggleSelectAll = () => {
    const visibleIds = filtered.map((d) => d.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
    setSelected((previous) => {
      const next = new Set(previous);
      visibleIds.forEach((id) => (allVisibleSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!projectId) {
    return (
      <div className="sb-dashboard-reference-page" style={{ textAlign: "center" }}>
        <p style={{ ...mono, fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.15em" }}>
          SELECT A PROJECT TO VIEW DRAWINGS
        </p>
      </div>
    );
  }

  return (
    <div
      className={embedded ? undefined : "sb-dashboard-reference-page"}
      style={embedded
        ? { padding: 0, background: "transparent" }
        : { minHeight: "100vh", background: "var(--bg-page)" }}
      onClick={() => { setContextMenu(null); }}
    >
      {/* ── Secondary-view banner: this is the full editor; the Hub is the command center ── */}
      {!embedded && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
            padding: "8px 14px", marginBottom: 14, borderRadius: 8,
            border: "1px solid var(--border-default)",
            background: "var(--bg-surface-low)",
          }}
        >
          <span style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", flexShrink: 0 }}>
            Full Editor
          </span>
          <span style={{ fontSize: 12.5, color: "var(--text-secondary, var(--text-muted))", lineHeight: 1.5 }}>
            The <strong style={{ color: "var(--text-primary)" }}>Detailing Control Center</strong> is your command center. This page is the detailed editor — filters, bulk actions, rename / delete, per-sheet.
          </span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="sbd-btn sbd-btn-primary"
            style={{ whiteSpace: "nowrap" }}
            onClick={() => navigate("/DrawingSubmittalHub")}
          >
            ← Back to the Hub
          </button>
        </div>
      )}

      {/* ── CommandBar ─────────────────────────────────────────────────────── */}
      <CommandBar
        eyebrow={`DESIGN & DOCUMENTS · ${(activeProject?.name || "").toUpperCase()}`}
        title="Drawings & Submittals"
        count={stats.total}
        unit={` · ${stats.sheetCount} SHEETS`}
        subtitle="Not Started → IFA → OFA → BFA → OFS → IFC → Released"
      >
        <Button variant="secondary" icon="download" onClick={() => exportTransmittal(filtered, activeProject?.name)}>
          TRANSMITTAL
        </Button>
        <Button variant="secondary" icon="download" onClick={() => setExportPkgKind("fab_release")}>
          EXPORT FAB RELEASE
        </Button>
        <Button variant="secondary" icon="download" onClick={() => setExportPkgKind("turnover")}>
          TURNOVER PACKAGE
        </Button>
        <Button variant="secondary" icon="download" onClick={() => setExportPkgKind("claims")}>
          CLAIMS PACKAGE
        </Button>
        {can("create", "drawing") && (
          <Button variant="secondary" icon="plus" onClick={() => { setEditing(null); setShowModal(true); }}>
            ADD SHEET
          </Button>
        )}
        <Button
          variant="outline"
          icon="arrow"
          onClick={() => setRevisionOpen(true)}
          disabled={drawingSetRecords.length === 0 && existingSetNames.length === 0}
          title="Upload a new revision of an existing set"
        >
          NEW REVISION
        </Button>
        {can("create", "drawing") && (
          <Button variant="outline" icon="upload" onClick={() => setLogImportOpen(true)} title="Import a detailer Drawing Complete / Submittal Log (.xls)">
            IMPORT LOG
          </Button>
        )}
        <Button variant="primary" icon="upload" onClick={() => setUploadSetOpen(true)}>
          UPLOAD SET
        </Button>
      </CommandBar>

      {/* ── KPI Row (hidden when embedded — the hub shows its own KPIs) ─────── */}
      {!embedded && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 14 }}>
          <KpiTile compact label="PACKAGES"  value={stats.total}    color="var(--accent)"          active={stageFilter === "ALL"}        onClick={() => setStageFilter("ALL")} />
          <KpiTile compact label="RELEASED"  value={stats.released} color="var(--status-success)"  active={stageFilter === "Released"}   onClick={() => setStageFilter("Released")} />
          <KpiTile compact label="IN REVIEW" value={stats.inReview} color="var(--status-info)"     active={stageFilter === "_inReview"}  onClick={() => setStageFilter(stageFilter === "_inReview" ? "ALL" : "_inReview")} />
          <KpiTile compact label="OVERDUE"   value={stats.overdue}  color="var(--status-error)"    active={stageFilter === "_overdue"}   onClick={() => setStageFilter(stageFilter === "_overdue" ? "ALL" : "_overdue")} />
          <KpiTile compact label="PRIORITY"  value={stats.priority} color="var(--status-review)"   active={stageFilter === "_priority"}  onClick={() => setStageFilter(stageFilter === "_priority" ? "ALL" : "_priority")} />
        </div>
      )}

      {/* ── Revision Alerts ────────────────────────────────────────────────── */}
      {revisionAlerts.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.2em", color: "var(--text-muted)", marginBottom: 6 }}>
            REVISION CONTROL — {revisionAlerts.length} ALERT{revisionAlerts.length !== 1 ? "S" : ""}
          </div>
          {revisionAlerts.map((alert, i) => (
            <AlertBanner
              key={i}
              alert={alert}
              onFilter={(sheets) => setSelected(new Set(sheets.map(s => s.id)))}
            />
          ))}
        </div>
      )}

      {/* ── Submittal Stage Pipeline — hidden when embedded (hub shows its own) ─ */}
      {!embedded && (
      <ErrorBoundary label="Stage Pipeline">
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-card)",
            padding: "12px 14px",
            marginBottom: 14,
          }}
        >
          <div
            style={{
              ...mono,
              fontSize: 9,
              color: "var(--text-muted)",
              letterSpacing: "0.14em",
              marginBottom: 8,
            }}
          >
            SUBMITTAL STAGE PIPELINE
          </div>
          {(() => {
            const { pipeStages, activeIdx } = computeStagePipeline({ submittals, drawingSetRecords, drawings, stageFilter });
            return <PhaseChevron stages={pipeStages} activeIdx={activeIdx} showIcons={false} />;
          })()}
        </div>
      </ErrorBoundary>
      )}

      {/* Surface the silent 2000-row read cap on entities.Drawing.filter (raw `drawings`). */}
      <ListTruncationNotice count={drawings.length} label="drawings" />

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <DisciplineChips discipline={discipline} setDiscipline={setDiscipline} disciplineCounts={disciplineCounts} />
      <FilterBar search={search} setSearch={setSearch} stageFilter={stageFilter} setStageFilter={setStageFilter} view={view} setView={setView} />

      {/* F22: explicit pills for every active filter so the user can see at
          a glance what's narrowing the list, plus one-click clear. Renders
          nothing when no filters are active to keep visual noise down. */}
      <ActiveFilterPills
        search={search}
        discipline={discipline}
        stageFilter={stageFilter}
        onClearSearch={() => setSearch("")}
        onClearDiscipline={() => setDiscipline("ALL")}
        onClearStage={() => setStageFilter("ALL")}
        onClearAll={() => { setSearch(""); setDiscipline("ALL"); setStageFilter("ALL"); }}
      />

      {/* ── Bulk Actions ───────────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <BulkActionsBar
          selectedCount={selected.size}
          bulkStage={bulkStage}
          setBulkStage={setBulkStage}
          onApplyStage={handleBulkStageApply}
          selectedSetName={selectedSetName}
          onSetApproval={openSetApproval}
          onBulkEdit={() => setBulkEditOpen(true)}
          onBulkDelete={handleBulkDelete}
          onClear={() => setSelected(new Set())}
        />
      )}

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <ErrorBoundary label="Drawings Content">
        {isLoading ? (
          <div style={{ padding: 48, textAlign: "center", ...mono, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.2em" }}>
            LOADING SHEETS…
          </div>
        ) : (filtered.length === 0 && drawingSetRecords.length === 0) ? (
          // Empty state only when there's truly nothing to show — no per-sheet
          // rows AND no set-level drawing_sets rows. Set-level-only records
          // (e.g. BFA imports from Drive with no child sheets yet) still want
          // to render through DrawingsTable so the user sees the group headers.
          <div style={{ ...surface, padding: 48, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>▦</div>
            <p style={{ ...mono, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.2em", margin: 0 }}>
              {drawings.length === 0 ? "NO SHEETS YET — ADD YOUR FIRST DRAWING" : "NO SHEETS MATCH FILTERS"}
            </p>
          </div>
        ) : view === "list" ? (
          <DrawingsTable
            drawings={filtered}
            selected={selected}
            onToggleSelect={toggleSelect}
            onToggleAll={toggleSelectAll}
            onEdit={can("edit", "drawing") ? d => { setEditing(d); setShowModal(true); } : null}
            onDelete={can("delete", "drawing") ? handleDelete : null}
            onAdvance={handleAdvanceStage}
            onView={d => navigate(`/DrawingViewer?id=${d.id}`)}
            setContextMenu={setContextMenu}
            onSetApproval={openSetApproval}
            onDeleteSet={can("delete", "drawing") ? handleDeleteSet : null}
            onRenameSet={openRenameSet}
            onMarkTitleblock={openMarkTitleblock}
            onPackageReport={revisionAiEnabled ? setReportSet : null}
            rfiMap={rfiMap}
            drawingSetMap={drawingSetMap}
            submittalsBySetId={submittalsBySetId}
          />
        ) : (
          <DrawingsGrid
            drawings={filtered}
            drawingSets={drawingSetRecords}
            selected={selected}
            onToggleSelect={toggleSelect}
            onEdit={can("edit", "drawing") ? d => { setEditing(d); setShowModal(true); } : null}
            onDelete={can("delete", "drawing") ? handleDelete : null}
            onAdvance={handleAdvanceStage}
            onView={d => navigate(`/DrawingViewer?id=${d.id}`)}
            onSetApproval={openSetApproval}
            onRenameSet={openRenameSet}
            onDeleteSet={can("delete", "drawing") ? handleDeleteSet : null}
            rfiMap={rfiMap}
          />
        )}
      </ErrorBoundary>

      {/* ── Context Menu ───────────────────────────────────────────────────── */}
      <DrawingContextMenu
        contextMenu={contextMenu}
        contextRef={contextRef}
        onView={(d) => navigate(`/DrawingViewer?id=${d.id}`)}
        onEdit={can("edit", "drawing") ? (d) => { setEditing(d); setShowModal(true); } : null}
        onAdvance={handleAdvanceStage}
        onSetApproval={openSetApproval}
        onCompareRevisions={(d) => setCompareDrawing(d)}
        onDelete={can("delete", "drawing") ? handleDelete : null}
        onDismiss={() => setContextMenu(null)}
      />

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showModal && (
        <SheetFormModal
          initial={editing || EMPTY_FORM}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null); }}
          saving={saving}
          existingSetNames={existingSetNames}
        />
      )}

      <BulkEditModal
        open={bulkEditOpen}
        onClose={() => setBulkEditOpen(false)}
        onApply={handleBulkEdit}
        selectedCount={selected.size}
      />

      <AdvanceStageDialog
        open={!!advanceTarget}
        currentStage={advanceTarget?.currentStage}
        targetStage={advanceTarget?.targetStage}
        drawingId={advanceTarget?.drawingId}
        setId={advanceTarget?.setId}
        allowLegacy={advanceTarget?.allowLegacy}
        onClose={() => setAdvanceTarget(null)}
        onLegacy={({ drawingId, targetStage }) => {
          // Pre-Sprint-2 fallback: mutate drawings.stage directly. The
          // workflow source of truth is now on submittals; this path is
          // kept for cleanup of orphan sheets without linked submittals.
          // stageUpdatePatch clears the deprecated legacy approval columns
          // (§20-21) when moving AWAY from "Released" so a stale
          // set_approval_status="approved" doesn't silently re-derive the sheet
          // as Released and revert this change on the next refetch. (Set-Approval
          // pills are unaffected — that flow lives in approveSetMut, not here.)
          updateMut.mutate({ id: drawingId, ...stageUpdatePatch(targetStage) });
          setAdvanceTarget(null);
        }}
        onViaSubmittal={({ setId, targetStage }) => {
          // Canonical path: hand the user off to the Submittals page
          // with a target set + prefilled status. Falls back to
          // navigating without a status if the stage maps to "Not Started"
          // or an unknown stage (stageToSubmittalStatus returns null).
          const mapped = stageToSubmittalStatus(targetStage);
          const params = new URLSearchParams();
          if (setId) params.set("targetSetId", setId);
          if (mapped?.status) params.set("prefilledStatus", mapped.status);
          navigate(`/Submittals${params.toString() ? `?${params.toString()}` : ""}`);
          setAdvanceTarget(null);
        }}
      />

      <SetApprovalModal
        open={!!approvalSet}
        onClose={() => setApprovalSet(null)}
        setName={approvalSet?.setName || ""}
        sheetCount={approvalSet?.sheets?.length || 0}
        existingRevision={approvalSet?.sheets?.[0]?.revision_number || ""}
        onConfirm={handleSetApproval}
        saving={savingApproval}
      />

      <RenameSetModal
        open={!!renameSet}
        initialName={renameSet?.setName || ""}
        onClose={() => setRenameSet(null)}
        onSave={handleRenameSet}
        saving={savingRename}
      />

      {markerSet && (
        <TitleblockMarkerModal
          set={markerSet}
          onClose={() => setMarkerSet(null)}
          onSaved={() => {
            // Pull fresh set rows so the templated indicator shows up
            // immediately on the row that was just marked.
            void invalidate();
          }}
        />
      )}

      <DrawingSetUploadModal
        open={uploadSetOpen}
        onClose={() => setUploadSetOpen(false)}
        onComplete={() => {
          void invalidate();
          qc.invalidateQueries({ queryKey: ["drawing_sets", projectId] });
        }}
        activeProject={activeProject}
        existingDrawings={drawings}
        existingSetNames={existingSetNames}
      />

      <DrawingLogImportModal
        open={logImportOpen}
        projectId={projectId}
        projectName={activeProject?.name}
        onClose={() => setLogImportOpen(false)}
        onImported={() => {
          void invalidate();
          qc.invalidateQueries({ queryKey: ["drawing_sets", projectId] });
        }}
      />

      {/* New Revision flow — marks prior sheets is_superseded=true and
          inserts the replacement revision under the same set. F14. */}
      <RevisionUploadModal
        open={revisionOpen}
        onClose={() => setRevisionOpen(false)}
        onComplete={(payload) => {
          void invalidate();
          setRevisionOpen(false);
          const setId = payload?.setId;
          if (!setId) return;
          const candidates = openLinkedSubmittalsForSet(setId, submittals);
          if (candidates.length === 0) return;
          setAttachPrompt({
            setId,
            setName: payload?.setName || null,
            revisionLabel: payload?.revisionLabel || null,
            candidates,
          });
        }}
        activeProject={activeProject}
        drawingSets={drawingSetRecords}
      />

      {attachPrompt && (
        <AttachRevisionToSubmittalModal
          open
          setName={attachPrompt.setName}
          revisionLabel={attachPrompt.revisionLabel}
          candidates={attachPrompt.candidates}
          busy={attachBusy}
          onDismiss={() => setAttachPrompt(null)}
          onAttach={async (submittalId) => {
            setAttachBusy(true);
            try {
              const row = submittals.find((s) => s.id === submittalId);
              if (!row || !openLinkedSubmittalsForSet(attachPrompt.setId, [row]).length) {
                toast.error("That submittal is no longer open — refresh and try again.");
                setAttachPrompt(null);
                await invalidate();
                return;
              }
              const nextIds = ensureSetLinked(row.drawing_set_ids, attachPrompt.setId);
              await entities.Submittal.update(submittalId, { drawing_set_ids: nextIds });
              toast.success("Revision kept linked to open submittal");
              setAttachPrompt(null);
              await invalidate();
              await invalidateEntity(qc, "submittal", projectId);
            } catch (err) {
              toast.error(err?.message || "Failed to attach revision to submittal");
            } finally {
              setAttachBusy(false);
            }
          }}
        />
      )}

      {/* Overlay compare — old revision red / new revision blue, from the
          per-sheet slip-sheet history. Opened via the row context menu. */}
      {compareDrawing && (
        <RevisionCompareModal
          open={!!compareDrawing}
          onClose={() => setCompareDrawing(null)}
          drawing={compareDrawing}
        />
      )}

      {/* Package-level AI Revision Impact Report — launched from a set's
          "Impact Report" action (flag-gated). */}
      {reportSet && (
        <RevisionImpactReportModal
          open
          onClose={() => setReportSet(null)}
          set={reportSet}
          projectId={projectId}
        />
      )}

      {/* Sprint 4 — package exports (fab release / turnover / claims). One
          shared modal switches behavior based on `kind`. */}
      <ExportFabReleaseModal
        open={!!exportPkgKind}
        onClose={() => setExportPkgKind(null)}
        kind={exportPkgKind || "fab_release"}
        project={activeProject}
        drawings={drawings}
      />

      {/* F18: styled confirm replacing window.confirm() for destructive
          actions. Sits on top of every list/set/bulk delete path. */}
      <DeleteDialog
        open={!!confirmState}
        onClose={() => setConfirmState(null)}
        onConfirm={() => {
          const run = confirmState?.run;
          setConfirmState(null);
          if (typeof run === "function") run();
        }}
        title={confirmState?.title}
        description={confirmState?.description}
      />
    </div>
  );
}
