/**
 * Profit — per-project margin report.
 *
 * Columns:
 *   project | original $ | approved CO $ | revised $ | projected final $
 *           | projected profit $ | projected margin %
 *
 * Where:
 *   approved CO total = Σ co_amount where co.status === 'Approved'
 *   revised           = revisedContractValue (utility from projectMetrics)
 *   projected final   = projectedFinalCost (utility from projectMetrics)
 *   projected profit  = revised − projected final
 *   margin %          = projected profit / revised · 100
 *
 * Footer aggregates the same values across the visible (filtered) set.
 */

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { entities } from "@/api/supabaseClient";
import { createPageUrl } from "@/utils";
import { PHASES } from "@/utils/phases";
import {
  revisedContractValue,
  projectedFinalCost,
} from "@/pages/dashboard/projectMetrics";
import ReportShell from "./ReportShell";
import ReportTable from "./ReportTable";
import { FilterBar, SearchInput, SelectFilter } from "./ReportFilters";
import {
  formatCurrencyFull,
  formatPercent,
  exportTableCSV,
} from "./utils";
import KPICard from "./KPICard";
import { mono } from "./constants";

export default function Profit() {
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

  const rows = useMemo(() => {
    return projects.map((p) => {
      const pCOs = changeOrders.filter((c) => c.project_id === p.id);
      const pExpenses = expenses.filter((e) => e.project_id === p.id);
      const original = Number(p.original_contract_value) || 0;
      const approvedCOTotal = pCOs
        .filter((c) => c.status === "Approved")
        .reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
      const revised = revisedContractValue(p, pCOs);
      const projected = projectedFinalCost(pExpenses, p);
      const profit = revised - projected;
      const margin = revised ? (profit / revised) * 100 : 0;
      return {
        id: p.id,
        name: p.name || "Untitled Project",
        number: p.project_number || `P-${p.id}`,
        phase: p.phase || "",
        original,
        approvedCOTotal,
        revised,
        projected,
        profit,
        margin,
      };
    });
  }, [projects, changeOrders, expenses]);

  const filtered = useMemo(() => {
    let out = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.number.toLowerCase().includes(q)
      );
    }
    if (phaseFilter !== "all") out = out.filter((r) => r.phase === phaseFilter);
    return out;
  }, [rows, search, phaseFilter]);

  const totals = useMemo(() => {
    const t = filtered.reduce(
      (acc, r) => {
        acc.original += r.original;
        acc.approvedCOTotal += r.approvedCOTotal;
        acc.revised += r.revised;
        acc.projected += r.projected;
        acc.profit += r.profit;
        return acc;
      },
      { original: 0, approvedCOTotal: 0, revised: 0, projected: 0, profit: 0 }
    );
    t.margin = t.revised ? (t.profit / t.revised) * 100 : 0;
    return t;
  }, [filtered]);

  const columns = useMemo(
    () => [
      {
        key: "name",
        label: "Project",
        width: "minmax(200px, 2fr)",
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
        key: "original",
        label: "Original",
        width: "minmax(110px, 1fr)",
        align: "right",
        render: (r) => (
          <span style={{ ...mono, color: "var(--text-secondary)" }}>
            {formatCurrencyFull(r.original)}
          </span>
        ),
        csvValue: (r) => r.original,
      },
      {
        key: "approvedCOTotal",
        label: "Approved COs",
        width: "minmax(120px, 1fr)",
        align: "right",
        render: (r) => (
          <span
            style={{
              ...mono,
              color: r.approvedCOTotal > 0 ? "var(--status-review)" : "var(--text-muted)",
            }}
          >
            {formatCurrencyFull(r.approvedCOTotal)}
          </span>
        ),
        csvValue: (r) => r.approvedCOTotal,
      },
      {
        key: "revised",
        label: "Revised",
        width: "minmax(120px, 1fr)",
        align: "right",
        render: (r) => (
          <span style={{ ...mono, color: "var(--text-primary)", fontWeight: 700 }}>
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
        key: "profit",
        label: "Profit",
        width: "minmax(110px, 1fr)",
        align: "right",
        render: (r) => (
          <span
            style={{
              ...mono,
              color:
                r.profit >= 0
                  ? "var(--status-success)"
                  : "var(--status-error)",
              fontWeight: 700,
            }}
          >
            {formatCurrencyFull(r.profit)}
          </span>
        ),
        csvValue: (r) => r.profit,
      },
      {
        key: "margin",
        label: "Margin",
        width: "100px",
        align: "right",
        render: (r) => (
          <span
            style={{
              ...mono,
              fontWeight: 700,
              color:
                r.margin >= 10
                  ? "var(--status-success)"
                  : r.margin >= 0
                    ? "var(--accent)"
                    : "var(--status-error)",
            }}
          >
            {formatPercent(r.margin, 1)}
          </span>
        ),
        csvValue: (r) => r.margin.toFixed(2),
      },
    ],
    [navigate]
  );

  return (
    <ReportShell
      title="Profit"
      count={filtered.length}
      unit=" · PROJECTS"
      subtitle={`Portfolio profit: ${formatCurrencyFull(totals.profit)} on ${formatCurrencyFull(totals.revised)} revised (${formatPercent(totals.margin, 1)})`}
      onExportCSV={() =>
        exportTableCSV({
          filename: "profit",
          columns,
          rows: filtered,
          summary: {
            "Projects": filtered.length,
            "Total Original Contract": formatCurrencyFull(totals.original),
            "Total Approved COs": formatCurrencyFull(totals.approvedCOTotal),
            "Total Revised": formatCurrencyFull(totals.revised),
            "Total Projected Final": formatCurrencyFull(totals.projected),
            "Total Profit": formatCurrencyFull(totals.profit),
            "Portfolio Margin": formatPercent(totals.margin, 2),
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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
        }}
      >
        <KPICard
          label="Revised Contract"
          value={formatCurrencyFull(totals.revised)}
          detail={`${filtered.length} projects`}
          borderColor="var(--status-info)"
        />
        <KPICard
          label="Projected Profit"
          value={formatCurrencyFull(totals.profit)}
          detail={`Margin ${formatPercent(totals.margin, 1)}`}
          borderColor={
            totals.profit >= 0 ? "var(--status-success)" : "var(--status-error)"
          }
        />
        <KPICard
          label="Approved COs"
          value={formatCurrencyFull(totals.approvedCOTotal)}
          detail="Across visible projects"
          borderColor="var(--status-review)"
        />
      </div>

      <ReportTable
        columns={columns}
        rows={filtered}
        initialSort={{ key: "margin", dir: "asc" }}
        emptyText={
          projects.length === 0
            ? "No projects yet."
            : "No projects match the current filters."
        }
        minWidth={1200}
        onRowClick={(r) =>
          navigate(createPageUrl("Projects") + `?id=${r.id}`)
        }
      />
    </ReportShell>
  );
}
