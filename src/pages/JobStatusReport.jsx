import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import {
  CheckCircle2,
  AlertCircle, Building2, Search, X,
  Filter, Clock, AlertTriangle, FileSpreadsheet,
} from "lucide-react";
import ProjectDrilldownModal from "../components/reports/ProjectDrilldownModal";
import PsrSpreadsheetImportModal from "@/components/reports/PsrSpreadsheetImportModal";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";

const today = new Date().toLocaleDateString("en-US", {
  weekday: "long", year: "numeric", month: "long", day: "numeric",
  timeZone: "America/Phoenix",
});
import { CommandBar } from "@/components/design-system";

import {
  enrichProjectsWithReadiness,
  computeJobStatusKpis,
  filterJobStatusProjects,
  countByHealthStatus,
} from "./jobStatusReport/jobStatusReportHelpers";
import {
  FilterChip,
  KpiTile,
  ReportTableRow,
  PreviewDrawer,
} from "./jobStatusReport/JobStatusReportUi";

export default function JobStatusReport() {
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const [drilldownProject, setDrilldownProject] = useState(null);
  const [previewProject, setPreviewProject] = useState(null);
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState("all");
  const [readinessFilter, setReadinessFilter] = useState("all");
  const [psrImportOpen, setPsrImportOpen] = useState(false);

  /* ── Enrich projects with readiness ── */
  const enriched = useMemo(
    () => enrichProjectsWithReadiness(projects),
    [projects],
  );

  /* ── Operational KPIs ── */
  const kpis = useMemo(
    () => computeJobStatusKpis(enriched),
    [enriched],
  );

  /* ── Filtering ── */
  const filtered = useMemo(
    () =>
      filterJobStatusProjects(enriched, {
        search,
        healthFilter,
        readinessFilter,
      }),
    [enriched, search, healthFilter, readinessFilter],
  );

  return (
    <div className="sb-dashboard-reference-page" style={{ maxWidth: 1280, margin: "0 auto", paddingBottom: 40 }}>
      <CommandBar
        eyebrow="OWNER REPORTING"
        title="Job Status Reports"
        count={projects.length}
        unit=" · PROJECTS"
        subtitle={today}
      >
        <button
          onClick={() => setPsrImportOpen(true)}
          disabled={projects.length === 0}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 14px", borderRadius: "var(--radius-btn)",
            background: "var(--bg-surface-low)",
            border: "1px solid var(--border-default)",
            color: "var(--text-secondary)",
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
            cursor: projects.length === 0 ? "not-allowed" : "pointer",
            letterSpacing: "0.08em", textTransform: "uppercase",
            opacity: projects.length === 0 ? 0.55 : 1,
            whiteSpace: "nowrap",
          }}
        >
          <FileSpreadsheet size={12} /> Import PSR
        </button>
      </CommandBar>

      {/* ── Operational KPI row ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 10, marginBottom: 16,
      }}>
        <KpiTile label="Ready"             value={kpis.readyCount}        color="var(--success)" icon={CheckCircle2} sub="Full data, ready to generate" />
        <KpiTile label="Needs Review"      value={kpis.needsReviewCount}  color="var(--warning)" icon={AlertCircle} sub="At-risk — PM check" />
        <KpiTile label="Missing Data"      value={kpis.missingDataCount}  color="var(--danger)"  icon={AlertTriangle} sub="Blocked — fill fields" />
        <KpiTile label="At Risk"           value={kpis.atRiskCount}       color="var(--danger)"  icon={AlertCircle} sub="Flagged health status" />
        <KpiTile label="Generated / Week"  value={kpis.generatedThisWeek} color="var(--info)"    icon={Clock} sub="Last 7 days" />
      </div>

      {/* ── Insight band ── */}
      {(kpis.missingDataCount > 0 || kpis.needsReviewCount > 0) && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "var(--bg-surface-low)",
          borderLeft: "2px solid var(--warning)",
          borderRadius: "var(--radius-card)",
          padding: "10px 16px",
          marginBottom: 16,
        }}>
          <AlertTriangle size={12} color="var(--warning)" />
          <span style={{
            fontFamily: "var(--font-body)", fontSize: 11,
            color: "var(--text-secondary)",
          }}>
            {kpis.missingDataCount > 0 && `${kpis.missingDataCount} project${kpis.missingDataCount > 1 ? "s" : ""} missing required fields`}
            {kpis.missingDataCount > 0 && kpis.needsReviewCount > 0 && " · "}
            {kpis.needsReviewCount > 0 && `${kpis.needsReviewCount} need${kpis.needsReviewCount === 1 ? "s" : ""} PM review before generation`}
          </span>
        </div>
      )}

      {/* ── Filter + search bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        marginBottom: 12,
      }}>
        <Filter size={12} color="var(--text-muted)" />
        <FilterChip label="All" count={enriched.length} active={healthFilter === "all" && readinessFilter === "all"} onClick={() => { setHealthFilter("all"); setReadinessFilter("all"); }} />
        <FilterChip label="At Risk" count={countByHealthStatus(enriched, "At Risk")} active={healthFilter === "At Risk"} onClick={() => setHealthFilter(healthFilter === "At Risk" ? "all" : "At Risk")} color="var(--danger)" />
        <FilterChip label="Watch"   count={countByHealthStatus(enriched, "Watch")}   active={healthFilter === "Watch"}   onClick={() => setHealthFilter(healthFilter === "Watch" ? "all" : "Watch")} color="var(--warning)" />
        <FilterChip label="Ready"   count={kpis.readyCount}         active={readinessFilter === "ready"}        onClick={() => setReadinessFilter(readinessFilter === "ready" ? "all" : "ready")} color="var(--success)" />
        <FilterChip label="Missing Data" count={kpis.missingDataCount} active={readinessFilter === "missing-data"} onClick={() => setReadinessFilter(readinessFilter === "missing-data" ? "all" : "missing-data")} color="var(--danger)" />

        <div style={{ position: "relative", flex: 1, minWidth: 200, marginLeft: "auto" }}>
          <Search size={12} color="var(--text-muted)" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }} />
          <input
            type="text"
            placeholder="Search project, number, or client…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: "100%",
              background: "var(--bg-surface-low)",
              border: "1px solid var(--border-default)",
              borderRadius: 6,
              padding: "7px 32px 7px 32px",
              fontFamily: "var(--font-body)",
              fontSize: 11,
              color: "var(--text-primary)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{
              position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--text-muted)",
            }}>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── Reporting table ── */}
      <div style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
        boxShadow: "var(--shadow-card)",
      }}>
        {/* Sticky header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "2fr 110px 110px 120px 130px 1fr 140px",
          gap: 0,
          padding: "10px 14px",
          background: "var(--bg-surface-low)",
          borderBottom: "1px solid var(--border-default)",
          position: "sticky", top: 0, zIndex: 2,
        }}>
          {["Project", "Phase", "Health", "Completeness", "Readiness", "Last Generated", "Actions"].map(col => (
            <div key={col} style={{
              fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
              color: "var(--text-muted)", letterSpacing: "0.13em", textTransform: "uppercase",
              paddingRight: 8,
              textAlign: col === "Actions" ? "right" : "left",
            }}>
              {col}
            </div>
          ))}
        </div>

        {/* Rows */}
        {isLoading ? (
          <div style={{ padding: 24 }}>
            <LoadingSkeleton variant="table" rows={6} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <Building2 size={32} color="var(--text-disabled)" style={{ margin: "0 auto 10px" }} />
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
              {search || healthFilter !== "all" || readinessFilter !== "all"
                ? "NO PROJECTS MATCH YOUR FILTERS"
                : "NO PROJECTS FOUND"}
            </p>
          </div>
        ) : (
          filtered.map((p, i) => (
            <ReportTableRow
              key={p.id}
              project={p}
              index={i}
              onDrilldown={() => setDrilldownProject(p)}
              onPreview={() => setPreviewProject(p)}
            />
          ))
        )}
      </div>

      {/* Preview drawer */}
      <PreviewDrawer
        project={previewProject}
        onClose={() => setPreviewProject(null)}
      />

      {/* Drilldown modal */}
      {drilldownProject && (
        <ProjectDrilldownModal
          project={drilldownProject}
          onClose={() => setDrilldownProject(null)}
        />
      )}

      <PsrSpreadsheetImportModal
        open={psrImportOpen}
        projects={projects}
        onClose={() => setPsrImportOpen(false)}
      />
    </div>
  );
}
