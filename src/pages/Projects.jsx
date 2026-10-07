import { useState, useMemo, useRef, useEffect } from "react";
import { entities } from "@/api/supabaseClient";
import { fetchProjectRegister } from "./projects/projectQueries";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ProjectFormModal from "@/components/projects/ProjectFormModal";
import { applyProjectTemplate } from "@/lib/projectTemplates";
import ProjectDetailView from "@/components/projects/ProjectDetailView";
import SecureDeleteDialog from "@/components/shared/SecureDeleteDialog";
import { toast } from "sonner";
import { useAutoOpenEdit } from "@/hooks/useAutoOpenEdit";
import { usePlan } from "@/hooks/usePlan";
import { withinLimit } from "@/lib/billing/plans";
import { roleAtLeast, useProjectRole } from "@/hooks/useProjectRole";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import { useProjectContext } from "@/components/shared/ProjectContext";
import ProjectsControlCenter from "./projects/ProjectsControlCenter";
import { buildOperationalHealthIndex } from "@/lib/projectHealth";
import { localToday } from "@/utils/dates";
import { useOrg } from "@/components/shared/OrgContext";
import { readProjectRows } from "@/lib/portfolioScope";

export default function Projects() {
  const { currentOrg, isLoadingOrgs } = useOrg();
  const orgId = currentOrg?.id;
  const scope = useMemo(() => ({ orgId, isLoadingOrgs }), [orgId, isLoadingOrgs]);
  const currentOrgRef = useRef(scope);
  currentOrgRef.current = scope;
  useEffect(() => {
    currentOrgRef.current = scope;
    return () => { if (currentOrgRef.current === scope) currentOrgRef.current = null; };
  }, [scope]);
  if (isLoadingOrgs) return <div role="status" style={{ padding: 24 }}>Loading workspace…</div>;
  if (!orgId) return <div role="status" style={{ padding: 24 }}>Select a workspace to view projects.</div>;
  return <WorkspaceProjects key={orgId} orgId={orgId} scope={scope} currentOrgRef={currentOrgRef} />;
}

function WorkspaceProjects({ orgId, scope, currentOrgRef }) {
  const qc         = useQueryClient();
  const { removeProject } = useProjectContext();
  const [search,        setSearch]        = useState("");
  const [phaseFilter,   setPhaseFilter]   = useState("all");
  const [healthFilter,  setHealthFilter]  = useState("all");
  const [modalOpen,     setModalOpen]     = useState(false);
  const [editing,       setEditing]       = useState(null);
  const [detailProject, setDetailProject] = useState(null);
  const [deleteTarget,  setDeleteTarget]  = useState(null);
  const { role: detailProjectRole, isLoading: detailRoleLoading } = useProjectRole(detailProject?.id);
  const canArchiveProject = !detailRoleLoading && roleAtLeast(detailProjectRole, "admin");

  /* ── Data fetching ──
     The /Projects page is the ONE place that sees on-hold projects. We
     bypass entities.Project.list() (which now auto-excludes
     on_hold=true) and query the table directly, still honouring soft-delete
     and project-membership RLS. Every other consumer keeps using
     Project.list() and silently gets the active subset. */
  const projectKey = ["projects", "all-including-on-hold", orgId];
  const projectQuery = useQuery({
    queryKey: projectKey,
    queryFn: () => fetchProjectRegister(orgId),
    staleTime: 5 * 60 * 1000,
  });
  const projects = useMemo(() => (projectQuery.data || []).filter((p) => p.org_id === orgId && !p.is_deleted), [projectQuery.data, orgId]);
  const projectIds = useMemo(() => projects.map((p) => p.id).filter(Boolean).sort(), [projects]);
  const childReadsEnabled = projectQuery.isSuccess;
  const workPackageQuery = useQuery({ queryKey: ["work-packages-all", orgId, projectIds], queryFn: () => readProjectRows(entities.WorkPackage, projectIds), enabled: childReadsEnabled });
  const rfiQuery = useQuery({ queryKey: ["rfis", "project-register", orgId, projectIds], queryFn: () => readProjectRows(entities.RFI, projectIds), enabled: childReadsEnabled });
  const changeOrderQuery = useQuery({ queryKey: ["change-orders-all", orgId, projectIds], queryFn: () => readProjectRows(entities.ChangeOrder, projectIds), enabled: childReadsEnabled });
  const scheduleQuery = useQuery({ queryKey: ["schedule-tasks-all", orgId, projectIds], queryFn: () => readProjectRows(entities.ScheduleTask, projectIds, "start_date"), enabled: childReadsEnabled });
  const { data: rawWorkPackages = [] } = workPackageQuery;
  const { data: rawRfis = [], isSuccess: rfisSuccess } = rfiQuery;
  const { data: rawChangeOrders = [] } = changeOrderQuery;
  const { data: rawScheduleTasks = [], isSuccess: scheduleTasksSuccess } = scheduleQuery;
  const sources = [["Projects", projectQuery], ["Work packages", workPackageQuery], ["RFIs", rfiQuery], ["Change orders", changeOrderQuery], ["Schedule tasks", scheduleQuery]];
  const failedSource = sources.find(([, query]) => query.isError);
  const evidenceReady = sources.every(([, query]) => query.isSuccess);
  const assertCurrentWorkspace = (projectId) => {
    const current = qc.getQueryState(projectKey);
    if (currentOrgRef.current !== scope || current?.status !== "success" || current.fetchStatus !== "idle" || current.isInvalidated) {
      throw new Error("Workspace changed or projects are refreshing. Reopen the project and try again.");
    }
    if (projectId && !current.data.some((p) => p.id === projectId && p.org_id === orgId && !p.is_deleted)) throw new Error("The project does not belong to this workspace.");
  };

  const liveProjectIds = useMemo(() => new Set(projects.map((p) => p.id).filter(Boolean)), [projects]);
  useAutoOpenEdit(projects, setDetailProject, { enabled: evidenceReady, param: "recordId" });
  const workPackages = useMemo(
    () => rawWorkPackages.filter((row) => row?.project_id && liveProjectIds.has(row.project_id)),
    [liveProjectIds, rawWorkPackages],
  );
  const rfis = useMemo(
    () => rawRfis.filter((row) => row?.project_id && liveProjectIds.has(row.project_id)),
    [liveProjectIds, rawRfis],
  );
  const changeOrders = useMemo(
    () => rawChangeOrders.filter((row) => row?.project_id && liveProjectIds.has(row.project_id)),
    [liveProjectIds, rawChangeOrders],
  );
  const scheduleTasks = useMemo(
    () => rawScheduleTasks.filter((row) => row?.project_id && liveProjectIds.has(row.project_id)),
    [liveProjectIds, rawScheduleTasks],
  );
  const todayIso = localToday();
  const evidence = useMemo(
    () => ({ rfiEvidenceLoaded: rfisSuccess, scheduleEvidenceLoaded: scheduleTasksSuccess }),
    [rfisSuccess, scheduleTasksSuccess],
  );
  const healthByProjectId = useMemo(
    () => buildOperationalHealthIndex(projects, rfis, scheduleTasks, todayIso, evidence),
    [projects, rfis, scheduleTasks, todayIso, evidence],
  );
  const { plan } = usePlan();
  const projectLimit = plan.limits.projects;
  const atProjectLimit = !withinLimit(projectLimit, projects.length);

  /* ── Mutations ── */
  const createMut = useMutation({
    mutationFn: async (d) => {
      assertCurrentWorkspace();
      const { __apply_template, ...projectData } = d;
      if (projectData.org_id && projectData.org_id !== orgId) throw new Error("The project workspace must match the active workspace.");
      const created = await entities.Project.create({ ...projectData, org_id: orgId });
      if (!__apply_template) return { created, template: null };
      // Template failure must not look like a failed creation — the project
      // row exists either way. Report it separately and keep the modal closed.
      try {
        const summary = await applyProjectTemplate(created.id, __apply_template);
        return { created, template: summary };
      } catch (templateErr) {
        return { created, template: null, templateError: templateErr };
      }
    },
    onSuccess: ({ template, templateError }) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      if (template) {
        qc.invalidateQueries({ queryKey: ["work-packages"] });
        qc.invalidateQueries({ queryKey: ["schedule-tasks"] });
        toast.success(`Project created — template added ${template.work_packages} work packages and ${template.schedule_tasks} schedule tasks`);
      } else if (templateError) {
        toast.warning(`Project created, but the template could not be applied: ${toUserErrorMessage(templateError, "Unknown error")}`);
      } else {
        toast.success("Project created");
      }
      setModalOpen(false);
      setEditing(null);
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Failed to create project")),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => {
      assertCurrentWorkspace(id);
      if (data.org_id && data.org_id !== orgId) throw new Error("A project cannot be moved to another workspace here.");
      return entities.Project.update(id, data);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); setModalOpen(false); setEditing(null); toast.success("Project updated"); },
    onError: (err) => toast.error(toUserErrorMessage(err, "Failed to update project")),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => { assertCurrentWorkspace(id); return entities.Project.delete(id); },
    onSuccess: (_result, id) => {
      removeProject(id);
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["projects", "all-including-on-hold"] });
      if (detailProject?.id === id) setDetailProject(null);
      setDeleteTarget(null);
      toast.success("Project archived");
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Failed to archive project")),
  });
  const handleSave = (d) => {
    if (editing) updateMut.mutate({ id: editing.id, data: d });
    else createMut.mutate(d);
  };
  const handleDelete = (project) => {
    setDeleteTarget(project);
  };

  /* ── Filtered list ── */
  const filtered = useMemo(() => projects.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.name?.toLowerCase().includes(q) || p.project_number?.toLowerCase().includes(q) || p.client?.toLowerCase().includes(q) || p.general_contractor?.toLowerCase().includes(q);
    return matchSearch
      && (phaseFilter === "all"   || p.phase === phaseFilter)
      && (healthFilter === "all"  || healthByProjectId[p.id]?.label === healthFilter);
  }), [projects, search, phaseFilter, healthFilter, healthByProjectId]);

  const canCreate = evidenceReady && !projectQuery.isFetching && !atProjectLimit;

  if (failedSource) return (
    <div role="alert" style={{ padding: 24, color: "var(--status-error)" }}>
      {failedSource[0]} could not be loaded. Project totals are unavailable. <button onClick={() => { sources.forEach(([, query]) => { void query.refetch(); }); }}>Retry</button>
    </div>
  );
  if (!evidenceReady) return <div role="status" style={{ padding: 24 }}>Loading projects and operational evidence…</div>;

  return (
    <>
      <ProjectsControlCenter
        projects={projects}
        workPackages={workPackages}
        rfis={rfis}
        changeOrders={changeOrders}
        scheduleTasks={scheduleTasks}
        todayIso={todayIso}
        evidence={evidence}
        search={search}
        onSearch={setSearch}
        phaseFilter={phaseFilter}
        onPhaseFilter={setPhaseFilter}
        healthFilter={healthFilter}
        onHealthFilter={setHealthFilter}
        filtered={filtered}
        onCreate={canCreate ? () => { setEditing(null); setModalOpen(true); } : null}
        onOpenProject={(p) => setDetailProject(p)}
      />
      {modalOpen && (
        <ProjectFormModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSave={handleSave}
          project={editing}
        />
      )}
      {detailProject && (
        <ProjectDetailView
          project={detailProject}
          onClose={() => setDetailProject(null)}
          onArchive={canArchiveProject ? () => handleDelete(detailProject) : null}
        />
      )}
      <SecureDeleteDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget || deleteMut.isPending) return;
          await deleteMut.mutateAsync(deleteTarget.id);
        }}
        title="Archive Project"
        description={`Archive "${deleteTarget?.name || "this project"}"? It will be removed from active project lists, while its data and audit history are retained.`}
        record={deleteTarget}
        requireTyped
        typedValue={deleteTarget?.name || ""}
        allowedOverride={canArchiveProject}
        confirmLabel="ARCHIVE PROJECT"
      />
    </>
  );
}
