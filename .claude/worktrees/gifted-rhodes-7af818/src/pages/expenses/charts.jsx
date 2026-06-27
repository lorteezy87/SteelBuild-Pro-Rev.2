/**
 * SVG chart helpers for the Expenses page — no external chart library.
 *
 *   - MiniProgressRing   — tiny ring in KPI cards.
 *   - BudgetDonutChart   — donut with per-cost-code segments + legend.
 *   - BurndownSparkline  — area+line showing remaining budget over time.
 *   - MonthlyTrendChart  — 6-month spend trend with dots + axis labels.
 *   - PaymentCircle      — tiny per-row indicator of payment status.
 */

import React from "react";
import { CATEGORY_COLORS } from "@/components/shared/costCodes";
import { formatCurrencyShort } from "@/components/shared/formatters";

export function MiniProgressRing({ ratio, size = 32, stroke = 3, color = "var(--accent)" }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(1, ratio)) * circ;
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-surface-highest)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeDashoffset={circ * 0.25}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.4s ease" }}
      />
    </svg>
  );
}

export function BudgetDonutChart({ segments, totalCommitted }) {
  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 65;
  const innerR = 45;
  const total = segments.reduce((s, seg) => s + seg.spend, 0);
  if (total === 0) {
    return (
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", padding: "20px 0", textAlign: "center" }}>
        No spend data
      </div>
    );
  }

  let cumAngle = -90;
  const paths = segments.map((seg) => {
    const frac = seg.spend / total;
    const startAngle = cumAngle;
    const sweep = frac * 360;
    cumAngle += sweep;
    const endAngle = startAngle + sweep;

    const toRad = (deg) => (deg * Math.PI) / 180;
    const x1o = cx + outerR * Math.cos(toRad(startAngle));
    const y1o = cy + outerR * Math.sin(toRad(startAngle));
    const x2o = cx + outerR * Math.cos(toRad(endAngle));
    const y2o = cy + outerR * Math.sin(toRad(endAngle));
    const x1i = cx + innerR * Math.cos(toRad(endAngle));
    const y1i = cy + innerR * Math.sin(toRad(endAngle));
    const x2i = cx + innerR * Math.cos(toRad(startAngle));
    const y2i = cy + innerR * Math.sin(toRad(startAngle));
    const large = sweep > 180 ? 1 : 0;
    const color = CATEGORY_COLORS[seg.category] || "var(--accent)";

    const d = [
      `M ${x1o} ${y1o}`,
      `A ${outerR} ${outerR} 0 ${large} 1 ${x2o} ${y2o}`,
      `L ${x1i} ${y1i}`,
      `A ${innerR} ${innerR} 0 ${large} 0 ${x2i} ${y2i}`,
      "Z",
    ].join(" ");

    return <path key={seg.code} d={d} fill={color} style={{ transition: "opacity 0.2s" }} />;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {paths}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="var(--text-muted)" style={{ fontFamily: "var(--font-mono)", fontSize: 9 }}>COMMITTED</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill="var(--text-primary)" style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700 }}>
          {formatCurrencyShort(totalCommitted)}
        </text>
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", justifyContent: "center" }}>
        {segments.map((seg) => (
          <div key={seg.code} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: CATEGORY_COLORS[seg.category] || "var(--accent)", flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-secondary)" }}>{seg.code}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--text-primary)" }}>{formatCurrencyShort(seg.spend)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BurndownSparkline({ expenses, totalBudget }) {
  if (!expenses.length || totalBudget <= 0) return null;

  const sorted = [...expenses]
    .filter((e) => e.payment_status !== "Voided")
    .sort((a, b) => new Date(a.expense_date) - new Date(b.expense_date));

  if (sorted.length === 0) return null;

  const points = [{ x: 0, y: totalBudget }];
  let running = totalBudget;
  sorted.forEach((e, i) => {
    running -= Number(e.amount) || 0;
    points.push({ x: i + 1, y: running });
  });

  const w = 120;
  const h = 28;
  const maxX = points.length - 1;
  const maxY = totalBudget;
  const minY = Math.min(0, ...points.map((p) => p.y));
  const range = maxY - minY || 1;

  const toSVG = (p) => ({
    sx: maxX > 0 ? (p.x / maxX) * w : w / 2,
    sy: h - ((p.y - minY) / range) * h,
  });

  const svgPoints = points.map(toSVG);
  const polyline = svgPoints.map((p) => `${p.sx},${p.sy}`).join(" ");

  const remaining = points[points.length - 1].y;
  const pctRemaining = totalBudget > 0 ? (remaining / totalBudget) * 100 : 0;
  const color =
    pctRemaining < 10 ? "var(--status-error)" :
    pctRemaining < 20 ? "var(--status-warning)" :
                        "var(--status-success)";

  const fillPoints = `0,${h} ${polyline} ${w},${h}`;

  return (
    <svg width={w} height={h} style={{ marginTop: 6, display: "block" }}>
      <polygon points={fillPoints} fill={color} opacity="0.12" />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function MonthlyTrendChart({ expenses }) {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("default", { month: "short" }),
      total: 0,
    });
  }

  const active = expenses.filter((e) => e.payment_status !== "Voided");
  active.forEach((e) => {
    if (!e.expense_date) return;
    const d = new Date(e.expense_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const m = months.find((mm) => mm.key === key);
    if (m) m.total += Number(e.amount) || 0;
  });

  const maxVal = Math.max(...months.map((m) => m.total), 1);
  const w = 220;
  const h = 70;
  const padT = 6;
  const padB = 16;
  const plotW = w;
  const plotH = h - padT - padB;

  const pts = months.map((m, i) => ({
    x: (i / (months.length - 1)) * plotW,
    y: padT + plotH - (m.total / maxVal) * plotH,
  }));

  const polyline = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const fillPoly = `0,${padT + plotH} ${polyline} ${plotW},${padT + plotH}`;

  return (
    <div>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <polygon points={fillPoly} fill="var(--accent)" opacity="0.12" />
        <polyline points={polyline} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="var(--accent)" />
        ))}
        {months.map((m, i) => (
          <text key={m.key} x={pts[i].x} y={h - 2} textAnchor="middle" fill="var(--text-muted)" style={{ fontFamily: "var(--font-mono)", fontSize: 9 }}>
            {m.label}
          </text>
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        {months.map((m) => (
          <span key={m.key} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", flex: 1, textAlign: "center" }}>
            {m.total > 0 ? formatCurrencyShort(m.total) : "--"}
          </span>
        ))}
      </div>
    </div>
  );
}

export function PaymentCircle({ status }) {
  const size = 14;
  const cx = size / 2;
  const cy = size / 2;
  const r = 5;

  if (status === "Voided") {
    return (
      <svg width={size} height={size} style={{ verticalAlign: "middle", marginRight: 4 }}>
        <line x1={3} y1={3} x2={size - 3} y2={size - 3} stroke="var(--text-muted)" strokeWidth={1.5} strokeLinecap="round" />
        <line x1={size - 3} y1={3} x2={3} y2={size - 3} stroke="var(--text-muted)" strokeWidth={1.5} strokeLinecap="round" />
      </svg>
    );
  }

  const colorMap = {
    Paid:               "var(--status-success)",
    "Pending Approval": "var(--status-warning)",
    Unpaid:             "var(--status-error)",
    Disputed:           "var(--status-error)",
  };
  const color = colorMap[status] || "var(--text-muted)";
  const circ = 2 * Math.PI * r;
  const fillRatio = status === "Paid" ? 1 : status === "Pending Approval" ? 0.5 : 0;
  const filled = fillRatio * circ;

  return (
    <svg width={size} height={size} style={{ verticalAlign: "middle", marginRight: 4 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={1.5} opacity={0.3} />
      {fillRatio > 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeDashoffset={circ * 0.25}
          strokeLinecap="round"
        />
      )}
      {fillRatio === 0 && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={1.5} />
      )}
    </svg>
  );
}
