import { useProjectId } from "@/hooks/useProjectId";
import {
  filterLiveRecords,
  filterSafetyIncidents,
  computeSafetyStats,
  nextFilterToggle,
  safetyCommandSubtitle,
  createEmptySafetyFilters,
} from "./safety/safetyPageHelpers";
import {
  SafetyKpiStrip,
  SafetyFilterBar,
  SafetyLoadError,
  SafetyEmptyState,
  SafetyFilteredEmpty,
} from "./safety/SafetyUi";
import React, { useState } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import SafetyIncidentFormModal from "@/components/safety/SafetyIncidentFormModal";
import SafetyIncidentList from "@/components/safety/SafetyIncidentList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { CommandBar, Button } from "@/components/design-system";
import { useAutoOpenCreate } from "@/hooks/useAutoOpenCreate";
import { useAutoOpenEdit } from "@/hooks/useAutoOpenEdit";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";

import { findById } from "@/pages/shared/findById";
export default function Safety() {
  const projectId = useProjectId();
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const {
    data: rawIncidents = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["safety-incidents", projectId],
    queryFn: () =>
      projectId
        ? entities.SafetyIncident.filter({ project_id: projectId })
        : entities.SafetyIncident.list("-incident_date"),
  });

  useRealtimeInvalidation("safety_incidents", projectId, [["safety-incidents", projectId]]);

  const incidents = React.useMemo(() => filterLiveRecords(rawIncidents), [rawIncidents]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const selectedProject = findById(projects, projectId);

  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useAutoOpenCreate(() => {
    setEditing(null);
    setShowForm(true);
  });

  // Field Hub rows deep-link here with ?id=<incident>; open it for edit/close.
  useAutoOpenEdit(
    incidents,
    (incident) => { setEditing(incident); setShowForm(true); },
    { enabled: !isLoading },
  );

  const createMut = useMutation({
    mutationFn: (data) => entities.SafetyIncident.create(withProjectId(data, projectId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["safety-incidents", projectId] });
      setShowForm(false);
      setEditing(null);
      toast.success("Incident created");
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Create failed")),
  });

  const updateMut = useMutation({
    mutationFn: (data) => entities.SafetyIncident.update(data.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["safety-incidents", projectId] });
      setShowForm(false);
      setEditing(null);
      toast.success("Incident updated");
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Update failed")),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => entities.SafetyIncident.delete(id),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ["safety-incidents", projectId] });
      if (editing?.id === deletedId) {
        setEditing(null);
        setShowForm(false);
      }
      setDeleteTarget(null);
      toast.success("Incident deleted");
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Delete failed")),
  });

  const handleSave = (data) => {
    if (editing) {
      updateMut.mutate({ ...data, id: editing.id });
    } else {
      createMut.mutate(data);
    }
  };

  const handleStatusChange = (incident, newStatus) => {
    if (incident.status === newStatus) return;
    updateMut.mutate({ id: incident.id, status: newStatus });
  };

  const filtered = filterSafetyIncidents(incidents, { filterType, filterSeverity, filterStatus });
  const stats = computeSafetyStats(incidents);

  return (
    <div
      className="sb-dashboard-reference-page"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <CommandBar
        eyebrow={selectedProject ? selectedProject.name : "ALL PROJECTS"}
        title="Safety & Hazards"
        count={filtered.length}
        unit=" · INCIDENTS"
        subtitle={safetyCommandSubtitle(stats.open, stats.critical)}
      >
        <Button variant="primary" icon="plus" onClick={() => { setEditing(null); setShowForm(true); }}>
          Report Incident
        </Button>
      </CommandBar>

      <SafetyKpiStrip
        stats={stats}
        filterSeverity={filterSeverity}
        filterType={filterType}
        filterStatus={filterStatus}
        onToggleSeverity={(v) => setFilterSeverity(nextFilterToggle(filterSeverity, v))}
        onToggleType={(v) => setFilterType(nextFilterToggle(filterType, v))}
        onToggleStatus={(v) => setFilterStatus(nextFilterToggle(filterStatus, v))}
      />

      <SafetyFilterBar
        filterType={filterType}
        filterSeverity={filterSeverity}
        filterStatus={filterStatus}
        onFilterType={setFilterType}
        onFilterSeverity={setFilterSeverity}
        onFilterStatus={setFilterStatus}
      />

      {/* Form Modal */}
      {showForm && <SafetyIncidentFormModal projectId={projectId} incident={editing} onClose={() => {setShowForm(false); setEditing(null);}} onSave={handleSave} isSaving={createMut.isPending || updateMut.isPending} />}

      {/* Incidents List */}
      {isLoading ? (
        <LoadingSkeleton variant="table" rows={5} />
      ) : isError ? (
        <SafetyLoadError
          errorMessage={toUserErrorMessage(error, "Something went wrong. Try again.")}
          onRetry={() => refetch()}
        />
      ) : filtered.length === 0 ? (
        incidents.length === 0 ? (
          <SafetyEmptyState onReport={() => { setEditing(null); setShowForm(true); }} />
        ) : (
          <SafetyFilteredEmpty onClearFilters={() => {
            const empty = createEmptySafetyFilters();
            setFilterType(empty.filterType);
            setFilterSeverity(empty.filterSeverity);
            setFilterStatus(empty.filterStatus);
          }} />
        )
      ) : (
        <SafetyIncidentList incidents={filtered} onEdit={(incident) => {setEditing(incident); setShowForm(true);}} onDelete={setDeleteTarget} onStatusChange={handleStatusChange} />
      )}

      {/* Delete Dialog */}
      <DeleteDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => { if (!deleteMut.isPending && deleteTarget?.id) deleteMut.mutate(deleteTarget.id); }} title="Delete Incident" description="Delete this record? This cannot be undone." />
    </div>
  );
}
