import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "@/components/shared/useProjectContext";
import ResourceFormModal from "@/components/resources/ResourceFormModal";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { formatDate } from "@/components/shared/formatters";
import { toast } from "sonner";

const mono = { fontFamily: "var(--font-mono)" };
const body = { fontFamily: "var(--font-body)" };

const RESOURCE_TYPES = ["Labor", "Equipment", "Subcontractor", "Material"];
const RESOURCE_STATUSES = ["Available", "Allocated", "Over-Allocated", "On Leave"];
const PHASES = ["Detailing", "Fabrication", "Delivery", "Erection"];

const TYPE_COLORS = {
  Labor: "var(--status-info)",
  Equipment: "var(--status-warning)",
  Subcontractor: "var(--accent)",
  Material: "var(--status-success)",
};

const STATUS_COLORS = {
  Available: "var(--status-success)",
  Allocated: "var(--status-info)",
  "Over-Allocated": "var(--status-error)",
  "On Leave": "var(--text-muted)",
};

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safeNumber(value));
}

function MetricCard({ label, value, detail, tone = "var(--accent)" }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        padding: "14px 16px",
        borderTop: `2px solid ${tone}`,
      }}
    >
      <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ ...mono, fontSize: 18, fontWeight: 700, color: tone, marginBottom: 4 }}>{value}</div>
      {detail ? <div style={{ ...body, fontSize: 11, color: "var(--text-secondary)" }}>{detail}</div> : null}
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? "var(--accent)" : "var(--bg-surface-low)",
        color: active ? "#0A0A0B" : "var(--text-secondary)",
        border: `1px solid ${active ? "var(--accent-border)" : "var(--border-default)"}`,
        borderRadius: "var(--radius-btn)",
        padding: "8px 12px",
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function ActionButton({ label, onClick, tone = "default" }) {
  const styles =
    tone === "accent"
      ? { background: "var(--accent)", border: "1px solid var(--accent-border)", color: "#0A0A0B" }
      : { background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" };

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...styles,
        borderRadius: "var(--radius-btn)",
        padding: "8px 12px",
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

export default function ResourceManagement({ initialTab = "overview" }) {
  const qc = useQueryClient();
  const { activeProject } = useProjectContext();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project") || activeProject?.id || null;

  const [activeTab, setActiveTab] = useState(initialTab);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [assignmentFilter, setAssignmentFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingResource, setEditingResource] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [pendingAssignments, setPendingAssignments] = useState({});

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const { data: resources = [], isLoading: loadingResources } = useQuery({
    queryKey: ["resources", projectId],
    queryFn: () => (projectId ? base44.entities.Resource.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
    initialData: [],
  });

  const { data: workPackages = [], isLoading: loadingWorkPackages } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: () => (projectId ? base44.entities.WorkPackage.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
    initialData: [],
  });

  const selectedProject = useMemo(() => projects.find((project) => project.id === projectId), [projectId, projects]);

  const deleteResourceMut = useMutation({
    mutationFn: (id) => base44.entities.Resource.delete(id),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["resources"] }),
        qc.invalidateQueries({ queryKey: ["work-packages"] }),
      ]);
      toast.success("Resource deleted");
      setDeleteTarget(null);
    },
    onError: (error) => toast.error(error?.message || "Failed to delete resource"),
  });

  const assignWorkPackageMut = useMutation({
    mutationFn: ({ id, crew }) => base44.entities.WorkPackage.update(id, { crew }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["work-packages"] });
      toast.success("Assignment saved");
    },
    onError: (error) => toast.error(error?.message || "Failed to save assignment"),
  });

  const filteredResources = useMemo(() => {
    const query = search.trim().toLowerCase();
    return resources.filter((resource) => {
      const matchesType = typeFilter === "all" || resource.resource_type === typeFilter;
      const matchesStatus = statusFilter === "all" || resource.availability_status === statusFilter;
      const matchesSearch = !query || [resource.name, resource.role, resource.notes].some((value) => String(value || "").toLowerCase().includes(query));
      return matchesType && matchesStatus && matchesSearch;
    });
  }, [resources, search, statusFilter, typeFilter]);

  const assignmentRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return workPackages
      .filter((workPackage) => {
        const matchesPhase = phaseFilter === "all" || workPackage.phase === phaseFilter;
        const matchesAssignment =
          assignmentFilter === "all" ||
          (assignmentFilter === "assigned" && !!workPackage.crew) ||
          (assignmentFilter === "unassigned" && !workPackage.crew);
        const matchesSearch = !query || [workPackage.wp_number, workPackage.name, workPackage.crew, workPackage.phase].some((value) => String(value || "").toLowerCase().includes(query));
        return matchesPhase && matchesAssignment && matchesSearch;
      })
      .sort((a, b) => {
        const phaseCompare = String(a.phase || "").localeCompare(String(b.phase || ""));
        if (phaseCompare !== 0) return phaseCompare;
        return String(a.wp_number || "").localeCompare(String(b.wp_number || ""));
      });
  }, [assignmentFilter, phaseFilter, search, workPackages]);

  const metrics = useMemo(() => {
    const total = resources.length;
    const labor = resources.filter((resource) => resource.resource_type === "Labor").length;
    const equipment = resources.filter((resource) => resource.resource_type === "Equipment").length;
    const subcontractors = resources.filter((resource) => resource.resource_type === "Subcontractor").length;
    const allocated = resources.filter((resource) => resource.availability_status === "Allocated").length;
    const overAllocated = resources.filter((resource) => resource.availability_status === "Over-Allocated").length;
    const budgetHours = resources.reduce((sum, resource) => sum + safeNumber(resource.budget_hours), 0);
    const actualHours = resources.reduce((sum, resource) => sum + safeNumber(resource.actual_hours), 0);
    const forecastHours = resources.reduce((sum, resource) => sum + safeNumber(resource.forecast_hours), 0);
    const assignedPackages = workPackages.filter((workPackage) => !!workPackage.crew).length;
    const unassignedPackages = workPackages.filter((workPackage) => !workPackage.crew).length;
    return { total, labor, equipment, subcontractors, allocated, overAllocated, budgetHours, actualHours, forecastHours, assignedPackages, unassignedPackages };
  }, [resources, workPackages]);

  const utilizationWatch = useMemo(() => {
    return resources
      .map((resource) => {
        const budget = safeNumber(resource.budget_hours);
        const actual = safeNumber(resource.actual_hours);
        const forecast = safeNumber(resource.forecast_hours);
        const projected = Math.max(actual, forecast || actual);
        const utilization = budget > 0 ? (projected / budget) * 100 : 0;
        const assignedWork = workPackages.filter((workPackage) => workPackage.crew === resource.name).length;
        return { ...resource, utilization, assignedWork, projected };
      })
      .filter((resource) => resource.utilization >= 85 || resource.availability_status === "Over-Allocated" || resource.assignedWork > 0)
      .sort((a, b) => b.utilization - a.utilization);
  }, [resources, workPackages]);

  const phaseSummary = useMemo(() => {
    return PHASES.map((phase) => {
      const phasePackages = workPackages.filter((workPackage) => workPackage.phase === phase);
      const assigned = phasePackages.filter((workPackage) => !!workPackage.crew).length;
      return { phase, total: phasePackages.length, assigned, unassigned: phasePackages.length - assigned };
    });
  }, [workPackages]);

  const assignableResources = useMemo(() => resources.filter((resource) => resource.resource_type !== "Material"), [resources]);

  const activeAssignmentValue = (workPackage) => pendingAssignments[workPackage.id] ?? workPackage.crew ?? "";

  const saveAssignment = async (workPackage) => {
    const crew = activeAssignmentValue(workPackage);
    await assignWorkPackageMut.mutateAsync({ id: workPackage.id, crew });
    setPendingAssignments((current) => {
      const next = { ...current };
      delete next[workPackage.id];
      return next;
    });
  };

  if (!projectId) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ ...mono, fontSize: 12, color: "var(--accent)", letterSpacing: "0.12em", textTransform: "uppercase" }}>Select A Project</div>
        <div style={{ ...body, fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
          Resources are managed against the active project so crew, equipment, and work package assignments stay tied to one job.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.35fr 0.7fr",
          gap: 16,
          background: "linear-gradient(135deg, rgba(255,122,0,0.14), rgba(0,184,217,0.10))",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          padding: 16,
        }}
      >
        <div>
          <div style={{ ...mono, fontSize: 8, color: "var(--accent)", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 8 }}>
            Resource Command
          </div>
          <div style={{ ...body, fontSize: 24, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.2, marginBottom: 8 }}>
            Crew, equipment, and outside support on one operational roster.
          </div>
          <div style={{ ...body, fontSize: 12, color: "var(--text-secondary)", maxWidth: 760 }}>
            This page now acts like a real resourcing workspace: maintain the project roster, assign work packages without drag-and-drop fragility, and see where labor or equipment pressure is building before schedule slips.
          </div>
        </div>
        <div
          style={{
            background: "rgba(12,14,18,0.72)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-card)",
            padding: 14,
          }}
        >
          <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
            Resource Mix
          </div>
          <div style={{ ...body, fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 10 }}>
            {selectedProject?.name || "Project"}
          </div>
          {[
            ["Available", resources.filter((resource) => resource.availability_status === "Available").length, "var(--status-success)"],
            ["Allocated", metrics.allocated, "var(--accent)"],
            ["Subcontractors", metrics.subcontractors, "var(--status-info)"],
          ].map(([label, value, color]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--divider)" }}>
              <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
              <span style={{ ...mono, fontSize: 12, color }}>{value}</span>
            </div>
          ))}
          <div style={{ marginTop: 12 }}>
            <ActionButton label="Create Resource" tone="accent" onClick={() => { setEditingResource(null); setFormOpen(true); }} />
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <MetricCard label="Total" value={metrics.total} detail={`${metrics.labor} labor • ${metrics.equipment} equipment`} />
        <MetricCard label="Labor Budget" value={`${formatNumber(metrics.budgetHours)}h`} detail={`Actual ${formatNumber(metrics.actualHours)}h`} tone="var(--status-info)" />
        <MetricCard label="Forecast Hours" value={`${formatNumber(metrics.forecastHours)}h`} detail={`${metrics.overAllocated} over-allocated`} tone="var(--status-warning)" />
        <MetricCard label="Assigned Work Packages" value={metrics.assignedPackages} detail={`${metrics.unassignedPackages} still need an owner`} tone={metrics.unassignedPackages > 0 ? "var(--status-warning)" : "var(--status-success)"} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <TabButton active={activeTab === "overview"} onClick={() => setActiveTab("overview")}>Overview</TabButton>
          <TabButton active={activeTab === "resources"} onClick={() => setActiveTab("resources")}>Roster</TabButton>
          <TabButton active={activeTab === "assignments"} onClick={() => setActiveTab("assignments")}>Assignments</TabButton>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ActionButton label="Add Resource" tone="accent" onClick={() => { setEditingResource(null); setFormOpen(true); }} />
          <ActionButton label="Open Assignments" onClick={() => setActiveTab("assignments")} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, role, notes, work package..."
          style={{
            minWidth: 320,
            flex: 1,
            background: "var(--bg-input)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-input)",
            padding: "9px 12px",
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
            fontSize: 12,
          }}
        />
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} style={{ background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-input)", padding: "9px 12px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
          <option value="all">All Types</option>
          {RESOURCE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={{ background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-input)", padding: "9px 12px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
          <option value="all">All Statuses</option>
          {RESOURCE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        {activeTab === "assignments" ? (
          <>
            <select value={phaseFilter} onChange={(event) => setPhaseFilter(event.target.value)} style={{ background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-input)", padding: "9px 12px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
              <option value="all">All Phases</option>
              {PHASES.map((phase) => <option key={phase} value={phase}>{phase}</option>)}
            </select>
            <select value={assignmentFilter} onChange={(event) => setAssignmentFilter(event.target.value)} style={{ background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-input)", padding: "9px 12px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
              <option value="all">All Packages</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </>
        ) : null}
      </div>

      {activeTab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Panel title="Allocation Pressure" count={utilizationWatch.length}>
              {utilizationWatch.length === 0 ? (
                <EmptyPanel message="No allocation pressure yet." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {utilizationWatch.slice(0, 8).map((resource, index) => (
                    <div key={resource.id} style={{ display: "grid", gridTemplateColumns: "1.1fr 0.7fr 0.7fr 0.5fr", gap: 12, padding: "12px 14px", borderTop: index === 0 ? "none" : "1px solid var(--divider)" }}>
                      <div>
                        <div style={{ ...body, fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{resource.name}</div>
                        <div style={{ ...mono, fontSize: 8, color: TYPE_COLORS[resource.resource_type] || "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 4 }}>
                          {resource.resource_type} {resource.role ? `• ${resource.role}` : ""}
                        </div>
                      </div>
                      <div style={{ ...mono, fontSize: 11, color: "var(--text-secondary)" }}>{formatNumber(resource.projected)}h / {formatNumber(resource.budget_hours)}h</div>
                      <div style={{ ...mono, fontSize: 11, color: resource.utilization > 100 ? "var(--status-error)" : resource.utilization > 85 ? "var(--status-warning)" : "var(--status-success)" }}>
                        {formatNumber(resource.utilization)}%
                      </div>
                      <div style={{ ...mono, fontSize: 11, color: "var(--text-secondary)" }}>{resource.assignedWork} WP</div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Phase Assignment Status" count={phaseSummary.length}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, padding: 14 }}>
                {phaseSummary.map((phase) => (
                  <div key={phase.phase} style={{ background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", padding: 12 }}>
                    <div style={{ ...mono, fontSize: 9, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{phase.phase}</div>
                    <div style={{ ...body, fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>{phase.total}</div>
                    <div style={{ ...body, fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
                      {phase.assigned} assigned • {phase.unassigned} unassigned
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <Panel title="Immediate Actions" count={assignmentRows.filter((row) => !row.crew).length}>
            <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              {assignmentRows.filter((row) => !row.crew).slice(0, 8).map((row) => (
                <div key={row.id} style={{ background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ ...mono, fontSize: 9, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{row.wp_number || "WP"}</div>
                      <div style={{ ...body, fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>{row.name}</div>
                    </div>
                    <div style={{ ...mono, fontSize: 9, color: "var(--status-warning)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Unassigned
                    </div>
                  </div>
                  <div style={{ ...body, fontSize: 11, color: "var(--text-secondary)", marginTop: 8 }}>
                    {row.phase || "No phase"} • Shop {formatNumber(row.shop_hours_budget || 0)}h • Field {formatNumber(row.field_hours_budget || 0)}h
                  </div>
                </div>
              ))}
              {assignmentRows.filter((row) => !row.crew).length === 0 ? <EmptyPanel message="No unassigned work packages." /> : null}
            </div>
          </Panel>
        </div>
      )}

      {activeTab === "resources" && (
        <Panel title="Resource Ledger" count={filteredResources.length}>
          {loadingResources ? (
            <EmptyPanel message="Loading resources..." />
          ) : filteredResources.length === 0 ? (
            <EmptyPanel message="No resources in the current view." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {filteredResources.map((resource, index) => {
                const budget = safeNumber(resource.budget_hours);
                const actual = safeNumber(resource.actual_hours);
                const forecast = safeNumber(resource.forecast_hours);
                const utilization = budget > 0 ? Math.round((Math.max(actual, forecast || actual) / budget) * 100) : 0;
                return (
                  <div key={resource.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 0.7fr 0.8fr 0.7fr 0.55fr", gap: 12, padding: "14px 16px", borderTop: index === 0 ? "none" : "1px solid var(--divider)", alignItems: "center" }}>
                    <div>
                      <div style={{ ...body, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{resource.name}</div>
                      <div style={{ ...mono, fontSize: 8, color: TYPE_COLORS[resource.resource_type] || "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 4 }}>
                        {resource.resource_type} {resource.role ? `• ${resource.role}` : ""}
                      </div>
                    </div>
                    <div style={{ ...mono, fontSize: 11, color: "var(--text-secondary)" }}>
                      {formatNumber(actual)}h actual
                      <div style={{ marginTop: 4 }}>{formatNumber(budget)}h budget</div>
                    </div>
                    <div>
                      <div style={{ height: 6, background: "var(--border-default)", borderRadius: 999, overflow: "hidden", marginBottom: 6 }}>
                        <div style={{ height: "100%", width: `${Math.min(utilization, 100)}%`, background: utilization > 100 ? "var(--status-error)" : utilization > 85 ? "var(--status-warning)" : "var(--accent)" }} />
                      </div>
                      <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>{utilization}% utilization</div>
                    </div>
                    <div>
                      <div style={{ display: "inline-flex", padding: "4px 8px", borderRadius: 999, background: `${STATUS_COLORS[resource.availability_status] || "var(--text-muted)"}20`, border: `1px solid ${(STATUS_COLORS[resource.availability_status] || "var(--text-muted)")}40` }}>
                        <span style={{ ...mono, fontSize: 8, color: STATUS_COLORS[resource.availability_status] || "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{resource.availability_status}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                      <button type="button" onClick={() => { setEditingResource(resource); setFormOpen(true); }} style={smallButton()}>Edit</button>
                      <button type="button" onClick={() => setDeleteTarget(resource)} style={smallDangerButton()}>Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}
      {activeTab === "assignments" && (
        <Panel title="Work Package Assignments" count={assignmentRows.length}>
          {loadingWorkPackages ? (
            <EmptyPanel message="Loading assignments..." />
          ) : assignmentRows.length === 0 ? (
            <EmptyPanel message="No work packages match the current filters." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {assignmentRows.map((workPackage, index) => {
                const currentCrew = activeAssignmentValue(workPackage);
                const changed = currentCrew !== (workPackage.crew || "");
                return (
                  <div key={workPackage.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 0.5fr 0.5fr 0.45fr 0.9fr 0.55fr", gap: 12, padding: "14px 16px", borderTop: index === 0 ? "none" : "1px solid var(--divider)", alignItems: "center" }}>
                    <div>
                      <div style={{ ...mono, fontSize: 9, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{workPackage.wp_number || "WP"}</div>
                      <div style={{ ...body, fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>{workPackage.name}</div>
                      <div style={{ ...body, fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
                        {workPackage.phase || "No phase"} • Released {workPackage.released_date ? formatDate(workPackage.released_date) : "not set"}
                      </div>
                    </div>
                    <div style={{ ...mono, fontSize: 11, color: "var(--text-secondary)" }}>{formatNumber(workPackage.shop_hours_budget || 0)}h shop</div>
                    <div style={{ ...mono, fontSize: 11, color: "var(--text-secondary)" }}>{formatNumber(workPackage.field_hours_budget || 0)}h field</div>
                    <div style={{ ...mono, fontSize: 11, color: "var(--text-secondary)" }}>{workPackage.status || "Open"}</div>
                    <div>
                      <select
                        value={currentCrew}
                        onChange={(event) => setPendingAssignments((current) => ({ ...current, [workPackage.id]: event.target.value }))}
                        style={{
                          width: "100%",
                          background: "var(--bg-input)",
                          border: `1px solid ${!workPackage.crew ? "var(--status-warning)" : "var(--border-default)"}`,
                          borderRadius: "var(--radius-input)",
                          padding: "8px 10px",
                          color: "var(--text-primary)",
                          fontFamily: "var(--font-body)",
                          fontSize: 12,
                        }}
                      >
                        <option value="">Unassigned</option>
                        {assignableResources.map((resource) => (
                          <option key={resource.id} value={resource.name}>
                            {resource.name} {resource.role ? `- ${resource.role}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                      <button type="button" onClick={() => saveAssignment(workPackage)} disabled={!changed || assignWorkPackageMut.isPending} style={smallButton(!changed)}>Save</button>
                      <button
                        type="button"
                        onClick={() => {
                          setPendingAssignments((current) => ({ ...current, [workPackage.id]: "" }));
                          assignWorkPackageMut.mutate({ id: workPackage.id, crew: "" });
                        }}
                        style={smallDangerButton()}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}

      {formOpen ? (
        <ResourceFormModal
          projectId={projectId}
          resource={editingResource}
          onClose={() => {
            setFormOpen(false);
            setEditingResource(null);
          }}
        />
      ) : null}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteResourceMut.mutate(deleteTarget.id)}
        title="Delete Resource"
        description={`Delete ${deleteTarget?.name || "this resource"}?`}
      />
    </div>
  );
}

function Panel({ title, count, children }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 14px", borderBottom: "1px solid var(--divider)" }}>
        <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em" }}>{title}</div>
        {count !== undefined ? <div style={{ ...mono, fontSize: 8, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.12em" }}>{count}</div> : null}
      </div>
      {children}
    </div>
  );
}

function EmptyPanel({ message }) {
  return (
    <div style={{ padding: 24, textAlign: "center", ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase" }}>
      {message}
    </div>
  );
}

function smallButton(disabled = false) {
  return {
    background: "var(--bg-surface-low)",
    border: "1px solid var(--border-default)",
    borderRadius: "var(--radius-btn)",
    padding: "6px 8px",
    color: disabled ? "var(--text-muted)" : "var(--text-secondary)",
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    textTransform: "uppercase",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function smallDangerButton() {
  return {
    background: "var(--danger-muted)",
    border: "1px solid var(--danger-border)",
    borderRadius: "var(--radius-btn)",
    padding: "6px 8px",
    color: "var(--status-error)",
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    textTransform: "uppercase",
    cursor: "pointer",
  };
}
