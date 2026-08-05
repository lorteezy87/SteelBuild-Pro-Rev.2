/**
 * RAG (Red/Amber/Green) — single-page traffic-light grid of every project.
 *
 * Tighter than Projects Health: one card per project, color-banded by
 * health_status. Sorted by RAG severity (Red → Amber → Green → Unknown)
 * then alphabetically. Designed for an executive at-a-glance view.
 */

import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { entities } from "@/api/supabaseClient";
import { createPageUrl } from "@/utils";
import { PHASES, PHASE_COLORS } from "@/utils/phases";
import ReportShell from "./ReportShell";
import { formatDate, formatCurrencyFull } from "./utils";
import { mono, body, CARD, PROJECT_HEALTH_COLORS } from "./constants";

import {
  RAG_LABEL,
  buildRagCards,
  countRagBuckets,
} from "./ragHelpers";

const SUPPORTED_PHASES = new Set(PHASES);

export default function RAG() {
  const navigate = useNavigate();
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
  });

  const cards = useMemo(() => buildRagCards(projects), [projects]);
  const counts = useMemo(() => countRagBuckets(cards), [cards]);

  return (
    <ReportShell
      title="RAG Status"
      count={cards.length}
      unit=" · PROJECTS"
      subtitle={`${counts["At Risk"]} red · ${counts["Watch"]} amber · ${counts["On Track"]} green · ${counts["On Hold"]} hold · ${counts["Unknown"]} unset`}
    >
      {cards.length === 0 ? (
        <div style={{ ...CARD, padding: 48, textAlign: "center", ...mono, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          No projects yet.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {cards.map((p) => {
            const color = PROJECT_HEALTH_COLORS[p.bucket] || "var(--text-muted)";
            const phaseColor = SUPPORTED_PHASES.has(p.phase) ? PHASE_COLORS[p.phase] : "var(--text-muted)";
            return (
              <button
                key={p.id}
                onClick={() => navigate(createPageUrl("Projects") + `?id=${p.id}`)}
                style={{
                  ...CARD,
                  textAlign: "left",
                  cursor: "pointer",
                  padding: 0,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  borderTop: `3px solid ${color}`,
                  transition: "transform 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
              >
                <div style={{ padding: "12px 14px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ ...mono, fontSize: 9, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.14em" }}>
                      {RAG_LABEL[p.bucket]}
                    </span>
                    <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>{p.number}</span>
                  </div>
                  <div style={{ ...body, fontSize: 13, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name}
                  </div>
                  {p.client && (
                    <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.client}
                    </div>
                  )}
                </div>
                <div style={{ borderTop: "1px solid var(--divider)", padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, ...mono, fontSize: 9, color: "var(--text-secondary)" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: phaseColor }} />
                    {p.phase || "—"}
                  </span>
                  <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>
                    {p.targetDate ? formatDate(p.targetDate) : ""}
                  </span>
                </div>
                <div style={{ borderTop: "1px solid var(--divider)", padding: "6px 14px", ...mono, fontSize: 10, color: "var(--text-primary)", textAlign: "right" }}>
                  {formatCurrencyFull(p.contractValue)}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </ReportShell>
  );
}
