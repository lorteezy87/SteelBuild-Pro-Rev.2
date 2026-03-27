import React from "react";

export default function ProjectBudgetCard({ project, summary }) {
  if (!project) {
    return (
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "12px",
          padding: "20px",
          textAlign: "center",
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
        }}
      >
        Select a project to view budget
      </div>
    );
  }

  const budgetHealth =
    summary.budget > 0
      ? ((summary.variance / summary.budget) * 100).toFixed(1)
      : 0;

  const isOverBudget = summary.variance < 0;
  const percentUsed = summary.budget > 0 ? ((summary.actual / summary.budget) * 100).toFixed(0) : 0;

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "12px",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
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
        {project.name}
      </h3>

      {/* Health Bar */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "6px",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "var(--text-muted)",
              letterSpacing: "0.08em",
            }}
          >
            Budget Used
          </span>
          <span
            style={{
              fontSize: "14px",
              fontWeight: 700,
              color: isOverBudget ? "var(--status-error)" : "var(--status-success)",
            }}
          >
            {percentUsed}%
          </span>
        </div>
        <div
          style={{
            height: "8px",
            background: "var(--border-default)",
            borderRadius: "4px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              background: isOverBudget ? "var(--status-error)" : "var(--accent)",
              width: `${Math.min(100, percentUsed)}%`,
              transition: "width 0.3s",
            }}
          />
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "var(--text-muted)",
              letterSpacing: "0.08em",
            }}
          >
            Contract Value
          </span>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
            ${(project.revised_contract_value / 1000).toFixed(0)}K
          </span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "var(--text-muted)",
              letterSpacing: "0.08em",
            }}
          >
            Total Cost
          </span>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--accent)" }}>
            ${(summary.actual / 1000).toFixed(0)}K
          </span>
        </div>

        <div
          style={{
            borderTop: "1px solid var(--divider)",
            paddingTop: "8px",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "var(--text-muted)",
              letterSpacing: "0.08em",
              fontWeight: 700,
            }}
          >
            Variance
          </span>
          <span
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: isOverBudget ? "var(--status-error)" : "var(--status-success)",
            }}
          >
            {isOverBudget ? "−" : "+"}${Math.abs(summary.variance / 1000).toFixed(0)}K
          </span>
        </div>
      </div>
    </div>
  );
}