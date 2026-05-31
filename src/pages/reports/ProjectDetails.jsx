/**
 * Project Details — pick one project, render every entity table for it.
 *
 * Sections (each a collapsible card):
 *   - KPI strip (RFIs / COs / WPs / Deliveries / Expenses / Actions)
 *   - RFIs table
 *   - Change Orders table
 *   - Work Packages table
 *   - Deliveries table
 *   - Expenses table
 *   - Action Items table
 *
 * Project selection persists via the `?project=<id>` query param so the
 * URL is shareable (and so refreshing keeps the user on the same project).
 */

import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { entities } from "@/api/supabaseClient";
import { createPageUrl } from "@/utils";
import {
  isRfiOpen,
  isCoPending,
  isWpComplete,
  isActionItemOpen,
} from "@/lib/entityPredicates";
import ReportShell from "./ReportShell";
import ReportTable from "./ReportTable";
import KPICard from "./KPICard";
import { SelectFilter, FilterBar } from "./ReportFilters";
import {
  formatCurrencyFull,
  formatDate,
  formatPercent,
} from "./utils";
import { mono, body, CARD, CARD_TITLE, PROJECT_HEALTH_COLORS } from "./constants";

function SectionCard({ title, count, children }) {
  return (
    <div style={CARD}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div style={CARD_TITLE}>{title}</div>
        <span
          style={{
            ...mono,
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.1em",
            fontWeight: 700,
          }}
        >
          {count} {count === 1 ? "row" : "rows"}
        </span>
      </div>
      {children}
    </div>
  );
}

function HealthBadge({ status }) {
  if (!status) return null;
  const color = PROJECT_HEALTH_COLORS[status] || "var(--text-muted)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 8px",
        ...mono,
        fontSize: 9,
        fontWeight: 700,
        background: `color-mix(in srgb, ${color} 18%, transparent)`,
        color,
        borderRadius: "var(--radius-badge)",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: color,
        }}
      />
      {status}
    </span>
  );
}

export default function ProjectDetails() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("project") || "";

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
  });

  // Auto-select the first project if none chosen.
  React.useEffect(() => {
    if (!selectedId && projects.length > 0) {
      setParams({ project: String(projects[0].id) }, { replace: true });
    }
  }, [selectedId, projects, setParams]);

  const project = projects.find((p) => String(p.id) === String(selectedId));

  const enabled = !!project;

  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis-by-project", project?.id],
    queryFn: () => entities.RFI.list(),
    enabled,
  });
  const { data: changeOrders = [] } = useQuery({
    queryKey: ["change-orders-by-project", project?.id],
    queryFn: () => entities.ChangeOrder.list(),
    enabled,
  });
  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages-by-project", project?.id],
    queryFn: () => entities.WorkPackage.list(),
    enabled,
  });
  const { data: deliveries = [] } = useQuery({
    queryKey: ["deliveries-by-project", project?.id],
    queryFn: () => entities.Delivery.list(),
    enabled,
  });
  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses-by-project", project?.id],
    queryFn: () => entities.Expense.list(),
    enabled,
  });
  const { data: actionItems = [] } = useQuery({
    queryKey: ["action-items-by-project", project?.id],
    queryFn: () => entities.ActionItem.list(),
    enabled,
  });

  const pid = project?.id;

  const projectRFIs = useMemo(
    () => rfis.filter((r) => r.project_id === pid),
    [rfis, pid]
  );
  const projectCOs = useMemo(
    () => changeOrders.filter((c) => c.project_id === pid),
    [changeOrders, pid]
  );
  const projectWPs = useMemo(
    () => workPackages.filter((w) => w.project_id === pid),
    [workPackages, pid]
  );
  const projectDeliveries = useMemo(
    () => deliveries.filter((d) => d.project_id === pid),
    [deliveries, pid]
  );
  const projectExpenses = useMemo(
    () => expenses.filter((e) => e.project_id === pid),
    [expenses, pid]
  );
  const projectActions = useMemo(
    () => actionItems.filter((a) => a.project_id === pid),
    [actionItems, pid]
  );

  // Derived counts for KPI strip — all four predicates pulled from
  // the shared `entityPredicates` so this page can't drift from
  // PortfolioOverview / TeamDashboard's interpretation of "open" /
  // "pending" / "complete". Pre-fix this page's pendingCO filter
  // included a literal "Pending" status (not in the live enum) and
  // wpComplete checked for "Shipped" (also not in the live enum) —
  // both branches were silent dead code.
  const openRFIs = projectRFIs.filter(isRfiOpen).length;
  const pendingCOs = projectCOs.filter(isCoPending).length;
  const openActions = projectActions.filter(isActionItemOpen).length;
  const wpComplete = projectWPs.filter(isWpComplete).length;
  const wpPct = projectWPs.length
    ? (wpComplete / projectWPs.length) * 100
    : 0;
  const totalExpenses = projectExpenses
    .filter((e) => e.payment_status !== "Voided")
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // ── Column defs (kept compact — these are detail tables, not the
  //    canonical RFI/CO/etc. pages). Rows with no project still render
  //    an empty state.
  const rfiCols = [
    { key: "rfi_number", label: "RFI #", width: "100px" },
    // The rfis table stores "title", not "subject" — pre-fix this
    // column always rendered blank.
    { key: "title", label: "Subject", width: "minmax(200px, 2.5fr)" },
    {
      key: "ball_in_court",
      label: "BIC",
      width: "100px",
      render: (r) => r.ball_in_court || "—",
    },
    {
      key: "status",
      label: "Status",
      width: "120px",
      render: (r) => (
        <span style={{ ...mono, fontSize: 10, color: "var(--text-secondary)" }}>
          {r.status}
        </span>
      ),
    },
    {
      key: "date_required",
      label: "Required",
      width: "110px",
      render: (r) => formatDate(r.date_required),
      csvValue: (r) => r.date_required || "",
    },
  ];

  const coCols = [
    { key: "co_number", label: "CO #", width: "100px" },
    {
      key: "description",
      label: "Description",
      width: "minmax(200px, 2.5fr)",
    },
    {
      key: "co_amount",
      label: "Amount",
      width: "120px",
      align: "right",
      render: (r) => formatCurrencyFull(r.co_amount),
      csvValue: (r) => r.co_amount,
    },
    {
      key: "status",
      label: "Status",
      width: "120px",
      render: (r) => (
        <span style={{ ...mono, fontSize: 10 }}>{r.status || "—"}</span>
      ),
    },
  ];

  const wpCols = [
    // work_packages stores "wp_number", not "package_id".
    { key: "wp_number", label: "Package #", width: "100px" },
    { key: "name", label: "Name", width: "minmax(180px, 2fr)" },
    {
      key: "phase",
      label: "Phase",
      width: "120px",
    },
    {
      key: "percent_complete",
      label: "% Done",
      width: "90px",
      align: "right",
      render: (r) => formatPercent(Number(r.percent_complete) || 0, 0),
      csvValue: (r) => r.percent_complete,
    },
    {
      key: "status",
      label: "Status",
      width: "120px",
    },
  ];

  const deliveryCols = [
    // The deliveries table doesn't have a "delivery_number" column —
    // identifiers are stored as either po_number or delivery_title.
    // The original columns ("expected_delivery_date" / "actual_delivery_date")
    // also don't exist; the live columns are scheduled_date / actual_date.
    {
      key: "po_number",
      label: "Delivery #",
      width: "110px",
      render: (r) => r.po_number || r.delivery_title || "—",
      csvValue: (r) => r.po_number || r.delivery_title || "",
    },
    { key: "description", label: "Description", width: "minmax(180px, 2fr)" },
    {
      key: "scheduled_date",
      label: "Expected",
      width: "110px",
      render: (r) => formatDate(r.scheduled_date),
      csvValue: (r) => r.scheduled_date || "",
    },
    {
      key: "actual_date",
      label: "Actual",
      width: "110px",
      render: (r) => formatDate(r.actual_date),
      csvValue: (r) => r.actual_date || "",
    },
    { key: "status", label: "Status", width: "110px" },
  ];

  const expenseCols = [
    {
      key: "expense_date",
      label: "Date",
      width: "110px",
      render: (r) => formatDate(r.expense_date),
      csvValue: (r) => r.expense_date || "",
    },
    {
      key: "vendor",
      label: "Vendor",
      width: "minmax(140px, 1.4fr)",
      // `vendor` is the live column; the dead `vendor_name` fallback
      // was harmless but confusing, so it's gone.
      render: (r) => r.vendor || "—",
    },
    {
      key: "description",
      label: "Description",
      width: "minmax(180px, 2fr)",
    },
    {
      key: "amount",
      label: "Amount",
      width: "120px",
      align: "right",
      render: (r) => formatCurrencyFull(r.amount),
      csvValue: (r) => r.amount,
    },
    { key: "payment_status", label: "Status", width: "110px" },
  ];

  const actionCols = [
    { key: "title", label: "Title", width: "minmax(200px, 2.5fr)" },
    {
      key: "assigned_to",
      label: "Assigned",
      width: "minmax(110px, 1fr)",
    },
    {
      key: "due_date",
      label: "Due",
      width: "110px",
      render: (r) => formatDate(r.due_date),
      csvValue: (r) => r.due_date || "",
    },
    { key: "priority", label: "Priority", width: "90px" },
    { key: "status", label: "Status", width: "110px" },
  ];

  const handleExportCSV = () => {
    if (!project) return;
    // Flatten everything into one CSV with section headers.
    const rows = [];
    const push = (label, cols, data) => {
      rows.push([label.toUpperCase()]);
      rows.push(cols.map((c) => c.csvLabel || c.label));
      data.forEach((d) =>
        rows.push(cols.map((c) => (c.csvValue ? c.csvValue(d) : d?.[c.key] ?? "")))
      );
      rows.push([]);
    };
    push("RFIs", rfiCols, projectRFIs);
    push("Change Orders", coCols, projectCOs);
    push("Work Packages", wpCols, projectWPs);
    push("Deliveries", deliveryCols, projectDeliveries);
    push("Expenses", expenseCols, projectExpenses);
    push("Action Items", actionCols, projectActions);
    const csv = rows
      .map((row) =>
        row
          .map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `project_details_${project.project_number || project.id}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ReportShell
      title="Project Details"
      subtitle={
        project
          ? `${project.name} · ${project.project_number || ""}`
          : "Pick a project to drill in"
      }
      onExportCSV={project ? handleExportCSV : null}
      filters={
        <FilterBar>
          <SelectFilter
            label="Project"
            value={selectedId}
            onChange={(v) => setParams({ project: v }, { replace: false })}
            options={[
              { key: "", label: "— Select a project —" },
              ...projects.map((p) => ({
                key: String(p.id),
                label: `${p.project_number ? `${p.project_number} · ` : ""}${p.name || "Untitled"}`,
              })),
            ]}
          />
          {project && (
            <button
              onClick={() =>
                navigate(createPageUrl("Projects") + `?id=${project.id}`)
              }
              style={{
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
              Open project →
            </button>
          )}
        </FilterBar>
      }
    >
      {!project ? (
        <div
          style={{
            ...CARD,
            padding: "48px 16px",
            textAlign: "center",
            ...mono,
            fontSize: 10,
            color: "var(--text-muted)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          {projects.length === 0
            ? "No projects yet."
            : "Pick a project from the dropdown above."}
        </div>
      ) : (
        <>
          {/* Summary header */}
          <div
            style={{
              ...CARD,
              borderLeft: "3px solid var(--accent)",
              padding: "16px 20px",
              display: "flex",
              gap: 24,
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div
                style={{
                  ...mono,
                  fontSize: 9,
                  color: "var(--text-muted)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Project · {project.project_number || ""}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                }}
              >
                {project.name}
              </div>
              <div
                style={{
                  ...body,
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  marginTop: 4,
                }}
              >
                {project.general_contractor || project.client || "—"} ·{" "}
                {project.contract_type || "—"} · {project.phase || "—"}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <HealthBadge status={project.health_status} />
              <div
                style={{
                  ...mono,
                  fontSize: 11,
                  color: "var(--text-secondary)",
                }}
              >
                {formatCurrencyFull(
                  Number(project.original_contract_value) || 0
                )}
              </div>
            </div>
          </div>

          {/* KPI strip */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
            }}
          >
            <KPICard
              label="Open RFIs"
              value={openRFIs}
              detail={`${projectRFIs.length} total`}
              borderColor="var(--status-warning)"
            />
            <KPICard
              label="Pending COs"
              value={pendingCOs}
              detail={`${projectCOs.length} total`}
              borderColor="#F97316"
            />
            <KPICard
              label="Work Packages"
              value={projectWPs.length}
              detail={`${formatPercent(wpPct, 0)} complete`}
              borderColor="var(--status-info)"
            />
            <KPICard
              label="Deliveries"
              value={projectDeliveries.length}
              detail="Scheduled + delivered"
              borderColor="var(--accent)"
            />
            <KPICard
              label="Expenses"
              value={formatCurrencyFull(totalExpenses)}
              detail={`${projectExpenses.length} entries`}
              borderColor="var(--status-success)"
            />
            <KPICard
              label="Open Actions"
              value={openActions}
              detail={`${projectActions.length} total`}
              borderColor="var(--status-error)"
            />
          </div>

          <SectionCard title="RFIs" count={projectRFIs.length}>
            <ReportTable
              columns={rfiCols}
              rows={projectRFIs}
              initialSort={{ key: "rfi_number", dir: "desc" }}
              emptyText="No RFIs on this project."
              minWidth={900}
              onRowClick={() => navigate(createPageUrl("RFIs"))}
            />
          </SectionCard>

          <SectionCard title="Change Orders" count={projectCOs.length}>
            <ReportTable
              columns={coCols}
              rows={projectCOs}
              initialSort={{ key: "co_number", dir: "desc" }}
              emptyText="No change orders on this project."
              minWidth={900}
              onRowClick={() => navigate(createPageUrl("ChangeOrders"))}
            />
          </SectionCard>

          <SectionCard title="Work Packages" count={projectWPs.length}>
            <ReportTable
              columns={wpCols}
              rows={projectWPs}
              initialSort={{ key: "wp_number", dir: "asc" }}
              emptyText="No work packages on this project."
              minWidth={900}
              onRowClick={() => navigate(createPageUrl("WorkPackages"))}
            />
          </SectionCard>

          <SectionCard title="Deliveries" count={projectDeliveries.length}>
            <ReportTable
              columns={deliveryCols}
              rows={projectDeliveries}
              initialSort={{ key: "scheduled_date", dir: "asc" }}
              emptyText="No deliveries on this project."
              minWidth={900}
              onRowClick={() => navigate(createPageUrl("Deliveries"))}
            />
          </SectionCard>

          <SectionCard title="Expenses" count={projectExpenses.length}>
            <ReportTable
              columns={expenseCols}
              rows={projectExpenses}
              initialSort={{ key: "expense_date", dir: "desc" }}
              emptyText="No expenses on this project."
              minWidth={900}
              onRowClick={() => navigate(createPageUrl("Expenses"))}
            />
          </SectionCard>

          <SectionCard title="Action Items" count={projectActions.length}>
            <ReportTable
              columns={actionCols}
              rows={projectActions}
              initialSort={{ key: "due_date", dir: "asc" }}
              emptyText="No action items on this project."
              minWidth={900}
              onRowClick={() => navigate(createPageUrl("ActionItems"))}
            />
          </SectionCard>
        </>
      )}
    </ReportShell>
  );
}
