import React, { useState, useMemo } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProjectId } from "@/hooks/useProjectId";
import ScopeItemFormModal from "@/components/scope/ScopeItemFormModal";
import ScopeItemList from "@/components/scope/ScopeItemList";
import BulkScopeModal from "@/components/scope/BulkScopeModal";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { toast } from "sonner";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import {
  filterScopeItems,
  computeScopeStats,
  commandBarSubtitle,
  hasActiveScopeFilters,
  nextSelectedIds,
  bulkSuccessMessage,
  buildCompleteToggleData,
  buildInProgressToggleData,
} from "./scopeExclusions/scopeExclusionsHelpers";
import {
  ScopeCommandBar,
  ScopeKpiStrip,
  ScopeSearchBar,
  ScopeFilterBars,
  ScopeBulkActionBar,
} from "./scopeExclusions/ScopeExclusionsUi";

export default function ScopeExclusions() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkActionBusy, setBulkActionBusy] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [hideCompleted, setHideCompleted] = useState(false);

  const { data: scopeItems = [] } = useQuery({
    queryKey: ["scope-items", projectId],
    queryFn: () =>
      projectId
        ? entities.ScopeItem.filter({ project_id: projectId })
        : entities.ScopeItem.list(),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => entities.ScopeItem.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["scope-items"] }); toast.success("Scope item updated"); setShowForm(false); setEditing(null); },
    onError: (e) => toast.error(`Failed: ${toUserErrorMessage(e, "Unknown error")}`),
  });

  // Lightweight checkbox toggle — does not open the form modal. Writes the
  // completed flag + timestamp so we have a record of when each item closed.
  // Completing a row also clears any in-progress flag so the UI stays tidy.
  const toggleCompleteMut = useMutation({
    mutationFn: ({ id, is_completed }) =>
      entities.ScopeItem.update(id, buildCompleteToggleData(is_completed)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["scope-items"] }); },
    onError: (e) => toast.error(`Failed: ${toUserErrorMessage(e, "Unknown error")}`),
  });

  // Toggle the in-progress flag. If the row is complete, this is a no-op at
  // the UI level (the button is hidden), so we don't guard against it here.
  const toggleInProgressMut = useMutation({
    mutationFn: ({ id, in_progress }) =>
      entities.ScopeItem.update(id, buildInProgressToggleData(in_progress)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["scope-items"] }); },
    onError: (e) => toast.error(`Failed: ${toUserErrorMessage(e, "Unknown error")}`),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => entities.ScopeItem.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["scope-items"] }); toast.success("Scope item deleted"); setDeleteTarget(null); },
    onError: (e) => toast.error(`Failed: ${toUserErrorMessage(e, "Unknown error")}`),
  });

  const handleSave = (data) => {
    if (editing) updateMut.mutate({ id: editing.id, data });
    // create is handled by ScopeItemFormModal internally
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => nextSelectedIds(prev, id));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const applyBulk = async (patch) => {
    if (selectedIds.size === 0) return;
    setBulkActionBusy(true);
    try {
      // Identical `patch` across every selected id → one chunked .in('id', ids) update.
      await entities.ScopeItem.bulkUpdate([...selectedIds], patch);
      qc.invalidateQueries({ queryKey: ["scope-items"] });
      toast.success(bulkSuccessMessage(selectedIds.size, "Updated"));
      clearSelection();
    } catch (e) {
      toast.error(`Bulk update failed: ${toUserErrorMessage(e, "Unknown error")}`);
    } finally {
      setBulkActionBusy(false);
    }
  };

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected scope item${selectedIds.size === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setBulkActionBusy(true);
    try {
      // One chunked .in('id', ids) delete instead of N single-row round-trips.
      await entities.ScopeItem.bulkDelete([...selectedIds]);
      qc.invalidateQueries({ queryKey: ["scope-items"] });
      toast.success(bulkSuccessMessage(selectedIds.size, "Deleted"));
      clearSelection();
    } catch (e) {
      toast.error(`Bulk delete failed: ${toUserErrorMessage(e, "Unknown error")}`);
    } finally {
      setBulkActionBusy(false);
    }
  };

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  const filtered = useMemo(
    () => filterScopeItems(scopeItems, { filterType, filterCategory, search, hideCompleted }),
    [scopeItems, filterType, filterCategory, search, hideCompleted],
  );

  const stats = useMemo(() => computeScopeStats(scopeItems), [scopeItems]);

  const openCreate = () => { setEditing(null); setShowForm(true); };

  return (
    <div className="sb-dashboard-reference-page" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <ScopeCommandBar
        projectName={selectedProject?.name}
        filteredCount={filtered.length}
        total={stats.total}
        subtitle={commandBarSubtitle(stats)}
        projectId={projectId}
        onBulkImport={() => setShowBulk(true)}
        onNewItem={openCreate}
      />

      <ScopeKpiStrip stats={stats} filterType={filterType} onFilterType={setFilterType} />

      <ScopeSearchBar
        search={search}
        onSearchChange={setSearch}
        hideCompleted={hideCompleted}
        onHideCompletedChange={setHideCompleted}
      />

      <ScopeFilterBars
        filterType={filterType}
        filterCategory={filterCategory}
        onFilterType={setFilterType}
        onFilterCategory={setFilterCategory}
      />

      {/* Form Modal */}
      {showForm && (
        <ScopeItemFormModal projectId={projectId} editing={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSave={handleSave} />
      )}

      {/* Bulk Import Modal */}
      {showBulk && (
        <BulkScopeModal
          projectId={projectId}
          onClose={() => setShowBulk(false)}
          onCreated={() => setShowBulk(false)}
        />
      )}

      {/* Bulk-edit action bar — appears when any rows are selected */}
      {selectedIds.size > 0 && (
        <ScopeBulkActionBar
          selectedCount={selectedIds.size}
          bulkActionBusy={bulkActionBusy}
          onApplyBulk={applyBulk}
          onBulkDelete={bulkDelete}
          onClear={clearSelection}
        />
      )}

      {/* Scope Items List */}
      <ScopeItemList
        items={filtered}
        totalCount={stats.total}
        hasActiveFilters={hasActiveScopeFilters({ filterType, filterCategory, search, hideCompleted })}
        onCreateFirst={openCreate}
        onClearFilters={() => { setFilterType("all"); setFilterCategory("all"); setSearch(""); setHideCompleted(false); }}
        onEdit={(item) => { setEditing(item); setShowForm(true); }}
        onDelete={setDeleteTarget}
        onToggleComplete={(item) =>
          toggleCompleteMut.mutate({ id: item.id, is_completed: !item.is_completed })
        }
        onToggleInProgress={(item) =>
          toggleInProgressMut.mutate({ id: item.id, in_progress: !item.in_progress })
        }
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
      />

      {/* Delete Dialog */}
      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        title="Delete Scope Item"
        description="Delete this scope item? This cannot be undone."
      />
    </div>
  );
}
