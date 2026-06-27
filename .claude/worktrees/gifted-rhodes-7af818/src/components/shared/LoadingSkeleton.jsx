import React from "react";

/* ── Inject shimmer keyframe once ──────────────────────────────────── */
let _shimmerInjected = false;
function ensureShimmer() {
  if (_shimmerInjected) return;
  _shimmerInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    @keyframes skeleton-shimmer {
      0%   { background-position: -400px 0; }
      100% { background-position: 400px 0;  }
    }
  `;
  document.head.appendChild(style);
}

const shimmerStyle = {
  background:
    "linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-surface-high) 50%, var(--bg-surface) 75%)",
  backgroundSize: "800px 100%",
  animation: "skeleton-shimmer 1.6s ease-in-out infinite",
  borderRadius: 8,
};

/* ── Variant: KPI strip ────────────────────────────────────────────── */
function KPISkeleton({ count = 4 }) {
  ensureShimmer();
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            ...shimmerStyle,
            flex: "1 1 140px",
            height: 72,
            border: "1px solid var(--border-default)",
          }}
        />
      ))}
    </div>
  );
}

/* ── Variant: Card ─────────────────────────────────────────────────── */
function CardSkeleton() {
  ensureShimmer();
  return (
    <div
      style={{
        ...shimmerStyle,
        height: 120,
        border: "1px solid var(--border-default)",
      }}
    />
  );
}

/* ── Variant: Table ────────────────────────────────────────────────── */
function TableSkeleton({ rows = 5 }) {
  ensureShimmer();
  return (
    <div
      style={{
        border: "1px solid var(--border-default)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {/* Header row */}
      <div
        style={{
          ...shimmerStyle,
          borderRadius: 0,
          height: 36,
          borderBottom: "1px solid var(--border-default)",
        }}
      />
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            ...shimmerStyle,
            borderRadius: 0,
            height: 40,
            borderBottom:
              i < rows - 1 ? "1px solid var(--border-default)" : "none",
            opacity: 1 - i * 0.08,
          }}
        />
      ))}
    </div>
  );
}

/* ── Variant: Full page ────────────────────────────────────────────── */
function PageSkeleton() {
  ensureShimmer();
  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Title bar placeholder */}
      <div
        style={{
          ...shimmerStyle,
          width: 220,
          height: 24,
        }}
      />
      {/* KPI strip */}
      <KPISkeleton count={4} />
      {/* Two card placeholders */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}

/* ── Main export ───────────────────────────────────────────────────── */
export default function LoadingSkeleton({ variant = "page", rows, count }) {
  switch (variant) {
    case "kpi":
      return <KPISkeleton count={count} />;
    case "card":
      return <CardSkeleton />;
    case "table":
      return <TableSkeleton rows={rows} />;
    case "page":
    default:
      return <PageSkeleton />;
  }
}
