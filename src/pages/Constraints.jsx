import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useProjectContext } from "@/components/shared/useProjectContext";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import DeleteDialog from "@/components/shared/DeleteDialog";

const CONSTRAINT_TYPES = [
  "Missing Embeds",
  "Anchor Bolt Issue",
  "Approved Submittal Missing",
  "Release Pending",
  "Field Measurement Needed",
  "Access Issue",
  "Crane / Logistics Conflict",
  "Predecessor Not Complete",
  "Material Not Available",
  "Design Change Pending",
  "Other",
];

const TYPE_COLORS = {
  "Missing Embeds": "var(--status-error)",
  "Anchor Bolt Issue": "var(--status-error)",
  "Approved Submittal Missing": "var(--status-warning)",
  "Release Pending": "var(--status-warning)",
  "Field Measurement Needed": "var(--accent)",
  "Access Issue": "var(--status-error)",
  "Crane / Logistics Conflict": "var(--status-error)",
  "Predecessor Not Complete": "var(--status-warning)",
  "Material Not Available": "var(--status-warning)",
  "Design Change Pending": "var(--accent)",
  Other: "var(--text-muted)",
};

const TYPE_ICONS = {
  "Missing Embeds": "⊗",
  "Anchor Bolt Issue": "⊘",
  "Approved Submittal Missing": "▤",
  "Release Pending": "⏸",
  "Field Measurement Needed": "◎",
  "Access Issue": "⛔",
  "Crane / Logistics Conflict": "▲",
  "Predecessor Not Complete": "⛓",
  "Material Not Available": "◻",
  "Design Change Pending": "✦",
  Other: "◈",
};

const PRIORITY_CONFIG = {
  Critical: { color: "var(--status-error)", bg: "var(--danger-muted)", border: "var(--danger-border)", dot: "#FF4444" },
  High: { color: "var(--status-warning)", bg: "var(--warning-muted)", border: "var(--warning-border)", dot: "#FFB95F" },
  Medium: { color: "var(--accent)", bg: "var(--accent-muted)", border: "var(--accent-border)", dot: "#7BD0FF" },
  Low: { color: "var(--text-muted)", bg: "rgba(144,144,149,0.1)", border: "rgba(144,144,149,0.25)", dot: "#909095" },
};

const STATUS_CONFIG = {
  Open: { color: "var(--status-warning)", bg: "var(--warning-muted)" },
  "In Progress": { color: "var(--accent)", bg: "var(--accent-muted)" },
  Resolved: { color: "var(--status-success)", bg: "var(--success-muted)" },
  Closed: { color: "var(--text-muted)", bg: "rgba(144,144,149,0.1)" },
};

const inputStyle = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-input)",
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: 4,
};

const formatDate = (d) =>
  d
    ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";

export default function Constraints() {
  const { project } = useProjectContext();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project") || project?.id || null;
  const qc = useQueryClient();

  const [view, setView] = useState("list");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("open");
  const [filterPriority, setFilterPriority] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["constraints", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.ActionItem.filter({ project_id: projectId, category: "CONSTRAINT" })
        : base44.entities.ActionItem.filter({ category: "CONSTRAINT" }),
    initialData: [],
  });

  const { data: wps = [] } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: () =>
      projectId ? base44.entities.WorkPackage.filter({ project_id: projectId }) : base44.entities.WorkPackage.list(),
    initialData: [],
  });

  useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.ActionItem.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["constraints"] });
      setShowForm(false);
      toast.success("Constraint logged");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ActionItem.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["constraints"] });
      setShowForm(false);
      setEditing(null);
      toast.success("Constraint updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.ActionItem.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["constraints"] });
      setDeleteTarget(null);
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
    const byPriority = ["Critical", "High", "Medium", "Low"].map((p) => ({
      priority: p,
      count: open.filter((c) => c.priority === p).length,
    }));
    return { open, resolved, closed, overdue, critical, inProg, byPriority, total: items.length };
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
        )
          return false;
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
        const aOver = a.due_date && new Date(`${a.due_date}T00:00:00Z`) < new Date();
        const bOver = b.due_date && new Date(`${b.due_date}T00:00:00Z`) < new Date();
        if (aOver !== bOver) return aOver ? -1 : 1;
        if (a.due_date && b.due_date) return new Date(a.due_date) - new Date(b.due_date);
        return 0;
      });
  }, [items, filterType, filterStatus, filterPriority, search]);

  const priorityBarTotal = Math.max(kpis.open.length, 1);
