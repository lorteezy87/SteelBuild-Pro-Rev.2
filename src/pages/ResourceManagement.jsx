import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import ResourceFormModal from "@/components/resources/ResourceFormModal";
import ResourceList from "@/components/resources/ResourceList";

export default function ResourceManagement() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project");
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: resources = [] } = useQuery({
    queryKey: ["resources", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.Resource.filter({ project_id: projectId })
        : base44.entities.Resource.list(),
    initialData: [],
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  const filtered = resources.filter((r) => {
    const typeMatch = filterType === "all" || r.resource_type === filterType;
    const statusMatch = filterStatus === "all" || r.availability_status === filterStatus;
    return typeMatch && statusMatch;
  });

  const stats = {
    total: resources.length,
    labor: resources.filter((r) => r.resource_type === "Labor").length,
    equipment: resources.filter((r) => r.resource_type === "Equipment").length,
    subcontractor: resources.filter((r) => r.resource_type === "Subcontractor").length,
    material: resources.filter((r) => r.resource_type === "Material").length,
    available: resources.filter((r) => r.availability_status === "Available").length,
    allocated: resources.filter((r) => r.availability_status === "Allocated").length,
    overAllocated: resources.filter((r) => r.availability_status === "Over-Allocated").length,
  };

  const types = ["Labor", "Equipment", "Subcontractor", "Material"];
  const statuses = ["Available", "Allocated", "Over-Allocated", "On Leave"];

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
            Resource Management
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
            {selectedProject ? selectedProject.name : "All Projects"} • {filtered.length} Resources
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
          + Add Resource
        </button>
      </div>

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "12px" }}>
        <StatCard label="Total" value={stats.total} color="var(--accent)" />
        <StatCard label="Labor" value={stats.labor} color="var(--status-info)" />
        <StatCard label="Equipment" value={stats.equipment} color="var(--status-warning)" />
        <StatCard label="Subs" value={stats.subcontractor} color="var(--accent)" />
        <StatCard label="Available" value={stats.available} color="var(--status-success)" />
        <StatCard label="Allocated" value={stats.allocated} color="var(--status-info)" />
        <StatCard label="Over-Allocated" value={stats.overAllocated} color="var(--status-error)" />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
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
            Status:
          </span>
          {["all", ...statuses].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              style={{
                background: filterStatus === status ? "var(--accent)" : "var(--bg-surface)",
                color: filterStatus === status ? "white" : "var(--text-secondary)",
                border: `1px solid ${filterStatus === status ? "var(--accent)" : "var(--border-default)"}`,
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
              {status === "all" ? "All" : status}
            </button>
          ))}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <ResourceFormModal projectId={projectId} onClose={() => setShowForm(false)} />
      )}

      {/* Resources List */}
      <ResourceList resources={filtered} />
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