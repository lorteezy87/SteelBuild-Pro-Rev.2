import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { CONSTRAINT_TYPES, TYPE_COLORS } from "./constraintsConfig";

export function useConstraintsData({
  activeProjectId,
  search,
  filterType,
  filterStatus,
  filterPriority,
  onFormClose,
  onDeleteClose,
}) {
  const qc = useQueryClient();

  const { data: items = [] } = useQuery({
    queryKey: ["constraints", activeProjectId],
    queryFn: () =>
      activeProjectId
        ? base44.entities.ActionItem.filter({ project_id: activeProjectId, category: "CONSTRAINT" })
        : [],
    enabled: !!activeProjectId,
    initialData: [],
  });

  const { data: wps = [] } = useQuery({
    queryKey: ["work-packages", activeProjectId],
    queryFn: () =>
      activeProjectId
        ? base44.entities.WorkPackage.filter({ project_id: activeProjectId })
        : [],
    enabled: !!activeProjectId,
    initialData: [],
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.ActionItem.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["constraints"] });
      toast.success("Constraint logged");
      onFormClose?.();
    },
    onError: (err) => toast.error(err?.message || "Create failed"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ActionItem.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["constraints"] });
      toast.success("Constraint updated");
      onFormClose?.();
    },
    onError: (err) => toast.error(err?.message || "Update failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.ActionItem.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["constraints"] });
      onDeleteClose?.();
      toast.success("Constraint deleted");
    },
    onError: () => toast.error("Delete failed"),
  });

  const kpis = useMemo(() => {
    const open = items.filter((c) => !["Resolved", "Closed"].includes(c.status));
    const resolved = items.filter((c) => c.status === "Resolved");
    const closed = items.filter((c) => c.status === "Closed");
    const overdue = open.filter((c) => c.due_date && new Date(`${c.due_date}T00:00:00Z`) < new Date());
    const critical = open.filter((c) => c.priority === "Critical");
    const inProg = items.filter((c) => c.status === "In Progress");

    const oldestOpen = open.reduce((oldest, c) => {
      const d = new Date(c.created_date || c.due_date || Date.now());
      return !oldest || d < oldest ? d : oldest;
    }, null);
    const agedays = oldestOpen ? Math.floor((Date.now() - oldestOpen) / 86400000) : 0;

    const byType = CONSTRAINT_TYPES.map((t) => ({
      type: t,
      count: open.filter((c) => c.constraint_type === t).length,
      color: TYPE_COLORS[t],
    }))
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count);

    const byPriority = ["Critical", "High", "Medium", "Low"].map((p) => ({
      priority: p,
      count: open.filter((c) => c.priority === p).length,
    }));

    return { open, resolved, closed, overdue, critical, inProg, agedays, byType, byPriority, total: items.length };
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items
      .filter((c) => {
        if (filterType !== "all" && c.constraint_type !== filterType) return false;
        if (filterStatus === "open" && ["Resolved", "Closed"].includes(c.status)) return false;
        if (filterStatus !== "all" && filterStatus !== "open" && c.status !== filterStatus) return false;
        if (filterPriority !== "all" && c.priority !== filterPriority) return false;
        if (
          q &&
          ![c.title, c.description, c.project_area, c.assigned_to]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const PRIO = { Critical: 0, High: 1, Medium: 2, Low: 3 };
        const aResolved = ["Resolved", "Closed"].includes(a.status);
        const bResolved = ["Resolved", "Closed"].includes(b.status);
        if (aResolved !== bResolved) return aResolved ? 1 : -1;
        const aP = PRIO[a.priority] ?? 2;
        const bP = PRIO[b.priority] ?? 2;
        if (aP !== bP) return aP - bP;
        const aOverdue = a.due_date && new Date(`${a.due_date}T00:00:00Z`) < new Date();
        const bOverdue = b.due_date && new Date(`${b.due_date}T00:00:00Z`) < new Date();
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
        if (a.due_date && b.due_date) return new Date(a.due_date) - new Date(b.due_date);
        return 0;
      });
  }, [items, filterType, filterStatus, filterPriority, search]);

  return {
    items,
    wps,
    projects,
    kpis,
    filtered,
    createMut,
    updateMut,
    deleteMut,
  };
}
