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
import { entities, auth, integrations } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useProjectId } from "@/hooks/useProjectId";
import { useResetOnProjectChange } from "@/hooks/useResetOnProjectChange";
import { useAutoOpenEdit } from "@/hooks/useAutoOpenEdit";
import { useAutoOpenCreate } from "@/hooks/useAutoOpenCreate";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import DeleteDialog from "@/components/shared/DeleteDialog";
import ListTruncationNotice from "@/components/shared/ListTruncationNotice";
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
import { usePermissions } from "@/services/permissions";
import { batchProcess } from "@/utils/batchProcess";

import { BulkActionBar } from "@/components/design-system";

import { exportRFIsToCSV, filterAndSortRfis, buildProjectNameMap } from "./rfis/utils";
import { useRfiSelection, useRfiDensity, useRfiInsightsCollapsed } from "./rfis/useRfiViewState";
import { matchesSequenceFilter } from "@/components/shared/SequenceFilter";
import { RFI_ROW_GRID } from "./rfis/RfiRow";
import RfiDetailModal from "./rfis/RfiDetailModal";
import NudgeDraftModal from "./rfis/NudgeDraftModal";
import { buildRfiAgenda } from "@/lib/commandCenter/rfiAgenda";
import RfiControlCenter from "./rfis/RfiControlCenter";
import { calcWpProgress } from "@/utils/projectKpis";
import {
  buildRfiAlertPayload,
  buildRfiAttachmentDocumentPayload,
  buildRfiCreatePayload,
  formatBulkRfiToast,
  formatRfiNotifyError,
} from "./rfis/rfiMutationHelpers";

export default function RFIs() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const projectId = useProjectId();
  const qc = useQueryClient();
  const { can } = usePermissions();

  const [filter, setFilter] = useState("all");
  const [disciplineFilter, setDisciplineFilter] = useState("All");
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [showForm, setShowForm] = useState(false);
  const [showLogImport, setShowLogImport] = useState(false);
  const [editingRFI, setEditingRFI] = useState(null);
  const [selectedRFI, setSelectedRFI] = useState(null);
  const [nudgeRFI, setNudgeRFI] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [seqFilter, setSeqFilter] = useState(null);
  const [savingAttachments, setSavingAttachments] = useState(false);
  const saveInFlightRef = useRef(false);
  const { density, densityPreset, setDensity: handleDensityChange } = useRfiDensity();
  const { insightsCollapsed, toggleInsights: handleToggleInsights } = useRfiInsightsCollapsed();

  useResetOnProjectChange(projectId, () => {
    setShowForm(false);
    setShowLogImport(false);
    setEditingRFI(null);
    setSelectedRFI(null);
    setNudgeRFI(null);
    setDeleteTarget(null);
    setShowBulkDelete(false);
    setShowBulkEdit(false);
  });

  /* ── Data ── */
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: rfis = [], isLoading: rfisLoading } = useQuery({
    queryKey: ["rfis", projectId],
    queryFn: () => entities.RFI.filter({ project_id: projectId }, "-submitted_date"),
    enabled: !!projectId,
  });
  useAutoOpenEdit(rfis, setSelectedRFI, { enabled: !rfisLoading, param: "recordId" });
  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: () => entities.WorkPackage.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
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
    mutationFn: (data) => entities.RFI.create(buildRfiCreatePayload(data, projectId)),
    onSuccess: async (created) => {
      appendRecordToCaches(qc, rfiQueryKeys, created, (record, key) => !key[1] || record.project_id === key[1]);
      await invalidateCrudQueries(qc, rfiQueryKeys);
      toast.success("RFI created");
    },
    onError: (e) => toastCrudError(e, "Failed to create RFI"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => entities.RFI.update(id, data),
    onSuccess: async (updated) => {
      replaceRecordInCaches(qc, rfiQueryKeys, updated);
      if (selectedRFI?.id === updated.id) setSelectedRFI(updated);
      await invalidateCrudQueries(qc, rfiQueryKeys);
      toast.success("RFI updated");
    },
    onError: (e) => toastCrudError(e, "Failed to update RFI"),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => entities.RFI.delete(id),
    onSuccess: async (_, deletedId) => {
      removeRecordFromCaches(qc, rfiQueryKeys, deletedId);
      if (selectedRFI?.id === deletedId) setSelectedRFI(null);
      setDeleteTarget(null);
      await invalidateCrudQueries(qc, rfiQueryKeys);
      toast.success("RFI deleted");
    },
    onError: (e) => toastCrudError(e, "Failed to delete RFI"),
  });

  const bulkUpdateMut = useMutation({
    mutationFn: async ({ ids, data }) => {
      const results = await batchProcess(ids, (id) => entities.RFI.update(id, data));
      if (results.failed.length > 0 && results.succeeded.length === 0) {
        throw new Error(`All ${results.failed.length} updates failed.`);
      }
      return results;
    },
    onSuccess: async (results) => {
      const succeededIds = new Set(results.succeeded.map(({ item }) => item));
      setSelectedIds((current) => new Set([...current].filter((id) => !succeededIds.has(id))));
      await invalidateCrudQueries(qc, rfiQueryKeys);
      const toastInfo = formatBulkRfiToast("updated", results.succeeded.length, results.failed.length);
      toast[toastInfo.level](toastInfo.message);
    },
    onError: (e) => toastCrudError(e, "Bulk update failed"),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids) => {
      const results = await batchProcess(ids, (id) => entities.RFI.delete(id));
      if (results.failed.length > 0 && results.succeeded.length === 0) {
        throw new Error(`All ${results.failed.length} deletes failed.`);
      }
      return results;
    },
    onSuccess: async (results) => {
      const deletedIds = new Set(results.succeeded.map(({ item }) => item));
      setSelectedIds((current) => new Set([...current].filter((id) => !deletedIds.has(id))));
      setShowBulkDelete(false);
      if (selectedRFI && deletedIds.has(selectedRFI.id)) setSelectedRFI(null);
      await invalidateCrudQueries(qc, rfiQueryKeys);
      const toastInfo = formatBulkRfiToast("deleted", results.succeeded.length, results.failed.length);
      toast[toastInfo.level](toastInfo.message);
    },
    onError: (e) => toastCrudError(e, "Bulk delete failed"),
  });

  /* ── Today's RFI Agenda (meeting view) ── */
  const [agendaOpen, setAgendaOpen] = useState(false);
  const agenda = useMemo(() => buildRfiAgenda(rfis), [rfis]);
  // Overdue + blocking RFIs are the ones that warrant pulling the eye to the
  // agenda toggle; drive its "urgent" treatment off that count.
  const agendaUrgent = (agenda.counts?.overdue ?? 0) + (agenda.counts?.blocking ?? 0);

  /* ── Filtered list and selection ── */
  const filtered = useMemo(
    () => filterAndSortRfis(rfis, { filter, disciplineFilter, seqFilter, search }, matchesSequenceFilter),
    [rfis, filter, disciplineFilter, seqFilter, search],
  );

  const { selectedIds, setSelectedIds, toggleSelect, toggleAll } = useRfiSelection(filtered);
  useEffect(() => {
    const sourceIds = new Set(rfis.map((r) => r.id));
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => sourceIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [rfis, setSelectedIds]);

  /* ── Overdue → Alert background effect ── */
  const projectMap = useMemo(() => buildProjectNameMap(projects), [projects]);

  const alertsCreatedRef = useRef(new Set());
  useEffect(() => {
    if (!rfis.length) return;
    const createRFIAlerts = async () => {
      try {
        const existing = await entities.Alert.filter({ alert_type: "RFI_Overdue" });
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
          await entities.Alert.create(buildRfiAlertPayload({
            alert_type: "RFI_Overdue",
            severity: r.priority === "Critical" || daysLate >= 7 ? "Critical" : daysLate >= 3 || r.priority === "High" ? "High" : "Medium",
            title: alertTitle,
            description: `${r.rfi_number}: "${(r.title || "").slice(0, 60)}" · BIC: ${r.ball_in_court || "Contractor"} · Priority: ${r.priority}`,
            project_name: liveProjectName,
            related_record_id: r.id,
            record_type: "RFI",
          }, r.project_id));
          alertsCreatedRef.current.add(r.id);
        }
      } catch (e) {
        console.warn("RFI alert:", e);
      }
    };
    const t = setTimeout(createRFIAlerts, 2500);
    return () => clearTimeout(t);
  }, [rfis, projectMap]);

  /* ── Notify field of an answered RFI (slice 4 downstream action) ── */
  const notifyFieldMut = useMutation({
    mutationFn: (r) =>
      entities.Alert.create(buildRfiAlertPayload({
        alert_type: "RFI_Field_Action",
        severity: r.priority === "Critical" ? "Critical" : r.priority === "High" ? "High" : "Medium",
        title: `${r.rfi_number || "RFI"} answered — field action`,
        description: `"${(r.title || "RFI").slice(0, 60)}" · Answer: ${(r.answer || "see RFI").slice(0, 90)}`,
        project_name: projectMap[r.project_id] || "",
        related_record_id: r.id,
      }, r.project_id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      qc.invalidateQueries({ queryKey: ["alerts-nav"] });
      toast.success("Field notified — alert posted");
    },
    onError: (e) => toast.error(formatRfiNotifyError(e)),
  });

  const uploadRfiPdfDocuments = async (rfiRecord, files = []) => {
    if (!rfiRecord?.id || !files.length) return { succeeded: 0, failed: [] };

    setSavingAttachments(true);
    const failed = [];
    let succeeded = 0;
    try {
      const uploadedBy = await auth.me?.()
        .then((user) => user?.email)
        .catch(() => "");
      const project = projects.find((p) => p.id === (rfiRecord.project_id || projectId));
      const now = new Date().toISOString();

      for (const file of files) {
        try {
          const uploaded = await integrations.Core.UploadFile({ file, workflow: "attachment" });
          await entities.Document.create(buildRfiAttachmentDocumentPayload({
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
          }, rfiRecord.project_id || projectId));
          succeeded += 1;
        } catch (error) {
          failed.push({ name: file.name, message: error?.message || "Upload failed" });
        }
      }

      if (succeeded > 0) {
        await qc.invalidateQueries({ queryKey: ["rfi-documents", rfiRecord.id] });
        await qc.invalidateQueries({ queryKey: ["documents", rfiRecord.project_id || projectId] });
      }
      if (failed.length > 0 && succeeded > 0) {
        toast.warning(`${succeeded} PDF${succeeded === 1 ? "" : "s"} attached; ${failed.length} failed. RFI was saved.`);
      } else if (failed.length > 0) {
        toast.error(`RFI was saved, but ${failed.length} PDF attachment${failed.length === 1 ? "" : "s"} failed.`);
      } else {
        toast.success(`${succeeded} PDF${succeeded === 1 ? "" : "s"} attached to ${rfiRecord.rfi_number || "RFI"}`);
      }
      return { succeeded, failed };
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

  // Project-level context for the RFI Control Center hero (real, from the project
  // record + work-package progress — same %-complete source as the Projects page).
  const activeProject = projects.find((p) => p.id === projectId);
  const projectHealth = activeProject?.health_status || null;
  const percentComplete =
    activeProject?.scope_complete_pct_override != null
      ? Number(activeProject.scope_complete_pct_override)
      : (workPackages.length ? calcWpProgress(workPackages).pct : null);

  const modals = (
    <>
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
        onNudge={() => setNudgeRFI(selectedRFI)}
        onCreateCO={() => {
          if (selectedRFI) navigate(`/ChangeOrders?fromRfi=${selectedRFI.id}`);
        }}
        onDownstreamAction={(key) => {
          if (!selectedRFI) return;
          const r = selectedRFI;
          if (key === "notify_field") {
            notifyFieldMut.mutate(r);
            return;
          }
          // Create CO + constraint land WITH context (?fromRfi prefills the form).
          // Drawings filters by ?sheet. WP does not consume a param yet.
          const dest = {
            create_co: `/ChangeOrders?fromRfi=${r.id}`,
            update_drawing: r.drawing_reference
              ? `/Drawings?sheet=${encodeURIComponent(r.drawing_reference)}`
              : "/Drawings",
            open_wp: "/WorkPackages",
            add_constraint: `/Constraints?fromRfi=${r.id}`,
          }[key];
          if (dest) navigate(dest);
        }}
      />

      <NudgeDraftModal
        rfi={nudgeRFI}
        open={!!nudgeRFI}
        onClose={() => setNudgeRFI(null)}
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
            if (saveInFlightRef.current) return;
            saveInFlightRef.current = true;
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
                const allocationProjectId = data.project_id || projectId;
                if (!allocationProjectId) throw new Error("Select a project before creating an RFI.");
                const num =
                  data.rfi_number ||
                  (await getNextFormattedNumber({
                    projectId: allocationProjectId,
                    recordType: "RFI",
                    entityName: "RFI",
                    fieldName: "rfi_number",
                    prefix: "RFI #",
                  }));
                if (!num) throw new Error("RFI number allocation failed. The RFI was not saved.");
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
            } finally {
              saveInFlightRef.current = false;
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
    </>
  );

  return (
    <div
      className="sb-dashboard-reference-page rfi-page"
      style={{
        "--density-row-height": `${densityPreset.rowHeight}px`,
        "--rfi-row-grid": RFI_ROW_GRID,
      }}
    >
      <RfiControlCenter
        projectName={activeProjectName}
        rfis={rfis}
        filtered={filtered}
        search={search}
        onSearch={setSearch}
        filter={filter}
        onFilterChange={setFilter}
        disciplineFilter={disciplineFilter}
        onDisciplineChange={setDisciplineFilter}
        onClearFilters={() => {
          setFilter("all");
          setDisciplineFilter("All");
          setSearch("");
          setSeqFilter(null);
        }}
        density={density}
        onDensityChange={handleDensityChange}
        seqFilter={seqFilter}
        onSeqFilter={setSeqFilter}
        agendaOpen={agendaOpen}
        onToggleAgenda={() => setAgendaOpen((value) => !value)}
        agenda={agenda}
        agendaUrgent={agendaUrgent}
        insightsCollapsed={insightsCollapsed}
        onToggleInsights={handleToggleInsights}
        onOpenRfi={setSelectedRFI}
        onExport={() => exportRFIsToCSV(filtered)}
        onImport={can("create", "rfi") ? () => setShowLogImport(true) : null}
        onCreate={can("create", "rfi") ? () => {
          setEditingRFI(null);
          setShowForm(true);
        } : null}
        projectHealth={projectHealth}
        percentComplete={percentComplete}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleAll={toggleAll}
        listTruncationNotice={<ListTruncationNotice count={rfis.length} label="RFIs" />}
        bulkActions={(
          <BulkActionBar
            count={selectedIds.size}
            onClear={() => setSelectedIds(new Set())}
            actions={[
              {
                label: "MARK ANSWERED",
                icon: "check",
                disabled: bulkUpdateMut.isPending,
                onClick: () => bulkUpdateMut.mutate({ ids: [...selectedIds], data: { status: "Answered", date_answered: new Date().toISOString().split("T")[0] } }),
              },
              {
                label: "MARK UNDER REVIEW",
                icon: "clock",
                disabled: bulkUpdateMut.isPending,
                onClick: () => bulkUpdateMut.mutate({ ids: [...selectedIds], data: { status: "Under Review" } }),
              },
              {
                label: "BULK EDIT",
                icon: "edit",
                disabled: bulkUpdateMut.isPending,
                onClick: () => setShowBulkEdit(true),
              },
              {
                label: "EXPORT",
                icon: "download",
                disabled: !filtered.some((r) => selectedIds.has(r.id)),
                onClick: () => exportRFIsToCSV(filtered.filter((r) => selectedIds.has(r.id))),
              },
              ...(can("delete", "rfi") ? [{
                label: "DELETE",
                icon: "x",
                variant: "danger",
                disabled: bulkDeleteMut.isPending,
                onClick: () => setShowBulkDelete(true),
              }] : []),
            ]}
          />
        )}
        bulkEditModal={(
          <RfiBulkEditModal
            open={showBulkEdit}
            count={selectedIds.size}
            onCancel={() => setShowBulkEdit(false)}
            onSubmit={(data) => {
              bulkUpdateMut.mutate({ ids: [...selectedIds], data });
              setShowBulkEdit(false);
            }}
          />
        )}
        modals={modals}
      />
    </div>
  );
}
