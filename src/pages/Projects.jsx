import { useState, useMemo } from "react";
import { entities } from "@/api/supabaseClient";
import { supabase } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ProjectFormModal from "@/components/projects/ProjectFormModal";
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
import {
  buildLiveProjectIdSet,
  filterRowsByLiveProjectIds,
} from "./dashboard/dashboardPageHelpers";

export default function Projects() {
  const qc         = useQueryClient();
  const { removeProject } = useProjectContext();
  const [search,        setSearch]        = useState("");
  const [phaseFilter,   setPhaseFilter]   = useState("all");
  const [healthFilter,  setHealthFilter]  = useState("all");
  const [jobTypeFilter, setJobTypeFilter] = useState("all");
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
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["projects", "all-including-on-hold"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
  const { data: rawWorkPackages = [] } = useQuery({ queryKey: ["work-packages-all"], queryFn: () => entities.WorkPackage.list() });
  const { data: rawRfis         = [] } = useQuery({ queryKey: ["rfis"],              queryFn: () => entities.RFI.list() });
  const { data: rawChangeOrders = [] } = useQuery({ queryKey: ["change-orders-all"], queryFn: () => entities.ChangeOrder.list() });

  const liveProjectIds = useMemo(() => buildLiveProjectIdSet(projects), [projects]);
  useAutoOpenEdit(projects, setDetailProject, { enabled: !projectsLoading, param: "recordId" });
  const workPackages = useMemo(
    () => filterRowsByLiveProjectIds(rawWorkPackages, liveProjectIds),
    [liveProjectIds, rawWorkPackages],
  );
  const rfis = useMemo(
    () => filterRowsByLiveProjectIds(rawRfis, liveProjectIds),
    [liveProjectIds, rawRfis],
  );
  const changeOrders = useMemo(
    () => filterRowsByLiveProjectIds(rawChangeOrders, liveProjectIds),
    [liveProjectIds, rawChangeOrders],
  );
  const { plan } = usePlan();
  const projectLimit = plan.limits.projects;
  const atProjectLimit = !withinLimit(projectLimit, projects.length);

  /* ── Mutations ── */
  const createMut = useMutation({
    mutationFn: (d) => entities.Project.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); setModalOpen(false); setEditing(null); toast.success("Project created"); },
    onError: (err) => toast.error(toUserErrorMessage(err, "Failed to create project")),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => entities.Project.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); setModalOpen(false); setEditing(null); toast.success("Project updated"); },
    onError: (err) => toast.error(toUserErrorMessage(err, "Failed to update project")),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => entities.Project.delete(id),
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
      && (healthFilter === "all"  || p.health_status === healthFilter)
      && (jobTypeFilter === "all" || p.job_type === jobTypeFilter);
  }), [projects, search, phaseFilter, healthFilter, jobTypeFilter]);

  const canCreate = !atProjectLimit;

  return (
    <>
      <ProjectsControlCenter
        projects={projects}
        workPackages={workPackages}
        rfis={rfis}
        changeOrders={changeOrders}
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
