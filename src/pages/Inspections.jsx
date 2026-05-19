import { useProjectId } from "@/hooks/useProjectId";
import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import InspectionFormModal from "@/components/inspections/InspectionFormModal";
import InspectionList from "@/components/inspections/InspectionList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { CommandBar, KpiTile, Button } from "@/components/design-system";
import { Plus } from "lucide-react";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

const TYPES = [
  "Steel Fabrication",
  "Welds",
  "Material",
  "Dimensional",
  "Surface Prep",
  "Coating",
  "Installation",
  "Connections",
  "Field Verification",
  "Other",
];

const TYPE_ABBREV = {
  "Steel Fabrication": "Steel Fab",
  "Field Verification": "Field Verify",
  "Surface Prep": "Surf Prep",
};

const STATUSES = ["Scheduled", "In Progress", "Completed", "On Hold", "Cancelled"];

const STATUS_COLORS = {
  Scheduled: "var(--status-info, #0EA5E9)",
  "In Progress": "var(--status-warning, #F59E0B)",
  Completed: "var(--status-success, #10B981)",
  "On Hold": "var(--text-muted, #8898A8)",
  Cancelled: "var(--status-error, #FF3B3B)",
};

export default function Inspections() {
  const projectId = useProjectId();
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: rawInspections = [], isLoading } = useQuery({
    queryKey: ["inspections", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.Inspection.filter({ project_id: projectId })
        : base44.entities.Inspection.list("-inspection_date"),
  });

  useRealtimeInvalidation("inspections", projectId, [["inspections", projectId]]);

  const inspections = React.useMemo(() => rawInspections.filter((r) => !r.is_deleted), [rawInspections]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Inspection.create({ ...data, project_id: data.project_id || projectId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inspections", projectId] });
      setShowForm(false);
      setEditing(null);
      toast.success("Inspection created");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: (data) => base44.entities.Inspection.update(data.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inspections", projectId] });
      setShowForm(false);
      setEditing(null);
      toast.success("Inspection updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Inspection.delete(id),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ["inspections", projectId] });
      if (editing?.id === deletedId) {
        setEditing(null);
        setShowForm(false);
      }
      setDeleteTarget(null);
      toast.success("Inspection deleted");
    },
    onError: () => toast.error("Delete failed"),
  });

  // C3 — Convert inspection deficiencies into punchlist items.
  // Creates one punchlist row per deficiency (count from deficiencies_count),
  // FK-linked back via punchlist_items.inspection_id and metadata trail.
  // Stamps inspection.metadata.punchlist_converted so the button hides
  // after conversion (idempotent — clicking again is a no-op).
  const convertMut = useMutation({
    mutationFn: async (inspection) => {
      const count = Math.max(1, parseInt(inspection.deficiencies_count, 10) || 1);
      const baseDescription = inspection.findings || inspection.corrective_actions || inspection.description || "Deficiency from inspection";
      const inspNumber = inspection.id ? `INSP-${String(inspection.id).slice(0, 8)}` : "Inspection";
      const items = [];
      for (let i = 0; i < count; i++) {
        const desc = count > 1
          ? `[${inspNumber} #${i + 1}/${count}] ${baseDescription}`
          : `[${inspNumber}] ${baseDescription}`;
        items.push(await base44.entities.PunchlistItem.create({
          project_id: inspection.project_id,
          description: desc,
          category: "Other",
          location: inspection.location || "",
          assigned_to: "",
          priority: inspection.sign_off_status === "Rejected" ? "High" : "Medium",
          status: "Open",
          percent_complete: 0,
          notes: inspection.corrective_actions || "",
          inspection_id: inspection.id,
          metadata: {
            inspection_id: inspection.id,
            inspection_number: inspNumber,
            inspection_type: inspection.inspection_type,
            deficiency_index: i + 1,
            deficiency_count: count,
          },
        }));
      }
      // Stamp the inspection so the convert button hides on re-render
      await base44.entities.Inspection.update(inspection.id, {
        metadata: {
          ...(inspection.metadata || {}),
          punchlist_converted: {
            count,
            at: new Date().toISOString(),
            ids: items.map((i) => i.id),
          },
        },
      });
      return { count };
    },
    onSuccess: ({ count }) => {
      qc.invalidateQueries({ queryKey: ["inspections", projectId] });
      qc.invalidateQueries({ queryKey: ["punchlist"] });
      qc.invalidateQueries({ queryKey: ["punchlist", projectId] });
      toast.success(`Created ${count} punchlist item${count === 1 ? "" : "s"} from inspection`);
    },
    onError: (err) => toast.error(`Convert failed: ${err.message}`),
  });

  const handleSave = (data) => {
    if (editing) {
      updateMut.mutate({ ...data, id: editing.id });
    } else {
      createMut.mutate(data);
    }
  };

  const filtered = inspections.filter((i) => {
    const typeMatch = filterType === "all" || i.inspection_type === filterType;
    const statusMatch = filterStatus === "all" || i.status === filterStatus;
    return typeMatch && statusMatch;
  });

  const stats = {
    total: inspections.length,
    scheduled: inspections.filter((i) => i.status === "Scheduled").length,
    inProgress: inspections.filter((i) => i.status === "In Progress").length,
    completed: inspections.filter((i) => i.status === "Completed").length,
    approved: inspections.filter((i) => i.sign_off_status === "Approved").length,
    rejected: inspections.filter((i) => i.sign_off_status === "Rejected").length,
  };

  // Click stat card to filter
  const handleStatClick = (statusValue) => {
    if (filterStatus === statusValue) {
      setFilterStatus("all");
    } else {
      setFilterStatus(statusValue);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CommandBar
        eyebrow={selectedProject ? selectedProject.name : "ALL PROJECTS"}
        title="Inspections"
        count={filtered.length}
        unit={` OF ${inspections.length}`}
        subtitle={`Welds · material · connections · coatings${filterType !== "all" || filterStatus !== "all" ? " · (filtered)" : ""}`}
      >
        <Button variant="primary" icon="plus" onClick={() => { setEditing(null); setShowForm(true); }}>
          New Inspection
        </Button>
      </CommandBar>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
        <KpiTile compact label="Total"       value={stats.total}      color="var(--accent)"
                 active={filterStatus === "all"} onClick={() => setFilterStatus("all")} />
        <KpiTile compact label="Scheduled"   value={stats.scheduled}  color={STATUS_COLORS.Scheduled}
                 active={filterStatus === "Scheduled"} onClick={() => handleStatClick("Scheduled")} />
        <KpiTile compact label="In Progress" value={stats.inProgress} color={STATUS_COLORS["In Progress"]}
                 active={filterStatus === "In Progress"} onClick={() => handleStatClick("In Progress")} />
        <KpiTile compact label="Completed"   value={stats.completed}  color={STATUS_COLORS.Completed}
                 active={filterStatus === "Completed"} onClick={() => handleStatClick("Completed")} />
        <KpiTile compact label="Approved"    value={stats.approved}   color="var(--status-success)" />
        <KpiTile compact label="Rejected"    value={stats.rejected}   color="var(--status-error)" />
      </div>

      {/* Filters — full labels, no truncation */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              color: "var(--text-muted)",
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              flexShrink: 0,
            }}
          >
            Type:
          </span>
          {["all", ...TYPES].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              aria-pressed={filterType === type}
              style={{
                background: filterType === type ? "var(--accent)" : "var(--bg-surface)",
                color: filterType === type ? "#07090E" : "var(--text-secondary)",
                border: filterType === type ? "1px solid var(--accent)" : "1px solid var(--border-default)",
                borderRadius: "var(--radius-btn)",
                padding: "4px 10px",
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                transition: "all 0.12s",
                whiteSpace: "nowrap",
              }}
            >
              {type === "all" ? "All" : (TYPE_ABBREV[type] || type)}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: "var(--divider)" }} />

        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              color: "var(--text-muted)",
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              flexShrink: 0,
            }}
          >
            Status:
          </span>
          {["all", ...STATUSES].map((status) => {
            const sColor = STATUS_COLORS[status];
            return (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                aria-pressed={filterStatus === status}
                style={{
                  background: filterStatus === status
                    ? (sColor ? `${sColor}20` : "var(--accent)")
                    : "var(--bg-surface)",
                  color: filterStatus === status
                    ? (sColor || "#07090E")
                    : "var(--text-secondary)",
                  border: filterStatus === status
                    ? `1px solid ${sColor || "var(--accent)"}`
                    : "1px solid var(--border-default)",
                  borderRadius: "var(--radius-btn)",
                  padding: "4px 10px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  fontWeight: 700,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  transition: "all 0.12s",
                  whiteSpace: "nowrap",
                }}
              >
                {status === "all" ? "All" : status}
              </button>
            );
          })}

          {/* Active filter clear */}
          {(filterType !== "all" || filterStatus !== "all") && (
            <button
              onClick={() => { setFilterType("all"); setFilterStatus("all"); }}
              style={{
                background: "transparent",
                color: "var(--text-muted)",
                border: "1px dashed var(--border-default)",
                borderRadius: "var(--radius-btn)",
                padding: "4px 10px",
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <InspectionFormModal
          projectId={projectId}
          inspection={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSave={handleSave}
          isSaving={createMut.isPending || updateMut.isPending}
        />
      )}

      {/* Empty State */}
      {!isLoading && filtered.length === 0 ? (
        <div className="sbd-card" style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "60px 20px", gap: 16,
          borderStyle: "dashed",
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: "var(--accent-muted, rgba(200,155,32,0.08))",
            border: "1px solid var(--accent-border, rgba(200,155,32,0.20))",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24,
          }}>
            {inspections.length === 0 ? "🔍" : "🔎"}
          </div>
          <div style={{
            fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600,
            color: "var(--text-primary)", textAlign: "center",
          }}>
            {inspections.length === 0
              ? "No Inspections Yet"
              : "No Inspections Match Your Filters"}
          </div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)",
            textAlign: "center", maxWidth: 340, lineHeight: 1.6,
          }}>
            {inspections.length === 0
              ? "Create your first inspection to start tracking quality control for this project."
              : "Try adjusting your type or status filters, or clear all filters to see everything."}
          </div>
          {inspections.length === 0 ? (
            <Button variant="primary" onClick={() => { setEditing(null); setShowForm(true); }} style={{ marginTop: 4 }}>
              + Create First Inspection
            </Button>
          ) : (
            <Button variant="outline" onClick={() => { setFilterType("all"); setFilterStatus("all"); }} style={{ marginTop: 4 }}>
              Clear All Filters
            </Button>
          )}
        </div>
      ) : (
        /* Inspections List */
        <InspectionList
          inspections={filtered}
          onEdit={(inspection) => { setEditing(inspection); setShowForm(true); }}
          onDelete={setDeleteTarget}
          onConvertToPunchlist={(inspection) => convertMut.mutate(inspection)}
        />
      )}

      {/* Delete Dialog */}
      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteMut.isPending && deleteTarget?.id) {
            deleteMut.mutate(deleteTarget.id);
          }
        }}
        title="Delete Inspection"
        description="Delete this record? This cannot be undone."
      />
    </div>
  );
}
