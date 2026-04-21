import { useProjectContext } from "@/components/shared/useProjectContext";
import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import PunchlistFormModal from "@/components/punchlist/PunchlistFormModal";
import PunchlistList from "@/components/punchlist/PunchlistList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { CommandBar, KpiTile, ProgressBar } from "@/components/design-system";
import { Plus } from "lucide-react";

export default function Punchlist() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: punchlist = [] } = useQuery({
    queryKey: ["punchlist", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.PunchlistItem.filter({ project_id: projectId })
        : base44.entities.PunchlistItem.list(),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  const createMut = useMutation({
    mutationFn: (data) =>
      base44.entities.PunchlistItem.create({ ...data, project_id: data.project_id || projectId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["punchlist", projectId] });
      setShowForm(false);
      setEditing(null);
      toast.success("Item created");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: (data) => base44.entities.PunchlistItem.update(data.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["punchlist", projectId] });
      setShowForm(false);
      setEditing(null);
      toast.success("Item updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.PunchlistItem.delete(id),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ["punchlist", projectId] });
      if (editing?.id === deletedId) {
        setEditing(null);
        setShowForm(false);
      }
      setDeleteTarget(null);
      toast.success("Item deleted");
    },
    onError: () => toast.error("Delete failed"),
  });

  const handleSave = (data) => {
    if (editing) {
      updateMut.mutate({ ...data, id: editing.id });
    } else {
      createMut.mutate(data);
    }
  };

  const filtered = punchlist.filter((item) => {
    const statusMatch = filterStatus === "all" || item.status === filterStatus;
    const categoryMatch = filterCategory === "all" || item.category === filterCategory;
    const priorityMatch = filterPriority === "all" || item.priority === filterPriority;
    return statusMatch && categoryMatch && priorityMatch;
  });

  const stats = {
    total: punchlist.length,
    open: punchlist.filter((i) => i.status === "Open").length,
    inProgress: punchlist.filter((i) => i.status === "In Progress").length,
    completed: punchlist.filter((i) => i.status === "Completed").length,
    onHold: punchlist.filter((i) => i.status === "On Hold").length,
    critical: punchlist.filter((i) => i.priority === "Critical").length,
  };

  const completionRate = punchlist.length > 0 ? Math.round((stats.completed / punchlist.length) * 100) : 0;

  const statuses = ["Open", "In Progress", "Completed", "On Hold", "Deferred"];
  const categories = ["Structural", "Connections", "Painting/Coating", "Hardware", "Fit-Up", "Cleanup", "Documentation", "Other"];
  const priorities = ["Critical", "High", "Medium", "Low"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CommandBar
        eyebrow={selectedProject ? selectedProject.name : "ALL PROJECTS"}
        title="Punchlist"
        count={filtered.length}
        unit=" · ITEMS"
        subtitle={`${completionRate}% complete · ${stats.critical} critical · close-out checklist`}
      >
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--accent)", color: "var(--bg-base)", border: "none",
            borderRadius: "var(--radius-btn)", padding: "8px 14px",
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
            letterSpacing: "0.08em", cursor: "pointer", textTransform: "uppercase",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        >
          <Plus size={12} /> Add Item
        </button>
      </CommandBar>

      {/* Completion Progress */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.10em" }}>
            Project Completion
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--accent)" }}>
            {completionRate}%
          </span>
        </div>
        <ProgressBar value={completionRate} color="var(--status-success)" height={6} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
        <KpiTile compact label="Total"       value={stats.total}      color="var(--accent)" />
        <KpiTile compact label="Completed"   value={stats.completed}  color="var(--status-success)"
                 active={filterStatus === "Completed"} onClick={() => setFilterStatus(filterStatus === "Completed" ? "all" : "Completed")} />
        <KpiTile compact label="In Progress" value={stats.inProgress} color="var(--status-warning)"
                 active={filterStatus === "In Progress"} onClick={() => setFilterStatus(filterStatus === "In Progress" ? "all" : "In Progress")} />
        <KpiTile compact label="Open"        value={stats.open}       color="var(--status-error)"
                 active={filterStatus === "Open"} onClick={() => setFilterStatus(filterStatus === "Open" ? "all" : "Open")} />
        <KpiTile compact label="On Hold"     value={stats.onHold}     color="var(--status-review)"
                 active={filterStatus === "On Hold"} onClick={() => setFilterStatus(filterStatus === "On Hold" ? "all" : "On Hold")} />
        <KpiTile compact label="Critical"    value={stats.critical}   color="var(--status-error)"
                 active={filterPriority === "Critical"} onClick={() => setFilterPriority(filterPriority === "Critical" ? "all" : "Critical")} />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Status:</span>
          {["all", ...statuses].map((status) => (
            <button key={status} onClick={() => setFilterStatus(status)} style={{ background: filterStatus === status ? "var(--accent)" : "var(--bg-surface-low)", color: filterStatus === status ? "white" : "var(--text-secondary)", border: "none", borderRadius: "var(--radius-btn)", padding: "5px 12px", fontFamily: "var(--font-body)", fontSize: "8px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {status === "all" ? "All" : status.slice(0, 6)}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Category:</span>
          {["all", ...categories.slice(0, 4)].map((cat) => (
            <button key={cat} onClick={() => setFilterCategory(cat)} style={{ background: filterCategory === cat ? "var(--accent)" : "var(--bg-surface-low)", color: filterCategory === cat ? "white" : "var(--text-secondary)", border: "none", borderRadius: "var(--radius-btn)", padding: "5px 12px", fontFamily: "var(--font-body)", fontSize: "8px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {cat === "all" ? "All" : cat.slice(0, 5)}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Priority:</span>
          {["all", ...priorities].map((pri) => (
            <button key={pri} onClick={() => setFilterPriority(pri)} style={{ background: filterPriority === pri ? "var(--accent)" : "var(--bg-surface-low)", color: filterPriority === pri ? "white" : "var(--text-secondary)", border: "none", borderRadius: "var(--radius-btn)", padding: "5px 12px", fontFamily: "var(--font-body)", fontSize: "8px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {pri === "all" ? "All" : pri}
            </button>
          ))}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && <PunchlistFormModal projectId={projectId} item={editing} onClose={() => {setShowForm(false); setEditing(null);}} onSave={handleSave} isSaving={createMut.isPending || updateMut.isPending} />}

      {/* Punchlist */}
      <PunchlistList items={filtered} onEdit={(item) => {setEditing(item); setShowForm(true);}} onDelete={setDeleteTarget} />

      {/* Delete Dialog */}
      <DeleteDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => { if (!deleteMut.isPending && deleteTarget?.id) deleteMut.mutate(deleteTarget.id); }} title="Delete Item" description="Delete this record? This cannot be undone." />
    </div>
  );
}
