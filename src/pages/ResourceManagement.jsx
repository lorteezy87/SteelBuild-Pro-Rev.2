import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "../components/shared/useProjectContext";
import ResourceFormModal from "@/components/resources/ResourceFormModal";
import ResourceList from "@/components/resources/ResourceList";

const panel = {
  background: "linear-gradient(180deg, rgba(31,33,37,0.96), rgba(12,14,17,0.98))",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card)",
};

const resourceTypes = ["Labor", "Equipment", "Subcontractor", "Material"];
const statuses = ["Available", "Allocated", "Over-Allocated", "On Leave"];

export default function ResourceManagement() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");

  const { data: resources = [] } = useQuery({
    queryKey: ["resources", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.Resource.filter({ project_id: projectId }, "-created_date")
        : base44.entities.Resource.list("-created_date"),
    initialData: [],
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const selectedProject = projectId ? projects.find((p) => p.id === projectId) : null;

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return resources.filter((resource) => {
      const typeMatch = filterType === "all" || resource.resource_type === filterType;
      const statusMatch = filterStatus === "all" || resource.availability_status === filterStatus;
      const searchMatch =
        !term ||
        resource.name?.toLowerCase().includes(term) ||
        resource.role?.toLowerCase().includes(term) ||
        resource.notes?.toLowerCase().includes(term);
      return typeMatch && statusMatch && searchMatch;
    });
  }, [resources, filterType, filterStatus, search]);

  const stats = useMemo(
    () => ({
      total: resources.length,
      labor: resources.filter((r) => r.resource_type === "Labor").length,
      equipment: resources.filter((r) => r.resource_type === "Equipment").length,
      subcontractor: resources.filter((r) => r.resource_type === "Subcontractor").length,
      available: resources.filter((r) => r.availability_status === "Available").length,
      allocated: resources.filter((r) => r.availability_status === "Allocated").length,
      overAllocated: resources.filter((r) => r.availability_status === "Over-Allocated").length,
    }),
    [resources]
  );

  const pressureList = useMemo(
    () => filtered.filter((resource) => resource.availability_status === "Over-Allocated").slice(0, 5),
    [filtered]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <section
        style={{
          ...panel,
          padding: 24,
          background:
            "radial-gradient(circle at top right, rgba(0,229,255,0.12), transparent 30%), radial-gradient(circle at left center, rgba(255,107,0,0.12), transparent 26%), linear-gradient(180deg, rgba(31,33,37,0.96), rgba(9,10,11,0.99))",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 0.85fr)", gap: 20 }}>
          <div>
            <div style={eyebrow}>Resource Command</div>
            <h1 style={titleStyle}>Crew, equipment, and outside support on one operational roster.</h1>
            <p style={bodyStyle}>
              This page now acts like a resourcing workspace: visibility into allocation pressure, resource mix, and manpower coverage instead of a thin register.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 18 }}>
              <MetricCard label="Total" value={stats.total} tone="var(--text-primary)" />
              <MetricCard label="Labor" value={stats.labor} tone="var(--secondary)" />
              <MetricCard label="Equipment" value={stats.equipment} tone="var(--status-warning)" />
              <MetricCard label="Over-Allocated" value={stats.overAllocated} tone={stats.overAllocated ? "var(--status-error)" : "var(--text-muted)"} />
            </div>
          </div>

          <div style={{ ...panel, padding: 18, background: "rgba(12,14,17,0.82)" }}>
            <div style={sectionLabel}>Resource Mix</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>
              {selectedProject?.name || "Portfolio Resource View"}
            </div>
            <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
              <InfoRow label="Available" value={stats.available} tone="var(--status-success)" />
              <InfoRow label="Allocated" value={stats.allocated} tone="var(--accent)" />
              <InfoRow label="Subcontractors" value={stats.subcontractor} tone="var(--secondary)" />
            </div>
            <button onClick={() => setShowForm(true)} style={primaryBtn}>
              Create Resource
            </button>
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 18, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ ...panel, padding: 18 }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) auto auto", gap: 12, alignItems: "center" }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, role, or notes..."
              />
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="all">All Types</option>
                {resourceTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="all">All Statuses</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ ...panel, padding: 18 }}>
            <div style={sectionLabel}>Resource Ledger</div>
            <ResourceList resources={filtered} onCreate={() => setShowForm(true)} />
          </div>
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ ...panel, padding: 18 }}>
            <div style={sectionLabel}>Allocation Pressure</div>
            {pressureList.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {pressureList.map((resource) => (
                  <div key={resource.id} style={noteCard}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
                      {resource.name}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                      {resource.resource_type}
                      {resource.role ? ` · ${resource.role}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                No over-allocated resources are visible in the current filtered view.
              </div>
            )}
          </div>
        </aside>
      </section>

      {showForm && <ResourceFormModal projectId={projectId} onClose={() => setShowForm(false)} />}
    </div>
  );
}

function MetricCard({ label, value, tone }) {
  return (
    <div style={{ ...panel, padding: 16, background: "rgba(12,14,17,0.78)" }}>
      <div style={sectionLabel}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 800, lineHeight: 1, color: tone }}>{value}</div>
    </div>
  );
}

function InfoRow({ label, value, tone = "var(--text-primary)" }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: "1px solid var(--divider)", paddingBottom: 8 }}>
      <span style={{ fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, color: tone }}>{value}</span>
    </div>
  );
}

const eyebrow = {
  fontFamily: "var(--font-body)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--secondary)",
  marginBottom: 10,
};

const titleStyle = {
  fontFamily: "var(--font-display)",
  fontSize: "clamp(30px,4vw,48px)",
  fontWeight: 800,
  lineHeight: 1.02,
  letterSpacing: "-0.04em",
  margin: 0,
  color: "var(--text-primary)",
};

const bodyStyle = {
  margin: "12px 0 0",
  maxWidth: 720,
  fontSize: 15,
  lineHeight: 1.6,
  color: "var(--text-secondary)",
};

const sectionLabel = {
  fontFamily: "var(--font-body)",
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginBottom: 10,
};

const primaryBtn = {
  width: "100%",
  background: "var(--accent)",
  color: "var(--on-accent)",
  border: "none",
  borderRadius: "var(--radius-btn)",
  padding: "9px 16px",
  fontFamily: "var(--font-body)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  cursor: "pointer",
};

const noteCard = {
  padding: "10px 12px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid var(--divider)",
  borderRadius: "var(--radius-card)",
};
