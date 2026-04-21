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
import { base44 } from "@/api/base44Client";
import { useProjectContext } from "@/components/shared/useProjectContext";
import { toast } from "sonner";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { batchProcess } from "@/utils/batchProcess";
import { autoCreateDetailingTasks } from "@/lib/autoScheduleDetailing";

// ── Domain config & utils ───────────────────────────────────────────────────
import {
  STAGE_ORDER, DISCIPLINES, EMPTY_FORM, IN_REVIEW_STAGES, STAGES,
  mono, surface,
} from "@/components/drawings/drawingsConfig";
import {
  isOverdue, exportTransmittal, computeStats, computeDisciplineCounts, buildRevisionAlerts,
  validateStageTransition,
} from "@/components/drawings/drawingsUtils";

// ── Presentation components ─────────────────────────────────────────────────
import DrawingsTable from "@/components/drawings/DrawingsTable";
import DrawingsGrid from "@/components/drawings/DrawingsGrid";
import { DisciplineChips, FilterBar, BulkActionsBar } from "@/components/drawings/DrawingsToolbar";
import AlertBanner from "@/components/drawings/AlertBanner";
import ActiveFilterPills from "@/components/drawings/ActiveFilterPills";
import DrawingContextMenu from "@/components/drawings/DrawingContextMenu";
import SheetFormModal from "@/components/drawings/SheetFormModal";
import SetApprovalModal from "@/components/drawings/SetApprovalModal";
import RenameSetModal from "@/components/drawings/RenameSetModal";
import BulkEditModal from "@/components/drawings/BulkEditModal";
import DrawingSetUploadModal from "@/components/drawings/DrawingSetUploadModal";
import RevisionUploadModal from "@/components/drawings/RevisionUploadModal";
import DeleteDialog from "@/components/shared/DeleteDialog";

// ── Design-system chrome (Claude Design redesign) ─────────────────────────
import {
  CommandBar,
  KpiTile,
  PhaseChevron,
  Button,
} from "@/components/design-system";

// ─────────────────────────────────────────────────────────────────────────────

export default function Drawings() {
  const { activeProject } = useProjectContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = activeProject?.id;

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
  const [approvalSet, setApprovalSet] = useState(null);
  const [savingApproval, setSavingApproval] = useState(false);
  const [renameSet, setRenameSet] = useState(null);   // { setId, setName, sheets }
  const [savingRename, setSavingRename] = useState(false);
  const [uploadSetOpen, setUploadSetOpen] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  // F18: replace window.confirm() with a styled DeleteDialog. Shape:
  //   { title, description, run: () => void }
  // run() is what fires when the user hits "Delete" in the dialog.
  const [confirmState, setConfirmState] = useState(null);
  const contextRef = useRef(null);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: drawings = [], isLoading } = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: () => projectId ? base44.entities.Drawing.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 30000,
  });

  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis", projectId],
    queryFn: () => projectId ? base44.entities.RFI.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 60000,
  });

  // Parent drawing_sets rows — used for aggregate badges (sheet_count,
  // processed_count, etc.) and to keep set names in sync with the upload modal.
  const { data: drawingSetRecords = [] } = useQuery({
    queryKey: ["drawing_sets", projectId],
    queryFn: () => projectId ? base44.entities.DrawingSet.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 30000,
  });

  // F15: reconcile stuck "Extracting" rows on page mount.
  //
  // If a user closes the tab while the AI extractor is mid-run, the child
  // sheet rows get left at ai_extraction_status='Extracting' forever — there
  // is no server-side worker that notices. On mount we find any rows that
  // have been in Extracting for more than 10 minutes (longer than any real
  // Claude call) and mark them Failed so the UI stops lying.
  useEffect(() => {
    if (!drawings.length) return;
    const STUCK_MS = 10 * 60 * 1000;
    const now = Date.now();
    const stuck = drawings.filter(d => {
      if (d.ai_extraction_status !== "Extracting") return false;
      const anchor = d.last_extracted_at || d.updated_at || d.created_at;
      if (!anchor) return true;
      return now - new Date(anchor).getTime() > STUCK_MS;
    });
    if (stuck.length === 0) return;
    (async () => {
      for (const d of stuck) {
        try {
          await base44.entities.Drawing.update(d.id, {
            ai_extraction_status: "Failed",
            ai_extraction_error: "Extraction interrupted — reconcile on page mount",
          });
        } catch (err) {
          console.warn("[drawings] Failed to reconcile stuck row", d.id, err);
        }
      }
      invalidate();
      toast.info(`Reconciled ${stuck.length} stuck extraction${stuck.length === 1 ? "" : "s"}`);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // H9: keep the search box in sync with ?sheet= / ?search= query params.
  // Without this, in-app deep links (e.g. PCC → /drawings?sheet=S-001) just
  // change the URL without remounting the page, so the useState initializer
  // above would never re-read the new param.
  useEffect(() => {
    const next = searchParams.get("search") || searchParams.get("sheet") || "";
    setSearch(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const rfiMap = useMemo(() => {
    const map = {};
    rfis.forEach(r => { if (r.rfi_number) map[r.rfi_number] = r; });
    return map;
  }, [rfis]);

  const filtered = useMemo(() => {
    let list = [...drawings];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        d.sheet_number?.toLowerCase().includes(q) ||
        d.title?.toLowerCase().includes(q) ||
        d.reviewer?.toLowerCase().includes(q) ||
        d.spec_section?.toLowerCase().includes(q)
      );
    }
    if (discipline !== "ALL") list = list.filter(d => d.discipline === discipline);
    if (stageFilter !== "ALL") {
      if (stageFilter === "_overdue") list = list.filter(d => isOverdue(d));
      else if (stageFilter === "_inReview") list = list.filter(d => IN_REVIEW_STAGES.includes(d.stage));
      else if (stageFilter === "_priority") list = list.filter(d => d.priority_flag);
      else list = list.filter(d => d.stage === stageFilter);
    }
    return list;
  }, [drawings, search, discipline, stageFilter]);

  const stats = useMemo(() => computeStats(drawings, drawingSetRecords), [drawings, drawingSetRecords]);
  const disciplineCounts = useMemo(() => computeDisciplineCounts(drawings, DISCIPLINES), [drawings]);
  const revisionAlerts = useMemo(() => buildRevisionAlerts(drawings, rfiMap), [drawings, rfiMap]);

  // ── Drawing set grouping ──────────────────────────────────────────────────
  const drawingSets = useMemo(() => {
    const map = {};
    drawings.forEach(d => {
      const name = d.drawing_set_name?.trim();
      if (!name) return;
      if (!map[name]) map[name] = [];
      map[name].push(d);
    });
    return map;
  }, [drawings]);

  // Names from real drawing_sets parent rows + legacy string column on drawings,
  // deduped. The upload modal uses this for autocomplete + duplicate detection.
  const existingSetNames = useMemo(() => {
    const names = new Set(Object.keys(drawingSets));
    drawingSetRecords.forEach(ds => {
      if (ds?.set_name?.trim()) names.add(ds.set_name.trim());
    });
    return [...names].sort();
  }, [drawingSets, drawingSetRecords]);

  // id → parent set record lookup. DrawingsTable groups by drawing_set_id and
  // pulls display names from this map so the FK is the source of truth for
  // grouping, not the legacy denormalized drawing_set_name string. (F8)
  const drawingSetMap = useMemo(() => {
    const map = {};
    drawingSetRecords.forEach(ds => { if (ds?.id) map[ds.id] = ds; });
    return map;
  }, [drawingSetRecords]);

  const selectedSetName = useMemo(() => {
    if (selected.size === 0) return null;
    const names = new Set();
    for (const id of selected) {
      const d = drawings.find(x => x.id === id);
      if (d?.drawing_set_name?.trim()) names.add(d.drawing_set_name.trim());
    }
    return names.size === 1 ? [...names][0] : null;
  }, [selected, drawings]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  // Any drawings mutation must also invalidate the parent drawing_sets query,
  // because a child INSERT/UPDATE/DELETE fires the sync_drawing_set_counts
  // trigger which updates sheet_count / processed_count / needs_review_count
  // / failed_count on the parent row. Without invalidating both, the group
  // summary badge lies for up to staleTime (30s) after every action.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["drawings", projectId] });
    qc.invalidateQueries({ queryKey: ["drawing_sets", projectId] });
  };

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Drawing.create({ ...data, project_id: projectId, project_name: activeProject?.name }),
    onSuccess: async (created) => {
      invalidate();
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
    onError: (e) => toast.error("Failed to add: " + (e?.message || "unknown")),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => base44.entities.Drawing.update(id, data),
    // Close the modal AND clear editing on success — leaving the modal
    // open while editing was cleared caused a second save click to route
    // into the create path with the edited row's id still in form state,
    // triggering a drawings_pkey duplicate.
    onSuccess: () => {
      invalidate();
      toast.success("Sheet updated");
      setEditing(null);
      setShowModal(false);
    },
    onError: (e) => toast.error("Failed to update: " + (e?.message || "unknown")),
  });

  // F19: soft-delete with undo. The id is a single drawing row; we can flip
  // is_deleted=false to restore it. The sonner toast exposes an "Undo"
  // action button that does exactly that.
  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Drawing.delete(id),
    onSuccess: (_data, id) => {
      invalidate();
      setSelected(new Set());
      toast.success("Sheet deleted", {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await base44.entities.Drawing.update(id, { is_deleted: false, deleted_at: null });
              invalidate();
              toast.success("Sheet restored");
            } catch (err) {
              toast.error("Restore failed: " + (err?.message || "unknown"));
            }
          },
        },
      });
    },
    onError: (e) => toast.error("Failed to delete: " + (e?.message || "unknown")),
  });

  // Cascade-delete an entire drawing set (parent + all child sheets) in one
  // transaction via the delete_drawing_set(p_set_id) RPC shipped in migration
  // 022. Falls back to a client-side loop if the child sheets reference the
  // set only by legacy drawing_set_name (no FK yet).
  const deleteSetMut = useMutation({
    mutationFn: async ({ setId, sheetIds }) => {
      // Set-only (parent row, no child sheets): soft-delete parent directly
      if (setId && sheetIds.length === 0) {
        await base44.entities.DrawingSet.delete(setId);
        return { deleted: 0, parentOnly: true };
      }
      // Normal cascade: parent + children in one transaction
      if (setId) {
        const result = await base44.entities.DrawingSet.deleteCascade(setId);
        return { deleted: result.deletedChildCount ?? sheetIds.length };
      }
      // Legacy fallback: no parent row, just sweep the children.
      const { succeeded } = await batchProcess(sheetIds, (id) => base44.entities.Drawing.delete(id));
      return { deleted: succeeded.length };
    },
    onSuccess: ({ deleted, parentOnly }, { setId, sheetIds, setName }) => {
      invalidate();
      setSelected(new Set());
      const msg = parentOnly
        ? `Deleted set "${setName}"`
        : `Deleted "${setName}" and ${deleted} sheet${deleted === 1 ? "" : "s"}`;
      toast.success(msg, {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              if (setId) {
                await base44.entities.DrawingSet.update(setId, { is_deleted: false, deleted_at: null });
              }
              if (sheetIds.length > 0) {
                await batchProcess(sheetIds, (id) =>
                  base44.entities.Drawing.update(id, { is_deleted: false, deleted_at: null })
                );
              }
              invalidate();
              toast.success(`Restored "${setName}"`);
            } catch (err) {
              toast.error("Restore failed: " + (err?.message || "unknown"));
            }
          },
        },
      });
    },
    onError: (e) => toast.error("Failed to delete set: " + (e?.message || "unknown")),
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
    updateMut.mutate({ id: drawing.id, stage: target });
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
    const { succeeded, failed } = await batchProcess(
      ids,
      (id) => {
        const current = drawings.find(d => d.id === id);
        if (current) {
          const v = validateStageTransition(current.stage, bulkStage);
          if (!v.ok) throw new Error(v.reason);
        }
        return base44.entities.Drawing.update(id, { stage: bulkStage });
      },
    );
    invalidate();
    if (failed.length > 0) {
      toast.warning(`${succeeded.length} updated, ${failed.length} failed`);
    } else {
      setSelected(new Set());
      setBulkStage("");
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
        const { succeeded, failed } = await batchProcess(ids, (id) => base44.entities.Drawing.delete(id));
        invalidate();
        if (failed.length > 0) {
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
                    base44.entities.Drawing.update(id, { is_deleted: false, deleted_at: null })
                  );
                  invalidate();
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
      (id) => base44.entities.Drawing.update(id, payload),
    );
    invalidate();
    if (failed.length > 0) {
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
        try {
          await base44.entities.DrawingSet.update(parentSetId, {
            set_approval_status: status,
            set_approved_date:   effectiveDate,
            set_approved_by:     _approvedBy || null,
            set_approval_notes:  notes || null,
            ...(revision ? { revision } : {}),
          });
        } catch (parentErr) {
          // Don't fail the whole operation on a parent-row update glitch —
          // the per-sheet writes below still record the intent.
          console.warn("Parent drawing_set approval update failed:", parentErr);
        }
      }

      const sheetsToUpdate = applyToSheets ? approvalSet.sheets : [approvalSet.sheets[0]];
      const { succeeded, failed } = await batchProcess(
        sheetsToUpdate,
        (s) => base44.entities.Drawing.update(s.id, {
          set_approval_status: status,
          set_approved_date: effectiveDate,
          ...(revision ? { revision_number: revision } : {}),
          ...(notes ? { notes: (s.notes ? s.notes + "\n" : "") + `[${status.toUpperCase()}] ${notes}` } : {}),
        }),
      );
      invalidate();
      if (failed.length > 0) {
        toast.warning(`${succeeded.length} sheets updated, ${failed.length} failed`);
      } else {
        toast.success(`Set "${approvalSet.setName}" marked as ${status}`);
      }
      setApprovalSet(null);
    } catch (err) {
      toast.error("Approval update failed: " + (err?.message || "Unknown error"));
    } finally {
      setSavingApproval(false);
    }
  };

  const openSetApproval = (setName) => {
    const sheets = drawingSets[setName] || [];
    if (!sheets.length) return;
    // Prefer the parent FK if any child sheet has one — that's what we'll
    // write approval state to.
    const setId = sheets.map(s => s.drawing_set_id).find(Boolean) || null;
    setApprovalSet({ setName, setId, sheets });
  };

  const openRenameSet = (group) => {
    // Group is what DrawingsTable passes to onDeleteSet — same shape works:
    //   { name, sheets, setId?, parent? }
    if (!group || group.isUngrouped) return;
    const setIdCandidates = (group.sheets || []).map(s => s.drawing_set_id).filter(Boolean);
    const setId = setIdCandidates[0] || group.setId || group.parent?.id || null;
    setRenameSet({ setId, setName: group.name, sheets: group.sheets || [] });
  };

  const handleRenameSet = async (newName) => {
    if (!renameSet) return;
    const { setId, setName: oldName, sheets } = renameSet;
    setSavingRename(true);
    try {
      // Update the parent drawing_sets row when one exists.
      if (setId) {
        await base44.entities.DrawingSet.update(setId, { set_name: newName });
      }
      // Also update every child sheet's denormalized drawing_set_name so the
      // table grouping follows the rename even for legacy rows that don't
      // have a parent FK. Uses the same batch helper as bulk stage apply.
      const sheetIds = (sheets || []).map(s => s.id);
      if (sheetIds.length > 0) {
        await batchProcess(sheetIds, (id) =>
          base44.entities.Drawing.update(id, { drawing_set_name: newName })
        );
      }
      invalidate();
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
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(d => d.id)));
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!projectId) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <p style={{ ...mono, fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.15em" }}>
          SELECT A PROJECT TO VIEW DRAWINGS
        </p>
      </div>
    );
  }

  return (
    <div
      style={{ padding: "24px 28px", minHeight: "100vh", background: "var(--bg-page)" }}
      onClick={() => { setContextMenu(null); }}
    >
      {/* ── CommandBar ─────────────────────────────────────────────────────── */}
      <CommandBar
        eyebrow={`DESIGN & DOCUMENTS · ${(activeProject?.name || "").toUpperCase()}`}
        title="Drawings & Submittals"
        count={stats.total}
        unit={` · ${stats.sheetCount} SHEETS`}
        subtitle="Not Started → OFA → BFA → OFS → BFS → IFC → Released"
      >
        <Button variant="secondary" icon="download" onClick={() => exportTransmittal(filtered, activeProject?.name)}>
          TRANSMITTAL
        </Button>
        <Button variant="secondary" icon="plus" onClick={() => { setEditing(null); setShowModal(true); }}>
          ADD SHEET
        </Button>
        <Button
          variant="outline"
          icon="arrow"
          onClick={() => setRevisionOpen(true)}
          disabled={drawingSetRecords.length === 0 && existingSetNames.length === 0}
          title="Upload a new revision of an existing set"
        >
          NEW REVISION
        </Button>
        <Button variant="primary" icon="upload" onClick={() => setUploadSetOpen(true)}>
          UPLOAD SET
        </Button>
      </CommandBar>

      {/* ── KPI Row ────────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 14 }}>
        <KpiTile compact label="PACKAGES"  value={stats.total}    color="var(--accent)"          active={stageFilter === "ALL"}        onClick={() => setStageFilter("ALL")} />
        <KpiTile compact label="RELEASED"  value={stats.released} color="var(--status-success)"  active={stageFilter === "Released"}   onClick={() => setStageFilter("Released")} />
        <KpiTile compact label="IN REVIEW" value={stats.inReview} color="var(--status-info)"     active={stageFilter === "_inReview"}  onClick={() => setStageFilter(stageFilter === "_inReview" ? "ALL" : "_inReview")} />
        <KpiTile compact label="OVERDUE"   value={stats.overdue}  color="var(--status-error)"    active={stageFilter === "_overdue"}   onClick={() => setStageFilter(stageFilter === "_overdue" ? "ALL" : "_overdue")} />
        <KpiTile compact label="PRIORITY"  value={stats.priority} color="var(--status-review)"   active={stageFilter === "_priority"}  onClick={() => setStageFilter(stageFilter === "_priority" ? "ALL" : "_priority")} />
      </div>

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

      {/* ── Submittal Stage Pipeline (PhaseChevron) ────────────────────────── */}
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
            // Build stage counts from all drawings
            const counts = STAGES.reduce((acc, s) => {
              acc[s.key] = drawings.filter((d) => d.stage === s.key).length;
              return acc;
            }, {});
            // Pipeline stages (use only the forward-flow stages; Released is the terminal)
            const pipeStages = STAGES.map((s) => ({
              id: s.key,
              label: s.label,
              color: s.color,
              count: counts[s.key] || 0,
            }));
            // Active = current stage filter if it's a real stage, else the first
            // non-empty non-terminal stage (the bottleneck).
            let activeIdx = 0;
            const filteredActive = stageFilter !== "ALL" && !stageFilter.startsWith("_")
              ? STAGES.findIndex((s) => s.key === stageFilter)
              : -1;
            if (filteredActive >= 0) {
              activeIdx = filteredActive;
            } else {
              for (let i = STAGES.length - 2; i >= 1; i--) {
                if (counts[STAGES[i].key] > 0) { activeIdx = i; break; }
              }
            }
            return <PhaseChevron stages={pipeStages} activeIdx={activeIdx} showIcons={false} />;
          })()}
        </div>
      </ErrorBoundary>

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
            onEdit={d => { setEditing(d); setShowModal(true); }}
            onDelete={handleDelete}
            onAdvance={handleAdvanceStage}
            onView={d => navigate(`/DrawingViewer?id=${d.id}`)}
            setContextMenu={setContextMenu}
            onSetApproval={openSetApproval}
            onDeleteSet={handleDeleteSet}
            onRenameSet={openRenameSet}
            rfiMap={rfiMap}
            drawingSetMap={drawingSetMap}
          />
        ) : (
          <DrawingsGrid
            drawings={filtered}
            drawingSets={drawingSetRecords}
            selected={selected}
            onToggleSelect={toggleSelect}
            onEdit={d => { setEditing(d); setShowModal(true); }}
            onDelete={handleDelete}
            onAdvance={handleAdvanceStage}
            onView={d => navigate(`/DrawingViewer?id=${d.id}`)}
            onSetApproval={openSetApproval}
            onRenameSet={openRenameSet}
            onDeleteSet={handleDeleteSet}
            rfiMap={rfiMap}
          />
        )}
      </ErrorBoundary>

      {/* ── Context Menu ───────────────────────────────────────────────────── */}
      <DrawingContextMenu
        contextMenu={contextMenu}
        contextRef={contextRef}
        onView={(d) => navigate(`/DrawingViewer?id=${d.id}`)}
        onEdit={(d) => { setEditing(d); setShowModal(true); }}
        onAdvance={handleAdvanceStage}
        onSetApproval={openSetApproval}
        onDelete={handleDelete}
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

      <DrawingSetUploadModal
        open={uploadSetOpen}
        onClose={() => setUploadSetOpen(false)}
        onComplete={() => {
          invalidate();
          qc.invalidateQueries({ queryKey: ["drawing_sets", projectId] });
        }}
        activeProject={activeProject}
        existingDrawings={drawings}
        existingSetNames={existingSetNames}
      />

      {/* New Revision flow — marks prior sheets is_superseded=true and
          inserts the replacement revision under the same set. F14. */}
      <RevisionUploadModal
        open={revisionOpen}
        onClose={() => setRevisionOpen(false)}
        onComplete={() => { invalidate(); setRevisionOpen(false); }}
        activeProject={activeProject}
        drawingSets={drawingSetRecords}
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

