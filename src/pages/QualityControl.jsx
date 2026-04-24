import { useProjectContext } from "@/components/shared/useProjectContext";
import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import QCFormModal from "@/components/qc/QCFormModal";
import QCList from "@/components/qc/QCList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { CommandBar, KpiTile } from "@/components/design-system";
import { Plus } from "lucide-react";

export default function QualityControl() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [filterResult, setFilterResult] = useState("all");
  const [filterStatus, setFilterStatus] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const qc = useQueryClient();

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.QualityControlRecord.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["qc-records"] }); toast.success("Record created"); setShowForm(false); setEditing(null); },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => base44.entities.QualityControlRecord.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["qc-records"] }); toast.success("Record updated"); setShowForm(false); setEditing(null); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.QualityControlRecord.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["qc-records"] }); toast.success("Record deleted"); setDeleteTarget(null); },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = (data) => {
    if (editing?.id) updateMut.mutate({ id: editing.id, ...data });
    else createMut.mutate({ ...data, project_id: projectId });
  };

  const { data: qcRecords = [], isLoading } = useQuery({
    queryKey: ["qc-records", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.QualityControlRecord.filter({ project_id: projectId })
        : base44.entities.QualityControlRecord.list("-test_date"),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  const hasActiveFilters = filterType !== "all" || filterResult !== "all" || filterStatus !== null || searchQuery.trim() !== "";

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return qcRecords.filter((record) => {
      const typeMatch = filterType === "all" || record.test_type === filterType;
      const resultMatch = filterResult === "all" || record.result === filterResult;
      const statusMatch = filterStatus === null || record.status === filterStatus;
      const searchMatch = !query || [
        record.material_or_component,
        record.location,
        record.test_lab_or_inspector,
        record.specification,
        record.notes,
      ].some((field) => field && String(field).toLowerCase().includes(query));
      return typeMatch && resultMatch && statusMatch && searchMatch;
    });
  }, [qcRecords, filterType, filterResult, filterStatus, searchQuery]);

  const stats = {
    total: qcRecords.length,
    passed: qcRecords.filter((r) => r.result === "Pass").length,
    failed: qcRecords.filter((r) => r.result === "Fail").length,
    conditional: qcRecords.filter((r) => r.result === "Conditional Pass").length,
    pending: qcRecords.filter((r) => r.status === "Pending").length,
  };

  const conclusiveCount = qcRecords.filter((r) => r.result !== "Inconclusive").length;
  const passRate = conclusiveCount > 0
    ? Math.round(((stats.passed + stats.conditional) / conclusiveCount) * 100)
    : 0;

  const types = [
    "Material Certificate",
    "Tensile Test",
    "Hardness Test",
    "Impact Test",
    "NDT - Ultrasonic",
    "NDT - Radiography",
    "Weld Test",
    "Coating Test",
  ];

  const clearFilters = () => {
    setFilterType("all");
    setFilterResult("all");
    setFilterStatus(null);
    setSearchQuery("");
  };

  /* Determine which stat card is "active" */
  const activeCard =
    filterStatus === "Pending" ? "pending"
    : filterResult === "Pass" && filterStatus === null ? "passed"
    : filterResult === "Fail" && filterStatus === null ? "failed"
    : filterType === "all" && filterResult === "all" && filterStatus === null ? null
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CommandBar
        eyebrow={selectedProject ? selectedProject.name : "ALL PROJECTS"}
        title="Quality Control"
        count={filtered.length}
        unit=" · RECORDS"
        subtitle={`${passRate}% pass rate · ${stats.pending} pending · material certs, weld inspections, NDT tests`}
      >
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--accent)", color: "var(--bg-base)", border: "none",
            borderRadius: "var(--radius-btn)", padding: "8px 14px",
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
            letterSpacing: "0.08em", cursor: "pointer", textTransform: "uppercase",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        >
          <Plus size={12} /> New Test
        </button>
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
      {isLoading ? (
        <LoadingSkeleton variant="table" rows={5} />
      ) : filtered.length === 0 ? (
        qcRecords.length === 0 ? (
          /* Truly empty — no records at all */
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px", background: "var(--bg-surface)", borderRadius: "var(--radius-card)", gap: "16px" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              <path d="M9 14l2 2 4-4" />
            </svg>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", margin: 0, textAlign: "center" }}>No quality control records yet</p>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "11px", color: "var(--text-muted)", margin: 0, textAlign: "center", maxWidth: 320 }}>Create your first test record to start tracking material certifications, NDT results, and inspection outcomes.</p>
            <button
              onClick={() => { setEditing(null); setShowForm(true); }}
              style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: "var(--radius-btn)", padding: "8px 20px", fontFamily: "var(--font-body)", fontSize: "10px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
            >+ New Test Record</button>
          </div>
        ) : (
          /* Has records but filters exclude everything */
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "36px 24px", background: "var(--bg-surface)", borderRadius: "var(--radius-card)", gap: "12px" }}>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>No records match the current filters</p>
            <button
              onClick={clearFilters}
              style={{ background: "transparent", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: "var(--radius-btn)", padding: "6px 16px", fontFamily: "var(--font-body)", fontSize: "10px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.color = "white"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--accent)"; }}
            >Clear Filters</button>
          </div>
        )
      ) : (
        <QCList records={filtered} onEdit={(record) => {setEditing(record); setShowForm(true);}} onDelete={setDeleteTarget} />
      )}

      {/* Delete Dialog */}
      <DeleteDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteMut.mutate(deleteTarget.id)} title="Delete Record" description="Delete this record? This cannot be undone." />
    </div>
  );
}

