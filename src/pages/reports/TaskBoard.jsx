/**
 * Task Board — kanban view, four columns: Not Started / In Progress /
 * Complete / Delayed.
 *
 * Drag-drop is intentionally out of scope for V1; click-to-open routes
 * to the project page where the existing schedule drawer handles edits.
 */

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { entities } from "@/api/supabaseClient";
import { createPageUrl } from "@/utils";
import { PHASES, PHASE_COLORS } from "@/utils/phases";
import ReportShell from "./ReportShell";
import { FilterBar, SearchInput, SelectFilter } from "./ReportFilters";
import { formatDate } from "./utils";
import { mono, body, CARD } from "./constants";

const SUPPORTED_PHASES = new Set(PHASES);

const COLUMNS = [
  { key: "Not Started", label: "Not Started", color: "var(--text-muted)" },
  { key: "In Progress", label: "In Progress", color: "var(--accent)" },
  { key: "Complete", label: "Complete", color: "var(--status-success)" },
  { key: "Delayed", label: "Delayed", color: "var(--status-error)" },
];

function TaskCard({ t, onClick }) {
  const phaseColor = SUPPORTED_PHASES.has(t.phase) ? PHASE_COLORS[t.phase] : "var(--text-muted)";
  return (
    <button
      onClick={onClick}
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: 6,
        padding: "10px 12px",
        textAlign: "left",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-row-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-surface)")}
    >
      <div style={{ ...body, fontSize: 12, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
        {t.taskName}
      </div>
      <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {t.projectNumber ? `${t.projectNumber} · ` : ""}{t.projectName}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, ...mono, fontSize: 9, color: "var(--text-secondary)" }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: phaseColor }} />
          {t.phase || "—"}
        </span>
        <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>{formatDate(t.endDate)}</span>
      </div>
    </button>
  );
}

export default function TaskBoard() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["schedule-tasks-all"],
    queryFn: () => entities.ScheduleTask.list(),
  });

  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const allRows = useMemo(() => {
    return tasks.map((t) => {
      const proj = projectsById.get(t.project_id);
      return {
        id: t.id,
        taskName: t.task_name || "Untitled",
        projectId: t.project_id,
        projectName: proj?.name || "—",
        projectNumber: proj?.project_number || "",
        phase: t.phase || "",
        status: t.status || "Not Started",
        endDate: t.end_date,
      };
    });
  }, [tasks, projectsById]);

  const filtered = useMemo(() => {
    let out = allRows;
    if (projectFilter !== "all") out = out.filter((r) => r.projectId === projectFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((r) =>
        r.taskName.toLowerCase().includes(q) ||
        r.projectName.toLowerCase().includes(q)
      );
    }
    return out;
  }, [allRows, search, projectFilter]);

  const columns = useMemo(() => {
    const grouped = { "Not Started": [], "In Progress": [], "Complete": [], "Delayed": [] };
    filtered.forEach((r) => {
      if (grouped[r.status]) grouped[r.status].push(r);
    });
    Object.values(grouped).forEach((arr) => {
      arr.sort((a, b) => {
        const da = a.endDate ? new Date(a.endDate).getTime() : Infinity;
        const db = b.endDate ? new Date(b.endDate).getTime() : Infinity;
        return da - db;
      });
    });
    return grouped;
  }, [filtered]);

  return (
    <ReportShell
      title="Task Board"
      count={filtered.length}
      unit=" · TASKS"
      subtitle="Kanban view of every schedule task. Click a card to drill into its project."
      filters={
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search tasks..." />
          <SelectFilter
            label="Project"
            value={projectFilter}
            onChange={setProjectFilter}
            options={[
              { key: "all", label: "All projects" },
              ...projects.map((p) => ({ key: p.id, label: p.project_number ? `${p.project_number} — ${p.name}` : p.name })),
            ]}
          />
        </FilterBar>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        {COLUMNS.map((col) => {
          const items = columns[col.key] || [];
          return (
            <div key={col.key} style={{ ...CARD, padding: 0, borderTop: `2px solid ${col.color}`, display: "flex", flexDirection: "column", gap: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--divider)" }}>
                <span style={{ ...mono, fontSize: 10, fontWeight: 700, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{col.label}</span>
                <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: col.color }}>{items.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, maxHeight: 600, overflowY: "auto" }}>
                {items.length === 0 ? (
                  <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", textAlign: "center", padding: "16px 0", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    No tasks
                  </div>
                ) : (
                  items.map((t) => (
                    <TaskCard key={t.id} t={t} onClick={() => navigate(createPageUrl("Projects") + `?id=${t.projectId}`)} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ReportShell>
  );
}
