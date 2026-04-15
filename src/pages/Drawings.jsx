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

// ── Domain config & utils ───────────────────────────────────────────────────
import {
  STAGE_ORDER, DISCIPLINES, EMPTY_FORM, IN_REVIEW_STAGES, STAGES,
  mono, surface, btnGhost, btnPrimary,
} from "@/components/drawings/drawingsConfig";
import {
  isOverdue, exportTransmittal, computeStats, computeDisciplineCounts, buildRevisionAlerts,
  validateStageTransition,
} from "@/components/drawings/drawingsUtils";

// ── Presentation components ─────────────────────────────────────────────────
import DrawingsTable, { ContextMenuItem } from "@/components/drawings/DrawingsTable";
import DrawingsGrid from "@/components/drawings/DrawingsGrid";
import { StatsBar, DisciplineChips, FilterBar, BulkActionsBar } from "@/components/drawings/DrawingsToolbar";
import StagePipeline from "@/components/drawings/StagePipeline";
import AlertBanner from "@/components/drawings/AlertBanner";
import SheetFormModal from "@/components/drawings/SheetFormModal";
import SetApprovalModal from "@/components/drawings/SetApprovalModal";
import DrawingSetUploadModal from "@/components/drawings/DrawingSetUploadModal";
import RevisionUploadModal from "@/components/drawings/RevisionUploadModal";
import DeleteDialog from "@/components/shared/DeleteDialog";

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
  const [contextMenu, setContextMenu] = useState(null);
  const [approvalSet, setApprovalSet] = useState(null);
  const [savingApproval, setSavingApproval] = useState(false);
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

  const stats = useMemo(() => computeStats(drawings), [drawings]);
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
      // Auto-create schedule task
      if (created && (created.due_date || created.submitted_date)) {
        try {
          const startDate = created.submitted_date || created.due_date;
          const endDate = created.due_date || created.submitted_date;
          await base44.entities.ScheduleTask.create({
            project_id: projectId,
            project_name: activeProject?.name || "",
            task_name: `${created.sheet_number || "DWG"} — ${created.title || "Drawing Review"}`,
            task_type: "Submittal",
            phase: "Detailing",
            start_date: startDate,
            end_date: endDate,
            status: "Not Started",
            priority: created.priority_flag ? "High" : "Normal",
            percent_complete: 0,
            notes: [
              created.discipline ? `Discipline: ${created.discipline}` : "",
              created.reviewer ? `Reviewer: ${created.reviewer}` : "",
              created.spec_section ? `Spec: ${created.spec_section}` : "",
            ].filter(Boolean).join(" | "),
          });
          qc.invalidateQueries({ queryKey: ["schedule-tasks"] });
          toast.success("Schedule task auto-created");
        } catch (err) {
          console.warn("Auto-schedule failed:", err);
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
      if (setId) {
        const result = await base44.entities.DrawingSet.deleteCascade(setId);
        return { deleted: result.deletedChildCount ?? sheetIds.length };
      }
      // Legacy fallback: no parent row, just sweep the children.
      const { succeeded } = await batchProcess(sheetIds, (id) => base44.entities.Drawing.delete(id));
      return { deleted: succeeded.length };
    },
    onSuccess: ({ deleted }, { setId, sheetIds, setName }) => {
      invalidate();
      setSelected(new Set());
      // F19: undo for the full cascade. We restore every child sheet id we
      // had going in, plus the parent drawing_sets row if there was one.
      // The cascade RPC set is_deleted=true on all of them, and update() by
      // id still works on soft-deleted rows, so we just flip the bits back.
      toast.success(`Deleted "${setName}" and ${deleted} sheet${deleted === 1 ? "" : "s"}`, {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              if (setId) {
                await base44.entities.DrawingSet.update(setId, { is_deleted: false, deleted_at: null });
              }
              await batchProcess(sheetIds, (id) =>
                base44.entities.Drawing.update(id, { is_deleted: false, deleted_at: null })
              );
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
    // Every child sheet created by the new parent/child flow carries
    // drawing_set_id; legacy hand-entered sheets may only have the text name.
    const setIdCandidates = group.sheets.map(s => s.drawing_set_id).filter(Boolean);
    const setId = setIdCandidates[0] || null;
    const sheetIds = group.sheets.map(s => s.id);
    setConfirmState({
      title: `Delete drawing set "${group.name}"?`,
      description: `The set and all ${total} sheet${total === 1 ? "" : "s"} inside it will be removed. You can undo this from the toast that appears after deletion.`,
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
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ ...mono, fontSize: 10, color: "var(--accent)", letterSpacing: "0.25em", textTransform: "uppercase", marginBottom: 4 }}>
            DRAWINGS & SUBMITTALS
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            {activeProject?.name}
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btnGhost} onClick={() => exportTransmittal(filtered, activeProject?.name)}>
            ↓ TRANSMITTAL
          </button>
          <button style={btnGhost} onClick={() => { setEditing(null); setShowModal(true); }}>
            + ADD SHEET
          </button>
          <button
            style={btnGhost}
            onClick={() => setRevisionOpen(true)}
            disabled={drawingSetRecords.length === 0 && existingSetNames.length === 0}
            title="Upload a new revision of an existing set"
          >
            ⟲ NEW REVISION
          </button>
          <button style={btnPrimary} onClick={() => setUploadSetOpen(true)}>
            + UPLOAD SET
          </button>
        </div>
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <StatsBar stats={stats} stageFilter={stageFilter} setStageFilter={setStageFilter} />

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

      {/* ── Stage Pipeline ─────────────────────────────────────────────────── */}
      <ErrorBoundary label="Stage Pipeline">
        <div style={{ ...surface, padding: "14px 18px", marginBottom: 16 }}>
          <div style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.2em", color: "var(--text-muted)", marginBottom: 10 }}>
            SUBMITTAL STAGE PIPELINE
          </div>
          <StagePipeline
            drawings={drawings}
            activeStage={stageFilter !== "ALL" && !stageFilter.startsWith("_") ? stageFilter : null}
            onStageClick={(key) => setStageFilter(prev => prev === key ? "ALL" : key)}
          />
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
            rfiMap={rfiMap}
            drawingSetMap={drawingSetMap}
          />
        ) : (
          <DrawingsGrid
            drawings={filtered}
            selected={selected}
            onToggleSelect={toggleSelect}
            onEdit={d => { setEditing(d); setShowModal(true); }}
            onDelete={handleDelete}
            onAdvance={handleAdvanceStage}
            onView={d => navigate(`/DrawingViewer?id=${d.id}`)}
            onSetApproval={openSetApproval}
            rfiMap={rfiMap}
          />
        )}
      </ErrorBoundary>

      {/* ── Context Menu ───────────────────────────────────────────────────── */}
      {contextMenu && (
        <div
          ref={contextRef}
          style={{
            position: "fixed", left: contextMenu.x, top: contextMenu.y, zIndex: 999,
            ...surface, padding: "6px 0", minWidth: 180,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
          onClick={e => e.stopPropagation()}
        >
          {[
            { label: "View PDF", action: () => { navigate(`/DrawingViewer?id=${contextMenu.drawing.id}`); setContextMenu(null); } },
            { label: "Edit Sheet", action: () => { setEditing(contextMenu.drawing); setShowModal(true); setContextMenu(null); } },
            { label: "Advance Stage →", action: () => handleAdvanceStage(contextMenu.drawing) },
            ...(contextMenu.drawing.drawing_set_name?.trim() ? [{
              label: "Set Approval ✓",
              action: () => { openSetApproval(contextMenu.drawing.drawing_set_name.trim()); setContextMenu(null); },
            }] : []),
            { label: "Delete Sheet", action: () => handleDelete(contextMenu.drawing.id), danger: true },
          ].map(item => (
            <ContextMenuItem key={item.label} label={item.label} onClick={item.action} danger={item.danger} />
          ))}
        </div>
      )}

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

      <SetApprovalModal
        open={!!approvalSet}
        onClose={() => setApprovalSet(null)}
        setName={approvalSet?.setName || ""}
        sheetCount={approvalSet?.sheets?.length || 0}
        existingRevision={approvalSet?.sheets?.[0]?.revision_number || ""}
        onConfirm={handleSetApproval}
        saving={savingApproval}
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

/**
 * F22: Active-filter pill strip.
 *
 * Sits under FilterBar and renders one chip per active filter — search term,
 * discipline, stage filter — each with a little × to clear that filter. If
 * more than one filter is active, a final "CLEAR ALL" chip resets everything
 * at once. When no filters are on, this renders `null` so the row is
 * completely empty, not just visually blank.
 */
function ActiveFilterPills({ search, discipline, stageFilter, onClearSearch, onClearDiscipline, onClearStage, onClearAll }) {
  const pills = [];
  if (search?.trim()) {
    pills.push({ key: "search", label: `SEARCH: "${search.trim()}"`, onClear: onClearSearch });
  }
  if (discipline && discipline !== "ALL") {
    pills.push({ key: "discipline", label: `DISCIPLINE: ${discipline}`, onClear: onClearDiscipline });
  }
  if (stageFilter && stageFilter !== "ALL") {
    // Translate the internal keys (_overdue / _inReview / _priority / stage-key)
    // into something the user will recognize.
    let stageLabel = stageFilter;
    if (stageFilter === "_overdue")  stageLabel = "OVERDUE";
    else if (stageFilter === "_inReview") stageLabel = "IN REVIEW";
    else if (stageFilter === "_priority") stageLabel = "PRIORITY";
    else if (stageFilter === "Released") stageLabel = "IFC ONLY";
    else {
      const s = STAGES.find(x => x.key === stageFilter);
      if (s) stageLabel = s.label;
    }
    pills.push({ key: "stage", label: `STAGE: ${stageLabel}`, onClear: onClearStage });
  }
  if (pills.length === 0) return null;

  const pillStyle = {
    ...mono,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.08em",
    padding: "4px 6px 4px 10px",
    borderRadius: "var(--radius-badge)",
    border: "1px solid rgba(200,155,32,0.35)",
    background: "rgba(200,155,32,0.10)",
    color: "var(--accent)",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
  const xStyle = {
    ...mono,
    fontSize: 11,
    fontWeight: 800,
    lineHeight: 1,
    padding: "2px 5px",
    marginLeft: 2,
    borderRadius: 3,
    border: "1px solid transparent",
    background: "transparent",
    color: "var(--accent)",
    cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 14 }}>
      <span style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.15em", color: "var(--text-muted)", marginRight: 2 }}>
        FILTERING BY
      </span>
      {pills.map(p => (
        <span key={p.key} style={pillStyle}>
          {p.label}
          <button type="button" aria-label={`Clear ${p.key} filter`} onClick={p.onClear} style={xStyle}>×</button>
        </span>
      ))}
      {pills.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          style={{
            ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
            padding: "4px 10px", borderRadius: "var(--radius-badge)",
            border: "1px solid var(--border-default)",
            background: "none", color: "var(--text-muted)", cursor: "pointer",
          }}
        >
          CLEAR ALL
        </button>
      )}
    </div>
  );
}
