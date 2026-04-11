import React, { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatCurrency } from "./formatters";

/**
 * Budget Forecast Chart (S-Curve)
 * Earned Value Management visualization
 */
export default function BudgetForecastChart({ costCodes = [], projectStartDate, projectEndDate }) {
  const data = useMemo(() => {
    if (costCodes.length === 0) return [];

    const totalBudget = costCodes.reduce((sum, cc) => sum + (cc.budget_amount || 0), 0);
    const totalActual = costCodes.reduce((sum, cc) => sum + (cc.actual_cost || 0), 0);
    const totalCommitted = costCodes.reduce((sum, cc) => sum + (cc.committed_cost || 0), 0);
    const totalForecast = costCodes.reduce((sum, cc) => sum + (cc.forecast_to_complete || 0), 0);

    // Generate monthly data points
    const start = new Date(projectStartDate);
    const end = new Date(projectEndDate);
    const monthCount = Math.ceil((end - start) / (1000 * 60 * 60 * 24 * 30));

    const chartData = [];
    for (let i = 0; i <= monthCount; i++) {
      const month = new Date(start);
      month.setMonth(month.getMonth() + i);
      const monthStr = month.toLocaleDateString("en-US", { month: "short", year: "2-digit" });

      // S-curve projection (modeled baseline — not sourced from time-phased actuals)
      const progress = i / monthCount;
      const sCurve = progress < 0.5 ? 0.5 * Math.pow(progress * 2, 1.5) : 1 - 0.5 * Math.pow(2 - progress * 2, 1.5);

      chartData.push({
        month: monthStr,
        PV: totalBudget * sCurve, // Planned Value (modeled)
        EV: (totalActual + totalCommitted) * sCurve, // Earned Value (modeled)
        AC: totalActual * (i / monthCount), // Actual Cost (modeled)
        EAC: totalBudget + totalForecast, // Estimate at Completion
      });
    }

    return chartData;
  }, [costCodes, projectStartDate, projectEndDate]);

  if (data.length === 0) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
        No cost data available
      </div>
    );
  }

  // Calculate metrics
  const lastData = data[data.length - 1] || {};
  const CPI = lastData.AC > 0 ? (lastData.EV / lastData.AC).toFixed(2) : 0;
  const SPI = lastData.PV > 0 ? (lastData.EV / lastData.PV).toFixed(2) : 0;

  const getCPIColor = (cpi) => {
    if (cpi > 1) return "var(--status-success)";
    if (cpi >= 0.9) return "var(--status-warning)";
    return "var(--status-error)";
  };

  const getSPIColor = (spi) => {
    if (spi > 1) return "var(--status-success)";
    if (spi >= 0.9) return "var(--status-warning)";
    return "var(--status-error)";
  };

  return (
    <div>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorPV" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.2} />
              <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorEV" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--status-success)" stopOpacity={0.2} />
              <stop offset="95%" stopColor="var(--status-success)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorAC" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--status-error)" stopOpacity={0.2} />
              <stop offset="95%" stopColor="var(--status-error)" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" />
          <XAxis
            dataKey="month"
            stroke="var(--text-muted)"
            style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
          />
          <YAxis
            stroke="var(--text-muted)"
            style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          />

          <Tooltip
            contentStyle={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              borderRadius: 8,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--text-primary)",
            }}
            formatter={(value) => formatCurrency(value)}
            labelStyle={{ color: "var(--text-primary)" }}
          />

          <Legend
            wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}
            iconType="line"
          />

          <Area
            type="monotone"
            dataKey="PV"
            stroke="var(--accent)"
            fillOpacity={1}
            fill="url(#colorPV)"
            strokeWidth={2}
            name="Planned Value (PV)"
          />
          <Area
            type="monotone"
            dataKey="EV"
            stroke="var(--status-success)"
            fillOpacity={1}
            fill="url(#colorEV)"
            strokeWidth={2}
            name="Earned Value (EV)"
          />
          <Area
            type="monotone"
            dataKey="AC"
            stroke="var(--status-error)"
            fillOpacity={1}
            fill="url(#colorAC)"
            strokeWidth={2}
            name="Actual Cost (AC)"
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Key Metrics */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 12,
          marginTop: 16,
        }}
      >
        <div
          style={{
            background: "var(--bg-surface)",
            border: `1px solid ${getCPIColor(CPI)}`,
            borderRadius: 10,
            padding: 12,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-muted)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            Cost Performance Index (CPI)
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 20,
                fontWeight: 700,
                color: getCPIColor(CPI),
              }}
            >
              {CPI}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
             EV ÷ AC
            </span>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: getCPIColor(CPI), marginTop: 4 }}>
            {CPI > 1 ? "✓ Under budget" : CPI >= 0.9 ? "⚠ Watch" : "✗ Over budget"}
            </div>
            </div>

            <div
            style={{
            background: "var(--bg-surface)",
            border: `1px solid ${getSPIColor(SPI)}`,
            borderRadius: 10,
            padding: 12,
            }}
            >
            <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-muted)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
            >
            Schedule Performance Index (SPI)
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 20,
                fontWeight: 700,
                color: getSPIColor(SPI),
              }}
            >
              {SPI}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
             EV ÷ PV
            </span>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: getSPIColor(SPI), marginTop: 4 }}>
            {SPI > 1 ? "✓ Ahead of schedule" : SPI >= 0.9 ? "⚠ Watch" : "✗ Behind schedule"}
            </div>
            </div>
      </div>
    </div>
  );
}