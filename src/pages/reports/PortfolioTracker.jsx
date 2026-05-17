/**
 * Portfolio Tracker — every project in one sortable table.
 *
 * Columns (per Nick's spec):
 *   name | client | phase | health | start | target | $ value | $ committed | % complete
 *
 * Where:
 *   client      = project.general_contractor || project.client
 *   $ value     = project.original_contract_value (raw, no CO rollup —
 *                 the Project Status / Profit reports own that lens)
 *   $ committed = sum of expenses where payment_status !== 'Voided'
 *   % complete  = average percent_complete across the project's WPs
 *
 * Phases come from `utils/phases.js` PHASES — we don't hardcode the
 * list. A row whose stored phase isn't in PHASES still renders, just
 * uncoloured.
 */

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
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

// Validate hardcoded health vocabulary against the PHASES list at
// module load — every phase used as a column option must exist in
// PHASES so a renamed canonical phase doesn't silently desync.
const SUPPORTED_PHASES = new Set(PHASES);

function HealthDot({ status }) {
  const color = PROJECT_HEALTH_COLORS[status] || "var(--text-muted)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        ...mono,
        fontSize: 10,
        color,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          boxShadow: status === "At Risk" ? `0 0 6px ${color}` : "none",
        }}
      />
      {status || "—"}
    </span>
  );
}

function PhaseChip({ phase }) {
  // Validate at runtime too — phases not in PHASES still render, but
  // without color, so a typo'd row stays visible (don't hide data).
  const isCanonical = SUPPORTED_PHASES.has(phase);
  const color = isCanonical ? PHASE_COLORS[phase] : "var(--text-muted)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        ...mono,
        fontSize: 10,
        color: "var(--text-secondary)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
        }}
      />
      {phase || "—"}
    </span>
  );
}

export default function PortfolioTracker() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");
  const [jobTypeFilter, setJobTypeFilter] = useState("all");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
  });
  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages-global"],
    queryFn: () => base44.entities.WorkPackage.list(),
  });
  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses-all"],
    queryFn: () => base44.entities.Expense.list(),
  });

  const rows = useMemo(() => {
    return projects.map((p) => {
      const pWPs = workPackages.filter((w) => w.project_id === p.id);
      const pctComplete = pWPs.length
        ? pWPs.reduce(
            (s, w) => s + (Number(w.percent_complete) || 0),
            0
          ) / pWPs.length
        : 0;
      const committed = expenses
        .filter(
          (e) => e.project_id === p.id && e.payment_status !== "Voided"
        )
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);
      return {
        id: p.id,
        name: p.name || "Untitled Project",
        number: p.project_number || `P-${p.id}`,
        client: p.general_contractor || p.client || "",
        phase: p.phase || "",
        health: p.health_status || "",
        jobType: p.job_type || "",
        startDate: p.start_date || null,
        targetDate: p.target_completion_date || null,
        contractValue: Number(p.original_contract_value) || 0,
        committed,
        pctComplete,
        raw: p,
      };
    });
  }, [projects, workPackages, expenses]);

  const filtered = useMemo(() => {
    let out = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.number.toLowerCase().includes(q) ||
          r.client.toLowerCase().includes(q)
      );
    }
    if (phaseFilter !== "all") out = out.filter((r) => r.phase === phaseFilter);
    if (healthFilter !== "all")
      out = out.filter((r) => r.health === healthFilter);
    if (jobTypeFilter !== "all")
      out = out.filter((r) => r.jobType === jobTypeFilter);
    return out;
  }, [rows, search, phaseFilter, healthFilter, jobTypeFilter]);

  const columns = useMemo(
    () => [
      {
        key: "name",
        label: "Project",
        width: "minmax(200px, 2fr)",
        render: (r) => (
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              onClick={() =>
                navigate(createPageUrl("Projects") + `?id=${r.id}`)
              }
              style={{
                fontWeight: 600,
                color: "var(--text-primary)",
                cursor: "pointer",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {r.name}
            </div>
            <div
              style={{
                ...mono,
                fontSize: 9,
                color: "var(--text-muted)",
                marginTop: 2,
              }}
            >
              {r.number}
            </div>
          </div>
        ),
        csvValue: (r) => `${r.number} ${r.name}`,
      },
      {
        key: "client",
        label: "Client",
        width: "minmax(140px, 1.4fr)",
      },
      {
        key: "phase",
        label: "Phase",
        width: "minmax(130px, 1fr)",
        render: (r) => <PhaseChip phase={r.phase} />,
      },
      {
        key: "jobType",
        label: "Job Type",
        width: "minmax(130px, 1fr)",
        render: (r) => (
          <span style={{ ...mono, fontSize: 10, color: r.jobType ? "var(--text-secondary)" : "var(--text-muted)" }}>
            {r.jobType || "—"}
          </span>
        ),
        csvValue: (r) => r.jobType || "",
      },
      {
        key: "health",
        label: "Health",
        width: "minmax(110px, 1fr)",
        render: (r) => <HealthDot status={r.health} />,
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
        key: "contractValue",
        label: "$ Value",
        width: "minmax(110px, 1fr)",
        align: "right",
        render: (r) => (
          <span style={{ ...mono, color: "var(--text-primary)" }}>
            {formatCurrencyFull(r.contractValue)}
          </span>
        ),
        csvValue: (r) => r.contractValue,
      },
      {
        key: "committed",
        label: "$ Committed",
        width: "minmax(120px, 1fr)",
        align: "right",
        render: (r) => (
          <span style={{ ...mono, color: "var(--text-secondary)" }}>
            {formatCurrencyFull(r.committed)}
          </span>
        ),
        csvValue: (r) => r.committed,
      },
      {
        key: "pctComplete",
        label: "% Complete",
        width: "120px",
        align: "right",
        render: (r) => (
          <span
            style={{
              ...mono,
              color:
                r.pctComplete >= 90
                  ? "var(--status-success)"
                  : r.pctComplete >= 50
                    ? "var(--accent)"
                    : "var(--text-secondary)",
            }}
          >
            {formatPercent(r.pctComplete, 0)}
          </span>
        ),
        csvValue: (r) => r.pctComplete.toFixed(1),
      },
    ],
    [navigate]
  );

  const totalValue = filtered.reduce((s, r) => s + r.contractValue, 0);
  const totalCommitted = filtered.reduce((s, r) => s + r.committed, 0);

  return (
    <ReportShell
      title="Portfolio Tracker"
      count={filtered.length}
      unit=" · PROJECTS"
      subtitle={`${formatCurrencyFull(totalValue)} contract value · ${formatCurrencyFull(totalCommitted)} committed`}
      onExportCSV={() =>
        exportTableCSV({
          filename: "portfolio_tracker",
          columns,
          rows: filtered,
          summary: {
            "Total Projects": filtered.length,
            "Total Contract Value": formatCurrencyFull(totalValue),
            "Total Committed": formatCurrencyFull(totalCommitted),
            "Generated": new Date().toLocaleString(),
          },
        })
      }
      filters={
        <FilterBar>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by project, number, or client..."
          />
          <SelectFilter
            label="Phase"
            value={phaseFilter}
            onChange={setPhaseFilter}
            options={[
              { key: "all", label: "All phases" },
              ...PHASES.map((p) => ({ key: p, label: p })),
            ]}
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
          <SelectFilter
            label="Job Type"
            value={jobTypeFilter}
            onChange={setJobTypeFilter}
            options={[
              { key: "all", label: "All" },
              { key: "Beams/Deck", label: "Beams/Deck" },
              { key: "Beams/Joists/Deck", label: "Beams/Joists/Deck" },
              { key: "Joist Deck", label: "Joist Deck" },
              { key: "Tilt", label: "Tilt" },
              { key: "Tilt Hybrid", label: "Tilt Hybrid" },
              { key: "Misc.", label: "Misc." },
              { key: "Other", label: "Other" },
            ]}
          />
        </FilterBar>
      }
    >
      <ReportTable
        columns={columns}
        rows={filtered}
        initialSort={{ key: "name", dir: "asc" }}
        emptyText={
          projects.length === 0
            ? "No projects yet — create one to populate this report."
            : "No projects match the current filters."
        }
        minWidth={1100}
        onRowClick={(r) =>
          navigate(createPageUrl("Projects") + `?id=${r.id}`)
        }
      />
    </ReportShell>
  );
}
