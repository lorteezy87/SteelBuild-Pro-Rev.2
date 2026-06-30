/**
 * InlineEditField — click-to-edit single field, optimistic, project-aware.
 *
 * The dashboard surfaces several project-level values that legitimately
 * sit empty for new jobs (project_manager, superintendent, original
 * contract value, etc.). Rather than asking the user to leave the
 * dashboard for the Projects edit form, this component lets them
 * click the value, type the new one, and press Enter to save.
 *
 *   <InlineEditField
 *     project={project}
 *     field="project_manager"
 *     value={project?.project_manager}
 *     placeholder="Unassigned"
 *     type="text"
 *   />
 *
 * Keyboard:
 *   Enter  → save
 *   Esc    → cancel
 *   Tab    → save and move to next focusable
 *
 * The component handles its own mutation through the Supabase Project
 * entity, invalidates the projects + projects/:id query keys so the
 * dashboard refreshes immediately, and shows a toast on error.
 */

import React, { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import { formatCurrency } from "@/components/shared/formatters";
import { useProjectContext } from "@/components/shared/ProjectContext";

export default function InlineEditField({
  project,
  field,
  value,
  type = "text",          // "text" | "date" | "currency"
  placeholder = "—",
  emptyText,              // distinct copy when blank (e.g. "Unassigned")
  onAfterSave,
  // Visual style — `display` style controls how the read-mode value
  // looks. Two presets: "value" (large mono, dashboard tile) and
  // "label" (medium body text, role card). Custom styles can be passed
  // via `style` to override.
  display = "label",
  style,
  width = "100%",
}) {
  const qc = useQueryClient();
  const { updateActiveProject } = useProjectContext();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(toEditableString(value, type));
  const inputRef = useRef(null);

  useEffect(() => {
    setDraft(toEditableString(value, type));
  }, [value, type]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      // Select-all so the user can replace whatever's there with one stroke.
      try { inputRef.current.select(); } catch {}
    }
  }, [editing]);

  const mutation = useMutation({
    mutationFn: async (newValue) => {
      if (!project?.id) throw new Error("Missing project id");
      const patch = { [field]: newValue };
      await entities.Project.update(project.id, patch);
      return patch;
    },
    onSuccess: (patch) => {
      // Update the active-project state in ProjectContext so every
      // dashboard panel reading `project?.[field]` re-renders with
      // the new value immediately (the React-Query keys aren't bound
      // to ProjectContext, so invalidating them alone wasn't enough
      // — the form would visually revert until a hard refresh).
      updateActiveProject?.(patch);
      // Still invalidate query keys for any place that does subscribe
      // (Projects table, project pill in chrome, etc).
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project", project.id] });
      qc.invalidateQueries({ queryKey: ["projects-summary"] });
      onAfterSave?.();
    },
    onError: (err) => {
      toast.error(`Save failed: ${err.message || "unknown error"}`);
    },
  });

  const isEmpty =
    value == null || value === "" ||
    (type === "currency" && Number(value) === 0);

  const renderedValue = formatForDisplay(value, type, isEmpty, emptyText, placeholder);

  const commit = () => {
    const next = parseDraft(draft, type);
    const cur = toEditableString(value, type);
    if (toEditableString(next, type) !== cur) {
      mutation.mutate(next);
    }
    setEditing(false);
  };

  const cancel = () => {
    setDraft(toEditableString(value, type));
    setEditing(false);
  };

  const baseStyle = {
    width,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    cursor: project?.id ? "pointer" : "default",
    ...(display === "value" ? VALUE_STYLE : LABEL_STYLE),
    ...(isEmpty ? { color: "var(--text-muted)", fontStyle: "italic" } : null),
    ...style,
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => project?.id && setEditing(true)}
        disabled={!project?.id}
        title={project?.id ? "Click to edit" : "No project selected"}
        style={{
          ...baseStyle,
          background: "transparent",
          border: "1px dashed transparent",
          borderRadius: 4,
          padding: "2px 6px",
          textAlign: "left",
          width: "100%",
          justifyContent: "flex-start",
        }}
        onMouseEnter={(e) => {
          if (!project?.id) return;
          e.currentTarget.style.borderColor = "var(--accent-border)";
          e.currentTarget.style.background = "var(--hover-bg)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "transparent";
          e.currentTarget.style.background = "transparent";
        }}
      >
        <span style={{
          flex: 1,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {renderedValue}
        </span>
        {project?.id && (
          <Pencil
            size={11}
            style={{
              color: "var(--text-muted)",
              opacity: 0.6,
              flexShrink: 0,
            }}
          />
        )}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      type={type === "date" ? "date" : type === "currency" ? "number" : "text"}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        else if (e.key === "Escape") { e.preventDefault(); cancel(); }
      }}
      step={type === "currency" ? "0.01" : undefined}
      placeholder={emptyText || placeholder}
      style={{
        ...baseStyle,
        width: "100%",
        background: "var(--bg-page)",
        border: "1px solid var(--accent-border)",
        borderRadius: 4,
        padding: "2px 6px",
        outline: "none",
        boxShadow: "0 0 0 2px var(--accent-muted)",
      }}
    />
  );
}

const LABEL_STYLE = {
  fontFamily: "var(--font-body)",
  fontSize: 14,
  fontWeight: 600,
  color: "var(--text-primary)",
};

const VALUE_STYLE = {
  fontFamily: "var(--font-mono)",
  fontSize: 18,
  fontWeight: 700,
  color: "var(--text-primary)",
  fontVariantNumeric: "tabular-nums",
};

function toEditableString(v, type) {
  if (v == null) return "";
  if (type === "date") {
    // Accept ISO date or full timestamp; render YYYY-MM-DD for the input.
    if (typeof v === "string") return v.slice(0, 10);
    try {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    } catch {}
    return "";
  }
  if (type === "currency") {
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : "";
  }
  return String(v);
}

function parseDraft(draft, type) {
  if (draft == null || draft === "") return null;
  if (type === "currency") {
    const n = Number(draft);
    return Number.isFinite(n) ? n : null;
  }
  if (type === "date") {
    return draft || null;
  }
  return String(draft).trim() || null;
}

function formatForDisplay(value, type, isEmpty, emptyText, placeholder) {
  if (isEmpty) return emptyText || placeholder;
  if (type === "currency") return formatCurrency(Number(value) || 0);
  if (type === "date") {
    if (typeof value !== "string") return placeholder;
    const iso = value.slice(0, 10);
    try {
      const d = new Date(iso + "T00:00:00Z");
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
      }
    } catch {}
    return iso;
  }
  return String(value);
}
