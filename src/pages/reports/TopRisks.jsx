/**
 * Top Risks — top 10 risks by score (probability × impact, descending),
 * rendered as cards instead of a table. Designed for the "what's
 * keeping the PM up at night" weekly review.
 *
 * Each card carries a severity ribbon at the top, the title, the
 * score (top-right), category / owner / target close, and an excerpt
 * of the mitigation plan. "View / Edit" opens the shared modal.
 */

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ReportShell from "./ReportShell";
import { FilterBar, SelectFilter } from "./ReportFilters";
import { CARD, mono } from "./constants";
import { formatDate } from "./utils";
import {
  computeScore,
  severityColor,
  isActiveRisk,
} from "./risks/severity";
import RiskFormModal from "@/components/risks/RiskFormModal";

const MITIGATION_EXCERPT_LEN = 200;

function excerpt(text, maxLen) {
  if (!text) return null;
  const trimmed = String(text).trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
}

function RiskCard({ risk, onEdit, projectLabel }) {
  const color = severityColor(risk.severity);
  const score = risk.score;
  const mitigationText = excerpt(risk.mitigation_plan, MITIGATION_EXCERPT_LEN);
  return (
    <div
      style={{
        ...CARD,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Severity ribbon */}
      <div
        style={{
          background: color,
          color: "var(--bg-base)",
          padding: "6px 14px",
          ...mono,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>{risk.severity || "—"}</span>
        <span style={{ opacity: 0.85 }}>{risk.status}</span>
      </div>

      <div
        style={{
          padding: "14px 18px 4px 18px",
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 16,
              fontWeight: 700,
              color: "var(--text-primary)",
              lineHeight: 1.25,
            }}
          >
            {risk.title}
          </div>
          {projectLabel && (
            <div
              style={{
                ...mono,
                fontSize: 9,
                color: "var(--text-muted)",
                marginTop: 4,
              }}
            >
              {projectLabel}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div
            style={{
              ...mono,
              fontSize: 8,
              color: "var(--text-muted)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Score
          </div>
          <div
            style={{
              ...mono,
              fontSize: 28,
              fontWeight: 700,
              color: "var(--text-primary)",
              lineHeight: 1,
            }}
          >
            {score}
          </div>
          <div
            style={{
              ...mono,
              fontSize: 9,
              color: "var(--text-muted)",
              marginTop: 4,
            }}
          >
            P{risk.probability} × I{risk.impact}
          </div>
        </div>
      </div>

      <div
        style={{
          padding: "8px 18px 0 18px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 10,
        }}
      >
        <Meta label="Category" value={risk.category || "—"} />
        <Meta label="Owner" value={risk.owner || "—"} />
        <Meta label="Target Close" value={formatDate(risk.target_close_date)} />
      </div>

      {mitigationText && (
        <div
          style={{
            padding: "12px 18px 0 18px",
            fontFamily: "var(--font-body)",
            fontSize: 12,
            color: "var(--text-secondary)",
            lineHeight: 1.5,
          }}
        >
          <div
            style={{
              ...mono,
              fontSize: 8,
              color: "var(--text-muted)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            Mitigation
          </div>
          {mitigationText}
        </div>
      )}

      <div
        style={{
          padding: "12px 18px 14px 18px",
          marginTop: "auto",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <button
          type="button"
          onClick={onEdit}
          style={{
            ...mono,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--accent)",
            background: "transparent",
            border: "1px solid var(--accent-border)",
            borderRadius: "var(--radius-btn)",
            padding: "6px 12px",
            cursor: "pointer",
          }}
        >
          View / Edit
        </button>
      </div>
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div>
      <div
        style={{
          ...mono,
          fontSize: 8,
          color: "var(--text-muted)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          ...mono,
          fontSize: 11,
          color: "var(--text-secondary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function TopRisks() {
  const [projectFilter, setProjectFilter] = useState("all");
  const [activeOnly, setActiveOnly] = useState("active");
  const [editingRow, setEditingRow] = useState(null);

  const { data: risks = [] } = useQuery({
    queryKey: ["risks"],
    queryFn: () => base44.entities.Risk.list(),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
  });
  const projectById = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p])),
    [projects]
  );

  const top = useMemo(() => {
    let list = risks;
    if (projectFilter !== "all") list = list.filter((r) => r.project_id === projectFilter);
    if (activeOnly === "active") list = list.filter(isActiveRisk);
    return list
      .map((r) => ({ ...r, score: computeScore(r.probability, r.impact) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [risks, projectFilter, activeOnly]);

  return (
    <ReportShell
      title="Top Risks"
      count={top.length}
      unit=" · OF 10"
      subtitle="The highest-scoring risks on the books, ranked by probability × impact."
      filters={
        <FilterBar>
          <SelectFilter
            label="Project"
            value={projectFilter}
            onChange={setProjectFilter}
            options={[
              { key: "all", label: "All projects" },
              ...projects.map((p) => ({
                key: p.id,
                label: p.project_number
                  ? `${p.project_number} — ${p.name}`
                  : p.name || "Untitled",
              })),
            ]}
          />
          <SelectFilter
            label="Scope"
            value={activeOnly}
            onChange={setActiveOnly}
            options={[
              { key: "active", label: "Active only" },
              { key: "all", label: "Include closed" },
            ]}
          />
        </FilterBar>
      }
    >
      {top.length === 0 ? (
        <div
          style={{
            ...CARD,
            padding: "48px 0",
            textAlign: "center",
            ...mono,
            fontSize: 10,
            color: "var(--text-muted)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          No risks match the current filters
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
            gap: 14,
          }}
        >
          {top.map((r) => {
            const p = projectById[r.project_id];
            const projectLabel = p
              ? `${p.project_number ? p.project_number + " — " : ""}${p.name}`
              : null;
            return (
              <RiskCard
                key={r.id}
                risk={r}
                projectLabel={projectLabel}
                onEdit={() => setEditingRow(r)}
              />
            );
          })}
        </div>
      )}

      <RiskFormModal
        open={Boolean(editingRow)}
        onClose={() => setEditingRow(null)}
        initial={editingRow}
        projectId={editingRow?.project_id}
      />
    </ReportShell>
  );
}
