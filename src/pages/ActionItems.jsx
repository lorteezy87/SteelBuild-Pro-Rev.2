import React, { useState, useMemo, useCallback } from "react";
import { entities } from "@/api/supabaseClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useProjectId } from "@/hooks/useProjectId";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import ActionItemFormModal from "@/components/actionitems/ActionItemFormModal";
import DeleteDialog from "@/components/shared/DeleteDialog";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { toast } from "sonner";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import { BulkActionBar, Button } from "@/components/design-system";
import { ACTION_ITEM_STATUS, PRIORITY } from "@/lib/enums";
import { daysUntil } from "@/lib/dateMath";
import { calcWpProgress } from "@/utils/projectKpis";
import ActionItemsControlCenter from "./actionItems/ActionItemsControlCenter";

/** Lightweight CSV export for the canonical presentation path. */
function exportActionItemsToCSV(items) {
  const rows = [
    ["ID", "Title", "Status", "Priority", "Assigned To", "Due Date", "Category", "Project Area", "Meeting Reference"],
    ...items.map((ai) => [
      ai.id,
      ai.title || "",
      ai.status || "",
      ai.priority || "",
      ai.assigned_to || "",
      ai.due_date || "",
      ai.category || "",
      ai.project_area || "",
      ai.meeting_reference || "",
    ]),
  ];
  const csv = rows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "action-items.csv";
  a.click();
  URL.revokeObjectURL(url);
}

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
    mutationFn: (data) => entities.ActionItem.create(withProjectId(data, projectId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["action-items"] });
      qc.invalidateQueries({ queryKey: ["action-items-all"] });
      toast.success("Action item created");
      setShowForm(false);
    },
    onError: (e) => toast.error(`Failed: ${toUserErrorMessage(e)}`),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => entities.ActionItem.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["action-items"] });
      qc.invalidateQueries({ queryKey: ["action-items-all"] });
      toast.success("Action item updated");
      setEditingItem(null);
      setShowForm(false);
    },
    onError: (e) => toast.error(`Failed: ${toUserErrorMessage(e)}`),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => entities.ActionItem.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["action-items"] });
      qc.invalidateQueries({ queryKey: ["action-items-all"] });
      setDeleteTarget(null);
      toast.success("Action item deleted");
    },
    onError: (e) => toast.error(`Failed: ${toUserErrorMessage(e, "Delete failed")}`),
  });

  // ─── Bulk mutation — per-row heterogeneous updates ───────────────────────
  // Used ONLY where each row gets a DIFFERENT payload (e.g. "Bump +1 Day",
  // which shifts each item off its OWN due_date). Identical-patch bulk ops
  // (Mark Complete / Assign To) go through bulkPatchMut below, which collapses
  // to one chunked .in('id', ids) request instead of N.
  const bulkUpdateMut = useMutation({
    mutationFn: async (updates) => {
      // updates is an array of { id, data } objects
      const results = await Promise.allSettled(
        updates.map(({ id, data }) => entities.ActionItem.update(id, data))
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
      toast.error(toUserErrorMessage(e, "Bulk update failed"));
    },
  });

  // ─── Bulk mutation — identical patch across all selected ids ─────────────
  // One chunked .in('id', ids) UPDATE via the entity client, for the handlers
  // whose payload is the same for every row.
  const bulkPatchMut = useMutation({
    mutationFn: async ({ ids, data }) => {
      await entities.ActionItem.bulkUpdate(ids, data);
      return ids.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["action-items"] });
      qc.invalidateQueries({ queryKey: ["action-items-all"] });
      toast.success(`${count} item${count === 1 ? "" : "s"} updated`);
      clearSelection();
    },
    onError: (e) => {
      qc.invalidateQueries({ queryKey: ["action-items"] });
      toast.error(toUserErrorMessage(e, "Bulk update failed"));
    },
  });

  // ─── Queries ─────────────────────────────────────────────────────────────
  const {
    data: allItems = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["action-items", projectId],
    queryFn: () =>
      projectId
        ? entities.ActionItem.filter({ project_id: projectId }, "-due_date")
        : entities.ActionItem.list("-due_date"),
  });

  useRealtimeInvalidation("action_items", projectId, [["action-items", projectId]]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const selectedProject = projectId ? projects.find((p) => p.id === projectId) : null;

  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: () => entities.WorkPackage.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });

  // ─── Split SETUP checklist items from regular action items ──────────────
  const [setupCollapsed, setSetupCollapsed] = useState(false);

  const setupItems = useMemo(() =>
    allItems
      .filter((ai) => ai.category === "SETUP")
      .sort((a, b) => (a.metadata?.sort_order ?? 99) - (b.metadata?.sort_order ?? 99)),
    [allItems]
  );

  const actionItems = useMemo(() =>
    allItems.filter((ai) => ai.category !== "SETUP"),
    [allItems]
  );

  const setupStats = useMemo(() => {
    const total = setupItems.length;
    const complete = setupItems.filter((si) => si.status === ACTION_ITEM_STATUS.COMPLETE).length;
    return { total, complete, pct: total > 0 ? Math.round((complete / total) * 100) : 0 };
  }, [setupItems]);

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
    // Identical { status: Complete } patch for every selected id.
    bulkPatchMut.mutate({ ids: Array.from(selectedIds), data: { status: ACTION_ITEM_STATUS.COMPLETE } });
  };

  const handleBulkAssign = (assignee) => {
    // Identical { assigned_to } patch for every selected id.
    bulkPatchMut.mutate({ ids: Array.from(selectedIds), data: { assigned_to: assignee } });
    setShowAssignDropdown(false);
  };

  // Shared modals remain page-owned while the control center owns presentation.
  const modals = (
    <>
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
      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        title="Delete Action Item"
        description={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
      />
    </>
  );

  // Gate fetch states at the page shell — ActionItemsControlCenter does not
  // accept isLoading (same pattern as RFIs / ChangeOrders / Backcharges).
  if (isLoading) {
    return (
      <div style={{ padding: 24 }}>
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "48px 24px", background: "var(--bg-surface)", borderRadius: "var(--radius-card)", gap: 16,
        margin: 24,
      }}>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>
          Couldn’t load action items
        </p>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", margin: 0, textAlign: "center", maxWidth: 320 }}>
          {toUserErrorMessage(error, "Something went wrong. Try again.")}
        </p>
        <Button variant="outline" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  // Canonical Action Items control center ─────────────────────────────────
    const activeProject = projects.find((p) => p.id === projectId);
    const projectHealth = activeProject?.health_status || null;
    const percentComplete =
      activeProject?.scope_complete_pct_override != null
        ? Number(activeProject.scope_complete_pct_override)
        : workPackages.length
        ? calcWpProgress(workPackages).pct
        : null;

    // filter state maps "All" → "all" for the shared filter helpers,
    // and passes display-friendly values (e.g. "Open") through unchanged.
    const ccStatusFilter = filterStatus === "all" ? "All" : filterStatus;
    const ccPriorityFilter = filterPriority === "all" ? "All" : filterPriority;
    const handleCcStatusChange = (v) => setFilterStatus(v === "All" ? "all" : v);
    const handleCcPriorityChange = (v) => setFilterPriority(v === "All" ? "all" : v);

    return (
      <div>
        <ActionItemsControlCenter
          projectName={activeProject?.name || "All Projects"}
          actionItems={allItems}
          filtered={filtered}
          search={search}
          onSearch={setSearch}
          statusFilter={ccStatusFilter}
          onStatusFilterChange={handleCcStatusChange}
          priorityFilter={ccPriorityFilter}
          onPriorityFilterChange={handleCcPriorityChange}
          onOpenItem={setEditingItem}
          onExport={() => exportActionItemsToCSV(filtered)}
          onCreate={() => { setEditingItem(null); setShowForm(true); }}
          projectHealth={projectHealth}
          percentComplete={percentComplete}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onToggleAll={(checked) => handleSelectAll(checked, filtered)}
        />
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
              label: "Mark Complete",
              icon: "check",
              variant: "primary",
              onClick: handleBulkComplete,
              disabled: bulkPatchMut.isPending,
            },
          ]}
        />
        {modals}
      </div>
    );
}
