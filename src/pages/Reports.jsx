import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

/* ── Style tokens ── */
const mono = { fontFamily: "var(--font-mono)" };
const body = { fontFamily: "var(--font-body)" };

const CARD = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-card)",
  padding: "18px 20px",
  boxShadow: "var(--shadow-card)",
};

const CARD_TITLE = {
  ...mono,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-primary)",
  marginBottom: 16,
};

const LABEL = {
  ...mono,
  fontSize: 8,
  fontWeight: 700,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.12em",
};

/* ── Helpers ── */
const formatCurrency = (v) => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
};

const computeHealth = (budget, actual) => {
  if (!budget || budget <= 0) return "neutral";
  const var_pct = ((actual - budget) / budget) * 100;
  if (var_pct <= 0) return "good";
  if (var_pct <= 5) return "watch";
  return "risk";
};

const HEALTH_COLORS = {
  good: "var(--status-success)",
  watch: "var(--status-warning)",
  risk: "var(--status-error)",
  neutral: "var(--text-muted)",
};

const PHASE_COLORS = {
  Detailing: "var(--phase-detailing)",
  Fabrication: "var(--phase-fab)",
  Delivery: "var(--phase-delivery)",
  Erection: "var(--phase-erection)",
  Closeout: "var(--phase-closeout)",
  Bidding: "var(--status-info)",
  Preconstruction: "var(--accent)",
};

const DATE_RANGES = [
  { key: "month", label: "This Month" },
  { key: "quarter", label: "This Quarter" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "All Time" },
];

function isInDateRange(dateStr, range) {
  if (range === "all" || !dateStr) return true;
  const d = new Date(dateStr);
  const now = new Date();
  if (range === "month") {
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }
  if (range === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    const qStart = new Date(now.getFullYear(), q * 3, 1);
    return d >= qStart && d <= now;
  }
  if (range === "ytd") {
    return d.getFullYear() === now.getFullYear() && d <= now;
  }
  return true;
}

/* ═══════════════════════════════════════════════════════════════
   SVG CHART COMPONENTS (no external chart library)
   ═══════════════════════════════════════════════════════════════ */

function BarChartSVG({ data, width = 400, height = 200 }) {
  if (!data || data.length === 0) return null;
  const padding = { top: 20, right: 16, bottom: 40, left: 56 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxVal = Math.max(...data.flatMap((d) => [d.budget || 0, d.actual || 0]), 1);
  const barGroupW = chartW / data.length;
  const barW = Math.max(6, Math.min(24, barGroupW * 0.32));
  const gap = 3;

  const gridLines = 5;
  const gridStep = maxVal / gridLines;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto" }}>
      {/* Grid lines */}
      {Array.from({ length: gridLines + 1 }, (_, i) => {
        const y = padding.top + chartH - (chartH * (gridStep * i)) / maxVal;
        return (
          <g key={i}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="var(--divider)" strokeDasharray="3 3" />
            <text x={padding.left - 8} y={y + 3} textAnchor="end" style={{ ...mono, fontSize: 8, fill: "var(--text-muted)" }}>
              {formatCurrency(gridStep * i)}
            </text>
          </g>
        );
      })}
      {/* Bars */}
      {data.map((d, i) => {
        const cx = padding.left + barGroupW * i + barGroupW / 2;
        const bH = (d.budget / maxVal) * chartH;
        const aH = (d.actual / maxVal) * chartH;
        return (
          <g key={i}>
            {/* Budget bar */}
            <rect
              x={cx - barW - gap / 2}
              y={padding.top + chartH - bH}
              width={barW}
              height={bH}
              rx={2}
              fill="var(--bg-surface-highest)"
            />
            {/* Actual bar */}
            <rect
              x={cx + gap / 2}
              y={padding.top + chartH - aH}
              width={barW}
              height={aH}
              rx={2}
              fill="var(--accent)"
            />
            {/* Label */}
            <text
              x={cx}
              y={height - padding.bottom + 14}
              textAnchor="middle"
              style={{ ...mono, fontSize: 7, fill: "var(--text-muted)" }}
            >
              {d.name?.length > 10 ? d.name.slice(0, 10) + ".." : d.name}
            </text>
          </g>
        );
      })}
      {/* Legend */}
      <rect x={width - 120} y={4} width={8} height={8} rx={2} fill="var(--bg-surface-highest)" />
      <text x={width - 108} y={11} style={{ ...mono, fontSize: 7, fill: "var(--text-muted)" }}>Budget</text>
      <rect x={width - 60} y={4} width={8} height={8} rx={2} fill="var(--accent)" />
      <text x={width - 48} y={11} style={{ ...mono, fontSize: 7, fill: "var(--text-muted)" }}>Actual</text>
    </svg>
  );
}

function DonutChartSVG({ segments, size = 180, innerRadius = 50, outerRadius = 72 }) {
  if (!segments || segments.length === 0) return null;
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return null;
  const cx = size / 2;
  const cy = size / 2;
  let cumulativeAngle = -Math.PI / 2;

  const arcs = segments.map((seg) => {
    const angle = (seg.value / total) * 2 * Math.PI;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + angle;
    cumulativeAngle = endAngle;

    const x1 = cx + outerRadius * Math.cos(startAngle);
    const y1 = cy + outerRadius * Math.sin(startAngle);
    const x2 = cx + outerRadius * Math.cos(endAngle);
    const y2 = cy + outerRadius * Math.sin(endAngle);
    const ix1 = cx + innerRadius * Math.cos(endAngle);
    const iy1 = cy + innerRadius * Math.sin(endAngle);
    const ix2 = cx + innerRadius * Math.cos(startAngle);
    const iy2 = cy + innerRadius * Math.sin(startAngle);
    const largeArc = angle > Math.PI ? 1 : 0;

    const path = [
      `M ${x1} ${y1}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${ix1} ${iy1}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix2} ${iy2}`,
      `Z`,
    ].join(" ");

    return { ...seg, path, pct: ((seg.value / total) * 100).toFixed(0) };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, maxWidth: "100%" }}>
        {arcs.map((arc, i) => (
          <path key={i} d={arc.path} fill={arc.color} stroke="var(--bg-surface)" strokeWidth={1.5}>
            <title>{`${arc.label}: ${arc.value} (${arc.pct}%)`}</title>
          </path>
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" style={{ ...mono, fontSize: 16, fontWeight: 700, fill: "var(--text-primary)" }}>
          {total}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" style={{ ...mono, fontSize: 7, fill: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Total
        </text>
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", justifyContent: "center" }}>
        {arcs.map((arc, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: arc.color }} />
            <span style={{ ...mono, fontSize: 8, color: "var(--text-muted)" }}>
              {arc.label} ({arc.value})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SKELETON / EMPTY STATES
   ═══════════════════════════════════════════════════════════════ */

function SkeletonBar({ width = "100%", height = 12, style = {} }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 4,
        background: "linear-gradient(90deg, var(--bg-surface-high) 25%, var(--bg-surface-highest) 50%, var(--bg-surface-high) 75%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.8s infinite",
        ...style,
      }}
    />
  );
}

function SkeletonKPICard() {
  return (
    <div style={{ ...CARD, borderTop: "2px solid var(--border-default)", padding: "16px 18px" }}>
      <SkeletonBar width={80} height={8} style={{ marginBottom: 12 }} />
      <SkeletonBar width={100} height={22} style={{ marginBottom: 8 }} />
      <SkeletonBar width={60} height={8} />
    </div>
  );
}

function SkeletonTableRow() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "40px 2fr 90px 50px 100px 100px 80px 60px 50px 120px 60px",
        padding: "10px 16px",
        gap: 8,
        borderBottom: "1px solid var(--divider)",
      }}
    >
      <SkeletonBar width={24} height={10} />
      <SkeletonBar width="80%" height={10} />
      <SkeletonBar width={60} height={10} />
      <SkeletonBar width={12} height={12} style={{ borderRadius: "50%" }} />
      <SkeletonBar width={70} height={10} />
      <SkeletonBar width={70} height={10} />
      <SkeletonBar width={50} height={10} />
      <SkeletonBar width={30} height={10} />
      <SkeletonBar width={24} height={10} />
      <SkeletonBar width="90%" height={8} />
      <SkeletonBar width={40} height={18} style={{ borderRadius: "var(--radius-btn)" }} />
    </div>
  );
}

function RichEmptyState({ navigate }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, padding: "60px 20px" }}>
      {/* Large icon */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: "var(--accent-muted)",
          border: "2px solid var(--accent-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" />
          <path d="M7 16l4-8 4 4 5-9" />
        </svg>
      </div>

      <div style={{ textAlign: "center" }}>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: "0 0 8px",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Start Building Your Portfolio
        </h2>
        <p style={{ ...body, fontSize: 13, color: "var(--text-secondary)", maxWidth: 440, margin: "0 auto", lineHeight: 1.6 }}>
          The Portfolio Reports dashboard aggregates data from all your projects, including budgets,
          RFIs, change orders, deliveries, and action items, giving you a single view of your
          entire operation.
        </p>
      </div>

      {/* CTA buttons */}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={() => navigate(createPageUrl("Projects"))}
          style={{
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-btn)",
            padding: "10px 20px",
            ...mono,
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            cursor: "pointer",
          }}
        >
          + Create Project
        </button>
        <button
          onClick={() => navigate(createPageUrl("ImportData"))}
          style={{
            background: "transparent",
            color: "var(--accent)",
            border: "1px solid var(--accent-border)",
            borderRadius: "var(--radius-btn)",
            padding: "10px 20px",
            ...mono,
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            cursor: "pointer",
          }}
        >
          Import Data
        </button>
      </div>

      {/* Ghost skeleton preview */}
      <div style={{ width: "100%", maxWidth: 900, opacity: 0.35, marginTop: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonKPICard key={i} />
          ))}
        </div>
        <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--divider)" }}>
            <SkeletonBar width={180} height={10} />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonTableRow key={i} />
          ))}
        </div>
      </div>

      {/* Shimmer keyframes injected inline */}
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   KPI CARD
   ═══════════════════════════════════════════════════════════════ */

function KPICard({ label, value, detail, borderColor, badge, onClick, active }) {
  return (
    <div
      onClick={onClick}
      style={{
        ...CARD,
        borderTop: `2px solid ${borderColor}`,
        padding: "16px 18px",
        cursor: onClick ? "pointer" : "default",
        outline: active ? `2px solid ${borderColor}` : "none",
        outlineOffset: -1,
        transition: "outline 0.15s, box-shadow 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={LABEL}>{label}</div>
        {badge && (
          <span
            style={{
              ...mono,
              fontSize: 7,
              fontWeight: 700,
              color: "#fff",
              background: "var(--status-error)",
              borderRadius: "var(--radius-badge)",
              padding: "2px 6px",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            {badge}
          </span>
        )}
      </div>
      <div style={{ ...mono, fontSize: 20, fontWeight: 700, color: borderColor, lineHeight: 1.2, marginBottom: 4 }}>
        {value}
      </div>
      {detail && (
        <div style={{ ...body, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4 }}>
          {detail}
        </div>
      )}
      {/* Mini trend indicator */}
      <div style={{ marginTop: 8 }}>
        <svg width={48} height={14} viewBox="0 0 48 14">
          <polyline
            points="0,12 8,8 16,10 24,5 32,7 40,3 48,6"
            fill="none"
            stroke={borderColor}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.6}
          />
        </svg>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   INLINE PROGRESS BAR
   ═══════════════════════════════════════════════════════════════ */

function MiniProgressBar({ pct, color = "var(--accent)" }) {
  const clamped = Math.max(0, Math.min(100, pct || 0));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          flex: 1,
          height: 6,
          background: "var(--bg-surface-high)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${clamped}%`,
            height: "100%",
            background: color,
            borderRadius: 3,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <span style={{ ...mono, fontSize: 8, color: "var(--text-muted)", minWidth: 28, textAlign: "right" }}>
        {clamped.toFixed(0)}%
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SORTABLE TABLE HEADER
   ═══════════════════════════════════════════════════════════════ */

function SortHeader({ label, field, sortField, sortDir, onSort, style = {} }) {
  const active = sortField === field;
  return (
    <div
      onClick={() => onSort(field)}
      style={{
        ...LABEL,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 3,
        color: active ? "var(--accent)" : "var(--text-muted)",
        userSelect: "none",
        ...style,
      }}
    >
      {label}
      {active && (
        <span style={{ fontSize: 8 }}>{sortDir === "asc" ? "\u25B2" : "\u25BC"}</span>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   INFO TOOLTIP ICON
   ═══════════════════════════════════════════════════════════════ */

function InfoIcon({ tooltip }) {
  const [show, setShow] = useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-flex", cursor: "help" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <circle cx={12} cy={12} r={10} />
        <line x1={12} y1={16} x2={12} y2={12} />
        <line x1={12} y1={8} x2={12.01} y2={8} />
      </svg>
      {show && (
        <div
          style={{
            position: "absolute",
            top: -4,
            left: "100%",
            marginLeft: 8,
            background: "var(--bg-surface-high)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-card)",
            padding: "8px 12px",
            ...body,
            fontSize: 11,
            color: "var(--text-secondary)",
            whiteSpace: "nowrap",
            zIndex: 100,
            boxShadow: "var(--shadow-card)",
          }}
        >
          {tooltip}
        </div>
      )}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   URGENT ITEM CARD (horizontal scroll section)
   ═══════════════════════════════════════════════════════════════ */

function UrgentCard({ title, subtitle, severity, meta, onClick }) {
  const sevColors = {
    critical: "var(--status-error)",
    high: "var(--status-warning)",
    medium: "var(--status-info)",
    low: "var(--text-muted)",
  };
  const color = sevColors[severity] || "var(--text-muted)";
  return (
    <div
      onClick={onClick}
      style={{
        minWidth: 240,
        maxWidth: 280,
        ...CARD,
        borderLeft: `3px solid ${color}`,
        padding: "14px 16px",
        cursor: onClick ? "pointer" : "default",
        flexShrink: 0,
      }}
    >
      <div style={{ ...mono, fontSize: 7, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>
        {severity?.toUpperCase() || "INFO"}
      </div>
      <div style={{ ...body, fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4, lineHeight: 1.3 }}>
        {title}
      </div>
      <div style={{ ...body, fontSize: 11, color: "var(--text-secondary)", marginBottom: 6, lineHeight: 1.4 }}>
        {subtitle}
      </div>
      {meta && (
        <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          {meta}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN REPORTS COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function Reports() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState("all");
  const [sortField, setSortField] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [kpiFilter, setKpiFilter] = useState(null);

  /* ── Data queries ── */
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });
  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis"],
    queryFn: () => base44.entities.RFI.list(),
  });
  const { data: changeOrders = [] } = useQuery({
    queryKey: ["change-orders-global"],
    queryFn: () => base44.entities.ChangeOrder.list(),
  });
  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses-all"],
    queryFn: () => base44.entities.Expense.list(),
  });
  const { data: actionItems = [] } = useQuery({
    queryKey: ["action-items-all"],
    queryFn: () => base44.entities.ActionItem.list(),
  });
  const { data: deliveries = [] } = useQuery({
    queryKey: ["deliveries-all"],
    queryFn: () => base44.entities.Delivery.list(),
  });
  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages-global"],
    queryFn: () => base44.entities.WorkPackage.list(),
  });
  const { data: costCodes = [] } = useQuery({
    queryKey: ["cost-codes-global"],
    queryFn: () => base44.entities.CostCode.list(),
  });

  /* ── Derived data ── */
  const now = new Date();

  const openRFIs = useMemo(
    () => rfis.filter((r) => !["Answered", "Closed"].includes(r.status)),
    [rfis]
  );
  const overdueRFIs = useMemo(
    () => openRFIs.filter((r) => r.date_required && new Date(r.date_required) < now),
    [openRFIs]
  );
  const pendingCOs = useMemo(
    () => changeOrders.filter((c) => c.status === "Pending" || c.status === "Under Review"),
    [changeOrders]
  );
  const pendingCOValue = useMemo(
    () => pendingCOs.reduce((s, c) => s + (Number(c.co_amount) || 0), 0),
    [pendingCOs]
  );
  const overdueActions = useMemo(
    () =>
      actionItems.filter(
        (a) => a.status !== "Complete" && a.status !== "Closed" && a.due_date && new Date(a.due_date) < now
      ),
    [actionItems]
  );
  const lateDeliveries = useMemo(
    () =>
      deliveries.filter(
        (d) =>
          d.status !== "Delivered" &&
          d.status !== "Complete" &&
          d.expected_delivery_date &&
          new Date(d.expected_delivery_date) < now
      ),
    [deliveries]
  );

  /* Per-project computed rows */
  const projectRows = useMemo(() => {
    return projects.map((p) => {
      const pCodes = costCodes.filter((c) => c.project_id === p.id);
      const budget = pCodes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0) || Number(p.original_contract_value) || 0;
      const actual = pCodes.reduce((s, c) => s + (Number(c.actual_cost) || 0), 0);
      const variance = budget > 0 ? actual - budget : 0;
      const var_pct = budget > 0 ? (variance / budget) * 100 : 0;
      const health = computeHealth(budget, actual);

      const pRFIs = rfis.filter((r) => r.project_id === p.id && !["Answered", "Closed"].includes(r.status));
      const pCOs = changeOrders.filter((c) => c.project_id === p.id && (c.status === "Pending" || c.status === "Under Review"));
      const pWPs = workPackages.filter((w) => w.project_id === p.id);
      const wpTotal = pWPs.length;
      const wpComplete = pWPs.filter((w) => w.status === "Complete" || w.status === "Shipped").length;
      const wpPct = wpTotal > 0 ? (wpComplete / wpTotal) * 100 : 0;

      return {
        id: p.id,
        number: p.project_number || `P-${p.id}`,
        name: p.name || "Untitled Project",
        phase: p.phase || "Unknown",
        health,
        budget,
        actual,
        variance,
        var_pct,
        openRFIs: pRFIs.length,
        openCOs: pCOs.length,
        wpPct,
        raw: p,
      };
    });
  }, [projects, costCodes, rfis, changeOrders, workPackages]);

  /* KPIs */
  const portfolioValue = useMemo(
    () => projectRows.reduce((s, r) => s + r.budget, 0),
    [projectRows]
  );
  const activeCount = projects.filter((p) => p.status !== "Complete" && p.status !== "Closed").length;
  const budgetVariance = useMemo(
    () => projectRows.reduce((s, r) => s + r.variance, 0),
    [projectRows]
  );

  /* Filter & sort project rows */
  const filteredRows = useMemo(() => {
    let rows = [...projectRows];

    // KPI filter
    if (kpiFilter === "value") {
      rows = rows.filter((r) => r.budget > 0);
    } else if (kpiFilter === "active") {
      rows = rows.filter((r) => {
        const p = r.raw;
        return p.status !== "Complete" && p.status !== "Closed";
      });
    } else if (kpiFilter === "rfis") {
      rows = rows.filter((r) => r.openRFIs > 0);
    } else if (kpiFilter === "cos") {
      rows = rows.filter((r) => r.openCOs > 0);
    } else if (kpiFilter === "variance") {
      rows = rows.filter((r) => r.variance !== 0);
    } else if (kpiFilter === "overdue") {
      const overdueProjectIds = new Set(overdueActions.map((a) => a.project_id));
      rows = rows.filter((r) => overdueProjectIds.has(r.id));
    }

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.number.toLowerCase().includes(q) ||
          r.phase.toLowerCase().includes(q)
      );
    }

    // Sort
    rows.sort((a, b) => {
      let av = a[sortField];
      let bv = b[sortField];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return rows;
  }, [projectRows, kpiFilter, search, sortField, sortDir, overdueActions]);

  /* Sort handler */
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  /* Chart data */
  const barChartData = useMemo(
    () =>
      projectRows
        .filter((r) => r.budget > 0 || r.actual > 0)
        .slice(0, 12)
        .map((r) => ({
          name: r.number,
          budget: r.budget,
          actual: r.actual,
        })),
    [projectRows]
  );

  const rfiDonutData = useMemo(() => {
    const open = rfis.filter((r) => r.status === "Open").length;
    const underReview = rfis.filter((r) => r.status === "Under Review").length;
    const answered = rfis.filter((r) => r.status === "Answered").length;
    const closed = rfis.filter((r) => r.status === "Closed").length;
    return [
      { label: "Open", value: open, color: "var(--status-warning)" },
      { label: "Under Review", value: underReview, color: "var(--status-info)" },
      { label: "Answered", value: answered, color: "var(--status-success)" },
      { label: "Closed", value: closed, color: "var(--text-muted)" },
    ].filter((s) => s.value > 0);
  }, [rfis]);

  /* Urgent items */
  const urgentItems = useMemo(() => {
    const items = [];
    overdueRFIs.slice(0, 5).forEach((r) => {
      const proj = projects.find((p) => p.id === r.project_id);
      items.push({
        type: "rfi",
        title: r.rfi_number || "RFI",
        subtitle: r.subject || "No subject",
        severity: r.priority === "Critical" ? "critical" : r.priority === "High" ? "high" : "medium",
        meta: proj ? proj.name : "",
        onClick: () => navigate(createPageUrl("RFIs")),
      });
    });
    pendingCOs.slice(0, 5).forEach((c) => {
      const proj = projects.find((p) => p.id === c.project_id);
      items.push({
        type: "co",
        title: c.co_number || "CO",
        subtitle: `${c.description || "Change order"} - ${formatCurrency(c.co_amount)}`,
        severity: (Number(c.co_amount) || 0) > 50000 ? "high" : "medium",
        meta: proj ? proj.name : "",
        onClick: () => navigate(createPageUrl("ChangeOrders")),
      });
    });
    lateDeliveries.slice(0, 5).forEach((d) => {
      const proj = projects.find((p) => p.id === d.project_id);
      items.push({
        type: "delivery",
        title: d.delivery_number || "Delivery",
        subtitle: d.description || "Late delivery",
        severity: "high",
        meta: proj ? proj.name : "",
        onClick: () => navigate(createPageUrl("Deliveries")),
      });
    });
    return items;
  }, [overdueRFIs, pendingCOs, lateDeliveries, projects, navigate]);

  /* ── FULL EMPTY STATE ── */
  if (projects.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header even in empty state */}
        <div>
          <h1
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 22,
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Portfolio Reports
          </h1>
          <p
            style={{
              ...mono,
              fontSize: 10,
              color: "var(--text-muted)",
              marginTop: 4,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            0 projects &middot; {now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <RichEmptyState navigate={navigate} />
        <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      </div>
    );
  }

  /* ── MAIN RENDER ── */
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── 1. HEADER ── */}
      <div>
        <h1
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 22,
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: 0,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Portfolio Reports
        </h1>
        <p
          style={{
            ...mono,
            fontSize: 10,
            color: "var(--text-muted)",
            marginTop: 4,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {projects.length} project{projects.length !== 1 ? "s" : ""} &middot;{" "}
          {now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </p>
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects by name, number, phase..."
          style={{
            flex: 1,
            minWidth: 280,
            background: "var(--bg-input)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-input)",
            padding: "9px 12px",
            color: "var(--text-primary)",
            ...body,
            fontSize: 12,
          }}
        />
        <div style={{ display: "flex", gap: 0, border: "1px solid var(--border-default)", borderRadius: "var(--radius-btn)", overflow: "hidden" }}>
          {DATE_RANGES.map((dr) => (
            <button
              key={dr.key}
              onClick={() => setDateRange(dr.key)}
              style={{
                background: dateRange === dr.key ? "var(--accent)" : "transparent",
                color: dateRange === dr.key ? "#fff" : "var(--text-muted)",
                border: "none",
                borderRight: "1px solid var(--border-default)",
                padding: "8px 12px",
                ...mono,
                fontSize: 8,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                cursor: "pointer",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {dr.label}
            </button>
          ))}
        </div>
        <button
          style={{
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-btn)",
            padding: "8px 16px",
            ...mono,
            fontSize: 9,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1={12} y1={15} x2={12} y2={3} />
          </svg>
          Export
        </button>
      </div>

      {/* ── 2. KPI CARDS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <KPICard
          label="Portfolio Value"
          value={formatCurrency(portfolioValue)}
          detail={`${projects.length} total projects`}
          borderColor="var(--status-success)"
          onClick={() => setKpiFilter(kpiFilter === "value" ? null : "value")}
          active={kpiFilter === "value"}
        />
        <KPICard
          label="Active Projects"
          value={activeCount}
          detail={`${projects.length - activeCount} complete/closed`}
          borderColor="var(--status-info)"
          onClick={() => setKpiFilter(kpiFilter === "active" ? null : "active")}
          active={kpiFilter === "active"}
        />
        <KPICard
          label="Open RFIs"
          value={openRFIs.length}
          badge={overdueRFIs.length > 0 ? `${overdueRFIs.length} overdue` : null}
          detail={`${rfis.length} total`}
          borderColor="var(--status-warning)"
          onClick={() => setKpiFilter(kpiFilter === "rfis" ? null : "rfis")}
          active={kpiFilter === "rfis"}
        />
        <KPICard
          label="Pending COs"
          value={pendingCOs.length}
          detail={formatCurrency(pendingCOValue) + " pending value"}
          borderColor="#F97316"
          onClick={() => setKpiFilter(kpiFilter === "cos" ? null : "cos")}
          active={kpiFilter === "cos"}
        />
        <KPICard
          label="Budget Variance"
          value={(budgetVariance >= 0 ? "+" : "") + formatCurrency(budgetVariance)}
          detail={budgetVariance <= 0 ? "Under budget" : "Over budget"}
          borderColor={budgetVariance <= 0 ? "var(--status-success)" : "var(--status-error)"}
          onClick={() => setKpiFilter(kpiFilter === "variance" ? null : "variance")}
          active={kpiFilter === "variance"}
        />
        <KPICard
          label="Overdue Actions"
          value={overdueActions.length}
          detail={`${actionItems.filter((a) => a.status !== "Complete" && a.status !== "Closed").length} open total`}
          borderColor="var(--status-error)"
          badge={overdueActions.length > 0 ? "past due" : null}
          onClick={() => setKpiFilter(kpiFilter === "overdue" ? null : "overdue")}
          active={kpiFilter === "overdue"}
        />
      </div>

      {/* ── 3. PROJECT STATUS MATRIX ── */}
      <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={CARD_TITLE}>Project Status Matrix</div>
          {kpiFilter && (
            <button
              onClick={() => setKpiFilter(null)}
              style={{
                background: "var(--accent-muted)",
                color: "var(--accent)",
                border: "1px solid var(--accent-border)",
                borderRadius: "var(--radius-badge)",
                padding: "3px 10px",
                ...mono,
                fontSize: 8,
                fontWeight: 600,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Clear filter
            </button>
          )}
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          {/* Sticky header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "40px 2fr 90px 50px 100px 100px 80px 60px 50px 120px 60px",
              padding: "9px 16px",
              gap: 8,
              background: "var(--bg-sidebar)",
              borderBottom: "1px solid var(--divider)",
              position: "sticky",
              top: 0,
              zIndex: 2,
              minWidth: 960,
            }}
          >
            <SortHeader label="#" field="number" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
            <SortHeader label="Project Name" field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
            <SortHeader label="Phase" field="phase" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
            <SortHeader label="Health" field="health" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
            <SortHeader label="Budget" field="budget" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={{ textAlign: "right", justifyContent: "flex-end" }} />
            <SortHeader label="Actual" field="actual" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={{ textAlign: "right", justifyContent: "flex-end" }} />
            <SortHeader label="VAR" field="variance" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={{ textAlign: "right", justifyContent: "flex-end" }} />
            <SortHeader label="RFIs" field="openRFIs" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={{ textAlign: "center", justifyContent: "center" }} />
            <SortHeader label="COs" field="openCOs" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={{ textAlign: "center", justifyContent: "center" }} />
            <SortHeader label="WP Progress" field="wpPct" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
            <div style={LABEL}>Action</div>
          </div>

          {/* Rows */}
          {filteredRows.length > 0 ? (
            filteredRows.map((row) => (
              <div
                key={row.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "40px 2fr 90px 50px 100px 100px 80px 60px 50px 120px 60px",
                  padding: "10px 16px",
                  gap: 8,
                  borderBottom: "1px solid var(--divider)",
                  alignItems: "center",
                  minWidth: 960,
                  transition: "background 0.1s",
                  cursor: "default",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-row-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {/* # */}
                <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>{row.number}</div>
                {/* Name */}
                <div style={{ ...body, fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {row.name}
                </div>
                {/* Phase */}
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: PHASE_COLORS[row.phase] || "var(--text-muted)",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ ...mono, fontSize: 9, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                    {row.phase}
                  </span>
                </div>
                {/* Health */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: HEALTH_COLORS[row.health],
                      boxShadow: row.health === "risk" ? "0 0 6px var(--status-error)" : "none",
                    }}
                    title={row.health}
                  />
                </div>
                {/* Budget */}
                <div style={{ ...mono, fontSize: 11, color: "var(--text-primary)", textAlign: "right" }}>
                  {formatCurrency(row.budget)}
                </div>
                {/* Actual */}
                <div style={{ ...mono, fontSize: 11, color: "var(--text-primary)", textAlign: "right" }}>
                  {formatCurrency(row.actual)}
                </div>
                {/* Variance */}
                <div
                  style={{
                    ...mono,
                    fontSize: 11,
                    fontWeight: 600,
                    textAlign: "right",
                    color: row.variance <= 0 ? "var(--status-success)" : "var(--status-error)",
                  }}
                >
                  {row.variance === 0 ? "\u2014" : (row.variance > 0 ? "+" : "") + formatCurrency(row.variance)}
                </div>
                {/* Open RFIs */}
                <div style={{ ...mono, fontSize: 11, color: row.openRFIs > 0 ? "var(--status-warning)" : "var(--text-muted)", textAlign: "center", fontWeight: row.openRFIs > 0 ? 700 : 400 }}>
                  {row.openRFIs}
                </div>
                {/* COs */}
                <div style={{ ...mono, fontSize: 11, color: row.openCOs > 0 ? "#F97316" : "var(--text-muted)", textAlign: "center", fontWeight: row.openCOs > 0 ? 700 : 400 }}>
                  {row.openCOs}
                </div>
                {/* WP Progress */}
                <MiniProgressBar
                  pct={row.wpPct}
                  color={row.wpPct >= 80 ? "var(--status-success)" : row.wpPct >= 40 ? "var(--accent)" : "var(--status-info)"}
                />
                {/* Action */}
                <button
                  onClick={() => navigate(createPageUrl("Projects") + `?id=${row.id}`)}
                  style={{
                    background: "var(--accent)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "var(--radius-btn)",
                    padding: "4px 10px",
                    ...mono,
                    fontSize: 8,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    cursor: "pointer",
                  }}
                >
                  View
                </button>
              </div>
            ))
          ) : (
            /* Empty table state */
            <div style={{ padding: "48px 20px", textAlign: "center" }}>
              <div style={{ opacity: 0.4, marginBottom: 16 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonTableRow key={i} />
                ))}
              </div>
              <div style={{ ...mono, fontSize: 12, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                No projects yet
              </div>
              <p style={{ ...body, fontSize: 12, color: "var(--text-secondary)", marginBottom: 14 }}>
                {kpiFilter || search ? "No projects match the current filters." : "Create your first project to see the status matrix."}
              </p>
              {!kpiFilter && !search && (
                <button
                  onClick={() => navigate(createPageUrl("Projects"))}
                  style={{
                    background: "var(--accent)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "var(--radius-btn)",
                    padding: "8px 18px",
                    ...mono,
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    cursor: "pointer",
                  }}
                >
                  + Create First Project
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 4. CHARTS ROW ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
        {/* Budget vs Actual Bar Chart */}
        <div style={CARD}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={CARD_TITLE}>Budget vs Actual</div>
            <InfoIcon tooltip="Grouped bar comparison of budget and actual spend per project" />
          </div>
          {barChartData.length > 0 ? (
            <BarChartSVG data={barChartData} width={420} height={200} />
          ) : (
            <div style={{ padding: "48px 0", textAlign: "center" }}>
              <p style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>No budget data available</p>
            </div>
          )}
        </div>

        {/* RFI Status Donut */}
        <div style={CARD}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={CARD_TITLE}>RFI Status Distribution</div>
            <InfoIcon tooltip="Breakdown of RFIs by current status across all projects" />
          </div>
          {rfiDonutData.length > 0 ? (
            <DonutChartSVG segments={rfiDonutData} />
          ) : (
            <div style={{ padding: "48px 0", textAlign: "center" }}>
              <p style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>No RFIs logged</p>
            </div>
          )}
        </div>
      </div>

      {/* ── 5. RECENT ACTIVITY / URGENT ITEMS ── */}
      {urgentItems.length > 0 && (
        <div>
          <div style={{ ...CARD_TITLE, marginBottom: 12 }}>Urgent Items</div>
          <div
            style={{
              display: "flex",
              gap: 12,
              overflowX: "auto",
              paddingBottom: 8,
              scrollbarWidth: "thin",
              scrollbarColor: "var(--bg-surface-highest) var(--bg-surface-low)",
            }}
          >
            {urgentItems.map((item, i) => (
              <UrgentCard
                key={`${item.type}-${i}`}
                title={item.title}
                subtitle={item.subtitle}
                severity={item.severity}
                meta={item.meta}
                onClick={item.onClick}
              />
            ))}
          </div>
        </div>
      )}

      {/* Shimmer animation for skeleton elements */}
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}
