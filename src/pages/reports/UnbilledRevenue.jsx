/**
 * Unbilled Revenue — sov_items where payment_received_date IS NULL
 * AND submitted_date IS NULL. Per-project rollup: contract_value vs.
 * billed-to-date, with the gap shown as remaining unbilled.
 *
 * Spec from Nick: "contract_value − billed_to_date" per project,
 * sortable list. We surface both the unbilled SOV line items and the
 * project-level gap because each is a different conversation.
 */

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { latestCertifiedPerLineItem } from "@/pages/dashboard/projectMetrics";
import ReportShell from "./ReportShell";
import ReportTable from "./ReportTable";
import { FilterBar, SearchInput } from "./ReportFilters";
import { formatCurrencyFull, exportTableCSV } from "./utils";
import { mono } from "./constants";

export default function UnbilledRevenue() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
  });
  const { data: sov = [] } = useQuery({
    queryKey: ["sov-items"],
    queryFn: () => base44.entities.SOVItem.list(),
  });

  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // Per-project rollup. Two passes:
  //   1. billed-to-date — uses the deduped Certified-only set so
  //      multi-app projects don't read 2-3× their actual billings.
  //   2. unbilledLineItems — counts raw rows where no submission has
  //      happened yet (line items still sitting at 0% on the very
  //      first pay app). This walks the full set on purpose; "have
  //      any pay app touched this line yet?" is a different question
  //      from "billed-to-date".
  const rows = useMemo(() => {
    const m = {};
    for (const p of projects) {
      m[p.id] = {
        id: p.id,
        projectName: p.name || "Untitled",
        projectNumber: p.project_number || "",
        client: p.general_contractor || p.client || "",
        contractValue: Number(p.original_contract_value) || 0,
        billed: 0,
        unbilledLineItems: 0,
      };
    }
    for (const r of latestCertifiedPerLineItem(sov)) {
      const sv = Number(r.scheduled_value) || 0;
      const pct = Number(r.current_percent_complete) || 0;
      if (m[r.project_id]) {
        m[r.project_id].billed += sv * (pct / 100);
      }
    }
    // Pending lines = line items with no submitted billing row at all.
    // Certified or Paid both count as "submitted somewhere down the
    // workflow"; Drafts don't.
    const seenLineItems = new Set();
    for (const r of sov) {
      if (r.is_deleted) continue;
      if (r.status !== "Certified" && r.status !== "Paid") continue;
      if (!r.submitted_date) continue;
      seenLineItems.add(`${r.project_id}|${r.line_item_number}`);
    }
    for (const r of sov) {
      if (r.is_deleted) continue;
      if (!m[r.project_id]) continue;
      const key = `${r.project_id}|${r.line_item_number}`;
      if (seenLineItems.has(key)) continue;
      // Only count the first row we see for this line item — otherwise
      // every Draft row in app #1 would tally separately.
      seenLineItems.add(key);
      m[r.project_id].unbilledLineItems += 1;
    }
    return Object.values(m).map((r) => ({ ...r, unbilled: Math.max(0, r.contractValue - r.billed) }));
  }, [projects, sov]);

  const filtered = useMemo(() => {
    let out = rows.filter((r) => r.unbilled > 0);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((r) =>
        r.projectName.toLowerCase().includes(q) ||
        r.projectNumber.toLowerCase().includes(q) ||
        r.client.toLowerCase().includes(q)
      );
    }
    return out;
  }, [rows, search]);

  const totalUnbilled = filtered.reduce((s, r) => s + r.unbilled, 0);
  const totalContract = filtered.reduce((s, r) => s + r.contractValue, 0);

  const columns = useMemo(() => [
    {
      key: "projectName",
      label: "Project",
      width: "minmax(220px, 2fr)",
      render: (r) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis" }}>{r.projectName}</div>
          {r.projectNumber && <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{r.projectNumber}</div>}
        </div>
      ),
    },
    { key: "client", label: "Client", width: "minmax(160px, 1.4fr)" },
    {
      key: "contractValue",
      label: "Contract",
      width: "minmax(120px, 1fr)",
      align: "right",
      render: (r) => <span style={{ ...mono, color: "var(--text-secondary)" }}>{formatCurrencyFull(r.contractValue)}</span>,
      csvValue: (r) => r.contractValue,
    },
    {
      key: "billed",
      label: "Billed-To-Date",
      width: "minmax(130px, 1fr)",
      align: "right",
      render: (r) => <span style={{ ...mono, color: "var(--text-secondary)" }}>{formatCurrencyFull(r.billed)}</span>,
      csvValue: (r) => r.billed.toFixed(2),
    },
    {
      key: "unbilled",
      label: "Unbilled",
      width: "minmax(130px, 1fr)",
      align: "right",
      render: (r) => <span style={{ ...mono, color: "var(--accent)", fontWeight: 700 }}>{formatCurrencyFull(r.unbilled)}</span>,
      csvValue: (r) => r.unbilled.toFixed(2),
    },
    {
      key: "unbilledLineItems",
      label: "Pending Lines",
      width: "120px",
      align: "right",
      render: (r) => <span style={{ ...mono, color: r.unbilledLineItems ? "var(--text-primary)" : "var(--text-muted)" }}>{r.unbilledLineItems || "—"}</span>,
    },
  ], []);

  return (
    <ReportShell
      title="Unbilled Revenue"
      count={filtered.length}
      unit=" · PROJECTS"
      subtitle={`${formatCurrencyFull(totalUnbilled)} unbilled across ${filtered.length} projects (of ${formatCurrencyFull(totalContract)} contracted).`}
      onExportCSV={() => exportTableCSV({
        filename: "unbilled_revenue",
        columns,
        rows: filtered,
        summary: {
          "Total Unbilled": formatCurrencyFull(totalUnbilled),
          "Total Contract Value": formatCurrencyFull(totalContract),
          "Projects with Unbilled": filtered.length,
          "Generated": new Date().toLocaleString(),
        },
      })}
      filters={
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search projects, clients..." />
        </FilterBar>
      }
    >
      <ReportTable
        columns={columns}
        rows={filtered}
        initialSort={{ key: "unbilled", dir: "desc" }}
        emptyText="Every project is fully billed — nothing to surface."
        minWidth={1100}
        onRowClick={(r) => navigate(createPageUrl("Projects") + `?id=${r.id}`)}
      />
    </ReportShell>
  );
}
