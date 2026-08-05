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
import { entities } from "@/api/supabaseClient";
import { createPageUrl } from "@/utils";
import ReportShell from "./ReportShell";
import ReportTable from "./ReportTable";
import { FilterBar, SearchInput } from "./ReportFilters";
import { formatCurrencyFull, exportTableCSV } from "./utils";
import { mono } from "./constants";
import {
  buildUnbilledRows,
  filterUnbilledRows,
  sumContractValue,
  sumUnbilled,
} from "./unbilledRevenueHelpers";

export default function UnbilledRevenue() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
  });
  const { data: sov = [] } = useQuery({
    queryKey: ["sov-items"],
    queryFn: () => entities.SOVItem.list(),
  });

  const rows = useMemo(
    () => buildUnbilledRows({ projects, sov }),
    [projects, sov],
  );

  const filtered = useMemo(
    () => filterUnbilledRows(rows, search),
    [rows, search],
  );

  const totalUnbilled = sumUnbilled(filtered);
  const totalContract = sumContractValue(filtered);

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
