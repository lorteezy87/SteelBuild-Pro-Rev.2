/**
 * Projects — flat sortable list of every project.
 *
 * Columns: name | number | client | phase | health | $ value | start | target | % complete
 * % complete is the average of percent_complete across each project's
 * work packages (mirrors PortfolioTracker's derivation). Clicking a row
 * opens the project page.
 */

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { entities } from "@/api/supabaseClient";
import { createPageUrl } from "@/utils";
import { PHASES, PHASE_COLORS } from "@/utils/phases";
import ReportShell from "./ReportShell";
import ReportTable from "./ReportTable";
import { FilterBar, SearchInput, SelectFilter } from "./ReportFilters";
import {
  formatCurrencyFull,
  formatDate,
  formatPercent,
  exportTableCSV,
} from "./utils";
import { mono, PROJECT_HEALTH_COLORS } from "./constants";

const SUPPORTED_PHASES = new Set(PHASES);

function PhaseDot({ phase }) {
  const isCanonical = SUPPORTED_PHASES.has(phase);
  const color = isCanonical ? PHASE_COLORS[phase] : "var(--text-muted)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, ...mono, fontSize: 10, color: "var(--text-secondary)" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {phase || "—"}
    </span>
  );
}

function HealthDot({ status }) {
  const color = PROJECT_HEALTH_COLORS[status] || "var(--text-muted)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, ...mono, fontSize: 10, color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      {status || "—"}
    </span>
  );
}

export default function Projects() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
  });
  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages-global"],
    queryFn: () => entities.WorkPackage.list(),
  });

  const rows = useMemo(() => {
    return projects.map((p) => {
      const pWPs = workPackages.filter((w) => w.project_id === p.id);
      const pctComplete = pWPs.length
        ? pWPs.reduce((s, w) => s + (Number(w.percent_complete) || 0), 0) / pWPs.length
        : 0;
      return {
        id: p.id,
        name: p.name || "Untitled Project",
        number: p.project_number || `P-${p.id}`,
        client: p.general_contractor || p.client || "",
        phase: p.phase || "",
        health: p.health_status || "",
        startDate: p.start_date,
        targetDate: p.target_completion_date,
        contractValue: Number(p.original_contract_value) || 0,
        pctComplete,
      };
    });
  }, [projects, workPackages]);

  const filtered = useMemo(() => {
    let out = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((r) =>
        r.name.toLowerCase().includes(q) ||
        r.number.toLowerCase().includes(q) ||
        r.client.toLowerCase().includes(q)
      );
    }
    if (phaseFilter !== "all") out = out.filter((r) => r.phase === phaseFilter);
    if (healthFilter !== "all") out = out.filter((r) => r.health === healthFilter);
    return out;
  }, [rows, search, phaseFilter, healthFilter]);

  const columns = useMemo(() => [
    {
      key: "name",
      label: "Project",
      width: "minmax(200px, 2fr)",
      render: (r) => (
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
          <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{r.number}</div>
        </div>
      ),
      csvValue: (r) => `${r.number} ${r.name}`,
    },
    { key: "client", label: "Client", width: "minmax(140px, 1.4fr)" },
    { key: "phase", label: "Phase", width: "minmax(140px, 1fr)", render: (r) => <PhaseDot phase={r.phase} /> },
    { key: "health", label: "Health", width: "minmax(110px, 1fr)", render: (r) => <HealthDot status={r.health} /> },
    {
      key: "contractValue",
      label: "$ Value",
      width: "minmax(110px, 1fr)",
      align: "right",
      render: (r) => <span style={{ ...mono, color: "var(--text-primary)" }}>{formatCurrencyFull(r.contractValue)}</span>,
      csvValue: (r) => r.contractValue,
    },
    {
      key: "startDate",
      label: "Start",
      width: "100px",
      render: (r) => formatDate(r.startDate),
      csvValue: (r) => r.startDate || "",
    },
    {
      key: "targetDate",
      label: "Target",
      width: "100px",
      render: (r) => formatDate(r.targetDate),
      csvValue: (r) => r.targetDate || "",
    },
    {
      key: "pctComplete",
      label: "% Complete",
      width: "120px",
      align: "right",
      render: (r) => (
        <span style={{ ...mono, color: r.pctComplete >= 90 ? "var(--status-success)" : r.pctComplete >= 50 ? "var(--accent)" : "var(--text-secondary)" }}>
          {formatPercent(r.pctComplete, 0)}
        </span>
      ),
      csvValue: (r) => r.pctComplete.toFixed(1),
    },
  ], []);

  return (
    <ReportShell
      title="Projects"
      count={filtered.length}
      unit=" · PROJECTS"
      subtitle="Every project across the portfolio. Click a row to drill in."
      onExportCSV={() => exportTableCSV({
        filename: "projects",
        columns,
        rows: filtered,
        summary: {
          "Total Projects": filtered.length,
          "Generated": new Date().toLocaleString(),
        },
      })}
      filters={
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search projects, numbers, or clients..." />
          <SelectFilter
            label="Phase"
            value={phaseFilter}
            onChange={setPhaseFilter}
            options={[{ key: "all", label: "All phases" }, ...PHASES.map((p) => ({ key: p, label: p }))]}
          />
          <SelectFilter
            label="Health"
            value={healthFilter}
            onChange={setHealthFilter}
            options={[
              { key: "all", label: "All" },
              { key: "On Track", label: "On Track" },
              { key: "Watch", label: "Watch" },
              { key: "At Risk", label: "At Risk" },
              { key: "On Hold", label: "On Hold" },
            ]}
          />
        </FilterBar>
      }
    >
      <ReportTable
        columns={columns}
        rows={filtered}
        initialSort={{ key: "name", dir: "asc" }}
        emptyText={projects.length === 0 ? "No projects yet — create one to populate this report." : "No projects match the current filters."}
        minWidth={1100}
        onRowClick={(r) => navigate(createPageUrl("Projects") + `?id=${r.id}`)}
      />
    </ReportShell>
  );
}
