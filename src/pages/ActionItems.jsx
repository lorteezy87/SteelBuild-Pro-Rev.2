import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "@/components/shared/useProjectContext";
import ActionItemFormModal from "@/components/actionitems/ActionItemFormModal";
import ActionItemList from "@/components/actionitems/ActionItemList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { toast } from "sonner";

const PRIORITY_COLORS = {
  Critical: "var(--status-error)",
  High:     "var(--status-warning)",
  Medium:   "var(--status-info)",
  Low:      "var(--text-muted)",
};

export default function ActionItems() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editingItem, setEditingItem] = useState(null);

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.ActionItem.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["action-items"] });
      qc.invalidateQueries({ queryKey: ["action-items-all"] });
      toast.success("Action item created");
      setShowForm(false);
    },
    onError: (e) => toast.error("Failed: " + (e?.message || "Unknown error")),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ActionItem.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["action-items"] });
      qc.invalidateQueries({ queryKey: ["action-items-all"] });
      toast.success("Action item updated");
      setEditingItem(null);
      setShowForm(false);
    },
    onError: (e) => toast.error("Failed: " + (e?.message || "Unknown error")),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.ActionItem.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["action-items"] });
      qc.invalidateQueries({ queryKey: ["action-items-all"] });
      setDeleteTarget(null);
      toast.success("Action item deleted");
    },
    onError: (e) => toast.error("Failed: " + (e?.message || "Delete failed")),
  });

  const { data: actionItems = [] } = useQuery({
    queryKey: ["action-items", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.ActionItem.filter({ project_id: projectId }, "-due_date")
        : base44.entities.ActionItem.list("-due_date"),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const selectedProject = projectId ? projects.find((p) => p.id === projectId) : null;

  const stats = useMemo(() => ({
    total:      actionItems.length,
    open:       actionItems.filter((ai) => ai.status === "Open").length,
    inProgress: actionItems.filter((ai) => ai.status === "In Progress").length,
    complete:   actionItems.filter((ai) => ai.status === "Complete").length,
    cancelled:  actionItems.filter((ai) => ai.status === "Cancelled").length,
    critical:   actionItems.filter((ai) => ai.priority === "Critical").length,
  }), [actionItems]);

  const filtered = useMemo(() => actionItems.filter((ai) => {
    const statusMatch   = filterStatus   === "all" || ai.status   === filterStatus;
    const priorityMatch = filterPriority === "all" || ai.priority === filterPriority;
    const searchMatch   = !search.trim() ||
      ai.title?.toLowerCase().includes(search.toLowerCase()) ||
      ai.description?.toLowerCase().includes(search.toLowerCase()) ||
      ai.assigned_to?.toLowerCase().includes(search.toLowerCase());
    return statusMatch && priorityMatch && searchMatch;
  }), [actionItems, filterStatus, filterPriority, search]);

  const handleResolve = (item) => {
    const isComplete = item.status === "Complete";
    updateMut.mutate({
      id: item.id,
      data: {
        status: isComplete ? "Open" : "Complete",
      },
    });
  };

  const statCards = [
    { label: "Total",       value: stats.total,      color: "var(--accent)",         filterKey: null },
    { label: "Open",        value: stats.open,        color: "var(--status-warning)", filterKey: "Open" },
    { label: "In Progress", value: stats.inProgress,  color: "var(--status-info)",    filterKey: "In Progress" },
    { label: "Complete",    value: stats.complete,    color: "var(--status-success)", filterKey: "Complete" },
    { label: "Cancelled",   value: stats.cancelled,   color: "var(--text-muted)",     filterKey: "Cancelled" },
    { label: "Critical",    value: stats.critical,    color: "var(--status-error)",   filterKey: null, priorityKey: "Critical" },
  ];

  const priorities = ["Critical", "High", "Medium", "Low"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-body)", fontSize: 24, fontWeight: 800, color: "var(--text-primary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Action Items
          </h1>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", marginTop: 4, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            {selectedProject ? selectedProject.name : "All Projects"} • {filtered.length} Items
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Search */}
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 12, pointerEvents: "none" }}>🔍</span>
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-btn)",
                padding: "7px 12px 7px 30px",
                fontFamily: "var(--font-body)",
                fontSize: 11,
                color: "var(--text-primary)",
                outline: "none",
                width: 200,
              }}
            />
          </div>

          <button
            onClick={() => { setEditingItem(null); setShowForm(true); }}
            style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: "var(--radius-btn)", padding: "8px 16px", fontFamily: "var(--font-body)", fontSize: "10px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
          >
            + New Action Item
          </button>
        </div>
      </div>

      {/* Clickable Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
        {statCards.map((stat) => {
          const isActive = stat.filterKey
            ? filterStatus === stat.filterKey
            : stat.priorityKey
            ? filterPriority === stat.priorityKey
            : false;
          const isAlertCard = stat.value > 0 && (stat.label === "Critical" || stat.label === "Open");
          return (
            <div
              key={stat.label}
              onClick={() => {
                if (stat.filterKey) {
                  setFilterStatus(prev => prev === stat.filterKey ? "all" : stat.filterKey);
                } else if (stat.priorityKey) {
                  setFilterPriority(prev => prev === stat.priorityKey ? "all" : stat.priorityKey);
                }
              }}
              style={{
                background: isActive ? `${stat.color}18` : isAlertCard ? `${stat.color}0a` : "var(--bg-surface)",
                border: isActive ? `1px solid ${stat.color}60` : isAlertCard ? `1px solid ${stat.color}30` : "none",
                borderRadius: "var(--radius-card)",
                padding: "12px",
                borderTop: `2px solid ${stat.color}`,
                cursor: stat.filterKey || stat.priorityKey ? "pointer" : "default",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { if (stat.filterKey || stat.priorityKey) e.currentTarget.style.background = `${stat.color}18`; }}
              onMouseLeave={e => { e.currentTarget.style.background = isActive ? `${stat.color}18` : isAlertCard ? `${stat.color}0a` : "var(--bg-surface)"; }}
              title={stat.filterKey ? `Filter by ${stat.label}` : stat.priorityKey ? `Filter by ${stat.label} priority` : ""}
            >
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 700, color: stat.color, marginBottom: "4px" }}>
                {stat.label === "Critical" && stat.value > 0 ? `🔥 ${stat.value}` : stat.value}
              </div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                {stat.label}
                {(stat.filterKey || stat.priorityKey) && <span style={{ marginLeft: 4, opacity: 0.5 }}>↑</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="filter-bar-responsive" style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginRight: 2 }}>Status:</span>
          {["all", "Open", "In Progress", "Complete", "Cancelled"].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              style={{
                background: filterStatus === status ? "var(--accent)" : "var(--bg-surface-low)",
                color: filterStatus === status ? "white" : "var(--text-secondary)",
                border: filterStatus === status ? "1px solid var(--accent)" : "1px solid var(--border-default)",
                borderRadius: "var(--radius-btn)",
                padding: "5px 12px",
                fontFamily: "var(--font-body)",
                fontSize: "9px",
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                transition: "all 0.12s",
              }}
            >
              {status === "all" ? "All" : status}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginRight: 2 }}>Priority:</span>
          {["all", ...priorities].map((priority) => {
            const pColor = PRIORITY_COLORS[priority];
            const isActive = filterPriority === priority;
            return (
              <button
                key={priority}
                onClick={() => setFilterPriority(priority)}
                style={{
                  background: isActive ? (pColor || "var(--accent)") : "var(--bg-surface-low)",
                  color: isActive ? "white" : pColor || "var(--text-secondary)",
                  border: isActive ? `1px solid ${pColor || "var(--accent)"}` : "1px solid var(--border-default)",
                  borderRadius: "var(--radius-btn)",
                  padding: "5px 12px",
                  fontFamily: "var(--font-body)",
                  fontSize: "9px",
                  fontWeight: 700,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  transition: "all 0.12s",
                }}
              >
                {priority === "all" ? "All" : priority === "Critical" ? `🔥 ${priority}` : priority}
              </button>
            );
          })}
        </div>

        {(filterStatus !== "all" || filterPriority !== "all" || search) && (
          <button
            onClick={() => { setFilterStatus("all"); setFilterPriority("all"); setSearch(""); }}
            style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em", textDecoration: "underline" }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Form Modal */}
      {(showForm || editingItem) && (
        <ActionItemFormModal
          projectId={editingItem?.project_id || projectId}
          actionItem={editingItem}
          onClose={() => { setShowForm(false); setEditingItem(null); }}
          onSave={(data) => {
            if (editingItem) {
              updateMut.mutate({ id: editingItem.id, data });
            } else {
              createMut.mutate(data);
            }
          }}
        />
      )}

      {/* Empty state */}
      {actionItems.length === 0 ? (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", padding: "64px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>No Action Items Yet</div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginBottom: 24, maxWidth: 360, margin: "0 auto 24px" }}>
            Track tasks, follow-ups, and field issues. Assign them to your crew and monitor due dates in one place.
          </div>
          <button
            onClick={() => { setEditingItem(null); setShowForm(true); }}
            style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: "var(--radius-btn)", padding: "10px 24px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            Assign Your First Action Item
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", padding: "40px", textAlign: "center" }}>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>No items match your filters</p>
        </div>
      ) : (
        <ActionItemList
          actionItems={filtered}
          onEdit={(item) => setEditingItem(item)}
          onResolve={handleResolve}
          onDelete={(item) => setDeleteTarget(item)}
        />
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        title="Delete Action Item"
        description={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
      />
    </div>
  );
}
