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
import { entities } from "@/api/supabaseClient";
import { createPageUrl } from "@/utils";
import { PHASES, PHASE_COLORS } from "@/utils/phases";
import ReportShell from "./ReportShell";
import { formatDate, formatCurrencyFull } from "./utils";
import { mono, body, CARD, SUPPORTED_PHASES } from "./constants";
import {
  bucketProjectsByHealth,
  projectsHealthSubtitle,
  HEALTH_BUCKETS as BUCKETS,
} from "./projectsHealthHelpers";

function ProjectCard({ p, onClick }) {
  const phaseColor = SUPPORTED_PHASES.has(p.phase) ? PHASE_COLORS[p.phase] : "var(--text-muted)";
  return (
    <button
      onClick={onClick}
      className="sbd-card sbd-card-hover"
      style={{
        ...CARD,
        textAlign: "left",
        cursor: "pointer",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
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
    queryFn: () => entities.Project.list(),
  });

  const buckets = useMemo(() => bucketProjectsByHealth(projects), [projects]);
  const subtitle = projectsHealthSubtitle(buckets);

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
