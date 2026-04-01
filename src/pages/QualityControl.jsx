import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "../components/shared/useProjectContext";
import QCFormModal from "@/components/qc/QCFormModal";
import QCList from "@/components/qc/QCList";

const panelStyle = {
  background: "linear-gradient(180deg, rgba(31,33,37,0.96), rgba(12,14,17,0.98))",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card)",
};

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

export default function QualityControl() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterResult, setFilterResult] = useState("all");
  const [search, setSearch] = useState("");

  const { data: qcRecords = [] } = useQuery({
    queryKey: ["qc-records", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.QualityControlRecord.filter({ project_id: projectId }, "-test_date")
        : base44.entities.QualityControlRecord.list("-test_date"),
    initialData: [],
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const selectedProject = projectId ? projects.find((p) => p.id === projectId) : null;

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return qcRecords.filter((record) => {
      const typeMatch = filterType === "all" || record.test_type === filterType;
      const resultMatch = filterResult === "all" || record.result === filterResult;
      const searchMatch =
        !term ||
        record.material_or_component?.toLowerCase().includes(term) ||
        record.location?.toLowerCase().includes(term) ||
        record.specification?.toLowerCase().includes(term);
      return typeMatch && resultMatch && searchMatch;
    });
  }, [qcRecords, filterType, filterResult, search]);

  const stats = useMemo(() => {
    const passed = qcRecords.filter((r) => r.result === "Pass").length;
    const failed = qcRecords.filter((r) => r.result === "Fail").length;
    const conditional = qcRecords.filter((r) => r.result === "Conditional Pass").length;
    const pending = qcRecords.filter((r) => r.status === "Pending").length;
    const decisive = qcRecords.filter((r) => r.result !== "Inconclusive").length;
    const passRate = decisive ? Math.round(((passed + conditional) / decisive) * 100) : 0;
    return { total: qcRecords.length, passed, failed, conditional, pending, passRate };
  }, [qcRecords]);

  const alerts = useMemo(
    () =>
      filtered
        .filter((record) => record.result === "Fail" || record.status === "Pending")
        .slice(0, 5),
    [filtered]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <section
        style={{
          ...panelStyle,
          padding: 24,
          background:
            "radial-gradient(circle at top right, rgba(0,229,255,0.12), transparent 28%), radial-gradient(circle at left center, rgba(255,107,0,0.12), transparent 28%), linear-gradient(180deg, rgba(31,33,37,0.96), rgba(9,10,11,0.99))",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, 0.9fr)", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <div style={eyebrow}>Quality Command</div>
              <h1 style={heroTitle}>Testing, traceability, and exception control for steel execution.</h1>
              <p style={heroText}>
                Replace the lightweight test register with an operational QC surface that exposes failure pressure, pending review, and compliance rhythm without hunting through records.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <MetricBlock label="Total Tests" value={stats.total} tone="var(--text-primary)" />
              <MetricBlock label="Pass Rate" value={`${stats.passRate}%`} tone="var(--status-success)" />
              <MetricBlock label="Failures" value={stats.failed} tone={stats.failed ? "var(--status-error)" : "var(--text-muted)"} />
              <MetricBlock label="Pending Review" value={stats.pending} tone={stats.pending ? "var(--status-warning)" : "var(--text-muted)"} />
            </div>
          </div>

          <div style={{ ...panelStyle, padding: 18, background: "rgba(12,14,17,0.82)" }}>
            <div style={eyebrow}>Project Scope</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>
              {selectedProject?.name || "Portfolio Quality View"}
            </div>
            <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
              <DetailRow label="Passing Records" value={stats.passed} tone="var(--status-success)" />
              <DetailRow label="Conditional" value={stats.conditional} tone="var(--status-warning)" />
              <DetailRow label="Open Pressure" value={stats.pending + stats.failed} tone={(stats.pending + stats.failed) ? "var(--accent)" : "var(--text-primary)"} />
            </div>
            <button onClick={() => setShowForm(true)} style={primaryBtn}>
              Create Test Record
            </button>
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 18, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ ...panelStyle, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
              <div>
                <div style={sectionLabel}>QC Filters</div>
                <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
                  Filter by test type, result, or material to isolate active quality risk.
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) auto auto", gap: 12, alignItems: "center" }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search component, location, or spec..."
              />
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="all">All Test Types</option>
                {types.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <select value={filterResult} onChange={(e) => setFilterResult(e.target.value)}>
                <option value="all">All Results</option>
                <option value="Pass">Pass</option>
                <option value="Fail">Fail</option>
                <option value="Conditional Pass">Conditional Pass</option>
                <option value="Inconclusive">Inconclusive</option>
              </select>
            </div>
          </div>

          <div style={{ ...panelStyle, padding: 18 }}>
            <div style={sectionLabel}>Quality Ledger</div>
            <QCList records={filtered} />
          </div>
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ ...panelStyle, padding: 18 }}>
            <div style={sectionLabel}>Exception Queue</div>
            {alerts.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {alerts.map((record) => (
                  <div key={record.id} style={alertCard}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
                      {record.material_or_component || record.test_type}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      {record.result} · {record.status}
                      {record.location ? ` · ${record.location}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                No active failures or pending approvals in the current filtered view.
              </div>
            )}
          </div>
        </aside>
      </section>

      {showForm && <QCFormModal projectId={projectId} onClose={() => setShowForm(false)} />}
    </div>
  );
}

function MetricBlock({ label, value, tone }) {
  return (
    <div style={{ ...panelStyle, padding: 16, background: "rgba(12,14,17,0.78)" }}>
      <div style={sectionLabel}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 800, lineHeight: 1, color: tone }}>{value}</div>
    </div>
  );
}

function DetailRow({ label, value, tone }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: "1px solid var(--divider)", paddingBottom: 8 }}>
      <span style={{ fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, color: tone }}>{value}</span>
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
  maxWidth: 720,
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

const alertCard = {
  padding: "10px 12px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid var(--divider)",
  borderRadius: "var(--radius-card)",
};
