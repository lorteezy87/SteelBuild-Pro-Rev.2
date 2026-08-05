import { useProjectId } from "@/hooks/useProjectId";
import {
  filterLiveRecords,
  filterInspections,
  computeInspectionStats,
  nextStatusFilterToggle,
  inspectionsCommandSubtitle,
  buildPunchlistCreatePayloadsFromInspection,
  buildInspectionPunchlistConvertedStamp,
  mergeInspectionMetadataWithConverted,
  createEmptyInspectionFilters,
} from "./inspections/inspectionsPageHelpers";
import {
  InspectionsKpiStrip,
  InspectionsFilterBar,
  InspectionsLoadError,
  InspectionsEmptyState,
} from "./inspections/InspectionsUi";
import React, { useState } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import InspectionFormModal from "@/components/inspections/InspectionFormModal";
import InspectionList from "@/components/inspections/InspectionList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { CommandBar, Button } from "@/components/design-system";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { useAutoOpenEdit } from "@/hooks/useAutoOpenEdit";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";

import { findById } from "@/pages/shared/findById";
export default function Inspections() {
  const projectId = useProjectId();
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const {
    data: rawInspections = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["inspections", projectId],
    queryFn: () =>
      projectId
        ? entities.Inspection.filter({ project_id: projectId })
        : entities.Inspection.list("-inspection_date"),
  });

  useRealtimeInvalidation("inspections", projectId, [["inspections", projectId]]);

  const inspections = React.useMemo(() => filterLiveRecords(rawInspections), [rawInspections]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const selectedProject = findById(projects, projectId);

  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Field Hub rows deep-link here with ?id=<inspection>; open it for edit/close.
  useAutoOpenEdit(
    inspections,
    (inspection) => { setEditing(inspection); setShowForm(true); },
    { enabled: !isLoading },
  );

  const createMut = useMutation({
    mutationFn: (data) => entities.Inspection.create(withProjectId(data, projectId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inspections", projectId] });
      setShowForm(false);
      setEditing(null);
      toast.success("Inspection created");
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Create failed")),
  });

  const updateMut = useMutation({
    mutationFn: (data) => entities.Inspection.update(data.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inspections", projectId] });
      setShowForm(false);
      setEditing(null);
      toast.success("Inspection updated");
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Update failed")),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => entities.Inspection.delete(id),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ["inspections", projectId] });
      if (editing?.id === deletedId) {
        setEditing(null);
        setShowForm(false);
      }
      setDeleteTarget(null);
      toast.success("Inspection deleted");
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Delete failed")),
  });

  // C3 — Convert inspection deficiencies into punchlist items.
  // Creates one punchlist row per deficiency (count from deficiencies_count),
  // FK-linked back via punchlist_items.inspection_id and metadata trail.
  // Stamps inspection.metadata.punchlist_converted so the button hides
  // after conversion (idempotent — clicking again is a no-op).
  const convertMut = useMutation({
    mutationFn: async (inspection) => {
      const payloads = buildPunchlistCreatePayloadsFromInspection(inspection);
      const items = [];
      for (const payload of payloads) {
        items.push(await entities.PunchlistItem.create(
          withProjectId(payload, projectId || inspection.project_id),
        ));
      }
      // Stamp the inspection so the convert button hides on re-render
      const stamp = buildInspectionPunchlistConvertedStamp(
        payloads.length,
        items.map((i) => i.id),
        new Date().toISOString(),
      );
      await entities.Inspection.update(inspection.id, {
        metadata: mergeInspectionMetadataWithConverted(inspection.metadata, stamp),
      });
      return { count: payloads.length };
    },
    onSuccess: ({ count }) => {
      qc.invalidateQueries({ queryKey: ["inspections", projectId] });
      qc.invalidateQueries({ queryKey: ["punchlist"] });
      qc.invalidateQueries({ queryKey: ["punchlist", projectId] });
      toast.success(`Created ${count} punchlist item${count === 1 ? "" : "s"} from inspection`);
    },
    onError: (err) => toast.error(`Convert failed: ${toUserErrorMessage(err)}`),
  });

  const handleSave = (data) => {
    if (editing) {
      updateMut.mutate({ ...data, id: editing.id });
    } else {
      createMut.mutate(data);
    }
  };

  const filtered = filterInspections(inspections, { filterType, filterStatus });
  const stats = computeInspectionStats(inspections);

  // Click stat card to filter
  const handleStatClick = (statusValue) => {
    setFilterStatus(nextStatusFilterToggle(filterStatus, statusValue));
  };

  return (
    <div
      className="sb-dashboard-reference-page"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <CommandBar
        eyebrow={selectedProject ? selectedProject.name : "ALL PROJECTS"}
        title="Inspections"
        count={filtered.length}
        unit={` OF ${inspections.length}`}
        subtitle={inspectionsCommandSubtitle(filterType, filterStatus)}
      >
        <Button variant="primary" icon="plus" onClick={() => { setEditing(null); setShowForm(true); }}>
          New Inspection
        </Button>
      </CommandBar>

      <InspectionsKpiStrip
        stats={stats}
        filterStatus={filterStatus}
        onStatusClick={(v) => {
          if (v === "all") setFilterStatus("all");
          else handleStatClick(v);
        }}
      />

      <InspectionsFilterBar
        filterType={filterType}
        filterStatus={filterStatus}
        onFilterType={setFilterType}
        onFilterStatus={setFilterStatus}
        onClearFilters={() => {
          const empty = createEmptyInspectionFilters();
          setFilterType(empty.filterType);
          setFilterStatus(empty.filterStatus);
        }}
      />

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

      {isLoading ? (
        <LoadingSkeleton variant="table" rows={5} />
      ) : isError ? (
        <InspectionsLoadError
          errorMessage={toUserErrorMessage(error, "Something went wrong. Try again.")}
          onRetry={() => refetch()}
        />
      ) : filtered.length === 0 ? (
        <InspectionsEmptyState
          totalCount={inspections.length}
          onCreate={() => { setEditing(null); setShowForm(true); }}
          onClearFilters={() => {
          const empty = createEmptyInspectionFilters();
          setFilterType(empty.filterType);
          setFilterStatus(empty.filterStatus);
        }}
        />
      ) : (
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
