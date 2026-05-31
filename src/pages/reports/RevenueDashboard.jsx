/**
 * Revenue Dashboard — billing/collection KPIs across all projects.
 *
 * KPI strip:
 *   - Total billed (cumulative, from SOV)
 *   - Cash collected (paid pay apps)
 *   - Pending payment (submitted, not yet paid)
 *   - Retention held
 *
 * Plus two donuts:
 *   - revenue (billed) split by client (top 6 + Other)
 *   - revenue (billed) split by contract type (Lump Sum / T&M / Cost Plus / etc.)
 *
 * All four KPI helpers come from src/pages/dashboard/projectMetrics.js
 * to keep the math identical to the dashboard.
 */

import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import {
  totalBilled,
  cashCollected,
  pendingPayment,
  retentionHeld,
  latestCertifiedPerLineItem,
} from "@/pages/dashboard/projectMetrics";
import ReportShell from "./ReportShell";
import KPICard from "./KPICard";
import InfoIcon from "./InfoIcon";
import { DonutChartSVG } from "./charts";
import {
  formatCurrencyFull,
  formatPercent,
  exportTableCSV,
} from "./utils";
import { mono, body, CARD, CARD_TITLE } from "./constants";

const PALETTE = [
  "var(--status-info)",
  "var(--accent)",
  "var(--status-success)",
  "#F97316",
  "var(--status-warning)",
  "var(--status-review)",
  "var(--text-muted)",
];

export default function RevenueDashboard() {
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
  });
  const { data: sovItems = [] } = useQuery({
    queryKey: ["sov-items-all"],
    queryFn: () => entities.SOVItem.list(),
  });

  const projectsById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  );

  const billed = totalBilled(sovItems);
  const collected = cashCollected(sovItems);
  const pending = pendingPayment(sovItems);
  const retention = retentionHeld(sovItems);

  // Donut math runs on the deduped Certified-only set. Pre-fix this
  // walked every sov_items row, which double/triple-counted any line
  // item with multi-app history (Draft + Certified per period).
  const certifiedDeduped = useMemo(
    () => latestCertifiedPerLineItem(sovItems),
    [sovItems],
  );

  /** SOV items have a project_id; project tells us the client + contract type. */
  const billedByClient = useMemo(() => {
    const map = new Map();
    for (const i of certifiedDeduped) {
      const proj = projectsById.get(i.project_id);
      const client = proj?.general_contractor || proj?.client || "Unknown";
      const value =
        ((Number(i.scheduled_value) || 0) *
          (Number(i.current_percent_complete) || 0)) /
        100;
      map.set(client, (map.get(client) || 0) + value);
    }
    const all = [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
    // Collapse the long tail to "Other".
    if (all.length <= 6) return all;
    const top = all.slice(0, 6);
    const otherTotal = all.slice(6).reduce((s, r) => s + r.value, 0);
    return [...top, { label: "Other", value: otherTotal }];
  }, [certifiedDeduped, projectsById]);

  const billedByContractType = useMemo(() => {
    const map = new Map();
    for (const i of certifiedDeduped) {
      const proj = projectsById.get(i.project_id);
      const type = proj?.contract_type || "Unspecified";
      const value =
        ((Number(i.scheduled_value) || 0) *
          (Number(i.current_percent_complete) || 0)) /
        100;
      map.set(type, (map.get(type) || 0) + value);
    }
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [certifiedDeduped, projectsById]);

  const decoratedClient = useMemo(
    () =>
      billedByClient
        .filter((s) => s.value > 0)
        .map((s, i) => ({ ...s, color: PALETTE[i % PALETTE.length] })),
    [billedByClient]
  );
  const decoratedContractType = useMemo(
    () =>
      billedByContractType
        .filter((s) => s.value > 0)
        .map((s, i) => ({ ...s, color: PALETTE[i % PALETTE.length] })),
    [billedByContractType]
  );

  const collectedPct = billed ? (collected / billed) * 100 : 0;

  const handleExportCSV = () => {
    // Build a flat row per project — billed/collected/pending/retention.
    const perProject = projects.map((p) => {
      const items = sovItems.filter((i) => i.project_id === p.id);
      return {
        number: p.project_number || `P-${p.id}`,
        name: p.name || "",
        client: p.general_contractor || p.client || "",
        contractType: p.contract_type || "",
        billed: totalBilled(items),
        collected: cashCollected(items),
        pending: pendingPayment(items).total,
        retention: retentionHeld(items),
      };
    });
    exportTableCSV({
      filename: "revenue_dashboard",
      columns: [
        { key: "number", label: "Project #" },
        { key: "name", label: "Name" },
        { key: "client", label: "Client" },
        { key: "contractType", label: "Contract Type" },
        { key: "billed", label: "Billed" },
        { key: "collected", label: "Collected" },
        { key: "pending", label: "Pending" },
        { key: "retention", label: "Retention" },
      ],
      rows: perProject,
      summary: {
        "Total Billed": formatCurrencyFull(billed),
        "Total Collected": formatCurrencyFull(collected),
        "Total Pending": formatCurrencyFull(pending.total),
        "Total Retention": formatCurrencyFull(retention),
        "Generated": new Date().toLocaleString(),
      },
    });
  };

  return (
    <ReportShell
      title="Revenue Dashboard"
      count={projects.length}
      unit=" · PROJECTS"
      subtitle={`${formatCurrencyFull(billed)} billed · ${formatCurrencyFull(collected)} collected (${formatPercent(collectedPct, 1)})`}
      onExportCSV={handleExportCSV}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
        }}
      >
        <KPICard
          label="Total Billed"
          value={formatCurrencyFull(billed)}
          detail="Cumulative SOV billings"
          borderColor="var(--status-info)"
        />
        <KPICard
          label="Cash Collected"
          value={formatCurrencyFull(collected)}
          detail={`${formatPercent(collectedPct, 1)} of billed`}
          borderColor="var(--status-success)"
        />
        <KPICard
          label="Pending Payment"
          value={formatCurrencyFull(pending.total)}
          detail={`${pending.count} pay app${pending.count === 1 ? "" : "s"}`}
          borderColor="var(--status-warning)"
        />
        <KPICard
          label="Retention Held"
          value={formatCurrencyFull(retention)}
          detail="Withheld across SOV"
          borderColor="#F97316"
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 16,
        }}
      >
        <div style={CARD}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 16,
            }}
          >
            <div style={CARD_TITLE}>Billed Revenue by Client</div>
            <InfoIcon tooltip="Cumulative SOV billings grouped by general contractor / client" />
          </div>
          {decoratedClient.length > 0 ? (
            <DonutChartSVG segments={decoratedClient} />
          ) : (
            <EmptyChart>No billings logged yet</EmptyChart>
          )}
          {decoratedClient.length > 0 && (
            <BillingsTable rows={decoratedClient} total={billed} />
          )}
        </div>

        <div style={CARD}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 16,
            }}
          >
            <div style={CARD_TITLE}>Billed Revenue by Contract Type</div>
            <InfoIcon tooltip="Cumulative SOV billings grouped by project contract type" />
          </div>
          {decoratedContractType.length > 0 ? (
            <DonutChartSVG segments={decoratedContractType} />
          ) : (
            <EmptyChart>No billings logged yet</EmptyChart>
          )}
          {decoratedContractType.length > 0 && (
            <BillingsTable rows={decoratedContractType} total={billed} />
          )}
        </div>
      </div>
    </ReportShell>
  );
}

function EmptyChart({ children }) {
  return (
    <div style={{ padding: "48px 0", textAlign: "center" }}>
      <p
        style={{
          ...mono,
          fontSize: 10,
          color: "var(--text-muted)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        {children}
      </p>
    </div>
  );
}

function BillingsTable({ rows, total }) {
  return (
    <div
      style={{
        marginTop: 16,
        borderTop: "1px solid var(--divider)",
        paddingTop: 12,
      }}
    >
      {rows.slice(0, 8).map((r) => {
        const pct = total ? (r.value / total) * 100 : 0;
        return (
          <div
            key={r.label}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "4px 0",
              gap: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                minWidth: 0,
                flex: 1,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: r.color,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  ...body,
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {r.label}
              </span>
            </div>
            <span
              style={{
                ...mono,
                fontSize: 11,
                color: "var(--text-primary)",
              }}
            >
              {formatCurrencyFull(r.value)}
            </span>
            <span
              style={{
                ...mono,
                fontSize: 9,
                color: "var(--text-muted)",
                width: 40,
                textAlign: "right",
              }}
            >
              {formatPercent(pct, 0)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
