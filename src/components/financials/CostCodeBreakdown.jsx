import React from "react";

export default function CostCodeBreakdown({ costCodes }) {
  if (costCodes.length === 0) {
    return (
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "12px",
          padding: "40px",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          No cost codes
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--divider)",
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr",
          gap: "12px",
          background: "var(--bg-surface-secondary)",
        }}
      >
        {["Code", "Budget", "Actual", "Committed", "Variance"].map((col) => (
          <div
            key={col}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              fontWeight: 700,
              color: "var(--text-muted)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {col}
          </div>
        ))}
      </div>

      {/* Rows */}
      {costCodes.map((cc) => {
        // Use enriched fields (revised_budget, exposure/committed_cost) when available,
        // fall back to raw budget_amount vs actual_cost for non-enriched data.
        const budget = Number(cc.revised_budget ?? cc.budget_amount) || 0;
        const spend = Number(cc.exposure ?? cc.committed_cost ?? cc.actual_cost) || 0;
        const variance = budget - spend;
        const isOverBudget = variance < 0;

        return (
          <div
            key={cc.id}
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--divider)",
              display: "grid",
              gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr",
              gap: "12px",
              alignItems: "center",
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--hover-bg)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            {/* Code */}
            <div>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                {cc.cost_code_number}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  color: "var(--text-muted)",
                  marginTop: "2px",
                }}
              >
                {cc.description}
              </div>
            </div>

            {/* Budget */}
            <div
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--text-secondary)",
              }}
            >
              ${(budget / 1000).toFixed(0)}K
            </div>

            {/* Actual */}
            <div
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--accent)",
              }}
            >
              ${((Number(cc.actual_cost) || 0) / 1000).toFixed(0)}K
            </div>

            {/* Committed */}
            <div
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--status-warning)",
              }}
            >
              ${(spend / 1000).toFixed(0)}K
            </div>

            {/* Variance */}
            <div
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: isOverBudget ? "var(--status-error)" : "var(--status-success)",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {isOverBudget ? "−" : "+"}${Math.abs(variance / 1000).toFixed(0)}K
              {isOverBudget && <span style={{ fontSize: "10px" }}>⚠</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}