import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "@/components/shared/useProjectContext";
import ScopeItemFormModal from "@/components/scope/ScopeItemFormModal";
import ScopeItemList from "@/components/scope/ScopeItemList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { toast } from "sonner";
import { Check, X, Info, Layers, Search, Plus } from "lucide-react";

const TYPE_META = {
  Scope:         { color: "var(--status-success)", Icon: Check },
  Exclusion:     { color: "var(--status-error)",   Icon: X },
  Clarification: { color: "var(--status-info)",    Icon: Info },
};

export default function ScopeExclusions() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
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
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ScopeItem.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["scope-items"] }); toast.success("Scope item updated"); setShowForm(false); setEditing(null); },
    onError: (e) => toast.error("Failed: " + (e?.message || "Unknown error")),
  });

  // Lightweight checkbox toggle — does not open the form modal. Writes the
  // completed flag + timestamp so we have a record of when each item closed.
  const toggleCompleteMut = useMutation({
    mutationFn: ({ id, is_completed }) =>
      base44.entities.ScopeItem.update(id, {
        is_completed,
        completed_at: is_completed ? new Date().toISOString() : null,
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
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 24,
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Scope & Exclusions
          </h1>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--text-secondary)",
              marginTop: 4,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {selectedProject ? selectedProject.name : "All Projects"} • {filtered.length} of {stats.total} Items
            {stats.total > 0 && (
              <> • <span style={{ color: "var(--status-success)" }}>{stats.completed} Complete</span></>
            )}
          </p>
        </div>

        <button
          onClick={openCreate}
          style={{
            background: "var(--accent)",
            color: "white",
            border: "none",
            borderRadius: "8px",
            padding: "8px 16px",
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            fontWeight: 700,
            cursor: "pointer",
            transition: "background 0.15s",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        >
          <Plus size={12} strokeWidth={3} /> New Item
        </button>
      </div>

      {/* Stats — clickable filters */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
        <StatCard
          label="Total"
          value={stats.total}
          color="var(--accent)"
          Icon={Layers}
          active={filterType === "all"}
          onClick={() => setFilterType("all")}
        />
        <StatCard
          label="Scope"
          value={stats.scope}
          color="var(--status-success)"
          Icon={Check}
          active={filterType === "Scope"}
          onClick={() => setFilterType(filterType === "Scope" ? "all" : "Scope")}
        />
        <StatCard
          label="Exclusion"
          value={stats.exclusion}
          color="var(--status-error)"
          Icon={X}
          active={filterType === "Exclusion"}
          onClick={() => setFilterType(filterType === "Exclusion" ? "all" : "Exclusion")}
        />
        <StatCard
          label="Clarification"
          value={stats.clarification}
          color="var(--status-info)"
          Icon={Info}
          active={filterType === "Clarification"}
          onClick={() => setFilterType(filterType === "Clarification" ? "all" : "Clarification")}
        />
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

function StatCard({ label, value, color, Icon, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? `${color}14` : "var(--bg-surface)",
        border: `1px solid ${active ? color : "var(--border-default)"}`,
        borderTop: `2px solid ${color}`,
        borderRadius: "10px",
        padding: "12px 14px",
        textAlign: "left",
        cursor: "pointer",
        transition: "all 0.15s",
        display: "flex",
        alignItems: "center",
        gap: 12,
        boxShadow: active ? `0 0 0 1px ${color}40` : "none",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.borderColor = `${color}80`;
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.borderColor = "var(--border-default)";
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: `${color}20`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: color,
          flexShrink: 0,
        }}
      >
        {Icon && <Icon size={16} strokeWidth={2.5} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "20px",
            fontWeight: 700,
            color: color,
            lineHeight: 1,
            marginBottom: 4,
            fontFamily: "var(--font-mono)",
          }}
        >
          {value}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "9px",
            color: active ? color : "var(--text-secondary)",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          {label}
        </div>
      </div>
    </button>
  );
}
