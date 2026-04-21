/**
 * RichEmptyState — first-run screen shown when the user has zero
 * projects. Illustrated icon, explainer copy, two CTAs (create
 * project / import data), and a ghost skeleton preview of what the
 * real dashboard will look like once they have data.
 *
 * Takes `navigate` from `react-router-dom` so it can route without
 * pulling the hook into this component — keeps it a pure prop.
 */

import React from "react";
import { createPageUrl } from "@/utils";
import { mono, body, CARD } from "./constants";
import { SkeletonBar, SkeletonKPICard, SkeletonTableRow } from "./skeletons";

export default function RichEmptyState({ navigate }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, padding: "60px 20px" }}>
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

      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}
