import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "@/components/shared/useProjectContext";
import { useProjectId } from "@/hooks/useProjectId";
import ScopeItemFormModal from "@/components/scope/ScopeItemFormModal";
import ScopeItemList from "@/components/scope/ScopeItemList";
import BulkScopeModal from "@/components/scope/BulkScopeModal";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { toast } from "sonner";
import { Check, X, Info, Search, Plus, Upload } from "lucide-react";
import { CommandBar, KpiTile } from "@/components/design-system";

const TYPE_META = {
  Scope:         { color: "var(--status-success)", Icon: Check },
  Exclusion:     { color: "var(--status-error)",   Icon: X },
  Clarification: { color: "var(--status-info)",    Icon: Info },
};

export default function ScopeExclusions() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
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
        ? base44.entities.ScopeItem.filter({ project_id: projectId })
        : base44.entities.ScopeItem.list(),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ScopeItem.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["scope-items"] }); toast.success("Scope item updated"); setShowForm(false); setEditing(null); },
    onError: (e) => toast.error("Failed: " + (e?.message || "Unknown error")),
  });

  // Lightweight checkbox toggle — does not open the form modal. Writes the
  // completed flag + timestamp so we have a record of when each item closed.
  // Completing a row also clears any in-progress flag so the UI stays tidy.
  const toggleCompleteMut = useMutation({
    mutationFn: ({ id, is_completed }) =>
      base44.entities.ScopeItem.update(id, {
        is_completed,
        completed_at: is_completed ? new Date().toISOString() : null,
        ...(is_completed ? { in_progress: false, in_progress_at: null } : {}),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["scope-items"] }); },
    onError: (e) => toast.error("Failed: " + (e?.message || "Unknown error")),
  });

  // Toggle the in-progress flag. If the row is complete, this is a no-op at
  // the UI level (the button is hidden), so we don't guard against it here.
  const toggleInProgressMut = useMutation({
    mutationFn: ({ id, in_progress }) =>
      base44.entities.ScopeItem.update(id, {
        in_progress,
        in_progress_at: in_progress ? new Date().toISOString() : null,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["scope-items"] }); },
    onError: (e) => toast.error("Failed: " + (e?.message || "Unknown error")),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.ScopeItem.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["scope-items"] }); toast.success("Scope item deleted"); setDeleteTarget(null); },
    onError: (e) => toast.error("Failed: " + (e?.message || "Unknown error")),
  });

  const handleSave = (data) => {
    if (editing) updateMut.mutate({ id: editing.id, data });
    // create is handled by ScopeItemFormModal internally
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const applyBulk = async (patch) => {
    if (selectedIds.size === 0) return;
    setBulkActionBusy(true);
    try {
      await Promise.all([...selectedIds].map(id => base44.entities.ScopeItem.update(id, patch)));
      qc.invalidateQueries({ queryKey: ["scope-items"] });
      toast.success(`Updated ${selectedIds.size} item${selectedIds.size === 1 ? "" : "s"}`);
      clearSelection();
    } catch (e) {
      toast.error("Bulk update failed: " + (e?.message || "Unknown error"));
    } finally {
      setBulkActionBusy(false);
    }
  };

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected scope item${selectedIds.size === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setBulkActionBusy(true);
    try {
      await Promise.all([...selectedIds].map(id => base44.entities.ScopeItem.delete(id)));
      qc.invalidateQueries({ queryKey: ["scope-items"] });
      toast.success(`Deleted ${selectedIds.size} item${selectedIds.size === 1 ? "" : "s"}`);
      clearSelection();
    } catch (e) {
      toast.error("Bulk delete failed: " + (e?.message || "Unknown error"));
    } finally {
      setBulkActionBusy(false);
    }
  };

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopeItems.filter((item) => {
      const typeMatch = filterType === "all" || item.item_type === filterType;
      const categoryMatch = filterCategory === "all" || item.category === filterCategory;
      const completedMatch = !hideCompleted || !item.is_completed;
      const searchMatch =
        !q ||
        item.description?.toLowerCase().includes(q) ||
        item.notes?.toLowerCase().includes(q) ||
        item.added_by?.toLowerCase().includes(q) ||
        item.category?.toLowerCase().includes(q);
      return typeMatch && categoryMatch && completedMatch && searchMatch;
    });
  }, [scopeItems, filterType, filterCategory, search, hideCompleted]);

  const stats = {
    total: scopeItems.length,
    scope: scopeItems.filter((i) => i.item_type === "Scope").length,
    exclusion: scopeItems.filter((i) => i.item_type === "Exclusion").length,
    clarification: scopeItems.filter((i) => i.item_type === "Clarification").length,
    completed: scopeItems.filter((i) => i.is_completed).length,
  };

  const types = ["Scope", "Exclusion", "Clarification"];
  const categories = ["Structural", "Misc Metals", "Connections", "Coatings", "Erection", "Engineering", "Other"];

  const openCreate = () => { setEditing(null); setShowForm(true); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CommandBar
        eyebrow={selectedProject ? selectedProject.name : "ALL PROJECTS"}
        title="Scope & Exclusions"
        count={filtered.length}
        unit={` OF ${stats.total}`}
        subtitle={`Contract-defined scope · exclusions · clarifications${stats.completed > 0 ? ` · ${stats.completed} complete` : ""}`}
      >
        <button
          onClick={() => setShowBulk(true)}
          disabled={!projectId}
          title={!projectId ? "Select a project first" : "Bulk import scope items"}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--bg-surface)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-btn)",
            padding: "8px 12px",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            cursor: projectId ? "pointer" : "not-allowed",
            opacity: projectId ? 1 : 0.5,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          <Upload size={12} /> Bulk Import
        </button>
        <button
          onClick={openCreate}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--accent)",
            color: "var(--bg-base)",
            border: "none",
            borderRadius: "var(--radius-btn)",
            padding: "8px 14px",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        >
          <Plus size={12} /> New Item
        </button>
      </CommandBar>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <KpiTile compact label="Total"         value={stats.total}         color="var(--accent)"
                 active={filterType === "all"} onClick={() => setFilterType("all")} />
        <KpiTile compact label="Scope"         value={stats.scope}         color="var(--status-success)"
                 active={filterType === "Scope"} onClick={() => setFilterType(filterType === "Scope" ? "all" : "Scope")} />
        <KpiTile compact label="Exclusion"     value={stats.exclusion}     color="var(--status-error)"
                 active={filterType === "Exclusion"} onClick={() => setFilterType(filterType === "Exclusion" ? "all" : "Exclusion")} />
        <KpiTile compact label="Clarification" value={stats.clarification} color="var(--status-info)"
                 active={filterType === "Clarification"} onClick={() => setFilterType(filterType === "Clarification" ? "all" : "Clarification")} />
      </div>

      {/* Local search */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: 8,
          padding: "8px 12px",
        }}
      >
        <Search size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by keyword — description, notes, category…"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
            fontSize: 12,
          }}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              padding: 2,
            }}
            aria-label="Clear search"
          >
            <X size={12} />
          </button>
        )}
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            paddingLeft: 12,
            borderLeft: "1px solid var(--border-default)",
            marginLeft: 4,
            flexShrink: 0,
            userSelect: "none",
          }}
          title="Hide items that have been marked complete"
        >
          <input
            type="checkbox"
            checked={hideCompleted}
            onChange={(e) => setHideCompleted(e.target.checked)}
            style={{ accentColor: "var(--status-success)", cursor: "pointer" }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              color: "var(--text-secondary)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            Hide Completed
          </span>
        </label>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        {/* Type Filter — segmented control */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "var(--text-muted)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Type:
          </span>
          <div
            style={{
              display: "inline-flex",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: 8,
              padding: 2,
              gap: 2,
            }}
          >
            {["all", ...types].map((type) => {
              const active = filterType === type;
              const meta = TYPE_META[type];
              const Icon = meta?.Icon;
              return (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  style={{
                    background: active ? "var(--accent)" : "transparent",
                    color: active ? "white" : "var(--text-secondary)",
                    border: "none",
                    borderRadius: 6,
                    padding: "6px 12px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "9px",
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {Icon && <Icon size={10} strokeWidth={3} />}
                  {type === "all" ? "All" : type}
                </button>
              );
            })}
          </div>
        </div>

        {/* Category Filter */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", overflowX: "auto" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "var(--text-muted)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            Category:
          </span>
          {["all", ...categories].map((cat) => {
            const active = filterCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                style={{
                  background: active ? "var(--accent)" : "var(--bg-surface)",
                  color: active ? "white" : "var(--text-secondary)",
                  border: `1px solid ${active ? "var(--accent)" : "var(--border-default)"}`,
                  borderRadius: "6px",
                  padding: "6px 12px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  whiteSpace: "nowrap",
                }}
              >
                {cat === "all" ? "All" : cat}
              </button>
            );
          })}
        </div>
      </div>

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
        <div style={{
          position: "sticky", top: 60, zIndex: 20,
          background: "var(--bg-surface)",
          border: "1px solid var(--accent)",
          borderLeft: "3px solid var(--accent)",
          borderRadius: 4,
          padding: "10px 14px",
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {selectedIds.size} SELECTED
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Set Type:
          </span>
          {types.map(t => (
            <button key={t} onClick={() => applyBulk({ item_type: t })} disabled={bulkActionBusy} style={chipBtn}>
              {t}
            </button>
          ))}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Set Category:
          </span>
          <select
            disabled={bulkActionBusy}
            onChange={(e) => { if (e.target.value) applyBulk({ category: e.target.value }); e.target.value = ""; }}
            style={{
              background: "var(--bg-page)", border: "1px solid var(--border-default)", borderRadius: 2,
              padding: "4px 8px", color: "var(--text-primary)",
              fontFamily: "var(--font-mono)", fontSize: 10,
            }}
            defaultValue=""
          >
            <option value="">—</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={() => applyBulk({ in_progress: true, in_progress_at: new Date().toISOString() })} disabled={bulkActionBusy} style={chipBtn}>
            Mark In Progress
          </button>
          <button onClick={() => applyBulk({ in_progress: false, in_progress_at: null })} disabled={bulkActionBusy} style={chipBtn}>
            Clear In Progress
          </button>
          <button onClick={() => applyBulk({ is_completed: true, completed_at: new Date().toISOString(), in_progress: false, in_progress_at: null })} disabled={bulkActionBusy} style={chipBtn}>
            Mark Complete
          </button>
          <button onClick={() => applyBulk({ is_completed: false, completed_at: null })} disabled={bulkActionBusy} style={chipBtn}>
            Mark Incomplete
          </button>
          <button onClick={bulkDelete} disabled={bulkActionBusy} style={{ ...chipBtn, color: "var(--status-error)", borderColor: "var(--status-error)" }}>
            Delete
          </button>
          <button onClick={clearSelection} style={{ ...chipBtn, marginLeft: "auto" }}>
            Clear
          </button>
        </div>
      )}

      {/* Scope Items List */}
      <ScopeItemList
        items={filtered}
        totalCount={stats.total}
        hasActiveFilters={filterType !== "all" || filterCategory !== "all" || !!search.trim() || hideCompleted}
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

const chipBtn = {
  background: "var(--bg-page)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-default)",
  borderRadius: 2,
  padding: "4px 10px",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  cursor: "pointer",
};
