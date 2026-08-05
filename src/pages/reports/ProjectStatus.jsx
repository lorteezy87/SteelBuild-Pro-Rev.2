/**
 * Project Status — financial-lens table.
 *
 * Reuses the same project rows as Portfolio Tracker but reorients on
 * money: revised contract value, projected final cost, projected
 * margin, with phase/health pinned to the left for context.
 *
 *   name | phase | health | start | target | $ value | margin
 *
 * Where:
 *   $ value (revised) = original_contract_value + Σ approved CO amounts
 *                       (via projectMetrics.revisedContractValue)
 *   projected final  = projectMetrics.projectedFinalCost(expenses, project)
 *   margin %         = (revised − projected) / revised · 100
 *                       (via projectMetrics.projectedMargin)
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
import {
  buildProjectStatusRows,
  filterProjectStatusRows,
  projectStatusPortfolioTotals,
} from "./projectStatusHelpers";

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
        }}
      />
      {status || "—"}
    </span>
  );
}

function PhaseChip({ phase }) {
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

export default function ProjectStatus() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("all");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
  });
  const { data: changeOrders = [] } = useQuery({
    queryKey: ["change-orders-global"],
    queryFn: () => entities.ChangeOrder.list(),
  });
  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses-all"],
    queryFn: () => entities.Expense.list(),
  });

  const rows = useMemo(
    () => buildProjectStatusRows({ projects, changeOrders, expenses }),
    [projects, changeOrders, expenses],
  );

  const filtered = useMemo(
    () => filterProjectStatusRows(rows, { search, phaseFilter }),
    [rows, search, phaseFilter],
  );

  const columns = useMemo(
    () => [
      {
        key: "name",
        label: "Project",
        width: "minmax(220px, 2fr)",
        render: (r) => (
          <div style={{ minWidth: 0 }}>
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
        key: "revised",
        label: "$ Value (Revised)",
        width: "minmax(140px, 1.1fr)",
        align: "right",
        render: (r) => (
          <span style={{ ...mono, color: "var(--text-primary)" }}>
            {formatCurrencyFull(r.revised)}
          </span>
        ),
        csvValue: (r) => r.revised,
      },
      {
        key: "projected",
        label: "Projected Final",
        width: "minmax(130px, 1fr)",
        align: "right",
        render: (r) => (
          <span style={{ ...mono, color: "var(--text-secondary)" }}>
            {formatCurrencyFull(r.projected)}
          </span>
        ),
        csvValue: (r) => r.projected,
      },
      {
        key: "margin",
        label: "Margin",
        width: "100px",
        align: "right",
        render: (r) => {
          const color =
            r.margin >= 10
              ? "var(--status-success)"
              : r.margin >= 0
                ? "var(--accent)"
                : "var(--status-error)";
          return (
            <span style={{ ...mono, color, fontWeight: 700 }}>
              {formatPercent(r.margin, 1)}
            </span>
          );
        },
        csvValue: (r) => r.margin.toFixed(2),
      },
    ],
    [navigate]
  );

  const { totalRevised, totalProjected, portfolioMargin } =
    projectStatusPortfolioTotals(filtered);

  return (
    <ReportShell
      title="Project Status"
      count={filtered.length}
      unit=" · PROJECTS"
      subtitle={`${formatCurrencyFull(totalRevised)} revised · ${formatCurrencyFull(totalProjected)} projected · ${formatPercent(portfolioMargin, 1)} portfolio margin`}
      onExportCSV={() =>
        exportTableCSV({
          filename: "project_status",
          columns,
          rows: filtered,
          summary: {
            "Projects": filtered.length,
            "Total Revised Contract": formatCurrencyFull(totalRevised),
            "Total Projected Final": formatCurrencyFull(totalProjected),
            "Portfolio Margin": formatPercent(portfolioMargin, 2),
            "Generated": new Date().toLocaleString(),
          },
        })
      }
      filters={
        <FilterBar>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by project name or number..."
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
        </FilterBar>
      }
    >
      <ReportTable
        columns={columns}
        rows={filtered}
        initialSort={{ key: "margin", dir: "asc" }}
        emptyText={
          projects.length === 0
            ? "No projects yet."
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
