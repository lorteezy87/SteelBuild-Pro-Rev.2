/**
 * Revenue by Type — billed grouped by `projects.contract_type`.
 *
 * Same arithmetic as Revenue by Client, different group key. Empty
 * contract_type maps to "Unspecified" so every project counts.
 */

import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ReportShell from "./ReportShell";
import ReportTable from "./ReportTable";
import { formatCurrencyFull, exportTableCSV } from "./utils";
import { mono, body, CARD, CARD_TITLE } from "./constants";

export default function RevenueByType() {
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
  });
  const { data: sov = [] } = useQuery({
    queryKey: ["sov-items"],
    queryFn: () => base44.entities.SOVItem.list(),
  });

  const billedByProject = useMemo(() => {
    const m = {};
    for (const r of sov) {
      const sv = Number(r.scheduled_value) || 0;
      const pct = Number(r.current_percent_complete) || 0;
      if (!sv || pct <= 0) continue;
      m[r.project_id] = (m[r.project_id] || 0) + sv * (pct / 100);
    }
    return m;
  }, [sov]);

  const grouped = useMemo(() => {
    const m = {};
    projects.forEach((p) => {
      const type = p.contract_type || "Unspecified";
      if (!m[type]) m[type] = { type, projectCount: 0, contractValue: 0, billed: 0 };
      m[type].projectCount += 1;
      m[type].contractValue += Number(p.original_contract_value) || 0;
      m[type].billed += billedByProject[p.id] || 0;
    });
    return Object.values(m).sort((a, b) => b.billed - a.billed);
  }, [projects, billedByProject]);

  const totalBilled = grouped.reduce((s, r) => s + r.billed, 0);
  const maxBilled = Math.max(...grouped.map((r) => r.billed), 1);

  const tableRows = grouped.map((r) => ({ id: r.type, ...r, sharePct: totalBilled ? (r.billed / totalBilled) * 100 : 0 }));
  const tableColumns = [
    { key: "type", label: "Contract Type", width: "minmax(180px, 2fr)", render: (r) => <span style={{ ...body, color: "var(--text-primary)", fontWeight: 600 }}>{r.type}</span> },
    { key: "projectCount", label: "Projects", width: "100px", align: "right" },
    { key: "contractValue", label: "Contract Value", width: "minmax(140px, 1.2fr)", align: "right", render: (r) => <span style={{ ...mono, color: "var(--text-secondary)" }}>{formatCurrencyFull(r.contractValue)}</span>, csvValue: (r) => r.contractValue },
    { key: "billed", label: "Billed", width: "minmax(140px, 1.2fr)", align: "right", render: (r) => <span style={{ ...mono, color: "var(--text-primary)", fontWeight: 700 }}>{formatCurrencyFull(r.billed)}</span>, csvValue: (r) => r.billed },
    { key: "sharePct", label: "% Share", width: "100px", align: "right", render: (r) => <span style={{ ...mono, color: "var(--text-secondary)" }}>{r.sharePct.toFixed(1)}%</span>, csvValue: (r) => r.sharePct.toFixed(1) },
  ];

  return (
    <ReportShell
      title="Revenue by Type"
      count={grouped.length}
      unit=" · TYPES"
      subtitle={`${formatCurrencyFull(totalBilled)} billed across ${grouped.length} contract types.`}
      onExportCSV={() => exportTableCSV({
        filename: "revenue_by_type",
        columns: tableColumns,
        rows: tableRows,
        summary: { "Total Billed": formatCurrencyFull(totalBilled), "Types": grouped.length, "Generated": new Date().toLocaleString() },
      })}
    >
      <div style={{ ...CARD }}>
        <div style={CARD_TITLE}>Billed by Contract Type</div>
        {grouped.length === 0 ? (
          <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", padding: "32px 0", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            No billed revenue yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {grouped.map((r) => (
              <div key={r.type} style={{ display: "grid", gridTemplateColumns: "180px 1fr 110px", gap: 12, alignItems: "center" }}>
                <div style={{ ...body, fontSize: 12, color: "var(--text-primary)" }}>{r.type}</div>
                <div style={{ height: 10, background: "var(--bg-surface-low)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(r.billed / maxBilled) * 100}%`, background: "var(--status-success)" }} />
                </div>
                <div style={{ ...mono, fontSize: 11, color: "var(--text-primary)", textAlign: "right" }}>{formatCurrencyFull(r.billed)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ReportTable
        columns={tableColumns}
        rows={tableRows}
        initialSort={{ key: "billed", dir: "desc" }}
        emptyText="No contract type revenue yet."
        minWidth={900}
      />
    </ReportShell>
  );
}
