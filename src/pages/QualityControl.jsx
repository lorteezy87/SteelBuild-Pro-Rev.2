import { useProjectContext } from "@/components/shared/useProjectContext";
import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import QCFormModal from "@/components/qc/QCFormModal";
import QCList from "@/components/qc/QCList";

export default function QualityControl() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterResult, setFilterResult] = useState("all");

  const { data: qcRecords = [] } = useQuery({
    queryKey: ["qc-records", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.QualityControlRecord.filter({ project_id: projectId })
        : base44.entities.QualityControlRecord.list("-test_date"),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
  });

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  const filtered = qcRecords.filter((record) => {
    const typeMatch = filterType === "all" || record.test_type === filterType;
    const resultMatch = filterResult === "all" || record.result === filterResult;
    return typeMatch && resultMatch;
  });

  const stats = {
    total: qcRecords.length,
    passed: qcRecords.filter((r) => r.result === "Pass").length,
    failed: qcRecords.filter((r) => r.result === "Fail").length,
    conditional: qcRecords.filter((r) => r.result === "Conditional Pass").length,
    pending: qcRecords.filter((r) => r.status === "Pending").length,
  };

  const passRate = qcRecords.length > 0
    ? Math.round(((stats.passed + stats.conditional) / qcRecords.filter((r) => r.result !== "Inconclusive").length) * 100)
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-body)", fontSize: 24, fontWeight: 800, color: "var(--text-primary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>Quality Control</h1>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", marginTop: 4, letterSpacing: "0.12em", textTransform: "uppercase" }}>{selectedProject ? selectedProject.name : "All Projects"} • {filtered.length} Records</p>
        </div>

        <button onClick={() => {setEditing(null); setShowForm(true);}} style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: "var(--radius-btn)", padding: "8px 16px", fontFamily: "var(--font-body)", fontSize: "10px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }} onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")} onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}>+ New Test</button>
      </div>

      {/* Quality Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "12px" }}>
        <StatCard label="Total Tests" value={stats.total} color="var(--accent)" />
        <StatCard label="Pass Rate" value={`${passRate}%`} color="var(--status-success)" />
        <StatCard label="Passed" value={stats.passed} color="var(--status-success)" />
        <StatCard label="Failed" value={stats.failed} color="var(--status-error)" />
        <StatCard label="Pending" value={stats.pending} color="var(--status-warning)" />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Type:</span>
          {["all", ...types.slice(0, 4)].map((type) => (
            <button key={type} onClick={() => setFilterType(type)} style={{ background: filterType === type ? "var(--accent)" : "var(--bg-surface-low)", color: filterType === type ? "white" : "var(--text-secondary)", border: "none", borderRadius: "var(--radius-btn)", padding: "5px 12px", fontFamily: "var(--font-body)", fontSize: "8px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {type === "all" ? "All" : type.split(" ")[0].slice(0, 5)}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Result:</span>
          {["all", "Pass", "Fail", "Conditional Pass"].map((result) => (
            <button key={result} onClick={() => setFilterResult(result)} style={{ background: filterResult === result ? "var(--accent)" : "var(--bg-surface-low)", color: filterResult === result ? "white" : "var(--text-secondary)", border: "none", borderRadius: "var(--radius-btn)", padding: "5px 12px", fontFamily: "var(--font-body)", fontSize: "8px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {result === "all" ? "All" : result.slice(0, 5)}
            </button>
          ))}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && <QCFormModal projectId={projectId} record={editing} onClose={() => {setShowForm(false); setEditing(null);}} onSave={handleSave} />}

      {/* QC Records List */}
      <QCList records={filtered} onEdit={(record) => {setEditing(record); setShowForm(true);}} onDelete={setDeleteTarget} />

      {/* Delete Dialog */}
      <DeleteDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteMut.mutate(deleteTarget.id)} title="Delete Record" description="Delete this record? This cannot be undone." />
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "none", borderRadius: "var(--radius-card)", padding: "12px", borderTop: `2px solid ${color}` }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 600, color: color, marginBottom: "4px" }}>{value}</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}