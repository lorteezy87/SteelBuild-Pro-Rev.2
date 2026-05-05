import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { getQueryKey } from "@/services/cacheRegistry";
import { useProjectContext } from "@/components/shared/useProjectContext";
import { formatDate } from "@/components/shared/formatters";
import { CommandBar, StatusPill } from "@/components/design-system";

// ─── Utilities ──────────────────────────────────────────────────────────────

const safeNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmt = (n) =>
  Number.isFinite(n) ? n.toLocaleString("en-US") : "0";

const fmtDec = (n, decimals = 1) =>
  Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : "0.0";

const pct = (actual, budget) => {
  const a = safeNum(actual);
  const b = safeNum(budget);
  return b === 0 ? 0 : (a / b) * 100;
};

const burnTone = (burn) => {
  if (burn > 100) return "var(--status-error)";
  if (burn > 85) return "var(--status-warning)";
  return "var(--text-primary)";
};

// ─── Shared Components ──────────────────────────────────────────────────────

const PageHeader = ({ title, subtitle }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
    <div>
      <h1 style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-primary)", margin: 0 }}>{title}</h1>
      {subtitle && <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>{subtitle}</p>}
    </div>
  </div>
);

const KPICard = ({ label, value, sub, tone }) => (
  <div className="sbd-kpi" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 4 }}>
    <span className="sbd-kpi-label" style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-muted)" }}>{label}</span>
    <span className="sbd-kpi-value sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 800, color: tone || "var(--text-primary)" }}>{value}</span>
    {sub && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{sub}</span>}
  </div>
);

const TabBar = ({ tabs, active, onSelect }) => (
  <div style={{ display: "flex", gap: 2, background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-btn)", padding: 3, width: "fit-content" }}>
    {tabs.map((t) => (
      <button
        key={t}
        onClick={() => onSelect(t)}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          padding: "8px 20px",
          border: "none",
          borderRadius: "var(--radius-btn)",
          cursor: "pointer",
          transition: "all 0.15s",
          background: active === t ? "var(--accent)" : "transparent",
          color: active === t ? "#000" : "var(--text-muted)",
        }}
      >
        {t}
      </button>
    ))}
  </div>
);

// ─── Table Builder ──────────────────────────────────────────────────────────

function DataTable({ columns, rows, rowKey, rowStyle }) {
  const gridCols = columns.map((c) => c.width || "1fr").join(" ");

  return (
    <div className="sbd-card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "grid", gridTemplateColumns: gridCols, padding: "10px 16px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface-secondary)" }}>
        {columns.map((col) => (
          <div
            key={col.key}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              textAlign: col.right ? "right" : "left",
            }}
          >
            {col.label}
          </div>
        ))}
      </div>

      {/* Rows */}
      {rows.length === 0 && (
        <div style={{ padding: "32px 16px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
          No data available
        </div>
      )}
      {rows.map((row, idx) => {
        const extraStyle = rowStyle ? rowStyle(row) : {};
        return (
          <div
            key={rowKey ? row[rowKey] : idx}
            style={{
              display: "grid",
              gridTemplateColumns: gridCols,
              padding: "10px 16px",
              borderBottom: "1px solid var(--divider)",
              transition: "background 0.1s",
              ...extraStyle,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = extraStyle.background || "transparent")}
          >
            {columns.map((col) => (
              <div
                key={col.key}
                style={{
                  fontFamily: col.mono !== false ? "var(--font-mono)" : "var(--font-body)",
                  fontSize: col.fontSize || 11,
                  color: col.color ? col.color(row) : "var(--text-primary)",
                  fontWeight: col.bold ? 600 : 400,
                  textAlign: col.right ? "right" : "left",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {col.render ? col.render(row) : row[col.key]}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// StatusPill now comes from the shared design-system (auto-colored via
// STATUS_COLOR tokens). Removed local copy — the previous one built an
// invalid CSS string by concatenating `var(...)` with a hex alpha
// suffix, so the tinted bg/border never actually rendered.

// ─── LABOR TAB ──────────────────────────────────────────────────────────────

function LaborTab({ workPackages, dailyLogs }) {
  const stats = useMemo(() => {
    const totalBudgetShop = workPackages.reduce((s, wp) => s + safeNum(wp.shop_hours_budget), 0);
    const totalActualShop = workPackages.reduce((s, wp) => s + safeNum(wp.shop_hours_actual), 0);
    const totalBudgetField = workPackages.reduce((s, wp) => s + safeNum(wp.field_hours_budget), 0);
    const totalActualField = workPackages.reduce((s, wp) => s + safeNum(wp.field_hours_actual), 0);
    const totalBudget = totalBudgetShop + totalBudgetField;
    const totalActual = totalActualShop + totalActualField;
    const burnPct = pct(totalActual, totalBudget);

    const headcounts = dailyLogs.map((l) => safeNum(l.headcount)).filter((h) => h > 0);
    const avgHeadcount = headcounts.length > 0 ? headcounts.reduce((a, b) => a + b, 0) / headcounts.length : 0;
    const totalLaborDays = dailyLogs.length;

    // Overtime exposure: hours worked beyond 8 per person per day
    const overtimeHrs = dailyLogs.reduce((sum, log) => {
      const hrs = safeNum(log.hours_worked);
      const hc = safeNum(log.headcount);
      if (hc === 0 || hrs === 0) return sum;
      const regularCap = hc * 8;
      return sum + Math.max(0, hrs - regularCap);
    }, 0);

    return { totalBudget, totalActual, burnPct, avgHeadcount, totalLaborDays, overtimeHrs, totalBudgetShop, totalActualShop, totalBudgetField, totalActualField };
  }, [workPackages, dailyLogs]);

  const wpRows = useMemo(() => {
    return workPackages.map((wp) => {
      const bShop = safeNum(wp.shop_hours_budget);
      const aShop = safeNum(wp.shop_hours_actual);
      const bField = safeNum(wp.field_hours_budget);
      const aField = safeNum(wp.field_hours_actual);
      const totalBudget = bShop + bField;
      const totalActual = aShop + aField;
      const burn = pct(totalActual, totalBudget);
      const variance = totalBudget - totalActual;
      return { ...wp, bShop, aShop, bField, aField, totalBudget, totalActual, burn, variance };
    });
  }, [workPackages]);

  const laborCols = [
    // DB column is `wp_number`, not `work_package_number` — the old
    // key made every WP# cell render blank because row[col.key] was
    // undefined. Same story for description → name (the work_packages
    // table has a `name` column, not `description`).
    { key: "wp_number", label: "WP#", width: "70px", bold: true, render: (r) => r.wp_number || "—" },
    { key: "name",      label: "Description", width: "2fr", mono: false, fontSize: 11, render: (r) => r.name || r.description || "—" },
    { key: "status", label: "Status", width: "100px", render: (r) => <StatusPill label={r.status || "—"} size="xs" /> },
    { key: "bShop", label: "Budget Shop", width: "100px", right: true, render: (r) => fmt(r.bShop) },
    { key: "aShop", label: "Actual Shop", width: "100px", right: true, render: (r) => fmt(r.aShop) },
    { key: "bField", label: "Budget Field", width: "100px", right: true, render: (r) => fmt(r.bField) },
    { key: "aField", label: "Actual Field", width: "100px", right: true, render: (r) => fmt(r.aField) },
    { key: "burn", label: "Burn %", width: "80px", right: true, color: (r) => burnTone(r.burn), render: (r) => `${fmtDec(r.burn)}%` },
    { key: "variance", label: "Variance", width: "90px", right: true, color: (r) => r.variance < 0 ? "var(--status-error)" : r.variance > 0 ? "var(--status-success)" : "var(--text-muted)", render: (r) => `${r.variance >= 0 ? "+" : ""}${fmt(r.variance)} hrs` },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <KPICard label="Total Budget Hours" value={fmt(stats.totalBudget)} sub={`Shop: ${fmt(stats.totalBudgetShop)} | Field: ${fmt(stats.totalBudgetField)}`} />
        <KPICard label="Total Actual Hours" value={fmt(stats.totalActual)} sub={`Shop: ${fmt(stats.totalActualShop)} | Field: ${fmt(stats.totalActualField)}`} />
        <KPICard label="Burn %" value={`${fmtDec(stats.burnPct)}%`} tone={burnTone(stats.burnPct)} sub={stats.burnPct > 100 ? "OVER BUDGET" : stats.burnPct > 85 ? "APPROACHING LIMIT" : "Within budget"} />
        <KPICard label="Avg Daily Headcount" value={fmtDec(stats.avgHeadcount)} sub={`Across ${fmt(stats.totalLaborDays)} logged days`} />
        <KPICard label="Total Labor Days" value={fmt(stats.totalLaborDays)} sub="Daily log entries" />
        <KPICard label="Overtime Exposure" value={`${fmt(stats.overtimeHrs)} hrs`} tone={stats.overtimeHrs > 0 ? "var(--status-warning)" : "var(--text-primary)"} sub="Hours above 8/person/day" />
      </div>

      {/* Section label */}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginTop: 4 }}>
        Work Package Labor Breakdown
      </div>

      {/* Table */}
      <DataTable
        columns={laborCols}
        rows={wpRows}
        rowKey="id"
        rowStyle={(r) => {
          if (r.burn > 100) return { borderLeft: "3px solid var(--status-error)", background: "rgba(255,61,61,0.04)" };
          if (r.burn > 85) return { borderLeft: "3px solid var(--status-warning)", background: "rgba(255,179,0,0.04)" };
          return {};
        }}
      />
    </div>
  );
}

// ─── EQUIPMENT TAB ──────────────────────────────────────────────────────────

function EquipmentTab({ dailyLogs }) {
  const equipData = useMemo(() => {
    const equipMap = {};

    dailyLogs.forEach((log) => {
      const raw = log.equipment_used;
      if (!raw || typeof raw !== "string" || raw.trim() === "") return;

      const logDate = log.date || log.created_date || "";

      // Parse equipment entries: support comma-separated, semicolon-separated, or newline-separated
      const entries = raw.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);

      entries.forEach((entry) => {
        // Try to extract quantity: "2x Crane", "Crane (2)", "Crane x2", "3 - Crane", or just "Crane"
        let type = entry;
        let qty = 1;

        const matchPrefix = entry.match(/^(\d+)\s*[x×\-]\s*(.+)$/i);
        const matchSuffix = entry.match(/^(.+?)\s*[x×]\s*(\d+)$/i);
        const matchParen = entry.match(/^(.+?)\s*\((\d+)\)\s*$/);

        if (matchPrefix) {
          qty = parseInt(matchPrefix[1], 10) || 1;
          type = matchPrefix[2].trim();
        } else if (matchSuffix) {
          type = matchSuffix[1].trim();
          qty = parseInt(matchSuffix[2], 10) || 1;
        } else if (matchParen) {
          type = matchParen[1].trim();
          qty = parseInt(matchParen[2], 10) || 1;
        }

        // Normalize type name
        const normalizedType = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();

        if (!equipMap[normalizedType]) {
          equipMap[normalizedType] = { type: normalizedType, daysUsed: 0, totalQty: 0, lastDate: "" };
        }
        equipMap[normalizedType].daysUsed += 1;
        equipMap[normalizedType].totalQty += qty;
        if (logDate > equipMap[normalizedType].lastDate) {
          equipMap[normalizedType].lastDate = logDate;
        }
      });
    });

    return Object.values(equipMap)
      .map((e) => ({
        ...e,
        avgQty: e.daysUsed > 0 ? e.totalQty / e.daysUsed : 0,
      }))
      .sort((a, b) => b.daysUsed - a.daysUsed);
  }, [dailyLogs]);

  const equipCols = [
    { key: "type", label: "Equipment Type", width: "2fr", bold: true },
    { key: "daysUsed", label: "Days Used", width: "100px", right: true, render: (r) => fmt(r.daysUsed) },
    { key: "avgQty", label: "Avg Qty / Day", width: "110px", right: true, render: (r) => fmtDec(r.avgQty) },
    { key: "lastDate", label: "Last Used", width: "120px", right: true, render: (r) => r.lastDate ? formatDate(r.lastDate) : "—" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <KPICard label="Equipment Types" value={fmt(equipData.length)} sub="Unique types identified" />
        <KPICard label="Total Usage Days" value={fmt(equipData.reduce((s, e) => s + e.daysUsed, 0))} sub="Sum of all equipment-days" />
        <KPICard label="Most Used" value={equipData.length > 0 ? equipData[0].type : "—"} sub={equipData.length > 0 ? `${fmt(equipData[0].daysUsed)} days` : ""} />
        <KPICard label="Logs With Equipment" value={fmt(dailyLogs.filter((l) => l.equipment_used && l.equipment_used.trim()).length)} sub={`of ${fmt(dailyLogs.length)} total logs`} />
      </div>

      {/* Section label */}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginTop: 4 }}>
        Equipment Utilization by Type
      </div>

      {/* Utilization bars */}
      {equipData.length > 0 && (
        <div className="sbd-card" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {equipData.slice(0, 10).map((eq) => {
            const maxDays = equipData[0].daysUsed || 1;
            const widthPct = (eq.daysUsed / maxDays) * 100;
            return (
              <div key={eq.type}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-primary)", fontWeight: 600 }}>{eq.type}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", fontWeight: 700 }}>{fmt(eq.daysUsed)} days</span>
                </div>
                <div style={{ height: 6, background: "var(--border-default)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${widthPct}%`, height: "100%", borderRadius: 3, background: "var(--accent)", transition: "width 0.4s ease" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table */}
      <DataTable columns={equipCols} rows={equipData} rowKey="type" />
    </div>
  );
}

// ─── MATERIALS TAB ──────────────────────────────────────────────────────────

function MaterialsTab({ workPackages, deliveries }) {
  const stats = useMemo(() => {
    const totalTonnage = workPackages.reduce((s, wp) => s + safeNum(wp.tonnage), 0);
    const deliveredTonnage = deliveries
      .filter((d) => d.status === "Delivered")
      .reduce((s, d) => s + safeNum(d.weight_tons), 0);
    const remaining = Math.max(0, totalTonnage - deliveredTonnage);
    const deliveryPct = pct(deliveredTonnage, totalTonnage);
    const totalPieces = deliveries.reduce((s, d) => s + safeNum(d.pieces), 0);
    const deliveredPieces = deliveries
      .filter((d) => d.status === "Delivered")
      .reduce((s, d) => s + safeNum(d.pieces), 0);

    return { totalTonnage, deliveredTonnage, remaining, deliveryPct, totalPieces, deliveredPieces };
  }, [workPackages, deliveries]);

  const deliveryRows = useMemo(() => {
    const today = new Date();
    return deliveries.map((d) => {
      const scheduled = d.scheduled_date ? new Date(d.scheduled_date) : null;
      const isLate = scheduled && scheduled < today && d.status !== "Delivered";
      return { ...d, isLate };
    });
  }, [deliveries]);

  const deliveryCols = [
    { key: "truck_number", label: "Truck / ID", width: "100px", bold: true, render: (r) => r.truck_number || `#${r.id?.slice(-6) || "—"}` },
    { key: "description", label: "Description", width: "2fr", mono: false, fontSize: 11, render: (r) => r.description || "—" },
    { key: "scheduled_date", label: "Scheduled", width: "110px", right: true, render: (r) => formatDate(r.scheduled_date) },
    { key: "actual_date", label: "Actual", width: "110px", right: true, render: (r) => formatDate(r.actual_date) },
    { key: "weight_tons", label: "Weight (tons)", width: "100px", right: true, render: (r) => fmtDec(safeNum(r.weight_tons)) },
    { key: "pieces", label: "Pieces", width: "80px", right: true, render: (r) => fmt(safeNum(r.pieces)) },
    { key: "status", label: "Status", width: "110px", render: (r) => <StatusPill label={r.status || "—"} size="xs" /> },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <KPICard label="Total Tonnage" value={`${fmtDec(stats.totalTonnage)} T`} sub="From work packages" />
        <KPICard label="Delivered Tonnage" value={`${fmtDec(stats.deliveredTonnage)} T`} tone="var(--status-success)" sub={`${fmt(stats.deliveredPieces)} pieces delivered`} />
        <KPICard label="Remaining" value={`${fmtDec(stats.remaining)} T`} tone={stats.remaining > 0 ? "var(--status-warning)" : "var(--status-success)"} sub={stats.remaining === 0 ? "All material delivered" : "Outstanding"} />
        <KPICard label="Delivery %" value={`${fmtDec(stats.deliveryPct)}%`} tone={stats.deliveryPct >= 100 ? "var(--status-success)" : stats.deliveryPct >= 75 ? "var(--accent)" : "var(--text-primary)"} sub={`${fmt(stats.totalPieces)} total pieces`} />
        <KPICard label="Total Deliveries" value={fmt(deliveries.length)} sub={`${fmt(deliveries.filter((d) => d.status === "Delivered").length)} completed`} />
        <KPICard label="Late Deliveries" value={fmt(deliveryRows.filter((d) => d.isLate).length)} tone={deliveryRows.some((d) => d.isLate) ? "var(--status-error)" : "var(--status-success)"} sub={deliveryRows.some((d) => d.isLate) ? "Past scheduled date" : "All on time"} />
      </div>

      {/* Section label */}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginTop: 4 }}>
        Delivery Log
      </div>

      {/* Table */}
      <DataTable
        columns={deliveryCols}
        rows={deliveryRows}
        rowKey="id"
        rowStyle={(r) => {
          if (r.status === "Delivered") return { borderLeft: "3px solid var(--status-success)" };
          if (r.isLate) return { borderLeft: "3px solid var(--status-error)", background: "rgba(255,61,61,0.04)" };
          if (r.status === "In Transit") return { borderLeft: "3px solid var(--status-warning)" };
          return {};
        }}
      />
    </div>
  );
}

// ─── MAIN PAGE ──────────────────────────────────────────────────────────────

const TABS = ["LABOR", "EQUIPMENT", "MATERIALS"];

export default function LEMs() {
  const { activeProject } = useProjectContext();
  const projectId = activeProject?.id || null;
  const [activeTab, setActiveTab] = useState("LABOR");

  // ── Queries ─────────────────────────────────────────────────────────────

  const { data: dailyLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: getQueryKey("daily_log", projectId),
    queryFn: () => base44.entities.DailyLog.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: workPackages = [], isLoading: wpLoading } = useQuery({
    queryKey: getQueryKey("work_package", projectId),
    queryFn: () => base44.entities.WorkPackage.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: expenses = [], isLoading: expLoading } = useQuery({
    queryKey: getQueryKey("expense", projectId),
    queryFn: () => base44.entities.Expense.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: deliveries = [], isLoading: delLoading } = useQuery({
    queryKey: getQueryKey("delivery", projectId),
    queryFn: () => base44.entities.Delivery.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = logsLoading || wpLoading || expLoading || delLoading;

  // ── Guards ──────────────────────────────────────────────────────────────

  if (!projectId) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>&#9881;</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: "var(--text-disabled)", marginBottom: 6 }}>Select a project</div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>Use the project selector in the top right.</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>Loading LEM data...</div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CommandBar
        eyebrow={activeProject?.name || "PROJECT"}
        title="Labor, Equipment & Materials"
        subtitle="Crew hours · equipment utilization · material usage tracking"
      />

      <TabBar tabs={TABS} active={activeTab} onSelect={setActiveTab} />

      {activeTab === "LABOR" && (
        <LaborTab workPackages={workPackages} dailyLogs={dailyLogs} />
      )}

      {activeTab === "EQUIPMENT" && (
        <EquipmentTab dailyLogs={dailyLogs} />
      )}

      {activeTab === "MATERIALS" && (
        <MaterialsTab workPackages={workPackages} deliveries={deliveries} />
      )}
    </div>
  );
}
