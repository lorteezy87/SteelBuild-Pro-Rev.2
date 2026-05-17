/**
 * RFIs page shell.
 *
 * Owns React Query data, mutations, URL state, search and filter state,
 * bulk selection, attachment upload, and overdue-alert creation. The
 * visible module is split into focused presentation components under
 * `src/pages/rfis/*`.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./rfis/RFIs.css";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useProjectId } from "@/hooks/useProjectId";
import { useAutoOpenCreate } from "@/hooks/useAutoOpenCreate";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import DeleteDialog from "@/components/shared/DeleteDialog";
import RFIFormModal from "@/components/rfis/RFIFormModal";
import RfiLogImportModal from "@/components/rfis/RfiLogImportModal";
import RfiBulkEditModal from "@/components/rfis/RfiBulkEditModal";
import { getNextFormattedNumber } from "@/components/shared/numberSequencing";
import {
  appendRecordToCaches,
  replaceRecordInCaches,
  removeRecordFromCaches,
  invalidateCrudQueries,
  toastCrudError,
} from "@/components/shared/crudFeedback";
import { batchProcess } from "@/utils/batchProcess";

import {
  BulkActionBar,
  EmptyState,
  Icon,
} from "@/components/design-system";

import { compareRfisByNumber, isOverdue, exportRFIsToCSV } from "./rfis/utils";
import RfiRow, { RFI_ROW_GRID } from "./rfis/RfiRow";
import RfiDetailModal from "./rfis/RfiDetailModal";
import RfiInsightsStrip from "./rfis/RfiInsightsStrip";
import RfiCommandCenter from "./rfis/RfiCommandCenter";

const DISCIPLINES = ["All", "Structural", "Connections", "Misc Metals", "Anchor Bolts"];

// Density presets persist in localStorage. "Compact" tightens the row
// height + drops the submitter sub-line; "Comfortable" gives the row
// 50px of breathing room. Density mutates the CSS variable that
// RfiRow reads for its row height.
const DENSITY_LS_KEY = "sbp-rfi-density";
const DENSITY_PRESETS = {
  compact:     { rowHeight: 56, label: "COMPACT" },
  normal:      { rowHeight: 72, label: "NORMAL" },
  comfortable: { rowHeight: 88, label: "COMFORTABLE" },
};
function loadDensity() {
  try {
    const v = localStorage.getItem(DENSITY_LS_KEY);
    if (v && DENSITY_PRESETS[v]) return v;
  } catch { /* noop */ }
  return "normal";
}
const INSIGHTS_LS_KEY = "sbp-rfi-insights-collapsed";
function loadInsightsCollapsed() {
  try { return localStorage.getItem(INSIGHTS_LS_KEY) === "1"; } catch { return false; }
}

export default function RFIs() {
  const [searchParams] = useSearchParams();
  const projectId = useProjectId();
  const qc = useQueryClient();

  const [filter, setFilter] = useState("all");
  const [disciplineFilter, setDisciplineFilter] = useState("All");
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [showForm, setShowForm] = useState(false);
  const [showLogImport, setShowLogImport] = useState(false);
  const [editingRFI, setEditingRFI] = useState(null);
  const [selectedRFI, setSelectedRFI] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [density, setDensity] = useState(loadDensity);
  const [insightsCollapsed, setInsightsCollapsed] = useState(loadInsightsCollapsed);
  const [savingAttachments, setSavingAttachments] = useState(false);
  const handleDensityChange = (v) => {
    setDensity(v);
    try { localStorage.setItem(DENSITY_LS_KEY, v); } catch { /* noop */ }
  };
  const handleToggleInsights = () => {
    setInsightsCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(INSIGHTS_LS_KEY, next ? "1" : "0"); } catch { /* noop */ }
      return next;
    });
  };
  const densityPreset = DENSITY_PRESETS[density] || DENSITY_PRESETS.normal;

  /* ── Data ── */
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: rfis = [], isLoading: rfisLoading } = useQuery({
    queryKey: ["rfis", projectId],
    queryFn: () => base44.entities.RFI.filter({ project_id: projectId }, "-submitted_date"),
    enabled: !!projectId,
  });
  const rfiQueryKeys = [["rfis", projectId], ["rfis"]];
  useRealtimeInvalidation("rfis", projectId, rfiQueryKeys);

  /* ── URL-driven selection (from cross-page deep links) ── */
  const urlRfiId = searchParams.get("id");
  const urlSearch = searchParams.get("search");
  useEffect(() => { if (urlSearch) setSearch(urlSearch); }, [urlSearch]);
  useEffect(() => {
    if (!urlRfiId || !rfis.length) return;
    const found = rfis.find((r) => r.id === urlRfiId);
    if (found) setSelectedRFI(found);
  }, [urlRfiId, rfis]);
  // Auto-open the create modal when QuickAddFAB navigated here with ?new=1.
  // The hook strips the param via `replace: true`, so a refresh of the
  // page doesn't re-open the modal and the back button still returns
  // the user to wherever they came from.
  useAutoOpenCreate(() => {
    setEditingRFI(null);
    setShowForm(true);
  });

  /* ── Mutations ── */
  const createMut = useMutation({
    mutationFn: (data) => base44.entities.RFI.create(data),
    onSuccess: async (created) => {
      appendRecordToCaches(qc, rfiQueryKeys, created, (record, key) => !key[1] || record.project_id === key[1]);
      await invalidateCrudQueries(qc, rfiQueryKeys);
      toast.success("RFI created");
    },
    onError: (e) => toastCrudError(e, "Failed to create RFI"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.RFI.update(id, data),
    onSuccess: async (updated) => {
      replaceRecordInCaches(qc, rfiQueryKeys, updated);
      if (selectedRFI?.id === updated.id) setSelectedRFI(updated);
      await invalidateCrudQueries(qc, rfiQueryKeys);
      toast.success("RFI updated");
    },
    onError: (e) => toastCrudError(e, "Failed to update RFI"),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.RFI.delete(id),
    onSuccess: async (_, deletedId) => {
      removeRecordFromCaches(qc, rfiQueryKeys, deletedId);
      if (selectedRFI?.id === deleteTarget?.id) setSelectedRFI(null);
      setDeleteTarget(null);
      await invalidateCrudQueries(qc, rfiQueryKeys);
      toast.success("RFI deleted");
    },
    onError: (e) => toastCrudError(e, "Failed to delete RFI"),
  });

  const bulkUpdateMut = useMutation({
    mutationFn: async ({ ids, data }) => {
      const results = await batchProcess(ids, (id) => base44.entities.RFI.update(id, data));
      if (results.failed.length > 0 && results.succeeded.length === 0) {
        throw new Error(`All ${results.failed.length} updates failed.`);
      }
      return results;
    },
    onSuccess: async (results) => {
      setSelectedIds(new Set());
      await invalidateCrudQueries(qc, rfiQueryKeys);
      if (results.failed.length > 0) {
        toast.warning(`${results.succeeded.length} updated, ${results.failed.length} failed`);
      } else {
        toast.success("RFIs updated");
      }
    },
    onError: (e) => toastCrudError(e, "Bulk update failed"),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids) => {
      const results = await batchProcess(ids, (id) => base44.entities.RFI.delete(id));
      if (results.failed.length > 0 && results.succeeded.length === 0) {
        throw new Error(`All ${results.failed.length} deletes failed.`);
      }
      return results;
    },
    onSuccess: async (results) => {
      const count = results.succeeded.length;
      setSelectedIds(new Set());
      setShowBulkDelete(false);
      if (selectedRFI && [...selectedIds].includes(selectedRFI.id)) setSelectedRFI(null);
      await invalidateCrudQueries(qc, rfiQueryKeys);
      if (results.failed.length > 0) {
        toast.warning(`${count} deleted, ${results.failed.length} failed`);
      } else {
        toast.success(`${count} RFI${count === 1 ? "" : "s"} deleted`);
      }
    },
    onError: (e) => toastCrudError(e, "Bulk delete failed"),
  });

  /* ── Counts & filtered list ── */
  const counts = useMemo(() => {
    const overdue = rfis.filter((r) => isOverdue(r));
    return {
      all:        rfis.length,
      open:       rfis.filter((r) => r.status === "Open").length,
      review:     rfis.filter((r) => r.status === "Under Review").length,
      incomplete: rfis.filter((r) => r.status === "Incomplete Response").length,
      answered:   rfis.filter((r) => r.status === "Answered").length,
      closed:     rfis.filter((r) => r.status === "Closed").length,
      overdue:    overdue.length,
      critical:   rfis.filter((r) => r.priority === "Critical").length,
    };
  }, [rfis]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rfis
      .filter((r) => {
        if (filter === "open")       return r.status === "Open";
        if (filter === "review")     return r.status === "Under Review";
        if (filter === "incomplete") return r.status === "Incomplete Response";
        if (filter === "answered")   return r.status === "Answered";
        if (filter === "closed")     return r.status === "Closed";
        if (filter === "overdue")    return isOverdue(r);
        if (filter === "critical")   return r.priority === "Critical";
        return true;
      })
      .filter((r) => {
        if (disciplineFilter === "All") return true;
        return (r.discipline || "").toLowerCase().trim() === disciplineFilter.toLowerCase().trim();
      })
      .filter((r) => {
        if (!q) return true;
        return (
          (r.rfi_number || "").toLowerCase().includes(q) ||
          (r.title || "").toLowerCase().includes(q) ||
          (r.submitted_by || "").toLowerCase().includes(q) ||
          (r.drawing_reference || "").toLowerCase().includes(q) ||
          (r.question || "").toLowerCase().includes(q) ||
          (r.answer || "").toLowerCase().includes(q)
        );
      })
      .sort(compareRfisByNumber);
  }, [rfis, filter, disciplineFilter, search]);

  /* ── Overdue → Alert background effect ── */
  const projectMap = useMemo(() => {
    const m = {};
    for (const p of projects) m[p.id] = p.name || "";
    return m;
  }, [projects]);

  const alertsCreatedRef = useRef(new Set());
  useEffect(() => {
    if (!rfis.length) return;
    const createRFIAlerts = async () => {
      try {
        const existing = await base44.entities.Alert.filter({ alert_type: "RFI_Overdue" });
        const existingIds = new Set(existing.map((a) => a.related_record_id).filter(Boolean));
        const existingTitles = new Set(existing.map((a) => a.title));
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const in3 = new Date(today.getTime() + 3 * 86400000);
        for (const r of rfis) {
          if (["Answered", "Closed"].includes(r.status)) continue;
          if (!r.date_required) continue;
          if (alertsCreatedRef.current.has(r.id)) continue;
          const due = new Date(r.date_required + "T00:00:00");
          const isOD = due < today;
          const soon = !isOD && due <= in3;
          if (!isOD && !soon) continue;
          if (existingIds.has(r.id)) continue;
          const daysLate = isOD ? Math.floor((today - due) / 86400000) : 0;
          const liveProjectName = projectMap[r.project_id] || "";
          const alertTitle = isOD ? `${r.rfi_number} OVERDUE — ${daysLate}d` : `${r.rfi_number} due in ≤3 days`;
          if (existingTitles.has(alertTitle)) continue;
          await base44.entities.Alert.create({
            alert_type: "RFI_Overdue",
            severity: r.priority === "Critical" || daysLate >= 7 ? "Critical" : daysLate >= 3 || r.priority === "High" ? "High" : "Medium",
            title: alertTitle,
            description: `${r.rfi_number}: "${(r.title || "").slice(0, 60)}" · BIC: ${r.ball_in_court || "Contractor"} · Priority: ${r.priority}`,
            project_id: r.project_id,
            project_name: liveProjectName,
          });
          alertsCreatedRef.current.add(r.id);
        }
      } catch (e) {
        console.warn("RFI alert:", e);
      }
    };
    const t = setTimeout(createRFIAlerts, 2500);
    return () => clearTimeout(t);
  }, [rfis, projectMap]);

  /* ── Selection helpers ── */
  const toggleSelect = (id) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const toggleAll = (checked) =>
    setSelectedIds(checked ? new Set(filtered.map((r) => r.id)) : new Set());

  const uploadRfiPdfDocuments = async (rfiRecord, files = []) => {
    if (!rfiRecord?.id || !files.length) return;

    setSavingAttachments(true);
    try {
      const uploadedBy = await base44.auth.me?.()
        .then((user) => user?.email)
        .catch(() => "");
      const project = projects.find((p) => p.id === (rfiRecord.project_id || projectId));
      const now = new Date().toISOString();

      for (const file of files) {
        const uploaded = await base44.integrations.Core.UploadFile({ file });
        await base44.entities.Document.create({
          project_id: rfiRecord.project_id || projectId,
          project_name: rfiRecord.project_name || project?.name || "",
          rfi_id: rfiRecord.id,
          display_name: file.name,
          description: `Attachment for ${rfiRecord.rfi_number || "RFI"}`,
          file_name: file.name,
          file_url: uploaded.file_url,
          file_type: "pdf",
          file_size_kb: Math.max(1, Math.round(file.size / 1024)),
          mime_type: file.type || "application/pdf",
          category: "RFI",
          document_type: "RFI Attachment",
          discipline: rfiRecord.discipline || "Other",
          status: "Current",
          revision_number: "0",
          revision_date: now.slice(0, 10),
          uploaded_by: uploadedBy || "Unknown",
          uploaded_date: now,
          tags: ["RFI", rfiRecord.rfi_number || rfiRecord.id].filter(Boolean),
        });
      }

      await qc.invalidateQueries({ queryKey: ["rfi-documents", rfiRecord.id] });
      await qc.invalidateQueries({ queryKey: ["documents", rfiRecord.project_id || projectId] });
      toast.success(`${files.length} PDF${files.length === 1 ? "" : "s"} attached to ${rfiRecord.rfi_number || "RFI"}`);
    } finally {
      setSavingAttachments(false);
    }
  };

  /* ── Loading ── */
  if (rfisLoading) {
    return (
      <div style={{ padding: 24 }}>
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }

  const activeProjectName = projects.find((p) => p.id === projectId)?.name || "All Projects";

  return (
    <div
      className="rfi-page"
      style={{
        "--density-row-height": `${densityPreset.rowHeight}px`,
        "--rfi-row-grid": RFI_ROW_GRID,
      }}
    >
      <RfiCommandCenter
        projectName={activeProjectName}
        counts={counts}
        rfis={rfis}
        filter={filter}
        onFilterChange={setFilter}
        onOpenRfi={setSelectedRFI}
        onExport={() => exportRFIsToCSV(filtered)}
        onImport={() => setShowLogImport(true)}
        onCreate={() => {
          setEditingRFI(null);
          setShowForm(true);
        }}
      />

      <RfiInsightsStrip
        rfis={rfis}
        collapsed={insightsCollapsed}
        onToggleCollapsed={handleToggleInsights}
      />
      <div className="rfi-filter-toolbar">
        <div className="rfi-search-box">
          <div className="rfi-search-icon">
            <Icon name="search" size={13} />
          </div>
          <input
            className="rfi-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search RFI number, title, drawing, question, or answer"
          />
        </div>

        <div className="rfi-filter-group">
          <span className="rfi-filter-label">Discipline</span>
          {DISCIPLINES.map((d) => (
            <button
              key={d}
              type="button"
              className={`rfi-chip${disciplineFilter === d ? " is-active" : ""}`}
              onClick={() => setDisciplineFilter(d)}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="rfi-filter-group">
          <span className="rfi-filter-label">Density</span>
          {Object.entries(DENSITY_PRESETS).map(([id, preset]) => (
            <button
              key={id}
              type="button"
              className={`rfi-chip${density === id ? " is-active" : ""}`}
              onClick={() => handleDensityChange(id)}
              title={preset.label.toLowerCase()}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <span className="rfi-toolbar-count">{filtered.length} of {rfis.length}</span>
      </div>

      {/* Table */}
      <div className="rfi-table-shell">
        <div className="rfi-table-header">
          <div>
            <input
              type="checkbox"
              checked={filtered.length > 0 && selectedIds.size === filtered.length}
              onChange={(e) => toggleAll(e.target.checked)}
            />
          </div>
          <div>RFI</div>
          <div>Question / Reference</div>
          <div>Ball in Court</div>
          <div>Status</div>
          <div>Due / Age</div>
          <div>Impact</div>
          <div></div>
        </div>
        {filtered.length > 0 ? (
          <div className="rfi-table-body">
            {filtered.map((r) => (
              <RfiRow
                key={r.id}
                rfi={r}
                selected={selectedIds.has(r.id)}
                onToggle={() => toggleSelect(r.id)}
                onOpen={() => setSelectedRFI(r)}
              />
            ))}
          </div>
        ) : (
          <div className="rfi-empty-wrap">
            <EmptyState
              icon="rfi"
              title={rfis.length === 0 ? "No RFIs yet" : "No RFIs match your filters"}
              body={
                rfis.length === 0
                  ? "Create the first RFI or import an existing RFI log from CSV."
                  : "Try clearing filters or widening the search query."
              }
            />
          </div>
        )}
      </div>

      {/* Bulk actions */}
      <BulkActionBar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        actions={[
          {
            label: "MARK ANSWERED",
            icon: "check",
            onClick: () => bulkUpdateMut.mutate({ ids: [...selectedIds], data: { status: "Answered", date_answered: new Date().toISOString().split("T")[0] } }),
          },
          {
            label: "MARK UNDER REVIEW",
            icon: "clock",
            onClick: () => bulkUpdateMut.mutate({ ids: [...selectedIds], data: { status: "Under Review" } }),
          },
          {
            // Full bulk-edit modal — lets users update priority, BIC,
            // required date, etc. on the whole selection at once.
            label: "BULK EDIT",
            icon: "edit",
            onClick: () => setShowBulkEdit(true),
          },
          {
            label: "EXPORT",
            icon: "download",
            onClick: () => exportRFIsToCSV(filtered.filter((r) => selectedIds.has(r.id))),
          },
          {
            label: "DELETE",
            icon: "x",
            variant: "danger",
            onClick: () => setShowBulkDelete(true),
          },
        ]}
      />

      <RfiBulkEditModal
        open={showBulkEdit}
        count={selectedIds.size}
        onCancel={() => setShowBulkEdit(false)}
        onSubmit={(data) => {
          bulkUpdateMut.mutate({ ids: [...selectedIds], data });
          setShowBulkEdit(false);
        }}
      />

      {/* Modals */}
      <RfiDetailModal
        rfi={selectedRFI}
        onClose={() => setSelectedRFI(null)}
        onEdit={() => {
          setEditingRFI(selectedRFI);
          setSelectedRFI(null);
          setShowForm(true);
        }}
        onAdvanceStatus={(status) => {
          if (!selectedRFI) return;
          const extra = ["Answered", "Closed"].includes(status)
            ? { date_answered: new Date().toISOString().split("T")[0] }
            : {};
          updateMut.mutate({ id: selectedRFI.id, data: { status, ...extra } });
        }}
      />

      <RfiLogImportModal
        open={showLogImport}
        projectId={projectId}
        projectName={projects.find((p) => p.id === projectId)?.name}
        projects={projects}
        onClose={() => setShowLogImport(false)}
      />

      {showForm && (
        <RFIFormModal
          open={showForm}
          onClose={() => { setShowForm(false); setEditingRFI(null); }}
          onSave={async (data, pdfFiles = []) => {
            try {
              if (editingRFI) {
                const updated = await updateMut.mutateAsync({
                  id: editingRFI.id,
                  data: {
                    ...data,
                    project_name:
                      projects.find((p) => p.id === (data.project_id || projectId))?.name ||
                      data.project_name ||
                      editingRFI.project_name ||
                      "",
                  },
                });
                await uploadRfiPdfDocuments(updated || { ...editingRFI, ...data }, pdfFiles);
              } else {
                const num =
                  data.rfi_number ||
                  (await getNextFormattedNumber({
                    projectId: data.project_id || projectId,
                    recordType: "RFI",
                    entityName: "RFI",
                    fieldName: "rfi_number",
                    prefix: "RFI #",
                  }));
                const created = await createMut.mutateAsync({
                  ...data,
                  rfi_number: num,
                  project_name:
                    projects.find((p) => p.id === (data.project_id || projectId))?.name ||
                    data.project_name ||
                    "",
                });
                await uploadRfiPdfDocuments(created, pdfFiles);
              }
              setShowForm(false);
              setEditingRFI(null);
            } catch (error) {
              toastCrudError(error, "Failed to save RFI");
            }
          }}
          saving={createMut.isPending || updateMut.isPending || savingAttachments}
          rfi={editingRFI}
          projectId={projectId}
        />
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        title="Delete RFI"
        description={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
      />
      <DeleteDialog
        open={showBulkDelete}
        onClose={() => setShowBulkDelete(false)}
        onConfirm={() => bulkDeleteMut.mutate([...selectedIds])}
        title={`Delete ${selectedIds.size} RFIs`}
        description={`Permanently delete ${selectedIds.size} selected RFI${selectedIds.size === 1 ? "" : "s"}? This cannot be undone.`}
      />
    </div>
  );
}
