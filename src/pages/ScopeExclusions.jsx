import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "@/components/shared/useProjectContext";
import ScopeItemFormModal from "@/components/scope/ScopeItemFormModal";
import ScopeItemList from "@/components/scope/ScopeItemList";

export default function ScopeExclusions() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const [showForm, setShowForm] = useState(false);
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
          onClick={() => setShowForm(true)}
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
        <ScopeItemFormModal projectId={projectId} onClose={() => setShowForm(false)} />
      )}

      {/* Scope Items List */}
      <ScopeItemList items={filtered} />
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
