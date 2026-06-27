import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const SERIES = [
  {
    key: "Budget",
    color: "var(--accent)",
    softColor: "rgba(173,198,255,0.22)",
    textColor: "var(--accent-light)",
  },
  {
    key: "Actual",
    color: "var(--status-warning)",
    softColor: "rgba(245,158,11,0.22)",
    textColor: "var(--status-warning)",
  },
  {
    key: "Forecast",
    color: "var(--status-success)",
    softColor: "rgba(74,225,118,0.18)",
    textColor: "var(--status-success)",
  },
];

function formatK(value) {
  return `$${Math.round(Number(value) || 0)}K`;
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        borderRadius: 8,
        padding: "10px 12px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          color: "var(--text-muted)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        Budget Performance
      </div>
      {payload.map((entry) => (
        <div
          key={entry.dataKey}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            marginTop: 4,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: entry.color,
                display: "inline-block",
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 11,
                color: "var(--text-secondary)",
              }}
            >
              {entry.dataKey}
            </span>
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-primary)",
            }}
          >
            {formatK(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function BudgetOverviewChart({ summary }) {
  const budget = Number(summary?.budget) || 0;
  const actual = Number(summary?.actual) || 0;
  const forecast = Number(summary?.forecast) || 0;
  // Positive variance = under budget (favorable), negative = over budget
  const variance = budget - actual;
  const burnPct = budget > 0 ? Math.round((actual / budget) * 100) : 0;

  const data = [
    {
      name: "Current",
      Budget: Math.round(budget / 1000),
      Actual: Math.round(actual / 1000),
      Forecast: Math.round(forecast / 1000),
    },
  ];

  const donutData = [
    { name: "Spent", value: actual, color: "var(--accent)" },
    {
      name: "Remaining",
      value: Math.max(0, budget - actual),
      color: "var(--bg-surface-highest)",
    },
  ];

  return (
    <div
      style={{
        background: "linear-gradient(180deg, rgba(173,198,255,0.03) 0%, rgba(19,19,20,0) 100%), var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "12px",
        padding: "18px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 20,
          marginBottom: 18,
        }}
      >
        <div>
          <h3
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "0.10em",
            }}
          >
            Budget Performance
          </h3>
          <div
            style={{
              marginTop: 6,
              fontFamily: "var(--font-body)",
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            Budget, actual spend, and forecast aligned to the current project.
          </div>
        </div>

        <div style={{ position: "relative", width: 120, height: 120, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={donutData}
                cx="50%"
                cy="50%"
                innerRadius={38}
                outerRadius={52}
                dataKey="value"
                stroke="none"
                startAngle={90}
                endAngle={-270}
              >
                {donutData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 18,
                fontWeight: 700,
                color: "var(--text-primary)",
                lineHeight: 1,
              }}
            >
              {burnPct}%
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.10em",
                marginTop: 3,
              }}
            >
              Burned
            </span>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.7fr) minmax(220px, 0.9fr)",
          gap: 18,
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            background: "var(--hover-bg)",
            border: "1px solid var(--divider)",
            borderRadius: 10,
            padding: "14px 14px 8px",
          }}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={data}
              barCategoryGap={48}
              margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
            >
              <CartesianGrid vertical={false} stroke="var(--divider)" />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{
                  fill: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={56}
                tickFormatter={(value) => `$${value}K`}
                tick={{
                  fill: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                }}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--hover-bg)" }} />
              {SERIES.map((series) => (
                <Bar
                  key={series.key}
                  dataKey={series.key}
                  fill={series.color}
                  radius={[6, 6, 0, 0]}
                  barSize={34}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div
          style={{
            background: "var(--hover-bg)",
            border: "1px solid var(--divider)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.1fr 0.9fr",
              gap: 12,
              padding: "12px 14px",
              borderBottom: "1px solid var(--divider)",
              background: "var(--bg-surface-low)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 700,
                color: "var(--text-muted)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Metric
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 700,
                color: "var(--text-muted)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                textAlign: "right",
              }}
            >
              Value
            </div>
          </div>

          {[
            { label: "Budget", value: budget, ...SERIES[0] },
            { label: "Actual", value: actual, ...SERIES[1] },
            { label: "Forecast", value: forecast, ...SERIES[2] },
            {
              label: variance >= 0 ? "Variance" : "Overrun",
              value: Math.abs(variance),
              color: variance >= 0 ? "var(--status-success)" : "var(--status-error)",
              softColor: variance >= 0 ? "rgba(74,225,118,0.16)" : "rgba(255,180,171,0.16)",
              textColor: variance >= 0 ? "var(--status-success)" : "var(--status-error)",
            },
          ].map((row, index) => (
            <div
              key={row.label}
              style={{
                display: "grid",
                gridTemplateColumns: "1.1fr 0.9fr",
                gap: 12,
                alignItems: "center",
                padding: "12px 14px",
                borderBottom: index === 3 ? "none" : "1px solid var(--divider)",
                background: index % 2 === 0 ? "transparent" : "var(--hover-bg)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: row.color,
                    boxShadow: `0 0 0 4px ${row.softColor}`,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 12,
                    color: "var(--text-secondary)",
                  }}
                >
                  {row.label}
                </span>
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  fontWeight: 700,
                  color: row.textColor,
                  textAlign: "right",
                }}
              >
                {`$${Math.round(row.value).toLocaleString()}`}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
