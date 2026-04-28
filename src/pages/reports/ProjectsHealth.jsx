/**
 * Projects Health — projects bucketed by `health_status` traffic-light.
 *
 * Three columns side-by-side: On Track (Green), Watch (Yellow), At Risk
 * (Red). On Hold/Unset projects fall into a fourth column. Each card
 * shows project name, number, phase, target date.
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

const BUCKETS = [
  { key: "On Track", label: "On Track", color: "var(--status-success)" },
  { key: "Watch", label: "Watch", color: "var(--status-warning)" },
  { key: "At Risk", label: "At Risk", color: "var(--status-error)" },
  { key: "Unknown", label: "On Hold / Unknown", color: "var(--text-muted)" },
];

function ProjectCard({ p, onClick }) {
  const phaseColor = SUPPORTED_PHASES.has(p.phase) ? PHASE_COLORS[p.phase] : "var(--text-muted)";
  return (
    <button
      onClick={onClick}
      style={{
        ...CARD,
        textAlign: "left",
        cursor: "pointer",
        padding: "12px 14px",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-row-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-surface)")}
    >
      <div style={{ ...body, fontSize: 13, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {p.name}
      </div>
      <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
        {p.number}{p.client ? ` · ${p.client}` : ""}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, ...mono, fontSize: 9, color: "var(--text-secondary)" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: phaseColor }} />
          {p.phase || "—"}
        </span>
        <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>
          {p.targetDate ? `→ ${formatDate(p.targetDate)}` : ""}
        </span>
      </div>
      <div style={{ ...mono, fontSize: 10, color: "var(--text-primary)", marginTop: 2 }}>
        {formatCurrencyFull(p.contractValue)}
      </div>
    </button>
  );
}

export default function ProjectsHealth() {
  const navigate = useNavigate();
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
  });

  const buckets = useMemo(() => {
    const out = { "On Track": [], "Watch": [], "At Risk": [], "Unknown": [] };
    for (const p of projects) {
      const row = {
        id: p.id,
        name: p.name || "Untitled Project",
        number: p.project_number || `P-${p.id}`,
        client: p.general_contractor || p.client || "",
        phase: p.phase || "",
        targetDate: p.target_completion_date,
        contractValue: Number(p.original_contract_value) || 0,
      };
      const h = p.health_status;
      if (h === "On Track" || h === "Watch" || h === "At Risk") out[h].push(row);
      else out["Unknown"].push(row);
    }
    Object.values(out).forEach((arr) => arr.sort((a, b) => a.name.localeCompare(b.name)));
    return out;
  }, [projects]);

  const subtitle = `${buckets["On Track"].length} on track · ${buckets["Watch"].length} watch · ${buckets["At Risk"].length} at risk · ${buckets["Unknown"].length} on hold/unset`;

  return (
    <ReportShell
      title="Projects Health"
      count={projects.length}
      unit=" · PROJECTS"
      subtitle={subtitle}
    >
      {projects.length === 0 ? (
        <div style={{ ...CARD, padding: 48, textAlign: "center", ...mono, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          No projects to bucket yet.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
          {BUCKETS.map((b) => {
            const items = buckets[b.key] || [];
            return (
              <div key={b.key} style={{ ...CARD, padding: 0, borderTop: `2px solid ${b.color}`, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid var(--divider)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: b.color }} />
                    <span style={{ ...mono, fontSize: 10, fontWeight: 700, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      {b.label}
                    </span>
                  </div>
                  <span style={{ ...mono, fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{items.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, paddingTop: 0 }}>
                  {items.length === 0 ? (
                    <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "16px 0", textAlign: "center" }}>
                      No projects
                    </div>
                  ) : (
                    items.map((p) => (
                      <ProjectCard
                        key={p.id}
                        p={p}
                        onClick={() => navigate(createPageUrl("Projects") + `?id=${p.id}`)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ReportShell>
  );
}
