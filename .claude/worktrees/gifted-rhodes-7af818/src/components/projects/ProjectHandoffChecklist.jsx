/**
 * ProjectHandoffChecklist
 *
 * The 36-item project-handoff checklist from the estimator → PM packet.
 * Items are pre-seeded in the DB by migration 045 (+ an AFTER INSERT trigger
 * on `projects`). This component just renders/edits them.
 *
 * Columns match the paper form: Description · Date Required · Status ·
 * Completed By · Date Completed.
 *
 * Updates are per-field with debounced auto-save. Status is a 4-way toggle
 * (Not Completed / In Progress / Completed / Not Applicable). When status
 * flips to "Completed" we auto-stamp `date_completed` to today if blank.
 */

import React, { useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const STATUS_ORDER = ["Not Completed", "In Progress", "Completed", "Not Applicable"];

const STATUS_STYLE = {
  "Not Completed":   { color: "var(--text-muted)",     bg: "var(--bg-surface-low)",   border: "var(--border-default)" },
  "In Progress":     { color: "var(--status-warning)", bg: "var(--warning-muted)",    border: "var(--warning-border)" },
  "Completed":       { color: "var(--status-success)", bg: "var(--success-muted)",    border: "var(--success-border)" },
  "Not Applicable":  { color: "var(--text-muted)",     bg: "var(--hover-bg)",         border: "var(--border-default)" },
};

const mono = { fontFamily: "var(--font-mono)" };

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function ProjectHandoffChecklist({ projectId }) {
  const qc = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["project-handoff-items", projectId],
    queryFn: () =>
      base44.entities.ProjectHandoffItem.filter(
        { project_id: projectId },
        "seq"
      ),
    enabled: !!projectId,
  });

  // Keep rows in the guaranteed order even if the API ever reorders.
  const rows = useMemo(
    () => [...items].sort((a, b) => (a.seq || 0) - (b.seq || 0)),
    [items]
  );

  const completedCount = rows.filter((r) => r.status === "Completed").length;
  const inProgressCount = rows.filter((r) => r.status === "In Progress").length;
  const naCount = rows.filter((r) => r.status === "Not Applicable").length;
  const total = rows.length;
  const effectiveTotal = total - naCount; // N/A rows don't count against progress
  const pct = effectiveTotal > 0 ? Math.round((completedCount / effectiveTotal) * 100) : 0;

  const updateMut = useMutation({
    mutationFn: ({ id, data }) =>
      base44.entities.ProjectHandoffItem.update(id, data),
    // Optimistic update so typing feels instant.
    onMutate: async ({ id, data }) => {
      const key = ["project-handoff-items", projectId];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData(key);
      qc.setQueryData(key, (old = []) =>
        old.map((r) => (r.id === id ? { ...r, ...data } : r))
      );
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(["project-handoff-items", projectId], ctx.prev);
      }
      toast.error(`Save failed: ${err.message || "unknown error"}`);
    },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ["project-handoff-items", projectId] }),
  });

  // Debounced save for text / date fields so we don't fire a request per keystroke.
  const debounceTimers = useRef({});
  const debouncedUpdate = (id, patch, delay = 400) => {
    const key = `${id}:${Object.keys(patch).join(",")}`;
    clearTimeout(debounceTimers.current[key]);
    debounceTimers.current[key] = setTimeout(() => {
      updateMut.mutate({ id, data: patch });
    }, delay);
  };

  // Optimistic local edit (no debounce reset) so the input reflects state.
  const patchLocal = (id, patch) => {
    qc.setQueryData(
      ["project-handoff-items", projectId],
      (old = []) => old.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  };

  const handleField = (id, field, value) => {
    patchLocal(id, { [field]: value });
    debouncedUpdate(id, { [field]: value });
  };

  const handleStatus = (row, nextStatus) => {
    const patch = { status: nextStatus };
    // Auto-stamp completion date the first time status moves to Completed.
    if (nextStatus === "Completed" && !row.date_completed) {
      patch.date_completed = todayISO();
    }
    // Clear completed_date when moving away from Completed? Keep it — users
    // may flip back and forth while reviewing.
    patchLocal(row.id, patch);
    updateMut.mutate({ id: row.id, data: patch });
  };

  if (!projectId) {
    return (
      <div style={{ ...mono, color: "var(--text-muted)", fontSize: 11 }}>
        Select a project.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ ...mono, color: "var(--text-muted)", fontSize: 11, padding: 12 }}>
        Loading checklist…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div style={{ ...mono, color: "var(--text-muted)", fontSize: 11, padding: 12 }}>
        No checklist items for this project yet. (They should seed automatically —
        contact an admin if this persists.)
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Progress header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 12px",
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)",
          borderRadius: 8,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
            Handoff Progress
          </div>
          <div
            style={{
              width: "100%",
              height: 8,
              background: "var(--bg-surface-low)",
              borderRadius: 999,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: "100%",
                background:
                  pct === 100
                    ? "var(--status-success)"
                    : pct >= 50
                    ? "var(--accent)"
                    : "var(--status-warning)",
                transition: "width 0.3s",
              }}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: 14, ...mono, fontSize: 10 }}>
          <Stat label="Complete"    value={completedCount} color="var(--status-success)" />
          <Stat label="In Progress" value={inProgressCount} color="var(--status-warning)" />
          <Stat label="N/A"         value={naCount} color="var(--text-muted)" />
          <Stat label="Pct"         value={`${pct}%`} color="var(--accent)" />
        </div>
      </div>

      {/* Header row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "40px minmax(220px, 2.2fr) 110px 150px 130px 110px",
          gap: 8,
          padding: "8px 10px",
          background: "var(--bg-surface-low)",
          borderBottom: "1px solid var(--divider)",
          ...mono,
          fontSize: 9,
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          position: "sticky",
          top: 0,
          zIndex: 2,
        }}
      >
        <div>#</div>
        <div>Description</div>
        <div>Date Required</div>
        <div>Status</div>
        <div>Completed By</div>
        <div>Date Completed</div>
      </div>

      {/* Rows */}
      <div>
        {rows.map((r) => {
          const style = STATUS_STYLE[r.status] || STATUS_STYLE["Not Completed"];
          return (
            <div
              key={r.id}
              style={{
                display: "grid",
                gridTemplateColumns: "40px minmax(220px, 2.2fr) 110px 150px 130px 110px",
                gap: 8,
                alignItems: "center",
                padding: "8px 10px",
                borderBottom: "1px solid var(--divider)",
                borderLeft: `3px solid ${r.status === "Completed" ? "var(--status-success)" : r.status === "In Progress" ? "var(--status-warning)" : "transparent"}`,
                background: r.status === "Completed" ? "rgba(34,197,94,0.04)" : "transparent",
              }}
            >
              <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", fontWeight: 700 }}>
                {String(r.seq).padStart(2, "0")}
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: r.status === "Completed" ? "var(--text-muted)" : "var(--text-primary)",
                  textDecoration: r.status === "Completed" ? "line-through" : "none",
                }}
              >
                {r.description}
              </div>

              <input
                type="date"
                value={r.date_required || ""}
                onChange={(e) => handleField(r.id, "date_required", e.target.value || null)}
                style={inputStyle}
              />

              <select
                value={r.status || "Not Completed"}
                onChange={(e) => handleStatus(r, e.target.value)}
                style={{
                  ...inputStyle,
                  ...mono,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: style.color,
                  background: style.bg,
                  borderColor: style.border,
                }}
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Initials / name"
                value={r.completed_by || ""}
                onChange={(e) => handleField(r.id, "completed_by", e.target.value)}
                style={inputStyle}
              />

              <input
                type="date"
                value={r.date_completed || ""}
                onChange={(e) => handleField(r.id, "date_completed", e.target.value || null)}
                style={inputStyle}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color, lineHeight: 1.1 }}>
        {value}
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: 4,
  padding: "5px 7px",
  fontSize: 11,
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  boxSizing: "border-box",
  minHeight: 26,
};
