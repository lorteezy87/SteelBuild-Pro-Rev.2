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
  STAGE_ORDER, DISCIPLINES, EMPTY_FORM,
  mono, surface, btnGhost, btnPrimary,
} from "@/components/drawings/drawingsConfig";
import {
  isOverdue, exportTransmittal, computeStats, computeDisciplineCounts, buildRevisionAlerts,
} from "@/components/drawings/drawingsUtils";

// ── Presentation components ─────────────────────────────────────────────────
import DrawingsTable, { ContextMenuItem } from "@/components/drawings/DrawingsTable";
import DrawingsGrid from "@/components/drawings/DrawingsGrid";
import { StatsBar, DisciplineChips, FilterBar, BulkActionsBar } from "@/components/drawings/DrawingsToolbar";
import StagePipeline from "@/components/drawings/StagePipeline";
import AlertBanner from "@/components/drawings/AlertBanner";
import SheetFormModal from "@/components/drawings/SheetFormModal";
import SetApprovalModal from "@/components/drawings/SetApprovalModal";

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
      else if (stageFilter === "_inReview") list = list.filter(d => ["OFA", "BFA", "OFS", "BFS", "FFF"].includes(d.stage));
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
  const invalidate = () => qc.invalidateQueries({ queryKey: ["drawings", projectId] });

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
    onSuccess: () => { invalidate(); toast.success("Sheet updated"); setEditing(null); },
    onError: (e) => toast.error("Failed to update: " + (e?.message || "unknown")),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Drawing.delete(id),
    onSuccess: () => { invalidate(); toast.success("Sheet deleted"); setSelected(new Set()); },
    onError: (e) => toast.error("Failed to delete: " + (e?.message || "unknown")),
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
    if (!confirm("Delete this sheet? This cannot be undone.")) return;
    deleteMut.mutate(id);
    setContextMenu(null);
  };

  const handleAdvanceStage = (drawing) => {
    const idx = STAGE_ORDER.indexOf(drawing.stage);
    if (idx < STAGE_ORDER.length - 1) {
      updateMut.mutate({ id: drawing.id, stage: STAGE_ORDER[idx + 1] });
    }
    setContextMenu(null);
  };

  const handleBulkStageApply = async () => {
    if (!bulkStage || selected.size === 0) return;
    const ids = [...selected];
    const { succeeded, failed } = await batchProcess(
      ids,
      (id) => base44.entities.Drawing.update(id, { stage: bulkStage }),
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

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selected.size} sheets? This cannot be undone.`)) return;
    const ids = [...selected];
    const { succeeded, failed } = await batchProcess(ids, (id) => base44.entities.Drawing.delete(id));
    invalidate();
    if (failed.length > 0) {
      toast.warning(`${succeeded.length} deleted, ${failed.length} failed`);
    } else {
      setSelected(new Set());
      toast.success("Sheets deleted");
    }
  };

  const handleSetApproval = async ({ status, revision, _approvedBy, approvalDate, applyToSheets, notes }) => {
    if (!approvalSet) return;
    setSavingApproval(true);
    try {
      const sheetsToUpdate = applyToSheets ? approvalSet.sheets : [approvalSet.sheets[0]];
      const { succeeded, failed } = await batchProcess(
        sheetsToUpdate,
        (s) => base44.entities.Drawing.update(s.id, {
          set_approval_status: status,
          set_approved_date: approvalDate || new Date().toISOString().split("T")[0],
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
    setApprovalSet({ setName, sheets });
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
          <button style={btnPrimary} onClick={() => { setEditing(null); setShowModal(true); }}>
            + ADD SHEET
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
        ) : filtered.length === 0 ? (
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
            rfiMap={rfiMap}
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
    </div>
  );
}
