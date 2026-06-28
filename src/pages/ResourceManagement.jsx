import { useProjectId } from "@/hooks/useProjectId";
import React, { useState } from "react";
import { entities } from "@/api/supabaseClient";
import { supabase } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ResourceFormModal from "@/components/resources/ResourceFormModal";
import ResourceList from "@/components/resources/ResourceList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { toast } from "sonner";
import { KpiTile } from "@/components/design-system";
import { OperationsPageShell, OpsActionButton, OpsFilterPanel } from "@/components/operations/OperationsPageShell";
import { Plus, RefreshCw } from "lucide-react";

// -- Keyframe injection (once) --
const STYLE_ID = "resource-mgmt-keyframes";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes overAllocPulse {
      0%, 100% { box-shadow: 0 0 8px rgba(239,68,68,0.15); }
      50%      { box-shadow: 0 0 22px rgba(239,68,68,0.45); }
    }
    @keyframes ghostShimmer {
      0%   { opacity: 0.25; }
      50%  { opacity: 0.42; }
      100% { opacity: 0.25; }
    }
    @keyframes fadeSlideUp {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

// -- Ghost placeholder data for empty state --
const GHOST_RESOURCES = [
  { name: "Jordan Lee", type: "Person", role: "Foreman", hours: "40h capacity" },
  { name: "Erection Crew A", type: "Crew", role: "Ironworkers", hours: "320h capacity" },
  { name: "Bay 3 Crane", type: "Bay", role: "Shop equipment", hours: "160h capacity" },
];

export default function ResourceManagement() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: resources = [] } = useQuery({
    queryKey: ["resources", projectId],
    queryFn: () =>
      projectId
        ? entities.Resource.filter({ project_id: projectId })
        : entities.Resource.list(),
  });

  // Pull in WPs so each resource row can show what's assigned to it.
  // Matches via work_packages.crew (text) against resource.name.
  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: () =>
      projectId
        ? entities.WorkPackage.filter({ project_id: projectId })
        : entities.WorkPackage.list(),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  // DB column is `availability`, not `availability_status`
  const getStatus = (r) => r.availability || r.availability_status || "Available";

  const filtered = resources.filter((r) => {
    const typeMatch = filterType === "all" || r.resource_type === filterType;
    const statusMatch = filterStatus === "all" || getStatus(r) === filterStatus;
    return typeMatch && statusMatch;
  });

  const stats = {
    total: resources.length,
    people: resources.filter((r) => r.resource_type === "Person").length,
    crews: resources.filter((r) => r.resource_type === "Crew").length,
    labor: resources.filter((r) => r.resource_type === "Labor").length,
    equipment: resources.filter((r) => r.resource_type === "Equipment").length,
    bays: resources.filter((r) => r.resource_type === "Bay").length,
    subcontractor: resources.filter((r) => r.resource_type === "Subcontractor").length,
    material: resources.filter((r) => r.resource_type === "Material").length,
    available: resources.filter((r) => getStatus(r) === "Available").length,
    allocated: resources.filter((r) => getStatus(r) === "Allocated").length,
    overAllocated: resources.filter((r) => getStatus(r) === "Over-Allocated").length,
  };

  // ResourceFormModal.toEntity() already maps UI fields - DB columns, so we
  // pass the payload straight through here.  The DB columns are:
  //   name, resource_type, role, capacity (=budget hrs), unit, cost_rate (=hourly rate),
  //   availability (=status), notes, metadata (JSONB with actual_hours, forecast_hours)

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => entities.Resource.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["resources"] }); toast.success("Resource updated"); setShowForm(false); setEditing(null); },
    onError: (e) => toast.error("Failed: " + (e?.message || "Unknown error")),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => entities.Resource.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["resources"] }); toast.success("Resource deleted"); setDeleteTarget(null); },
    onError: (e) => toast.error("Failed: " + (e?.message || "Unknown error")),
  });

  const handleSave = (data) => {
    // data comes from ResourceFormModal.toEntity() - already DB-mapped
    if (editing) updateMut.mutate({ id: editing.id, data });
    else toast.error("Unexpected save path - use form modal");
  };

  // -- Company resource sync ----------------------------------------------------------------------
  //
  // The `resources` table's RLS policy allows reads+writes on rows
  // with project_id = null ("project_member_access" has an explicit
  // `project_id IS NULL OR ?` branch), so those rows act as a
  // shared company-wide library. Sync Company copies every library
  // resource into the currently-active project, skipping anything
  // the project already has (matched by name + resource_type).
  //
  // No-op when the library is empty or when no project is selected ?
  // both surface a gentle toast explaining next steps rather than a
  // bare error.
  const syncMut = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Pick a project first - Sync Company copies the library into one specific project.");
      const { data: library, error: libErr } = await supabase
        .from("resources")
        .select("*")
        .is("project_id", null);
      if (libErr) throw libErr;
      if (!library || library.length === 0) {
        return { inserted: 0, skipped: 0, libraryEmpty: true };
      }
      // Dedup key: (name|resource_type) lowercased - good enough for
      // MVP given there's no explicit library_resource_id. Two "Welder
      // Crew A" labor rows would collide, which is arguably correct
      // (don't double-add the same crew).
      const keyOf = (r) => `${(r.name || "").toLowerCase().trim()}|${(r.resource_type || "").toLowerCase().trim()}`;
      const existing = new Set((resources || []).map(keyOf));

      const projectName = selectedProject?.name || null;
      const toInsert = library
        .filter((r) => r.name && !existing.has(keyOf(r)))
        .map((src) => {
          // Strip id/created_at so the insert gets fresh ones; drop
          // parent_resource_id too (library hierarchy shouldn't pollute
          // the project copy). Carry name/role/capacity/etc. through
          // verbatim; stash a breadcrumb in metadata so we can later
          // tell which project rows came from the library and which
          // library row they came from.
          const {
            id: _id, created_at: _created_at, updated_at: _updated_at,
            project_id: _oldProject, project_name: _oldProjectName,
            parent_resource_id: _parent_resource_id,
            metadata,
            ...rest
          } = src;
          return {
            ...rest,
            project_id:   projectId,
            project_name: projectName,
            metadata: {
              ...(metadata || {}),
              synced_from_library: true,
              source_library_resource_id: _id,
              synced_at: new Date().toISOString(),
            },
          };
        });
      if (toInsert.length === 0) {
        return { inserted: 0, skipped: library.length, libraryEmpty: false };
      }
      const { error: insErr } = await supabase.from("resources").insert(toInsert);
      if (insErr) throw insErr;
      return { inserted: toInsert.length, skipped: library.length - toInsert.length, libraryEmpty: false };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["resources"] });
      if (res.libraryEmpty) {
        toast.info(
          "No company library yet.",
          { description: "Create a resource and leave its project empty - those rows become your company library for future syncs." },
        );
        return;
      }
      const parts = [];
      parts.push(`${res.inserted} added`);
      if (res.skipped > 0) parts.push(`${res.skipped} already in project`);
      toast.success(`Company library synced - ${parts.join(", ")}`);
    },
    onError: (e) => toast.error(`Sync failed: ${e?.message || "Unknown error"}`),
  });

  const types = ["Person", "Crew", "Labor", "Equipment", "Bay", "Subcontractor", "Material"];
  const statuses = ["Available", "Partially Available", "Committed", "Allocated", "Over-Allocated", "On Leave", "Unavailable"];

  const isEmpty = resources.length === 0;

  return (
    <div className="sb-dashboard-reference-page">
    <OperationsPageShell
      eyebrow={selectedProject ? selectedProject.name : "All Projects"}
      title="Resource Management"
      subtitle="Manage people, crews, equipment, subcontractors, project availability, and company library sync in one operational register."
      meta={[
        { label: "Showing", value: filtered.length },
        { label: "Available", value: stats.available, color: "var(--status-success)" },
        { label: "Allocated", value: stats.allocated, color: "var(--phase-delivery)" },
        { label: "Over-Allocated", value: stats.overAllocated, color: stats.overAllocated > 0 ? "var(--status-error)" : "var(--status-success)" },
      ]}
      metrics={[
        { label: "Total Resources", value: stats.total, sub: `${stats.people} people / ${stats.crews} crews`, color: "var(--accent)" },
        { label: "Labor Pool", value: stats.people + stats.crews + stats.labor, sub: "People, crews, labor", color: "var(--phase-fabrication)" },
        { label: "Equipment", value: stats.equipment + stats.bays, sub: "Equipment and bays", color: "var(--status-warning)" },
        { label: "Over-Allocated", value: stats.overAllocated, sub: "Needs rebalance", color: stats.overAllocated > 0 ? "var(--status-error)" : "var(--status-success)" },
      ]}
      actions={(
        <>
          <OpsActionButton
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending || !projectId}
            title={projectId
              ? "Copy every resource from the company library (project_id=null rows) into this project, skipping ones already here."
              : "Pick a project first - Sync Company adds library resources to a specific project."}
            icon={<RefreshCw size={13} style={{ animation: syncMut.isPending ? "spin 0.8s linear infinite" : "none" }} />}
          >
            {syncMut.isPending ? "Syncing" : "Sync Company"}
          </OpsActionButton>
          <OpsActionButton
            variant="primary"
            onClick={() => { setEditing(null); setShowForm(true); }}
            icon={<Plus size={13} />}
          >
            Add Resource
          </OpsActionButton>
        </>
      )}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
        <KpiTile compact label="Total"          value={stats.total}           color="var(--accent)"
                 active={filterType === "all" && filterStatus === "all"}
                 onClick={() => { setFilterType("all"); setFilterStatus("all"); }} />
        <KpiTile compact label="People"         value={stats.people}          color="var(--accent)"
                 active={filterType === "Person"}
                 onClick={() => setFilterType(filterType === "Person" ? "all" : "Person")} />
        <KpiTile compact label="Crews"          value={stats.crews}           color="var(--phase-erection)"
                 active={filterType === "Crew"}
                 onClick={() => setFilterType(filterType === "Crew" ? "all" : "Crew")} />
        <KpiTile compact label="Labor"          value={stats.labor}           color="var(--phase-fabrication)"
                 active={filterType === "Labor"}
                 onClick={() => setFilterType(filterType === "Labor" ? "all" : "Labor")} />
        <KpiTile compact label="Equipment"      value={stats.equipment}       color="var(--status-warning)"
                 active={filterType === "Equipment"}
                 onClick={() => setFilterType(filterType === "Equipment" ? "all" : "Equipment")} />
        <KpiTile compact label="Bays"           value={stats.bays}            color="var(--phase-delivery)"
                 active={filterType === "Bay"}
                 onClick={() => setFilterType(filterType === "Bay" ? "all" : "Bay")} />
        <KpiTile compact label="Subs"           value={stats.subcontractor}   color="var(--phase-detailing)"
                 active={filterType === "Subcontractor"}
                 onClick={() => setFilterType(filterType === "Subcontractor" ? "all" : "Subcontractor")} />
        <KpiTile compact label="Available"      value={stats.available}       color="var(--status-success)"
                 active={filterStatus === "Available"}
                 onClick={() => setFilterStatus(filterStatus === "Available" ? "all" : "Available")} />
        <KpiTile compact label="Allocated"      value={stats.allocated}       color="var(--phase-delivery)"
                 active={filterStatus === "Allocated"}
                 onClick={() => setFilterStatus(filterStatus === "Allocated" ? "all" : "Allocated")} />
        <KpiTile compact label="Over-Allocated" value={stats.overAllocated}   color="var(--status-error)"
                 active={filterStatus === "Over-Allocated"}
                 onClick={() => setFilterStatus(filterStatus === "Over-Allocated" ? "all" : "Over-Allocated")} />
      </div>

      {/* Filters */}
      <OpsFilterPanel>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
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
                color: filterType === type ? "var(--bg-base)" : "var(--text-secondary)",
                border: `1px solid ${filterType === type ? "var(--accent)" : "var(--border-default)"}`,
                borderRadius: "var(--radius-badge)",
                padding: "6px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                minHeight: 32,
              }}
            >
              {type === "all" ? "All" : type}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
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
                color: filterStatus === status ? "var(--bg-base)" : "var(--text-secondary)",
                border: `1px solid ${filterStatus === status ? "var(--accent)" : "var(--border-default)"}`,
                borderRadius: "var(--radius-badge)",
                padding: "6px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                minHeight: 32,
              }}
            >
              {status === "all" ? "All" : status}
            </button>
          ))}
        </div>
      </OpsFilterPanel>

      {/* Form Modal */}
      {showForm && (
        <ResourceFormModal projectId={projectId} editing={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSave={handleSave} />
      )}

      {/* Empty State with ghost placeholders */}
      {isEmpty && (
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-card)",
            padding: "40px 32px",
            textAlign: "center",
            animation: "fadeSlideUp 0.3s ease-out both",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 18,
              fontWeight: 800,
              color: "var(--text-primary)",
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            No Resources Yet
          </div>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 13,
              color: "var(--text-muted)",
              margin: "0 0 24px 0",
              lineHeight: 1.6,
            }}
          >
            Add your first crew, equipment, or subcontractor to start tracking resources.
          </p>

          {/* Ghost placeholder cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 560, margin: "0 auto 24px" }}>
            {GHOST_RESOURCES.map((ghost, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr auto",
                  gap: 16,
                  alignItems: "center",
                  padding: "12px 16px",
                  background: "var(--bg-surface-low)",
                  border: "1px dashed var(--bg-surface-high)",
                  borderRadius: "var(--radius-card)",
                  animation: `ghostShimmer 2.5s ease-in-out infinite`,
                  animationDelay: `${i * 0.4}s`,
                }}
              >
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-disabled)" }}>{ghost.name}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-disabled)", marginTop: 2 }}>{ghost.type}</div>
                </div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-disabled)" }}>{ghost.role}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-disabled)", marginTop: 2 }}>{ghost.hours}</div>
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    color: "var(--text-disabled)",
                    border: "1px dashed var(--divider)",
                    borderRadius: 4,
                    padding: "3px 8px",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Ghost
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            style={{
              background: "var(--accent)",
              color: "var(--bg-base)",
              border: "none",
              borderRadius: "var(--radius-btn)",
              padding: "10px 24px",
              fontFamily: "var(--font-display)",
              fontSize: "13px",
              fontWeight: 700,
              cursor: "pointer",
              transition: "background 0.15s, box-shadow 0.15s",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              minHeight: 44,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-hover)"; e.currentTarget.style.boxShadow = "var(--shadow-glow-gold)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.boxShadow = "none"; }}
          >
            + Add First Resource
          </button>
        </div>
      )}

      {/* Resources List (only shown when not empty) */}
      {!isEmpty && (
        <ResourceList resources={filtered} workPackages={workPackages} onEdit={(r) => { setEditing(r); setShowForm(true); }} onDelete={setDeleteTarget} />
      )}

      {/* Delete Dialog */}
      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        title="Delete Resource"
        description="Delete this resource? This cannot be undone."
      />
    </OperationsPageShell>
    </div>
  );
}
