/**
 * Risks — flat sortable / filterable list of every risk on the active
 * project (or the whole portfolio when "All projects" is selected).
 *
 * Click a row → opens the shared RiskFormModal in edit mode. The
 * "+ New Risk" button in the command bar opens it in create mode.
 *
 * Severity badge colour bands match what the matrix and Top Risks
 * cards render — same source of truth (severity.js).
 */

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ReportShell from "./ReportShell";
import ReportTable from "./ReportTable";
import { FilterBar, SearchInput, SelectFilter } from "./ReportFilters";
import { exportTableCSV, formatDate } from "./utils";
import { mono } from "./constants";
import {
  RISK_CATEGORIES,
  RISK_STATUSES,
  computeScore,
  severityColor,
} from "./risks/severity";
import RiskFormModal from "@/components/risks/RiskFormModal";

function SeverityBadge({ severity }) {
  const color = severityColor(severity);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        ...mono,
        fontSize: 9,
        fontWeight: 700,
        color,
        textTransform: "uppercase",
        letterSpacing: "0.10em",
        padding: "3px 8px",
        background: "var(--bg-surface-low)",
        border: `1px solid ${color}`,
        borderRadius: 4,
      }}
    >
      <span
        style={{ width: 6, height: 6, borderRadius: "50%", background: color }}
      />
      {severity || "—"}
    </span>
  );
}

function StatusChip({ status }) {
  const tone =
    status === "Closed" || status === "Mitigated"
      ? "var(--status-success)"
      : status === "Mitigating"
      ? "var(--status-info)"
      : status === "Accepted" || status === "Transferred"
      ? "var(--text-muted)"
      : "var(--text-secondary)";
  return (
    <span
      style={{
        ...mono,
        fontSize: 10,
        color: tone,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      {status || "—"}
    </span>
  );
}

export default function Risks() {
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editingRow, setEditingRow] = useState(null);
  const [creating, setCreating] = useState(false);

  const { data: risks = [] } = useQuery({
    queryKey: ["risks"],
    queryFn: () => base44.entities.Risk.list(),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
  });
  const projectById = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p])),
    [projects]
  );

  const rows = useMemo(() => {
    return risks.map((r) => {
      const p = projectById[r.project_id];
      return {
        ...r,
        score: computeScore(r.probability, r.impact),
        projectLabel: p
          ? `${p.project_number ? p.project_number + " — " : ""}${p.name}`
          : "—",
      };
    });
  }, [risks, projectById]);

  const filtered = useMemo(() => {
    let out = rows;
    if (projectFilter !== "all") {
      out = out.filter((r) => r.project_id === projectFilter);
    }
    if (severityFilter !== "all") {
      out = out.filter((r) => r.severity === severityFilter);
    }
    if (statusFilter !== "all") {
      out = out.filter((r) => r.status === statusFilter);
    }
    if (categoryFilter !== "all") {
      out = out.filter((r) => r.category === categoryFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((r) =>
        [r.title, r.owner, r.category, r.description, r.trigger_event]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      );
    }
    return out;
  }, [rows, projectFilter, severityFilter, statusFilter, categoryFilter, search]);

  const columns = useMemo(
    () => [
      {
        key: "title",
        label: "Title",
        width: "minmax(220px, 2.4fr)",
        render: (r) => (
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600,
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {r.title}
            </div>
            {r.projectLabel && r.projectLabel !== "—" && (
              <div
                style={{
                  ...mono,
                  fontSize: 9,
                  color: "var(--text-muted)",
                  marginTop: 2,
                }}
              >
                {r.projectLabel}
              </div>
            )}
          </div>
        ),
        csvValue: (r) => r.title,
      },
      {
        key: "category",
        label: "Category",
        width: "minmax(110px, 1fr)",
        render: (r) => (
          <span style={{ ...mono, fontSize: 10, color: "var(--text-secondary)" }}>
            {r.category || "—"}
          </span>
        ),
      },
      {
        key: "probability",
        label: "Prob.",
        width: "70px",
        align: "right",
        render: (r) => (
          <span style={{ ...mono, color: "var(--text-secondary)" }}>{r.probability}</span>
        ),
      },
      {
        key: "impact",
        label: "Impact",
        width: "70px",
        align: "right",
        render: (r) => (
          <span style={{ ...mono, color: "var(--text-secondary)" }}>{r.impact}</span>
        ),
      },
      {
        key: "score",
        label: "Score",
        width: "70px",
        align: "right",
        render: (r) => (
          <span style={{ ...mono, fontWeight: 700, color: "var(--text-primary)" }}>
            {r.score}
          </span>
        ),
      },
      {
        key: "severity",
        label: "Severity",
        width: "minmax(110px, 1fr)",
        render: (r) => <SeverityBadge severity={r.severity} />,
        sortValue: (r) => {
          // Sort Critical → Low (high to low) regardless of asc/desc by mapping
          // to a numeric weight; ReportTable applies asc by default so this
          // gives the most useful ordering on first click.
          return { Critical: 4, High: 3, Medium: 2, Low: 1 }[r.severity] || 0;
        },
      },
      {
        key: "status",
        label: "Status",
        width: "minmax(110px, 1fr)",
        render: (r) => <StatusChip status={r.status} />,
      },
      {
        key: "owner",
        label: "Owner",
        width: "minmax(120px, 1.2fr)",
        render: (r) => (
          <span style={{ color: r.owner ? "var(--text-secondary)" : "var(--text-muted)" }}>
            {r.owner || "—"}
          </span>
        ),
      },
      {
        key: "target_close_date",
        label: "Target Close",
        width: "110px",
        render: (r) => (
          <span style={{ ...mono, color: "var(--text-secondary)" }}>
            {formatDate(r.target_close_date)}
          </span>
        ),
        csvValue: (r) => r.target_close_date || "",
      },
    ],
    []
  );

  const headerActions = (
    <button
      type="button"
      onClick={() => setCreating(true)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: "var(--bg-surface)",
        color: "var(--text-secondary)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-btn)",
        padding: "8px 12px",
        ...mono,
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        cursor: "pointer",
      }}
    >
      <Plus size={12} /> New Risk
    </button>
  );

  // Default to the first project as the form target on create when the
  // filter is set to "all"; otherwise inherit the active project filter.
  const createProjectId =
    projectFilter !== "all" ? projectFilter : projects[0]?.id;

  return (
    <ReportShell
      title="Risks"
      count={filtered.length}
      unit=" · RISKS"
      subtitle="Project risk register — every identified risk on the books."
      headerActions={headerActions}
      onExportCSV={() =>
        exportTableCSV({
          filename: "risks",
          columns,
          rows: filtered,
          summary: {
            "Total Risks": filtered.length,
            Generated: new Date().toLocaleString(),
          },
        })
      }
      filters={
        <FilterBar>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by title, owner, category, trigger…"
          />
          <SelectFilter
            label="Project"
            value={projectFilter}
            onChange={setProjectFilter}
            options={[
              { key: "all", label: "All projects" },
              ...projects.map((p) => ({
                key: p.id,
                label: p.project_number
                  ? `${p.project_number} — ${p.name}`
                  : p.name || "Untitled",
              })),
            ]}
          />
          <SelectFilter
            label="Severity"
            value={severityFilter}
            onChange={setSeverityFilter}
            options={[
              { key: "all", label: "All" },
              { key: "Critical", label: "Critical" },
              { key: "High", label: "High" },
              { key: "Medium", label: "Medium" },
              { key: "Low", label: "Low" },
            ]}
          />
          <SelectFilter
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { key: "all", label: "All" },
              ...RISK_STATUSES.map((s) => ({ key: s, label: s })),
            ]}
          />
          <SelectFilter
            label="Category"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { key: "all", label: "All" },
              ...RISK_CATEGORIES.map((c) => ({ key: c, label: c })),
            ]}
          />
        </FilterBar>
      }
    >
      <ReportTable
        columns={columns}
        rows={filtered}
        initialSort={{ key: "score", dir: "desc" }}
        onRowClick={(r) => setEditingRow(r)}
        emptyText={
          risks.length === 0
            ? "No risks logged yet — click “New Risk” to add one."
            : "No risks match the current filters."
        }
        minWidth={1100}
      />
      <RiskFormModal
        open={creating}
        onClose={() => setCreating(false)}
        projectId={createProjectId}
      />
      <RiskFormModal
        open={Boolean(editingRow)}
        onClose={() => setEditingRow(null)}
        initial={editingRow}
        projectId={editingRow?.project_id}
      />
    </ReportShell>
  );
}
