/**
 * Risks Dashboard — KPI strip + severity donut + category bar +
 * Top 5 open risks list. Single-screen "where are we on risk?" view
 * for a PM who wants the executive answer without scrolling a table.
 *
 * The two charts reuse the existing DonutChartSVG / BarChartSVG so
 * the visual language matches the Portfolio Overview dashboard.
 */

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import ReportShell from "./ReportShell";
import { FilterBar, SelectFilter } from "./ReportFilters";
import { BarChartSVG, DonutChartSVG } from "./charts";
import { CARD, CARD_TITLE, mono } from "./constants";
import { exportTableCSV } from "./utils";
import {
  RISK_CATEGORIES,
  computeScore,
  severityColor,
  isActiveRisk,
} from "./risks/severity";
import RiskFormModal from "@/components/risks/RiskFormModal";

function KpiCell({ label, value, tone = "var(--text-primary)" }) {
  return (
    <div
      style={{
        ...CARD,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: 0,
      }}
    >
      <div
        style={{
          ...mono,
          fontSize: 8,
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          ...mono,
          fontSize: 22,
          fontWeight: 700,
          color: tone,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function RisksDashboard() {
  const [projectFilter, setProjectFilter] = useState("all");
  const [editingRow, setEditingRow] = useState(null);

  const { data: risks = [] } = useQuery({
    queryKey: ["risks"],
    queryFn: () => entities.Risk.list(),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
  });

  const scoped = useMemo(() => {
    if (projectFilter === "all") return risks;
    return risks.filter((r) => r.project_id === projectFilter);
  }, [risks, projectFilter]);

  // KPIs
  const total = scoped.length;
  const open = scoped.filter((r) => r.status === "Open").length;
  const mitigating = scoped.filter((r) => r.status === "Mitigating").length;
  const mitigated = scoped.filter((r) => r.status === "Mitigated").length;
  const closed = scoped.filter((r) => r.status === "Closed").length;
  const criticalCount = scoped.filter((r) => r.severity === "Critical").length;
  const avgScore = scoped.length
    ? scoped.reduce((s, r) => s + computeScore(r.probability, r.impact), 0) /
      scoped.length
    : 0;

  // Severity donut segments (Critical → Low)
  const severitySegments = useMemo(() => {
    const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    for (const r of scoped) {
      if (counts[r.severity] !== undefined) counts[r.severity] += 1;
    }
    return ["Critical", "High", "Medium", "Low"]
      .map((sev) => ({
        label: sev,
        value: counts[sev],
        color: severityColor(sev),
      }))
      .filter((s) => s.value > 0);
  }, [scoped]);

  // Category bar — re-uses the BarChartSVG which expects {name, budget, actual}.
  // We map "open" onto budget and "all" onto actual so the bars compare the
  // two and the colours remain on-brand.
  const categoryData = useMemo(() => {
    return RISK_CATEGORIES.map((cat) => {
      const all = scoped.filter((r) => r.category === cat).length;
      const openCount = scoped.filter(
        (r) => r.category === cat && isActiveRisk(r)
      ).length;
      return { name: cat, budget: all, actual: openCount };
    }).filter((d) => d.budget > 0 || d.actual > 0);
  }, [scoped]);

  // Top 5 open
  const topOpen = useMemo(() => {
    return [...scoped]
      .filter(isActiveRisk)
      .map((r) => ({ ...r, score: computeScore(r.probability, r.impact) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [scoped]);

  return (
    <ReportShell
      title="Risks Dashboard"
      count={total}
      unit=" · RISKS"
      subtitle="Severity distribution, category breakdown, and the top 5 open risks."
      onExportCSV={() =>
        exportTableCSV({
          filename: "risks_dashboard",
          columns: [
            { key: "title", label: "Title" },
            { key: "category", label: "Category" },
            { key: "probability", label: "Probability" },
            { key: "impact", label: "Impact" },
            { key: "severity", label: "Severity" },
            { key: "status", label: "Status" },
            { key: "owner", label: "Owner" },
            { key: "target_close_date", label: "Target Close" },
          ],
          rows: scoped,
          summary: {
            "Total Risks": total,
            Open: open,
            Mitigating: mitigating,
            Mitigated: mitigated,
            Closed: closed,
            "Critical Count": criticalCount,
            "Avg Score": avgScore.toFixed(1),
            Generated: new Date().toLocaleString(),
          },
        })
      }
      filters={
        <FilterBar>
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
        </FilterBar>
      }
    >
      {/* KPI strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
        }}
      >
        <KpiCell label="Total" value={total} />
        <KpiCell label="Open" value={open} />
        <KpiCell label="Mitigating" value={mitigating} tone="var(--status-info)" />
        <KpiCell label="Mitigated" value={mitigated} tone="var(--status-success)" />
        <KpiCell label="Closed" value={closed} tone="var(--text-muted)" />
        <KpiCell
          label="Critical"
          value={criticalCount}
          tone={criticalCount > 0 ? "var(--status-error)" : "var(--text-muted)"}
        />
        <KpiCell label="Avg Score" value={avgScore.toFixed(1)} />
      </div>

      {/* Charts row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(260px, 1fr) minmax(320px, 1.4fr)",
          gap: 14,
        }}
      >
        <div style={CARD}>
          <div style={CARD_TITLE}>Severity Distribution</div>
          {severitySegments.length === 0 ? (
            <EmptyChart label="No risks logged" />
          ) : (
            <DonutChartSVG segments={severitySegments} />
          )}
        </div>
        <div style={CARD}>
          <div style={CARD_TITLE}>By Category (All vs Active)</div>
          {categoryData.length === 0 ? (
            <EmptyChart label="No risks logged" />
          ) : (
            <BarChartSVG data={categoryData} width={520} height={220} />
          )}
        </div>
      </div>

      {/* Top 5 open */}
      <div style={CARD}>
        <div style={CARD_TITLE}>Top 5 Open Risks</div>
        {topOpen.length === 0 ? (
          <div
            style={{
              padding: "24px 0",
              textAlign: "center",
              ...mono,
              fontSize: 10,
              color: "var(--text-muted)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            No active risks
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {topOpen.map((r) => {
              const color = severityColor(r.severity);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setEditingRow(r)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "8px minmax(0, 2fr) 120px 80px 90px",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    background: "var(--bg-surface-low)",
                    border: "1px solid var(--border-default)",
                    borderLeft: `3px solid ${color}`,
                    borderRadius: "var(--radius-btn)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.title}
                    </div>
                    <div
                      style={{
                        ...mono,
                        fontSize: 9,
                        color: "var(--text-muted)",
                        marginTop: 2,
                      }}
                    >
                      {r.category || "—"} · Owner {r.owner || "—"}
                    </div>
                  </div>
                  <span
                    style={{
                      ...mono,
                      fontSize: 9,
                      fontWeight: 700,
                      color,
                      textTransform: "uppercase",
                      letterSpacing: "0.10em",
                    }}
                  >
                    {r.severity}
                  </span>
                  <span
                    style={{
                      ...mono,
                      fontSize: 10,
                      color: "var(--text-secondary)",
                    }}
                  >
                    P{r.probability} × I{r.impact}
                  </span>
                  <span
                    style={{
                      ...mono,
                      fontSize: 14,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      textAlign: "right",
                    }}
                  >
                    {r.score}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <RiskFormModal
        open={Boolean(editingRow)}
        onClose={() => setEditingRow(null)}
        initial={editingRow}
        projectId={editingRow?.project_id}
      />
    </ReportShell>
  );
}

function EmptyChart({ label }) {
  return (
    <div
      style={{
        padding: "32px 0",
        textAlign: "center",
        ...mono,
        fontSize: 10,
        color: "var(--text-muted)",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </div>
  );
}
