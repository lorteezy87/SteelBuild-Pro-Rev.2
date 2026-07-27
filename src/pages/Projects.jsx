import { useState, useMemo } from "react";
import { entities } from "@/api/supabaseClient";
import { supabase } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ProjectFormModal from "@/components/projects/ProjectFormModal";
import ProjectDetailView from "@/components/projects/ProjectDetailView";
import { toast } from "sonner";
import { useAutoOpenEdit } from "@/hooks/useAutoOpenEdit";
import { usePlan } from "@/hooks/usePlan";
import { withinLimit } from "@/lib/billing/plans";
import ProjectsControlCenter from "./projects/ProjectsControlCenter";

export default function Projects() {
  const qc         = useQueryClient();
  const [search,        setSearch]        = useState("");
  const [phaseFilter,   setPhaseFilter]   = useState("all");
  const [healthFilter,  setHealthFilter]  = useState("all");
  const [jobTypeFilter, setJobTypeFilter] = useState("all");
  const [modalOpen,     setModalOpen]     = useState(false);
  const [editing,       setEditing]       = useState(null);
  const [detailProject, setDetailProject] = useState(null);

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

  const liveProjectIds = useMemo(() => new Set(projects.map((p) => p.id).filter(Boolean)), [projects]);
  useAutoOpenEdit(projects, setDetailProject, { enabled: !projectsLoading });
  const workPackages = useMemo(
    () => rawWorkPackages.filter((row) => row?.project_id && liveProjectIds.has(row.project_id)),
    [liveProjectIds, rawWorkPackages]
  );
  const rfis = useMemo(
    () => rawRfis.filter((row) => row?.project_id && liveProjectIds.has(row.project_id)),
    [liveProjectIds, rawRfis]
  );
  const changeOrders = useMemo(
    () => rawChangeOrders.filter((row) => row?.project_id && liveProjectIds.has(row.project_id)),
    [liveProjectIds, rawChangeOrders]
  );
  const { plan } = usePlan();
  const projectLimit = plan.limits.projects;
  const atProjectLimit = !withinLimit(projectLimit, projects.length);

  /* ── Mutations ── */
  const createMut = useMutation({
    mutationFn: (d) => entities.Project.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); setModalOpen(false); setEditing(null); toast.success("Project created"); },
    onError: (err) => toast.error(err.message),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => entities.Project.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); setModalOpen(false); setEditing(null); toast.success("Project updated"); },
    onError: (err) => toast.error(err.message),
  });
  const handleSave = (d) => {
    if (editing) updateMut.mutate({ id: editing.id, data: d });
    else createMut.mutate(d);
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
        />
      )}
    </>
  );
}
