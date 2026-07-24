import React, { useEffect, useRef, useState } from "react";
import { entities } from "@/api/supabaseClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFormValidation } from "@/hooks/useFormValidation";
import { Button, Modal } from "@/components/design-system";
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
  const { fieldErrors, runValidation, clearField } = useFormValidation("action_item", actionItem ? "update" : "create");
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
    queryFn: () => entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: (data) => entities.ActionItem.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["action-items"] });
      toast.success("Action item created");
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = async () => {
    if (!runValidation(formData)) return;
    if (actionItem && onSave) {
      try {
        await onSave(formData);
        onClose();
      } catch (err) {
        toast.error(err?.message || "Action item could not be saved");
      }
      return;
    }
    mutation.mutate(formData);
  };

  // Cmd/Ctrl+Enter to save (Escape is handled by Modal)
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
    <Modal
      open={true}
      onClose={onClose}
      title={actionItem ? `Edit: ${actionItem.title}` : "New Action Item"}
      eyebrow="Ctrl+Enter to save"
      width={640}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : actionItem ? "Update" : "Create Item"}
        </Button>
      </>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Title — full width, auto-focused */}
        <div>
          <label style={labelStyle}>Title *</label>
          <input
            ref={titleRef}
            type="text"
            value={formData.title}
            onChange={e => { field("title", e.target.value); clearField("title"); }}
            placeholder="e.g., Fix anchor bolt alignment at Grid A-4"
            style={{ ...inputStyle, ...(fieldErrors.title ? { borderColor: "var(--status-error)" } : {}) }}
            required
          />
          {fieldErrors.title && <p style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--status-error)", marginTop: 4 }}>{fieldErrors.title}</p>}
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
          <select value={formData.project_id} onChange={e => { field("project_id", e.target.value); clearField("project_id"); }} style={{ ...inputStyle, ...(fieldErrors.project_id ? { borderColor: "var(--status-error)" } : {}) }} required>
            <option value="">Select project...</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {fieldErrors.project_id && <p style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--status-error)", marginTop: 4 }}>{fieldErrors.project_id}</p>}
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
    </Modal>
  );
}
