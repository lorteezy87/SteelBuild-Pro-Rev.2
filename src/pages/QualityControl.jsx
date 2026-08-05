import { useProjectId } from "@/hooks/useProjectId";
import React, { useState, useMemo } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import QCFormModal from "@/components/qc/QCFormModal";
import QCList from "@/components/qc/QCList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { RegisterFetchBody } from "@/components/shared/RegisterFetchStates";
import { CommandBar, Button } from "@/components/design-system";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import {
  filterLiveRecords,
  filterQcRecords,
  computeQcStats,
  hasActiveQcFilters,
  resolveActiveQcCard,
  createEmptyQcFilters,
  qcCommandSubtitle,
  applyQcCardFilters,
} from "./qualityControl/qualityControlPageHelpers";
import {
  QcKpiStrip,
  QcSearchBar,
  QcFilterBar,
} from "./qualityControl/QualityControlUi";

import { findById } from "@/pages/shared/findById";
export default function QualityControl() {
  const projectId = useProjectId();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [filterResult, setFilterResult] = useState("all");
  const [filterStatus, setFilterStatus] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const qc = useQueryClient();

  const createMut = useMutation({
    mutationFn: (data) => entities.QualityControlRecord.create(withProjectId(data, projectId)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["qc-records", projectId] }); toast.success("Record created"); setShowForm(false); setEditing(null); },
    onError: (e) => toast.error(toUserErrorMessage(e, "Create failed")),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => entities.QualityControlRecord.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["qc-records"] }); toast.success("Record updated"); setShowForm(false); setEditing(null); },
    onError: (e) => toast.error(toUserErrorMessage(e, "Update failed")),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => entities.QualityControlRecord.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["qc-records"] }); toast.success("Record deleted"); setDeleteTarget(null); },
    onError: (e) => toast.error(toUserErrorMessage(e, "Delete failed")),
  });

  const handleSave = (data) => {
    if (editing?.id) updateMut.mutate({ id: editing.id, ...data });
    else createMut.mutate(data);
  };

  const {
    data: rawQcRecords = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["qc-records", projectId],
    queryFn: () =>
      projectId
        ? entities.QualityControlRecord.filter({ project_id: projectId })
        : entities.QualityControlRecord.list("-test_date"),
  });
  // Defensive soft-delete filter (entity layer also does this at fetch).
  const qcRecords = useMemo(() => filterLiveRecords(rawQcRecords), [rawQcRecords]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const selectedProject = findById(projects, projectId);

  const hasActiveFilters = hasActiveQcFilters({ filterType, filterResult, filterStatus, searchQuery });

  const filtered = useMemo(
    () =>
      filterQcRecords(qcRecords, {
        filterType,
        filterResult,
        filterStatus,
        searchQuery,
      }),
    [qcRecords, filterType, filterResult, filterStatus, searchQuery],
  );

  const { passRate, total, passed, failed, conditional, pending } = computeQcStats(qcRecords);
  const stats = { total, passed, failed, conditional, pending };

  const clearFilters = () => {
    const empty = createEmptyQcFilters();
    setFilterType(empty.filterType);
    setFilterResult(empty.filterResult);
    setFilterStatus(empty.filterStatus);
    setSearchQuery(empty.searchQuery);
  };

  const applyCard = (card) => {
    const next = applyQcCardFilters(card);
    setFilterResult(next.filterResult);
    setFilterStatus(next.filterStatus);
    setFilterType(next.filterType);
    setSearchQuery(next.searchQuery);
  };

  const activeCard = resolveActiveQcCard({ filterStatus, filterResult });

  return (
    <div
      className="sb-dashboard-reference-page"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <CommandBar
        eyebrow={selectedProject ? selectedProject.name : "ALL PROJECTS"}
        title="Quality Control"
        count={filtered.length}
        unit=" · RECORDS"
        subtitle={qcCommandSubtitle(passRate, stats.pending)}
      >
        <Button variant="primary" icon="plus" onClick={() => { setEditing(null); setShowForm(true); }}>
          New Test
        </Button>
      </CommandBar>

      <QcKpiStrip
        stats={stats}
        passRate={passRate}
        activeCard={activeCard}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
        onPassed={() => applyCard("passed")}
        onFailed={() => applyCard("failed")}
        onPending={() => applyCard("pending")}
      />

      <QcSearchBar searchQuery={searchQuery} onSearchQuery={setSearchQuery} />

      <QcFilterBar
        filterType={filterType}
        filterResult={filterResult}
        filterStatus={filterStatus}
        onFilterType={setFilterType}
        onFilterResult={(result) => { setFilterResult(result); setFilterStatus(null); }}
      />

      {showForm && (
        <QCFormModal
          projectId={projectId}
          record={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSave={handleSave}
          isSaving={createMut.isPending || updateMut.isPending}
        />
      )}

      <RegisterFetchBody
        isLoading={isLoading}
        isError={isError}
        errorMessage={toUserErrorMessage(error, "Failed to load QC records")}
        onRetry={() => refetch()}
        totalCount={qcRecords.length}
        filteredCount={filtered.length}
        emptyTitle="No quality control records yet"
        emptyBody="Create your first test record to start tracking material certifications, NDT results, and inspection outcomes."
        emptyActionLabel="+ New Test Record"
        onEmptyAction={() => { setEditing(null); setShowForm(true); }}
        onClearFilters={clearFilters}
      >
        <QCList records={filtered} onEdit={(record) => {setEditing(record); setShowForm(true);}} onDelete={setDeleteTarget} />
      </RegisterFetchBody>

      <DeleteDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteMut.mutate(deleteTarget.id)} title="Delete Record" description="Delete this record? This cannot be undone." />
    </div>
  );
}
