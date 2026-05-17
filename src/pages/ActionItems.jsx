import React, { useState, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useProjectId } from "@/hooks/useProjectId";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import ActionItemFormModal from "@/components/actionitems/ActionItemFormModal";
import ActionItemList from "@/components/actionitems/ActionItemList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { toast } from "sonner";
import { CommandBar, KpiTile, BulkActionBar } from "@/components/design-system";
import { Plus, Search } from "lucide-react";
import { ACTION_ITEM_STATUS, PRIORITY } from "@/lib/enums";
import { daysUntil } from "@/lib/dateMath";

const priorities = [
  PRIORITY.CRITICAL,
  PRIORITY.HIGH,
  PRIORITY.MEDIUM,
  PRIORITY.LOW,
];

const PRIORITY_COLORS = {
  [PRIORITY.CRITICAL]: "var(--status-error)",
  [PRIORITY.HIGH]: "var(--status-warning)",
  [PRIORITY.MEDIUM]: "var(--status-info)",
  [PRIORITY.LOW]: "var(--text-muted)",
};

/**
 * Shift a YYYY-MM-DD date string forward by N days, returning a new
 * YYYY-MM-DD string. Uses local date math (no TZ surprises).
 */
function shiftDate(dateStr, days) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function ActionItems() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editingItem, setEditingItem] = useState(null);

  // ─── Bulk selection state ────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setShowAssignDropdown(false);
  }, []);

  const handleToggleSelect = useCallback((id, checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((checked, items) => {
    if (checked) {
      setSelectedIds(new Set(items.map((item) => item.id)));
    } else {
      setSelectedIds(new Set());
    }
  }, []);

  // ─── Mutations ───────────────────────────────────────────────────────────
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

  // ─── Bulk mutation — runs parallel updates then invalidates once ─────────
  const bulkUpdateMut = useMutation({
    mutationFn: async (updates) => {
      // updates is an array of { id, data } objects
      const results = await Promise.allSettled(
        updates.map(({ id, data }) => base44.entities.ActionItem.update(id, data))
      );
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        throw new Error(`${failed.length} of ${updates.length} updates failed`);
      }
      return results.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["action-items"] });
      qc.invalidateQueries({ queryKey: ["action-items-all"] });
      toast.success(`${count} item${count === 1 ? "" : "s"} updated`);
      clearSelection();
    },
    onError: (e) => {
      qc.invalidateQueries({ queryKey: ["action-items"] });
      toast.error(e?.message || "Bulk update failed");
    },
  });

  // ─── Queries ─────────────────────────────────────────────────────────────
  const { data: actionItems = [], isLoading } = useQuery({
    queryKey: ["action-items", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.ActionItem.filter({ project_id: projectId }, "-due_date")
        : base44.entities.ActionItem.list("-due_date"),
  });

  useRealtimeInvalidation("action_items", projectId, [["action-items", projectId]]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const selectedProject = projectId ? projects.find((p) => p.id === projectId) : null;

  // ─── Derived: unique assignees (for bulk-assign dropdown) ────────────────
  const knownAssignees = useMemo(() => {
    const names = new Set();
    for (const ai of actionItems) {
      if (ai.assigned_to) names.add(ai.assigned_to);
    }
    return Array.from(names).sort();
  }, [actionItems]);

  const stats = useMemo(() => ({
    total:      actionItems.length,
    open:       actionItems.filter((ai) => ai.status === ACTION_ITEM_STATUS.OPEN).length,
    inProgress: actionItems.filter((ai) => ai.status === ACTION_ITEM_STATUS.IN_PROGRESS).length,
    complete:   actionItems.filter((ai) => ai.status === ACTION_ITEM_STATUS.COMPLETE).length,
    cancelled:  actionItems.filter((ai) => ai.status === ACTION_ITEM_STATUS.CANCELLED).length,
    critical:   actionItems.filter((ai) => ai.priority === PRIORITY.CRITICAL).length,
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

  const executionQueue = useMemo(() => {
    const activeItems = actionItems.filter((ai) => ai.status !== ACTION_ITEM_STATUS.COMPLETE && ai.status !== ACTION_ITEM_STATUS.CANCELLED);
    const score = (ai) => {
      const days = ai.due_date ? daysUntil(ai.due_date) : null;
      let value = 0;
      if (ai.priority === PRIORITY.CRITICAL) value += 50;
      else if (ai.priority === PRIORITY.HIGH) value += 35;
      else if (ai.priority === PRIORITY.MEDIUM) value += 20;
      if (days !== null && days < 0) value += 60 + Math.min(30, Math.abs(days) * 4);
      else if (days === 0) value += 45;
      else if (days === 1) value += 30;
      else if (days === 2) value += 20;
      if (!ai.assigned_to) value += 12;
      if (ai.metadata?.created_from === "production_meeting_parser") value += 8;
      return value;
    };
    return activeItems
      .map((ai) => ({ ...ai, _daysUntil: ai.due_date ? daysUntil(ai.due_date) : null, _executionScore: score(ai) }))
      .sort((a, b) => b._executionScore - a._executionScore)
      .slice(0, 8);
  }, [actionItems]);

  // ─── Handlers ────────────────────────────────────────────────────────────
  const handleResolve = (item) => {
    const isComplete = item.status === ACTION_ITEM_STATUS.COMPLETE;
    updateMut.mutate({
      id: item.id,
      data: {
        status: isComplete ? ACTION_ITEM_STATUS.OPEN : ACTION_ITEM_STATUS.COMPLETE,
      },
    });
  };

  // ─── Bulk action handlers ────────────────────────────────────────────────
  const handleBulkBumpDay = () => {
    const selectedItems = actionItems.filter((ai) => selectedIds.has(ai.id));
    const updates = selectedItems.map((ai) => ({
      id: ai.id,
      data: { due_date: shiftDate(ai.due_date, 1) || shiftDate(new Date().toISOString().slice(0, 10), 1) },
    }));
    bulkUpdateMut.mutate(updates);
  };

  const handleBulkComplete = () => {
    const updates = Array.from(selectedIds).map((id) => ({
      id,
      data: { status: ACTION_ITEM_STATUS.COMPLETE },
    }));
    bulkUpdateMut.mutate(updates);
  };

  const handleBulkAssign = (assignee) => {
    const updates = Array.from(selectedIds).map((id) => ({
      id,
      data: { assigned_to: assignee },
    }));
    bulkUpdateMut.mutate(updates);
    setShowAssignDropdown(false);
  };

  // ─── Stat cards ──────────────────────────────────────────────────────────
  const statCards = [
    { label: "Total",       value: stats.total,       color: "var(--accent)",         filterKey: null },
    { label: "Open",        value: stats.open,        color: "var(--status-warning)", filterKey: ACTION_ITEM_STATUS.OPEN },
    { label: "In Progress", value: stats.inProgress,  color: "var(--status-info)",    filterKey: ACTION_ITEM_STATUS.IN_PROGRESS },
    { label: "Complete",    value: stats.complete,    color: "var(--status-success)", filterKey: ACTION_ITEM_STATUS.COMPLETE },
    { label: "Cancelled",   value: stats.cancelled,   color: "var(--text-muted)",     filterKey: ACTION_ITEM_STATUS.CANCELLED },
    { label: "Critical",    value: stats.critical,    color: "var(--status-error)",   filterKey: null, priorityKey: PRIORITY.CRITICAL },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CommandBar
        eyebrow={selectedProject ? selectedProject.name : "ALL PROJECTS"}
        title="Action Items"
        count={filtered.length}
        unit=" · ITEMS"
        subtitle={`${stats.open} open · ${stats.critical} critical · ${stats.complete} complete`}
      >
        <div style={{ position: "relative" }}>
          <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
          <input
            type="text"
            placeholder="Search items..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-btn)",
              padding: "8px 12px 8px 30px",
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
          style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--accent)", color: "var(--bg-base)", border: "none", borderRadius: "var(--radius-btn)", padding: "8px 14px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer", textTransform: "uppercase" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        >
          <Plus size={12} /> New Action Item
        </button>
      </CommandBar>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        {statCards.map((stat) => {
          const isActive = stat.filterKey
            ? filterStatus === stat.filterKey
            : stat.priorityKey
            ? filterPriority === stat.priorityKey
            : filterStatus === "all" && filterPriority === "all";
          const clickable = !!(stat.filterKey || stat.priorityKey || stat.label === "Total");
          return (
            <KpiTile
              key={stat.label}
              compact
              label={stat.label}
              value={stat.value}
              color={stat.color}
              active={isActive}
              onClick={
                clickable
                  ? () => {
                      if (stat.label === "Total") {
                        setFilterStatus("all");
                        setFilterPriority("all");
                      } else if (stat.filterKey) {
                        setFilterStatus((prev) => (prev === stat.filterKey ? "all" : stat.filterKey));
                      } else if (stat.priorityKey) {
                        setFilterPriority((prev) => (prev === stat.priorityKey ? "all" : stat.priorityKey));
                      }
                    }
                  : undefined
              }
            />
          );
        })}
      </div>

      {executionQueue.length > 0 && (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--divider)" }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: "var(--accent)", textTransform: "uppercase" }}>
                Today's Execution Queue
              </div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
                Auto-ranked by due date, priority, missing owner, and production-meeting origin.
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setFilterStatus("all"); setFilterPriority("all"); setSearch(""); }}
              style={{ background: "var(--bg-surface-low)", color: "var(--text-secondary)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-btn)", padding: "7px 12px", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}
            >
              Show All
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 0 }}>
            {executionQueue.map((item) => {
              const overdue = item._daysUntil !== null && item._daysUntil < 0;
              const dueToday = item._daysUntil === 0;
              const priorityColor = PRIORITY_COLORS[item.priority] || "var(--text-muted)";
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setEditingItem(item)}
                  style={{ textAlign: "left", background: overdue ? "rgba(239,68,68,0.06)" : dueToday ? "rgba(245,158,11,0.06)" : "transparent", border: "none", borderRight: "1px solid var(--divider)", borderBottom: "1px solid var(--divider)", padding: 14, cursor: "pointer" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--hover-bg)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = overdue ? "rgba(239,68,68,0.06)" : dueToday ? "rgba(245,158,11,0.06)" : "transparent"}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: priorityColor, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      {item.priority || "Normal"}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: overdue ? "var(--status-error)" : dueToday ? "var(--status-warning)" : "var(--text-muted)", fontWeight: 800 }}>
                      {item._daysUntil === null ? "NO DATE" : overdue ? `${Math.abs(item._daysUntil)}D OVERDUE` : dueToday ? "DUE TODAY" : `${item._daysUntil}D`}
                    </span>
                  </div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.35 }}>
                    {item.title}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                    <span>{item.assigned_to || "Unassigned"}</span>
                    {item.metadata?.impact_area && <span>{item.metadata.impact_area}</span>}
                    {item.metadata?.task_type && <span>{item.metadata.task_type}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

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
                {priority === "all" ? "All" : priority === "Critical" ? `\u{1F525} ${priority}` : priority}
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

      {/* List — with loading, empty, and populated states */}
      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "24px 0" }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", padding: "16px 20px", height: 56, animation: "pulse 1.5s ease-in-out infinite", opacity: 0.5 }} />
          ))}
        </div>
      ) : actionItems.length === 0 ? (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", padding: "64px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>{"✅"}</div>
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
          selectionEnabled={true}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onSelectAll={(checked) => handleSelectAll(checked, filtered)}
        />
      )}

      {/* Bulk Action Bar — appears when 1+ items selected */}
      <BulkActionBar
        count={selectedIds.size}
        onClear={clearSelection}
        actions={[
          {
            label: "Bump +1 Day",
            icon: "schedule",
            variant: "secondary",
            onClick: handleBulkBumpDay,
            disabled: bulkUpdateMut.isPending,
          },
          {
            label: "Assign To",
            icon: "crew",
            variant: "secondary",
            onClick: () => setShowAssignDropdown((v) => !v),
            disabled: bulkUpdateMut.isPending,
          },
          {
            label: "Mark Complete",
            icon: "check",
            variant: "primary",
            onClick: handleBulkComplete,
            disabled: bulkUpdateMut.isPending,
          },
        ]}
      />

      {/* Assign-to dropdown — positioned above the bulk bar */}
      {showAssignDropdown && selectedIds.size > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 64,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--bg-surface-high)",
            backdropFilter: "blur(20px) saturate(140%)",
            WebkitBackdropFilter: "blur(20px) saturate(140%)",
            border: "1px solid var(--accent-border)",
            borderRadius: "var(--radius-card)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.55), 0 0 20px color-mix(in srgb, var(--accent) 15%, transparent)",
            padding: "8px 4px",
            zIndex: 210,
            minWidth: 200,
            maxHeight: 240,
            overflowY: "auto",
          }}
        >
          <div style={{ padding: "6px 12px", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase" }}>
            Assign to
          </div>
          {knownAssignees.length === 0 && (
            <div style={{ padding: "10px 12px", fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)" }}>
              No assignees found. Add assignees to items first.
            </div>
          )}
          {knownAssignees.map((name) => (
            <button
              key={name}
              onClick={() => handleBulkAssign(name)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 12px",
                background: "transparent",
                border: "none",
                borderRadius: 6,
                color: "var(--text-primary)",
                fontFamily: "var(--font-body)",
                fontSize: 12,
                cursor: "pointer",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {name}
            </button>
          ))}
          <div style={{ borderTop: "1px solid var(--divider)", margin: "4px 0" }} />
          <button
            onClick={() => setShowAssignDropdown(false)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "6px 12px",
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        title="Delete Action Item"
        description={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
      />

      {/* Spacer so the bulk bar doesn't overlap the last item */}
      {selectedIds.size > 0 && <div style={{ height: 72 }} />}
    </div>
  );
}
