/**
 * Revenue by Client — total billed grouped by `projects.client` (falls
 * back to `general_contractor` if client is empty).
 *
 * Billed = sov_items.scheduled_value × current_percent_complete% per
 * project, then summed at the client level.
 */

import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { latestCertifiedPerLineItem } from "@/pages/dashboard/projectMetrics";
import ReportShell from "./ReportShell";
import ReportTable from "./ReportTable";
import { formatCurrencyFull, exportTableCSV } from "./utils";
import { mono, body, CARD, CARD_TITLE } from "./constants";

export default function RevenueByClient() {
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
  });
  const { data: sov = [] } = useQuery({
    queryKey: ["sov-items"],
    queryFn: () => entities.SOVItem.list(),
  });

  // Billed = latest Certified row per (project, line_item). Pre-fix
  // this summed across every row (Drafts + every prior pay app) and
  // tripled the totals on projects with multi-app history.
  const billedByProject = useMemo(() => {
    const m = {};
    for (const r of latestCertifiedPerLineItem(sov)) {
      const sv = Number(r.scheduled_value) || 0;
      const pct = Number(r.current_percent_complete) || 0;
      if (!sv || pct <= 0) continue;
      m[r.project_id] = (m[r.project_id] || 0) + sv * (pct / 100);
    }
    return m;
  }, [sov]);

  // "Revenue by Client" = who-pays-us. Standardised on
  // `general_contractor || client` across the three revenue reports
  // so the same number doesn't move depending on which page you
  // opened. Previously this fell back the other way (client first).
  const grouped = useMemo(() => {
    const m = {};
    projects.forEach((p) => {
      const client = p.general_contractor || p.client || "Unspecified";
      if (!m[client]) m[client] = { client, projectCount: 0, contractValue: 0, billed: 0 };
      m[client].projectCount += 1;
      m[client].contractValue += Number(p.original_contract_value) || 0;
      m[client].billed += billedByProject[p.id] || 0;
    });
    return Object.values(m).sort((a, b) => b.billed - a.billed);
  }, [projects, billedByProject]);

  const totalBilled = grouped.reduce((s, r) => s + r.billed, 0);
  const maxBilled = Math.max(...grouped.map((r) => r.billed), 1);

  const tableRows = grouped.map((r, i) => ({ id: r.client, idx: i, ...r, sharePct: totalBilled ? (r.billed / totalBilled) * 100 : 0 }));
  const tableColumns = [
    { key: "client", label: "Client", width: "minmax(220px, 2fr)", render: (r) => <span style={{ ...body, color: "var(--text-primary)", fontWeight: 600 }}>{r.client}</span> },
    { key: "projectCount", label: "Projects", width: "100px", align: "right" },
    {
      key: "contractValue",
      label: "Contract Value",
      width: "minmax(140px, 1.2fr)",
      align: "right",
      render: (r) => <span style={{ ...mono, color: "var(--text-secondary)" }}>{formatCurrencyFull(r.contractValue)}</span>,
      csvValue: (r) => r.contractValue,
    },
    {
      key: "billed",
      label: "Billed",
      width: "minmax(140px, 1.2fr)",
      align: "right",
      render: (r) => <span style={{ ...mono, color: "var(--text-primary)", fontWeight: 700 }}>{formatCurrencyFull(r.billed)}</span>,
      csvValue: (r) => r.billed,
    },
    {
      key: "sharePct",
      label: "% Share",
      width: "100px",
      align: "right",
      render: (r) => <span style={{ ...mono, color: "var(--text-secondary)" }}>{r.sharePct.toFixed(1)}%</span>,
      csvValue: (r) => r.sharePct.toFixed(1),
    },
  ];

  return (
    <ReportShell
      title="Revenue by Client"
      count={grouped.length}
      unit=" · CLIENTS"
      subtitle={`${formatCurrencyFull(totalBilled)} billed across ${grouped.length} clients.`}
      onExportCSV={() => exportTableCSV({
        filename: "revenue_by_client",
        columns: tableColumns,
        rows: tableRows,
        summary: {
          "Total Billed": formatCurrencyFull(totalBilled),
          "Clients": grouped.length,
          "Generated": new Date().toLocaleString(),
        },
      })}
    >
      {/* Bar chart */}
      <div style={{ ...CARD }}>
        <div style={CARD_TITLE}>Top Clients by Billed Revenue</div>
        {grouped.length === 0 ? (
          <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", padding: "32px 0", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            No billed revenue yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {grouped.slice(0, 10).map((r) => (
              <div key={r.client} style={{ display: "grid", gridTemplateColumns: "200px 1fr 110px", gap: 12, alignItems: "center" }}>
                <div style={{ ...body, fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.client}</div>
                <div style={{ height: 10, background: "var(--bg-surface-low)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(r.billed / maxBilled) * 100}%`, background: "var(--accent)" }} />
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
        emptyText="No client revenue yet."
        minWidth={900}
      />
    </ReportShell>
  );
}
