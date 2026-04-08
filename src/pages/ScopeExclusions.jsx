import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "@/components/shared/useProjectContext";
import ScopeItemFormModal from "@/components/scope/ScopeItemFormModal";
import ScopeItemList from "@/components/scope/ScopeItemList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { toast } from "sonner";

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

  const filtered = scopeItems.filter((item) => {
    const typeMatch = filterType === "all" || item.item_type === filterType;
    const categoryMatch = filterCategory === "all" || item.category === filterCategory;
    return typeMatch && categoryMatch;
  });

  const stats = {
    total: scopeItems.length,
    scope: scopeItems.filter((i) => i.item_type === "Scope").length,
    exclusion: scopeItems.filter((i) => i.item_type === "Exclusion").length,
    clarification: scopeItems.filter((i) => i.item_type === "Clarification").length,
  };

  const types = ["Scope", "Exclusion", "Clarification"];
  const categories = ["Structural", "Misc Metals", "Connections", "Coatings", "Erection", "Engineering", "Other"];

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
              fontSize: 10,
              color: "var(--text-muted)",
              marginTop: 4,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {selectedProject ? selectedProject.name : "All Projects"} • {filtered.length} Items
          </p>
        </div>

        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
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
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        >
          + New Item
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
        <StatCard label="Total" value={stats.total} color="var(--accent)" />
        <StatCard label="Scope" value={stats.scope} color="var(--status-success)" />
        <StatCard label="Exclusion" value={stats.exclusion} color="var(--status-error)" />
        <StatCard label="Clarification" value={stats.clarification} color="var(--status-info)" />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        {/* Type Filter */}
        <div style={{ display: "flex", gap: "8px" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "var(--text-muted)",
              alignSelf: "center",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Type:
          </span>
          {["all", ...types].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              style={{
                background: filterType === type ? "var(--accent)" : "var(--bg-surface)",
                color: filterType === type ? "white" : "var(--text-secondary)",
                border: `1px solid ${filterType === type ? "var(--accent)" : "var(--border-default)"}`,
                borderRadius: "6px",
                padding: "6px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: "8px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {type === "all" ? "All" : type}
            </button>
          ))}
        </div>

        {/* Category Filter */}
        <div style={{ display: "flex", gap: "8px", overflowX: "auto" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "var(--text-muted)",
              alignSelf: "center",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            Category:
          </span>
          {["all", ...categories].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              style={{
                background: filterCategory === cat ? "var(--accent)" : "var(--bg-surface)",
                color: filterCategory === cat ? "white" : "var(--text-secondary)",
                border: `1px solid ${filterCategory === cat ? "var(--accent)" : "var(--border-default)"}`,
                borderRadius: "6px",
                padding: "6px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: "8px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                whiteSpace: "nowrap",
              }}
            >
              {cat === "all" ? "All" : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <ScopeItemFormModal projectId={projectId} editing={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSave={handleSave} />
      )}

      {/* Scope Items List */}
      <ScopeItemList items={filtered} onEdit={(item) => { setEditing(item); setShowForm(true); }} onDelete={setDeleteTarget} />

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

function StatCard({ label, value, color }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "10px",
        padding: "12px",
        borderTop: `2px solid ${color}`,
      }}
    >
      <div
        style={{
          fontSize: "18px",
          fontWeight: 700,
          color: color,
          marginBottom: "4px",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "8px",
          color: "var(--text-muted)",
          letterSpacing: "0.10em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
    </div>
  );
}
