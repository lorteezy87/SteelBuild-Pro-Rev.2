/**
 * Drawings.jsx — Drawings & Submittals page orchestrator
 *
 * Thin composition shell. All presentation lives in:
 *   components/drawings/DrawingsTable.jsx   — list view
 *   components/drawings/DrawingsGrid.jsx    — card grid view
 *   components/drawings/DrawingsToolbar.jsx — stats, filters, bulk actions
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
import {
  buildApprovalSetState,
  buildBulkDeleteConfirm,
  buildDeleteSetConfirm,
  buildDeleteSheetConfirm,
  buildMarkerSetState,
  buildParentApprovalPatch,
  buildRenameSetState,
  buildSheetApprovalPatch,
  buildSubmittalAdvanceSearch,
  formatBulkDeleteToast,
  formatBulkUpdateToast,
  formatRenameSetToast,
  formatSetApprovalToast,
  planAdvanceStage,
  planBulkStageApply,
  planDeleteSetMutation,
  resolveApprovalEffectiveDate,
  resolveApprovalParentSetId,
  resolveSheetsToApprove,
  toggleIdInSet,
  toggleSelectAllIds,
} from "./drawings/drawingActionHelpers";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { batchProcess } from "@/utils/batchProcess";
import { autoCreateDetailingTasks } from "@/lib/autoScheduleDetailing";
import { usePermissions } from "@/services/permissions";

// ── Domain config & utils ───────────────────────────────────────────────────
import {
  STAGE_ORDER, DISCIPLINES,
  mono, surface, stageUpdatePatch,
} from "@/components/drawings/drawingsConfig";
import {
  computeStatsFromSubmittals, computeDisciplineCounts, buildRevisionAlerts,
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
import DrawingsPageModals from "./drawings/DrawingsPageModals";
import DrawingsPageToolbar from "./drawings/DrawingsPageToolbar";
import ListTruncationNotice from "@/components/shared/ListTruncationNotice";

// ── Design-system chrome (Claude Design redesign) ─────────────────────────
import { PhaseChevron } from "@/components/design-system";

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
      const strategy = planDeleteSetMutation({ setId, sheetIds });
      if (strategy.kind === "parentOnly") {
        await entities.DrawingSet.delete(strategy.setId);
        return { deleted: 0, parentOnly: true };
      }
      if (strategy.kind === "cascade") {
        const result = await entities.DrawingSet.deleteCascade(strategy.setId);
        return { deleted: result.deletedChildCount ?? strategy.sheetCount };
      }
      const { succeeded, failed } = await batchProcess(strategy.sheetIds, (id) => entities.Drawing.delete(id));
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

  // ── Handlers (planning in drawingActionHelpers; IO stays here) ────────────
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
    const confirm = buildDeleteSheetConfirm(drawings.find((x) => x.id === id));
    setConfirmState({ ...confirm, run: () => deleteMut.mutate(id) });
  };

  const handleDeleteSet = (group) => {
    const plan = buildDeleteSetConfirm(group);
    if (!plan) return;
    setConfirmState({
      title: plan.title,
      description: plan.description,
      run: () => deleteSetMut.mutate(plan.mutateArgs),
    });
  };

  const handleAdvanceStage = (drawing) => {
    const plan = planAdvanceStage(
      drawing,
      STAGE_ORDER,
      submittalsBySetId,
      validateStageTransition,
      classifyDrawingStageMutation,
    );
    if (plan.kind === "error") toast.error(plan.message);
    else if (plan.kind === "info") toast.info(plan.message);
    else setAdvanceTarget(plan.target);
    setContextMenu(null);
  };

  const handleBulkStageApply = async () => {
    const plan = planBulkStageApply({
      bulkStage,
      selected,
      drawings,
      stageOrder: STAGE_ORDER,
      submittalsBySetId,
      classify: classifyDrawingStageMutation,
      resolveSetLabel: (setId) => drawingSetMap[setId]?.set_name,
    });
    if (plan.kind === "noop") return;
    if (plan.kind === "error") {
      toast.error(plan.message);
      return;
    }

    if (plan.blockedToast) {
      const targetSetId = plan.blockedToast.blockedSetIds[0] || null;
      const mapped = stageToSubmittalStatus(bulkStage);
      const qs = buildSubmittalAdvanceSearch(targetSetId, mapped?.status);
      toast.error(plan.blockedToast.message, {
        duration: 8000,
        action: {
          label: "Open Submittals",
          onClick: () => navigate(`/Submittals${qs}`),
        },
      });
      if (plan.blockedToast.abort) return;
    }

    if (plan.infoMessage) {
      toast.info(plan.infoMessage, { duration: 4000 });
    }
    const { succeeded, failed } = await batchProcess(
      plan.ids,
      (id) => {
        const current = drawings.find((d) => d.id === id);
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
      // Keep blocked sheets selected so the operator can jump to Submittals.
      setSelected(new Set(plan.blockedIds));
      if (plan.blockedIds.length === 0) setBulkStage("");
      toast.success(`Updated ${succeeded.length} sheets`);
    }
  };

  const handleBulkDelete = () => {
    const confirm = buildBulkDeleteConfirm(selected.size);
    if (!confirm) return;
    setConfirmState({
      ...confirm,
      run: async () => {
        const ids = [...selected];
        const { succeeded, failed } = await batchProcess(ids, (id) => entities.Drawing.delete(id));
        await invalidate();
        const toastInfo = formatBulkDeleteToast(succeeded.length, failed.length);
        if (failed.length > 0) {
          setSelected(new Set(failed));
          toast.warning(toastInfo.message);
          return;
        }
        setSelected(new Set());
        // F19: bulk undo. Restore every id we successfully soft-deleted.
        toast.success(toastInfo.message, {
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
    const toastInfo = formatBulkUpdateToast(succeeded.length, failed.length, { fieldCount });
    if (failed.length > 0) setSelected(new Set(failed));
    else if (toastInfo.clearSelection) setSelected(new Set());
    toast[toastInfo.level](toastInfo.message);
  };

  const handleSetApproval = async ({ status, revision, _approvedBy, approvalDate, applyToSheets, notes }) => {
    if (!approvalSet) return;
    setSavingApproval(true);
    try {
      const effectiveDate = resolveApprovalEffectiveDate(approvalDate);
      // F11: write approval state to the parent drawing_sets row so it's
      // stored in one canonical place. The per-sheet mirror below stays for
      // back-compat until migration 026 drops those columns.
      const parentSetId = resolveApprovalParentSetId(approvalSet);
      if (parentSetId) {
        await entities.DrawingSet.update(
          parentSetId,
          buildParentApprovalPatch({
            status,
            effectiveDate,
            approvedBy: _approvedBy,
            notes,
            revision,
          }),
        );
      }

      const sheetsToUpdate = resolveSheetsToApprove(approvalSet, applyToSheets);
      const { succeeded, failed } = await batchProcess(
        sheetsToUpdate,
        (s) => entities.Drawing.update(
          s.id,
          buildSheetApprovalPatch(s, { status, effectiveDate, revision, notes }),
        ),
      );
      // Locking is now driven by submittal status, not document-side
      // approval. When a submittal linked to this set reaches a
      // terminal-approved status, useSubmittals.ts will lock the set
      // automatically. The document-side approval here just records the
      // legacy set_approval_status mirror.
      await invalidate();
      const toastInfo = formatSetApprovalToast(approvalSet.setName, status, succeeded.length, failed.length);
      toast[toastInfo.level](toastInfo.message);
      if (toastInfo.clearSelection) setApprovalSet(null);
    } catch (err) {
      toast.error("Approval update failed: " + (err?.message || "Unknown error"));
    } finally {
      setSavingApproval(false);
    }
  };

  const openSetApproval = (target) => {
    const next = buildApprovalSetState(target, drawings, drawingSetMap);
    if (next) setApprovalSet(next);
  };

  const openRenameSet = (group) => {
    const next = buildRenameSetState(group);
    if (next) setRenameSet(next);
  };

  const openMarkTitleblock = (group) => {
    const plan = buildMarkerSetState(group, activeProject?.id);
    if (plan.kind === "noop") return;
    if (plan.kind === "error") {
      toast.error(plan.message);
      return;
    }
    setMarkerSet(plan.markerSet);
  };

  const handleRenameSet = async (newName) => {
    if (!renameSet) return;
    const { setId, setName: oldName, sheets } = renameSet;
    setSavingRename(true);
    try {
      if (setId) {
        await entities.DrawingSet.update(setId, { set_name: newName });
      }
      const sheetIds = (sheets || []).map((s) => s.id);
      if (sheetIds.length > 0) {
        const result = await batchProcess(sheetIds, (id) =>
          entities.Drawing.update(id, { drawing_set_name: newName })
        );
        if (result.failed.length > 0) {
          await invalidate();
          setSelected(new Set(result.failed));
          const toastInfo = formatRenameSetToast(oldName, newName, result.failed.length);
          toast[toastInfo.level](toastInfo.message);
          return;
        }
      }
      await invalidate();
      const toastInfo = formatRenameSetToast(oldName, newName);
      toast[toastInfo.level](toastInfo.message);
      setRenameSet(null);
    } catch (err) {
      toast.error("Rename failed: " + (err?.message || "Unknown error"));
    } finally {
      setSavingRename(false);
    }
  };

  const toggleSelect = (id) => setSelected(toggleIdInSet(selected, id));

  const toggleSelectAll = () => {
    const visibleIds = filtered.map((d) => d.id);
    setSelected((previous) => toggleSelectAllIds(previous, visibleIds));
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
      <DrawingsPageToolbar
        embedded={embedded}
        projectName={activeProject?.name}
        stats={stats}
        filtered={filtered}
        canCreateDrawing={can("create", "drawing")}
        drawingSetRecordsLength={drawingSetRecords.length}
        existingSetNamesLength={existingSetNames.length}
        stageFilter={stageFilter}
        onBackToHub={() => navigate("/DrawingSubmittalHub")}
        onExportPkg={setExportPkgKind}
        onAddSheet={() => { setEditing(null); setShowModal(true); }}
        onOpenRevision={() => setRevisionOpen(true)}
        onOpenLogImport={() => setLogImportOpen(true)}
        onOpenUploadSet={() => setUploadSetOpen(true)}
        onStageFilter={setStageFilter}
      />

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
      <DrawingsPageModals
        showModal={showModal}
        editing={editing}
        saving={saving}
        existingSetNames={existingSetNames}
        onSave={handleSave}
        onCloseSheetModal={() => { setShowModal(false); setEditing(null); }}
        bulkEditOpen={bulkEditOpen}
        onCloseBulkEdit={() => setBulkEditOpen(false)}
        onBulkEdit={handleBulkEdit}
        selectedCount={selected.size}
        advanceTarget={advanceTarget}
        onCloseAdvance={() => setAdvanceTarget(null)}
        onLegacyAdvance={({ drawingId, targetStage }) => {
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
          navigate(`/Submittals${buildSubmittalAdvanceSearch(setId, mapped?.status)}`);
          setAdvanceTarget(null);
        }}
        approvalSet={approvalSet}
        onCloseApproval={() => setApprovalSet(null)}
        onConfirmApproval={handleSetApproval}
        savingApproval={savingApproval}
        renameSet={renameSet}
        onCloseRename={() => setRenameSet(null)}
        onSaveRename={handleRenameSet}
        savingRename={savingRename}
        markerSet={markerSet}
        onCloseMarker={() => setMarkerSet(null)}
        onMarkerSaved={() => {
          // Pull fresh set rows so the templated indicator shows up
          // immediately on the row that was just marked.
          void invalidate();
        }}
        uploadSetOpen={uploadSetOpen}
        onCloseUploadSet={() => setUploadSetOpen(false)}
        onUploadComplete={() => {
          void invalidate();
          qc.invalidateQueries({ queryKey: ["drawing_sets", projectId] });
        }}
        activeProject={activeProject}
        drawings={drawings}
        logImportOpen={logImportOpen}
        projectId={projectId}
        onCloseLogImport={() => setLogImportOpen(false)}
        onLogImported={() => {
          void invalidate();
          qc.invalidateQueries({ queryKey: ["drawing_sets", projectId] });
        }}
        revisionOpen={revisionOpen}
        onCloseRevision={() => setRevisionOpen(false)}
        onRevisionComplete={() => { void invalidate(); setRevisionOpen(false); }}
        drawingSetRecords={drawingSetRecords}
        compareDrawing={compareDrawing}
        onCloseCompare={() => setCompareDrawing(null)}
        reportSet={reportSet}
        onCloseReport={() => setReportSet(null)}
        exportPkgKind={exportPkgKind}
        onCloseExport={() => setExportPkgKind(null)}
        confirmState={confirmState}
        onCloseConfirm={() => setConfirmState(null)}
        onConfirmDelete={() => {
          const run = confirmState?.run;
          setConfirmState(null);
          if (typeof run === "function") run();
        }}
      />
    </div>
  );
}
