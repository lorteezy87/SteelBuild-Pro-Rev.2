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
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { PHASES, PHASE_COLORS } from "@/utils/phases";
import ReportShell from "./ReportShell";
import { formatDate, formatCurrencyFull } from "./utils";
import { mono, body, CARD, PROJECT_HEALTH_COLORS } from "./constants";

const SUPPORTED_PHASES = new Set(PHASES);

const RAG_RANK = { "At Risk": 0, "Watch": 1, "On Track": 2, "On Hold": 3, "Unknown": 4 };
const RAG_LABEL = {
  "At Risk": "RED",
  "Watch": "AMBER",
  "On Track": "GREEN",
  "On Hold": "HOLD",
  "Unknown": "—",
};

function ragBucket(status) {
  if (status === "On Track" || status === "Watch" || status === "At Risk" || status === "On Hold") return status;
  return "Unknown";
}

export default function RAG() {
  const navigate = useNavigate();
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
  });

  const cards = useMemo(() => {
    return projects
      .map((p) => ({
        id: p.id,
        name: p.name || "Untitled Project",
        number: p.project_number || `P-${p.id}`,
        client: p.general_contractor || p.client || "",
        phase: p.phase || "",
        bucket: ragBucket(p.health_status),
        targetDate: p.target_completion_date,
        contractValue: Number(p.original_contract_value) || 0,
      }))
      .sort((a, b) => {
        const ra = RAG_RANK[a.bucket] ?? 99;
        const rb = RAG_RANK[b.bucket] ?? 99;
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name);
      });
  }, [projects]);

  const counts = useMemo(() => {
    const c = { "At Risk": 0, "Watch": 0, "On Track": 0, "On Hold": 0, "Unknown": 0 };
    cards.forEach((c2) => { c[c2.bucket] = (c[c2.bucket] || 0) + 1; });
    return c;
  }, [cards]);

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
