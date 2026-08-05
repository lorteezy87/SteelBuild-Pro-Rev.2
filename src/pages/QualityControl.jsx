import { useProjectId } from "@/hooks/useProjectId";
import React, { useState, useMemo } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import QCFormModal from "@/components/qc/QCFormModal";
import QCList from "@/components/qc/QCList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { RegisterFetchBody } from "@/components/shared/RegisterFetchStates";
import { CommandBar, KpiTile, Button } from "@/components/design-system";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import {
  filterLiveRecords,
  filterQcRecords,
  computeQcStats,
  QC_TEST_TYPES,
  hasActiveQcFilters,
  resolveActiveQcCard,
  createEmptyQcFilters,
} from "./qualityControl/qualityControlPageHelpers";

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

  const types = QC_TEST_TYPES;

  const clearFilters = () => {
    const empty = createEmptyQcFilters();
    setFilterType(empty.filterType);
    setFilterResult(empty.filterResult);
    setFilterStatus(empty.filterStatus);
    setSearchQuery(empty.searchQuery);
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
        subtitle={`${passRate}% pass rate · ${stats.pending} pending · material certs, weld inspections, NDT tests`}
      >
        <Button variant="primary" icon="plus" onClick={() => { setEditing(null); setShowForm(true); }}>
          New Test
        </Button>
      </CommandBar>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <KpiTile compact label="Total Tests" value={stats.total}    color="var(--accent)"
                 active={activeCard === null && !hasActiveFilters}  onClick={clearFilters} />
        <KpiTile compact label="Pass Rate"   value={`${passRate}%`} color="var(--status-success)" />
        <KpiTile compact label="Passed"      value={stats.passed}   color="var(--status-success)"
                 active={activeCard === "passed"}
                 onClick={() => { setFilterResult("Pass"); setFilterStatus(null); setFilterType("all"); setSearchQuery(""); }} />
        <KpiTile compact label="Failed"      value={stats.failed}   color="var(--status-error)"
                 active={activeCard === "failed"}
                 onClick={() => { setFilterResult("Fail"); setFilterStatus(null); setFilterType("all"); setSearchQuery(""); }} />
        <KpiTile compact label="Pending"     value={stats.pending}  color="var(--status-warning)"
                 active={activeCard === "pending"}
                 onClick={() => { setFilterResult("all"); setFilterStatus("Pending"); setFilterType("all"); setSearchQuery(""); }} />
      </div>

      {/* Search Bar */}
      <div style={{ position: "relative" }}>
        <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by material, location, heat number, spec..."
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "8px 12px 8px 32px",
            fontFamily: "var(--font-body)",
            fontSize: "11px",
            color: "var(--text-primary)",
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-btn)",
            outline: "none",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Type:</span>
          {["all", ...types].map((type) => (
            <button key={type} onClick={() => setFilterType(type)} style={{ background: filterType === type ? "var(--accent)" : "var(--bg-surface-low)", color: filterType === type ? "white" : "var(--text-secondary)", border: "none", borderRadius: "var(--radius-btn)", padding: "5px 12px", fontFamily: "var(--font-body)", fontSize: "8px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {type === "all" ? "All" : type.split(" ")[0].slice(0, 5)}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Result:</span>
          {["all", "Pass", "Fail", "Conditional Pass"].map((result) => (
            <button key={result} onClick={() => { setFilterResult(result); setFilterStatus(null); }} style={{ background: filterResult === result && filterStatus === null ? "var(--accent)" : "var(--bg-surface-low)", color: filterResult === result && filterStatus === null ? "white" : "var(--text-secondary)", border: "none", borderRadius: "var(--radius-btn)", padding: "5px 12px", fontFamily: "var(--font-body)", fontSize: "8px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {result === "all" ? "All" : result.slice(0, 5)}
            </button>
          ))}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <QCFormModal
          projectId={projectId}
          record={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSave={handleSave}
          isSaving={createMut.isPending || updateMut.isPending}
        />
      )}

      {/* QC Records List */}
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

      {/* Delete Dialog */}
      <DeleteDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteMut.mutate(deleteTarget.id)} title="Delete Record" description="Delete this record? This cannot be undone." />
    </div>
  );
}

