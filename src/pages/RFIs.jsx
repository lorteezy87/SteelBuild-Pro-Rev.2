/**
 * RFIs page shell.
 *
 * Owns React Query data, URL state, search and filter state, and bulk
 * selection. Mutations + attachment save live in useRfiPageMutations;
 * overdue-alert planning stays here. Presentation is under `src/pages/rfis/*`.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./rfis/RFIs.css";
import { entities } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
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
import { usePermissions } from "@/services/permissions";

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
import { buildRfiAlertPayload } from "./rfis/rfiMutationHelpers";
import { planRfiOverdueAlerts } from "./rfis/rfiOverdueAlerts";
import { useRfiPageMutations } from "./rfis/useRfiPageMutations";

export default function RFIs() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const projectId = useProjectId();
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

  const projectMap = useMemo(() => buildProjectNameMap(projects), [projects]);

  const {
    updateMut,
    deleteMut,
    bulkUpdateMut,
    bulkDeleteMut,
    notifyFieldMut,
    saveRfi,
    isSaving,
  } = useRfiPageMutations({
    projectId,
    projects,
    projectMap,
    selectedRFI,
    setSelectedRFI,
    setDeleteTarget,
    setSelectedIds,
    setShowBulkDelete,
    setShowForm,
    setEditingRFI,
    editingRFI,
  });

  /* ── Overdue → Alert background effect ── */
  const alertsCreatedRef = useRef(new Set());
  useEffect(() => {
    if (!rfis.length) return;
    const createRFIAlerts = async () => {
      try {
        const existing = await entities.Alert.filter({ alert_type: "RFI_Overdue" });
        const existingIds = new Set(existing.map((a) => a.related_record_id).filter(Boolean));
        const existingTitles = new Set(existing.map((a) => a.title));
        const planned = planRfiOverdueAlerts(rfis, {
          existingRelatedIds: existingIds,
          existingTitles,
          alreadyCreatedIds: alertsCreatedRef.current,
          projectMap,
        });
        for (const item of planned) {
          await entities.Alert.create(buildRfiAlertPayload(item.alertFields, item.projectId));
          alertsCreatedRef.current.add(item.rfiId);
        }
      } catch (e) {
        console.warn("RFI alert:", e);
      }
    };
    const t = setTimeout(createRFIAlerts, 2500);
    return () => clearTimeout(t);
  }, [rfis, projectMap]);

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
          onSave={saveRfi}
          saving={isSaving}
          rfi={editingRFI}
          projectId={projectId}
        />
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        busy={deleteMut.isPending}
        onConfirm={() => deleteMut.mutateAsync(deleteTarget.id)}
        title="Delete RFI"
        description={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
      />
      <DeleteDialog
        open={showBulkDelete}
        onClose={() => setShowBulkDelete(false)}
        busy={bulkDeleteMut.isPending}
        onConfirm={() => bulkDeleteMut.mutateAsync([...selectedIds])}
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
            onSubmit={async (data) => {
              await bulkUpdateMut.mutateAsync({ ids: [...selectedIds], data });
              setShowBulkEdit(false);
            }}
          />
        )}
        modals={modals}
      />
    </div>
  );
}
