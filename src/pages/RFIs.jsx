/**
 * RFIs page shell.
 *
 * Owns React Query data, URL state, search and filter state, and bulk
 * selection. Mutations + attachment save live in useRfiPageMutations;
 * overdue-alert planning stays here. Presentation is under `src/pages/rfis/*`.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as Sentry from "@sentry/react";
import "./rfis/RFIs.css";
import { entities } from "@/api/supabaseClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useProjectId } from "@/hooks/useProjectId";
import { useResetOnProjectChange } from "@/hooks/useResetOnProjectChange";
import { useAutoOpenEdit } from "@/hooks/useAutoOpenEdit";
import { useAutoOpenCreate } from "@/hooks/useAutoOpenCreate";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import DeleteDialog from "@/components/shared/DeleteDialog";
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
import { scopeRfiPortfolioRows } from "./rfis/rfiPortfolioScope";
import { buildOperationalHealthIndex } from "@/lib/projectHealth";
import { matchesRfiOperationalFilter } from "./rfis/rfiControlCenter.derive";
import { localToday } from "@/utils/dates";
import { useOrg } from "@/components/shared/OrgContext";
import { projectsInWorkspace, readProjectRows } from "@/lib/portfolioScope";

export default function RFIs() {
  const { currentOrg, isLoadingOrgs } = useOrg();
  const orgId = currentOrg?.id;
  const projectId = useProjectId();
  const scope = useMemo(() => ({ orgId, projectId, isLoadingOrgs }), [orgId, projectId, isLoadingOrgs]);
  const currentScopeRef = useRef(scope);
  currentScopeRef.current = scope;
  useEffect(() => {
    currentScopeRef.current = scope;
    return () => { if (currentScopeRef.current === scope) currentScopeRef.current = null; };
  }, [scope]);
  if (isLoadingOrgs) return <div role="status" style={{ padding: 24 }}>Loading workspace…</div>;
  if (!orgId) return <div role="status" style={{ padding: 24 }}>Select a workspace to view RFIs.</div>;
  return <WorkspaceRFIs key={JSON.stringify([orgId, projectId])} orgId={orgId} projectId={projectId} scope={scope} currentScopeRef={currentScopeRef} />;
}

function WorkspaceRFIs({ orgId, projectId, scope, currentScopeRef }) {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isPortfolio = !projectId;
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
  const projectKey = ["projects", "rfi-workspace", orgId];
  const projectQuery = useQuery({
    queryKey: projectKey,
    queryFn: () => entities.Project.filterAll({ org_id: orgId }),
    staleTime: 5 * 60 * 1000,
  });
  const projects = useMemo(() => projectsInWorkspace(projectQuery.data || [], orgId), [projectQuery.data, orgId]);
  const projectAllowed = !projectId || projects.some((project) => project.id === projectId);
  const projectIds = useMemo(() => (projectId ? projects.filter((project) => project.id === projectId) : projects).map((project) => project.id).sort(), [projects, projectId]);
  const childReadsEnabled = projectQuery.isSuccess && projectAllowed;
  const rfiKey = ["rfis", projectId || "portfolio", orgId, projectIds];
  const workPackageKey = ["work-packages", "rfi-evidence", projectId || "portfolio", orgId, projectIds];
  const scheduleKey = ["schedule-tasks-rfis", projectId || "portfolio", orgId, projectIds];

  const rfiQuery = useQuery({
    queryKey: rfiKey,
    queryFn: () => readProjectRows(entities.RFI, projectIds, "-submitted_date"),
    enabled: childReadsEnabled,
  });
  const { data: rawRfis = [], isSuccess: rfisSuccess } = rfiQuery;
  const rfis = useMemo(
    () => isPortfolio ? scopeRfiPortfolioRows(projects, rawRfis) : rawRfis,
    [isPortfolio, projects, rawRfis],
  );
  const workPackageQuery = useQuery({
    queryKey: workPackageKey,
    queryFn: () => readProjectRows(entities.WorkPackage, projectIds),
    enabled: childReadsEnabled,
    staleTime: 5 * 60 * 1000,
  });
  const { data: rawWorkPackages = [] } = workPackageQuery;
  const workPackages = useMemo(
    () => isPortfolio ? scopeRfiPortfolioRows(projects, rawWorkPackages) : rawWorkPackages,
    [isPortfolio, projects, rawWorkPackages],
  );
  const scheduleQuery = useQuery({
    queryKey: scheduleKey,
    queryFn: () => readProjectRows(entities.ScheduleTask, projectIds, "-start_date"),
    enabled: childReadsEnabled,
  });
  const { data: rawScheduleTasks = [], isSuccess: scheduleTasksSuccess } = scheduleQuery;
  const scheduleTasks = useMemo(
    () => isPortfolio ? scopeRfiPortfolioRows(projects, rawScheduleTasks) : rawScheduleTasks,
    [isPortfolio, projects, rawScheduleTasks],
  );

  const sources = [["Projects", projectQuery], ["RFIs", rfiQuery], ["Work packages", workPackageQuery], ["Schedule tasks", scheduleQuery]];
  const failedSource = sources.find(([, query]) => query.isError);
  const evidenceReady = projectAllowed && sources.every(([, query]) => query.isSuccess);
  const writesReady = evidenceReady && sources.every(([, query]) => !query.isFetching);
  const assertMutationScope = (recordId, targetProjectId) => {
    if (currentScopeRef.current !== scope || !projectAllowed) throw new Error("Workspace or project changed. Reopen the RFI and try again.");
    for (const key of [projectKey, rfiKey, workPackageKey, scheduleKey]) {
      const state = qc.getQueryState(key);
      if (state?.status !== "success" || state.fetchStatus !== "idle" || state.isInvalidated) throw new Error("RFI evidence is refreshing or unavailable. Retry after it has loaded.");
    }
    const ownedIds = new Set(projectsInWorkspace(qc.getQueryData(projectKey) || [], orgId).map((project) => project.id));
    if (targetProjectId && (!projectIds.includes(targetProjectId) || !ownedIds.has(targetProjectId))) throw new Error("The RFI project is outside this workspace.");
    if (recordId && !(qc.getQueryData(rfiKey) || []).some((rfi) => rfi.id === recordId && projectIds.includes(rfi.project_id) && ownedIds.has(rfi.project_id))) throw new Error("The RFI is outside the current project scope.");
  };
  useAutoOpenEdit(rfis, setSelectedRFI, { enabled: evidenceReady, param: "recordId" });
  const rfiQueryKeys = [rfiKey, ["rfis"]];
  useRealtimeInvalidation("rfis", projectId, rfiQueryKeys);

  /* ── URL-driven selection (from cross-page deep links) ── */
  const urlRfiId = searchParams.get("id");
  const urlSearch = searchParams.get("search");
  useEffect(() => { if (urlSearch) setSearch(urlSearch); }, [urlSearch]);
  useEffect(() => {
    if (!evidenceReady || !urlRfiId || !rfis.length) return;
    const found = rfis.find((r) => r.id === urlRfiId);
    if (found) setSelectedRFI(found);
  }, [urlRfiId, rfis, evidenceReady]);
  // Auto-open the create modal when QuickAddFAB navigated here with ?new=1.
  // The hook strips the param via `replace: true`, so a refresh of the
  // page doesn't re-open the modal and the back button still returns
  // the user to wherever they came from.
  useAutoOpenCreate(() => {
    if (isPortfolio) return;
    setEditingRFI(null);
    setShowForm(true);
  }, { enabled: writesReady && !isPortfolio && can("create", "rfi") });

  /* ── Today's RFI Agenda (meeting view) ── */
  const [agendaOpen, setAgendaOpen] = useState(false);
  const agenda = useMemo(() => buildRfiAgenda(rfis), [rfis]);
  // Overdue + blocking RFIs are the ones that warrant pulling the eye to the
  // agenda toggle; drive its "urgent" treatment off that count.
  const agendaUrgent = (agenda.counts?.overdue ?? 0) + (agenda.counts?.blocking ?? 0);

  /* ── Filtered list and selection ── */
  const filtered = useMemo(() => {
    const base = filterAndSortRfis(
      rfis,
      { filter, disciplineFilter, seqFilter, search },
      matchesSequenceFilter,
    );
    const operationalFilters = new Set([
      "overdue",
      "due_soon",
      "detailing_blocker",
      "fab_blocker",
      "field_impact",
      "unanswered_external",
      "downstream_action",
    ]);
    return operationalFilters.has(filter)
      ? base.filter((r) => matchesRfiOperationalFilter(r, filter))
      : base;
  }, [rfis, filter, disciplineFilter, seqFilter, search]);

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
    releaseHoldsMut,
    saveRfi,
    isSaving,
  } = useRfiPageMutations({
    assertMutationScope,
    isCurrentScope: () => currentScopeRef.current === scope,
    queryKeys: [rfiKey],
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
    if (!projectId || !writesReady) return;
    if (!rfis.length) return;
    const createRFIAlerts = async () => {
      try {
        // Scoped to the current project: RFI numbers are per-project
        // sequences, so an unscoped title dedupe collided across projects
        // (silently suppressing the second project's alerts) and downloaded
        // the tenant-wide alert list on every visit.
        const existing = await entities.Alert.filterAll({ alert_type: "RFI_Overdue", project_id: projectId });
        if (currentScopeRef.current !== scope) return;
        const existingIds = new Set(existing.map((a) => a.related_record_id).filter(Boolean));
        const existingTitles = new Set(existing.map((a) => a.title));
        const planned = planRfiOverdueAlerts(rfis, {
          existingRelatedIds: existingIds,
          existingTitles,
          alreadyCreatedIds: alertsCreatedRef.current,
          projectMap,
        });
        for (const item of planned) {
          if (currentScopeRef.current !== scope) return;
          await entities.Alert.create(buildRfiAlertPayload(item.alertFields, item.projectId));
          alertsCreatedRef.current.add(item.rfiId);
        }
      } catch (e) {
        console.warn("RFI alert:", e);
        Sentry.captureException(e, { tags: { source: "rfi-overdue-alerts" } });
      }
    };
    const t = setTimeout(createRFIAlerts, 2500);
    return () => clearTimeout(t);
  }, [projectId, rfis, projectMap, writesReady, currentScopeRef, scope]);

  // Memoized: O(projects × (rfis + tasks)) — unmemoized this re-ran on every
  // keystroke/selection. Local today (not UTC) so evening sessions don't
  // count due-today items as overdue.
  const healthByProjectId = useMemo(
    () =>
      buildOperationalHealthIndex(projects, rfis, scheduleTasks, localToday(), {
        rfiEvidenceLoaded: rfisSuccess,
        scheduleEvidenceLoaded: scheduleTasksSuccess,
      }),
    [projects, rfis, scheduleTasks, rfisSuccess, scheduleTasksSuccess],
  );

  /* ── Loading ── */
  if (failedSource || (projectQuery.isSuccess && !projectAllowed)) return (
    <div role="alert" style={{ padding: 24, color: "var(--status-error)" }}>
      {!projectAllowed && projectQuery.isSuccess ? "This project is not active in the selected workspace. Select a project from this workspace." : `${failedSource[0]} could not be loaded. RFI metrics are unavailable.`}
      {failedSource && <button onClick={() => { sources.forEach(([, query]) => { void query.refetch(); }); }}>Retry</button>}
    </div>
  );
  if (!evidenceReady) {
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
  const operationalHealth = activeProject?.id ? healthByProjectId[activeProject.id] : null;
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
          if (key === "release_holds") {
            releaseHoldsMut.mutate(r);
            return;
          }
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

      {!isPortfolio && <RfiLogImportModal
        open={showLogImport}
        projectId={projectId}
        projectName={projects.find((p) => p.id === projectId)?.name}
        projects={projects.filter((project) => project.id === projectId)}
        assertCanImport={(targetProjectId) => assertMutationScope(undefined, targetProjectId)}
        onClose={() => setShowLogImport(false)}
      />}

      {!isPortfolio && showForm && (
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
        contextMode={isPortfolio ? "portfolio" : "project"}
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
        onImport={writesReady && !isPortfolio && can("create", "rfi") ? () => setShowLogImport(true) : null}
        onCreate={writesReady && !isPortfolio && can("create", "rfi") ? () => {
          setEditingRFI(null);
          setShowForm(true);
        } : null}
        operationalHealth={operationalHealth}
        percentComplete={percentComplete}
        portfolioProjectCount={projects.length}
        portfolioAtRiskCount={projects.filter((project) => healthByProjectId[project.id]?.label === "At Risk").length}
        loadError={null}
        onRetryLoad={() => { sources.forEach(([, query]) => { void query.refetch(); }); }}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleAll={toggleAll}
        listTruncationNotice={null}
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
