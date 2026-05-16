import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import RelatedScheduleTasksChips from "@/components/shared/RelatedScheduleTasksChips";

const PRIORITY_OPTIONS = [
  { value: "Low",      label: "Low",      color: "var(--text-muted)",     bg: "rgba(100,116,139,0.12)", border: "rgba(100,116,139,0.3)" },
  { value: "Medium",   label: "Med",      color: "var(--status-info)",    bg: "rgba(37,99,235,0.12)",   border: "rgba(37,99,235,0.3)"   },
  { value: "High",     label: "High",     color: "var(--status-warning)", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.3)"  },
  { value: "Critical", label: "🔥 Crit",  color: "var(--status-error)",   bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.3)"   },
];

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
};

export default function ActionItemFormModal({ projectId, onClose, onSave, actionItem = null }) {
  const qc = useQueryClient();
  const titleRef = useRef(null);
  const [formData, setFormData] = useState({
    project_id:       projectId || "",
    title:            "",
    description:      "",
    assigned_to:      "",
    due_date:         tomorrow(),
    priority:         "Medium",
    status:           "Open",
    meeting_reference: "",
  });

  useEffect(() => {
    if (actionItem) {
      setFormData({
        project_id:        actionItem.project_id || "",
        title:             actionItem.title || "",
        description:       actionItem.description || "",
        assigned_to:       actionItem.assigned_to || "",
        due_date:          actionItem.due_date || tomorrow(),
        priority:          actionItem.priority || "Medium",
        status:            actionItem.status || "Open",
        meeting_reference: actionItem.meeting_reference || "",
      });
    } else {
      setFormData(prev => ({ ...prev, project_id: projectId || "" }));
    }
  }, [actionItem, projectId]);

  // Auto-focus title on open
  useEffect(() => {
    const t = setTimeout(() => titleRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: (data) => base44.entities.ActionItem.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["action-items"] });
      toast.success("Action item created");
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = () => {
    if (!formData.title.trim() || !formData.project_id) return;
    if (actionItem && onSave) { onSave(formData); onClose(); return; }
    mutation.mutate(formData);
  };

  // Cmd/Ctrl+Enter to save
  const handleSubmitRef = useRef(handleSubmit);
  handleSubmitRef.current = handleSubmit;
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSubmitRef.current();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const field = (key, value) => setFormData(prev => ({ ...prev, [key]: value }));

  const modalStyle = {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--radius-card)",
    boxShadow: "0 24px 60px rgba(0,0,0,0.65)",
    maxWidth: 640,
    width: "90%",
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  };

  const inputStyle = {
    width: "100%", background: "var(--bg-surface-high)", border: "1px solid var(--border-strong)",
    borderRadius: 8, padding: "8px 12px", color: "var(--text-primary)",
    fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
  };

  const labelStyle = {
    fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
    letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: 4,
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={modalStyle}>
        {/* Header */}
        <div style={{ padding: "18px 24px 12px", borderBottom: "1px solid var(--divider)", flexShrink: 0 }}>
          <h2 style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.10em" }}>
            {actionItem ? `Edit: ${actionItem.title}` : "New Action Item"}
          </h2>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", margin: "4px 0 0", letterSpacing: "0.06em" }}>
            Ctrl+Enter to save
          </p>
        </div>

        {/* Body */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "16px 24px", flex: 1, overflowY: "auto", background: "var(--bg-surface)" }}>

          {/* Title — full width, auto-focused */}
          <div>
            <label style={labelStyle}>Title *</label>
            <input
              ref={titleRef}
              type="text"
              value={formData.title}
              onChange={e => field("title", e.target.value)}
              placeholder="e.g., Fix anchor bolt alignment at Grid A-4"
              style={inputStyle}
              required
            />
          </div>

          {/* Priority toggle buttons + Due Date */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Priority</label>
              <div style={{ display: "flex", gap: 4 }}>
                {PRIORITY_OPTIONS.map(opt => {
                  const active = formData.priority === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => field("priority", opt.value)}
                      style={{
                        flex: 1, padding: "7px 4px",
                        fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: "0.04em",
                        border: `1px solid ${active ? opt.border : "var(--border-default)"}`,
                        borderRadius: 6, cursor: "pointer",
                        background: active ? opt.bg : "var(--bg-surface-low)",
                        color: active ? opt.color : "var(--text-muted)",
                        transition: "all 0.12s",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label style={labelStyle}>Due Date</label>
              <input type="date" value={formData.due_date} onChange={e => field("due_date", e.target.value)} style={inputStyle} />
            </div>
          </div>

          {/* Status + Assigned To */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={formData.status} onChange={e => field("status", e.target.value)} style={inputStyle}>
                {["Open", "In Progress", "Complete", "Cancelled"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Assign To</label>
              <input type="text" value={formData.assigned_to} onChange={e => field("assigned_to", e.target.value)} placeholder="Name or crew" style={inputStyle} />
            </div>
          </div>

          {/* Project */}
          <div>
            <label style={labelStyle}>Project *</label>
            <select value={formData.project_id} onChange={e => field("project_id", e.target.value)} style={inputStyle} required>
              <option value="">Select project...</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description / Notes</label>
            <textarea
              value={formData.description}
              onChange={e => field("description", e.target.value)}
              rows={3}
              style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
            />
          </div>

          {/* Meeting ref */}
          <div>
            <label style={labelStyle}>Meeting Reference</label>
            <input type="text" value={formData.meeting_reference} onChange={e => field("meeting_reference", e.target.value)} placeholder="e.g., MTG-001" style={inputStyle} />
          </div>

          {/* Inbound chips — schedule tasks that link to this Action Item.
              Read-only; edit the link from the schedule task's LINKS tab.
              Only renders when we're editing an existing item. */}
          {actionItem?.id && formData.project_id && (
            <div style={{ paddingTop: 8, borderTop: "1px solid var(--divider)" }}>
              <RelatedScheduleTasksChips
                projectId={formData.project_id}
                relatedField="related_action_item_ids"
                targetId={actionItem.id}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "10px 24px", borderTop: "1px solid var(--divider)", display: "flex", gap: 8, justifyContent: "flex-end", background: "var(--bg-elevated)", flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-btn)", padding: "8px 16px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={mutation.isPending}
            style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: "var(--radius-btn)", padding: "8px 16px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em", opacity: mutation.isPending ? 0.5 : 1 }}
          >
            {mutation.isPending ? "Saving…" : actionItem ? "Update" : "Create Item"}
          </button>
        </div>
      </div>
    </div>
  );
}
