import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "../components/shared/useProjectContext";
import { toast } from "sonner";
import DeleteDialog from "@/components/shared/DeleteDialog";
import ResourceFormModal from "@/components/resources/ResourceFormModal";

const panel = {
  background: "linear-gradient(180deg, rgba(31,33,37,0.96), rgba(12,14,17,0.98))",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card)",
};

const STATUS_TONE = {
  Available: "var(--status-success)",
  Allocated: "var(--secondary)",
  "Over-Allocated": "var(--status-error)",
  "On Leave": "var(--status-warning)",
};

export default function Equipment() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: resources = [] } = useQuery({
    queryKey: ["resources", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.Resource.filter({ project_id: projectId, resource_type: "Equipment" }, "-created_date")
        : [],
    initialData: [],
    enabled: !!projectId,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Resource.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resources"] });
      toast.success("Equipment updated");
      setShowForm(false);
      setEditing(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Resource.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resources"] });
      toast.success("Equipment removed");
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const selectedProject = projectId ? projects.find((p) => p.id === projectId) : null;

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return resources.filter((resource) => {
      const matchesStatus = statusFilter === "all" || resource.availability_status === statusFilter;
      const matchesSearch =
        !term ||
        resource.name?.toLowerCase().includes(term) ||
        resource.role?.toLowerCase().includes(term) ||
        resource.notes?.toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [resources, search, statusFilter]);

  const metrics = useMemo(
    () => ({
      total: resources.length,
      available: resources.filter((r) => r.availability_status === "Available").length,
      allocated: resources.filter((r) => r.availability_status === "Allocated").length,
      overloaded: resources.filter((r) => r.availability_status === "Over-Allocated").length,
      avgUtilization: resources.length
        ? Math.round(
            resources.reduce((sum, resource) => {
              const budget = Number(resource.budget_hours || 0);
              const actual = Number(resource.actual_hours || 0);
              return sum + (budget ? Math.min(200, Math.round((actual / budget) * 100)) : 0);
            }, 0) / resources.length
          )
        : 0,
    }),
    [resources]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <section
        style={{
          ...panel,
          padding: 24,
          background:
            "radial-gradient(circle at top right, rgba(0,229,255,0.12), transparent 30%), radial-gradient(circle at left center, rgba(255,107,0,0.14), transparent 26%), linear-gradient(180deg, rgba(31,33,37,0.96), rgba(9,10,11,0.99))",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 0.85fr)", gap: 20 }}>
          <div>
            <div style={eyebrow}>Equipment Tracker</div>
            <h1 style={heroTitle}>Track project equipment, utilization, and availability from a dedicated page.</h1>
            <p style={heroText}>
              This closes the missing equipment-page gap with a real tracker for cranes, lifts, forklifts, welding rigs, and rental gear tied to project operations.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 18 }}>
              <MetricCard label="Total Units" value={metrics.total} tone="var(--text-primary)" />
              <MetricCard label="Available" value={metrics.available} tone="var(--status-success)" />
              <MetricCard label="Allocated" value={metrics.allocated} tone="var(--secondary)" />
              <MetricCard label="Overloaded" value={metrics.overloaded} tone={metrics.overloaded ? "var(--status-error)" : "var(--text-muted)"} />
            </div>
          </div>

          <div style={{ ...panel, padding: 18, background: "rgba(12,14,17,0.82)" }}>
            <div style={sectionLabel}>Project Scope</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>
              {selectedProject?.name || activeProject?.name || "Current Project"}
            </div>
            <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
              <InfoRow label="Visible Units" value={filtered.length} />
              <InfoRow label="Average Utilization" value={`${metrics.avgUtilization}%`} tone="var(--accent)" />
              <InfoRow label="Risk Count" value={metrics.overloaded} tone={metrics.overloaded ? "var(--status-error)" : "var(--text-primary)"} />
            </div>
            <button
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
              style={primaryBtn}
            >
              Create Equipment
            </button>
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 18, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ ...panel, padding: 18 }}>
            <div style={sectionLabel}>Filters</div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) auto", gap: 12, alignItems: "center" }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search equipment, trade, or notes..."
              />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All Statuses</option>
                <option value="Available">Available</option>
                <option value="Allocated">Allocated</option>
                <option value="Over-Allocated">Over-Allocated</option>
                <option value="On Leave">On Leave</option>
              </select>
            </div>
          </div>

          <div style={{ ...panel, padding: 18 }}>
            <div style={sectionLabel}>Equipment Ledger</div>
            <div style={{ display: "grid", gap: 12 }}>
              {filtered.length ? (
                filtered.map((resource) => {
                  const budget = Number(resource.budget_hours || 0);
                  const actual = Number(resource.actual_hours || 0);
                  const utilization = budget ? Math.min(200, Math.round((actual / budget) * 100)) : 0;
                  const tone = STATUS_TONE[resource.availability_status] || "var(--text-muted)";
                  return (
                    <div key={resource.id} style={{ background: "var(--bg-surface)", border: "1px solid var(--divider)", borderRadius: "var(--radius-card)", padding: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>
                            {resource.name}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                            {resource.role || "No trade/type specified"}
                          </div>
                        </div>
                        <span style={{ padding: "4px 8px", borderRadius: 999, background: `${tone}22`, border: `1px solid ${tone}33`, color: tone, fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          {resource.availability_status}
                        </span>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginTop: 14 }}>
                        <DataCell label="Budget Hours" value={`${budget || 0}h`} />
                        <DataCell label="Actual Hours" value={`${actual || 0}h`} />
                        <DataCell label="Forecast" value={`${Number(resource.forecast_hours || 0)}h`} />
                        <DataCell label="Rate" value={resource.hourly_rate ? `$${Number(resource.hourly_rate).toFixed(2)}` : "-"} />
                      </div>

                      <div style={{ marginTop: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={miniLabel}>Utilization</span>
                          <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, color: utilization > 100 ? "var(--status-error)" : "var(--accent)" }}>{utilization}%</span>
                        </div>
                        <div style={{ height: 6, background: "var(--bg-surface-highest)", borderRadius: 999, overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(utilization, 100)}%`, height: "100%", background: utilization > 100 ? "var(--status-error)" : "var(--accent)" }} />
                        </div>
                      </div>

                      {resource.notes && (
                        <div style={{ marginTop: 14, fontSize: 12, lineHeight: 1.6, color: "var(--text-secondary)" }}>
                          {resource.notes}
                        </div>
                      )}

                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
                        <button
                          onClick={() => {
                            setEditing(resource);
                            setShowForm(true);
                          }}
                          style={tinyBtn}
                        >
                          Edit
                        </button>
                        <button onClick={() => setDeleteTarget(resource)} style={{ ...tinyBtn, borderColor: "var(--danger-border)", color: "var(--status-error)" }}>
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "12px 4px" }}>
                  No equipment records in the current view.
                </div>
              )}
            </div>
          </div>
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ ...panel, padding: 18 }}>
            <div style={sectionLabel}>Risk Watch</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.filter((r) => r.availability_status === "Over-Allocated").slice(0, 5).map((resource) => (
                <div key={resource.id} style={riskCard}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>{resource.name}</div>
                  <div style={{ fontSize: 11, lineHeight: 1.55, color: "var(--text-secondary)" }}>{resource.role || "Equipment"} · {resource.availability_status}</div>
                </div>
              ))}
              {!filtered.some((r) => r.availability_status === "Over-Allocated") && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                  No overloaded equipment in the current view.
                </div>
              )}
            </div>
          </div>
        </aside>
      </section>

      {showForm && (
        editing ? (
          <ResourceFormModal
            projectId={projectId}
            resource={editing}
            defaultType="Equipment"
            title="Edit Equipment"
            submitLabel="Save Equipment"
            isSaving={updateMut.isPending}
            onSave={(payload) => updateMut.mutate({ id: editing.id, data: payload })}
            onClose={() => {
              setShowForm(false);
              setEditing(null);
            }}
          />
        ) : (
          <ResourceFormModal
            projectId={projectId}
            defaultType="Equipment"
            title="Create Equipment"
            submitLabel="Create Equipment"
            onClose={() => {
              setShowForm(false);
              setEditing(null);
            }}
          />
        )
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteMut.isPending && deleteTarget?.id) deleteMut.mutate(deleteTarget.id);
        }}
        title="Delete Equipment"
        description={`Delete ${deleteTarget?.name || "this equipment record"}?`}
      />
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

function DataCell({ label, value }) {
  return (
    <div>
      <div style={miniLabel}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{value}</div>
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

const heroTitle = {
  fontFamily: "var(--font-display)",
  fontSize: "clamp(30px,4vw,48px)",
  fontWeight: 800,
  lineHeight: 1.02,
  letterSpacing: "-0.04em",
  margin: 0,
  color: "var(--text-primary)",
};

const heroText = {
  margin: "12px 0 0",
  maxWidth: 760,
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

const miniLabel = {
  fontFamily: "var(--font-body)",
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginBottom: 6,
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

const tinyBtn = {
  background: "transparent",
  border: "1px solid var(--border-default)",
  borderRadius: 4,
  padding: "4px 8px",
  color: "var(--text-muted)",
  fontFamily: "var(--font-body)",
  fontSize: 9,
  fontWeight: 700,
  cursor: "pointer",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const riskCard = {
  padding: "10px 12px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid var(--divider)",
  borderRadius: "var(--radius-card)",
};
