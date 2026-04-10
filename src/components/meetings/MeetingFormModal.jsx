import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

const inputStyle = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-input)",
  padding: "10px 12px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
  minHeight: "44px",
};

const labelStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: "9px",
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: "4px",
};

export default function MeetingFormModal({ projectId, meeting, templateDefaults, onSave, onClose, isSaving }) {
  const isEditing = !!meeting;

  const [formData, setFormData] = useState({
    project_id: projectId || "",
    title: "",
    meeting_type: "Internal",
    meeting_date: new Date().toISOString().split("T")[0],
    location: "",
    attendees: "",
    minutes: "",
    status: "Scheduled",
    next_meeting_date: "",
  });

  useEffect(() => {
    if (meeting) {
      setFormData({ ...meeting });
    } else if (templateDefaults) {
      setFormData((prev) => ({ ...prev, ...templateDefaults }));
    }
  }, [meeting, templateDefaults]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const handleSubmit = () => {
    onSave(formData);
  };

  const set = (field) => (e) => setFormData((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--glass-bg)",
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        animation: "fadeIn 0.2s ease-out",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--glass-border)",
          borderRadius: "16px",
          padding: "28px",
          maxWidth: "700px",
          width: "92%",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "var(--shadow-lg), 0 0 60px rgba(0,0,0,0.4)",
          animation: "slideUp 0.25s ease-out",
        }}
      >
        {/* Header with accent bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "24px",
            paddingBottom: "16px",
            borderBottom: "1px solid var(--divider)",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "16px",
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {isEditing ? "Edit Meeting" : "New Meeting"}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid transparent",
              borderRadius: "var(--radius-btn)",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "18px",
              lineHeight: 1,
              minHeight: "44px",
              minWidth: "44px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--text-primary)";
              e.currentTarget.style.borderColor = "var(--border-default)";
              e.currentTarget.style.background = "var(--hover-bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.borderColor = "transparent";
              e.currentTarget.style.background = "transparent";
            }}
          >
            {"\u2715"}
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Project */}
          <div>
            <label style={labelStyle}>Project</label>
            <select value={formData.project_id} onChange={set("project_id")} style={inputStyle} required>
              <option value="">Select project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label style={labelStyle}>Title</label>
            <input type="text" value={formData.title} onChange={set("title")} style={inputStyle} required />
          </div>

          {/* Type, Date, Location */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <div>
              <label style={labelStyle}>Type</label>
              <select value={formData.meeting_type} onChange={set("meeting_type")} style={inputStyle}>
                <option value="OAC">OAC</option>
                <option value="Internal">Internal</option>
                <option value="Safety">Safety</option>
                <option value="Kickoff">Kickoff</option>
                <option value="Progress">Progress</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" value={formData.meeting_date} onChange={set("meeting_date")} style={inputStyle} required />
            </div>
            <div>
              <label style={labelStyle}>Location</label>
              <input type="text" value={formData.location} onChange={set("location")} style={inputStyle} />
            </div>
          </div>

          {/* Attendees */}
          <div>
            <label style={labelStyle}>Attendees (comma-separated)</label>
            <textarea
              value={formData.attendees}
              onChange={set("attendees")}
              style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }}
            />
          </div>

          {/* Minutes */}
          <div>
            <label style={labelStyle}>Minutes</label>
            <textarea
              value={formData.minutes}
              onChange={set("minutes")}
              style={{ ...inputStyle, minHeight: "100px", resize: "vertical" }}
              placeholder="Add meeting notes, action items, and key decisions..."
            />
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "8px",
                color: "var(--text-muted)",
                marginTop: "4px",
                letterSpacing: "0.06em",
              }}
            >
              Tip: Use "Decision:" or "[x]" / "[ ]" markers for action items
            </div>
          </div>

          {/* Status & Next Meeting */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={formData.status} onChange={set("status")} style={inputStyle}>
                <option value="Scheduled">Scheduled</option>
                <option value="In Progress">In Progress</option>
                <option value="Complete">Complete</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Next Meeting Date</label>
              <input type="date" value={formData.next_meeting_date} onChange={set("next_meeting_date")} style={inputStyle} />
            </div>
          </div>

          {/* Actions */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              justifyContent: "flex-end",
              paddingTop: "8px",
              borderTop: "1px solid var(--divider)",
              marginTop: "4px",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              style={{
                background: "transparent",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-btn)",
                padding: "10px 20px",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-display)",
                fontSize: "12px",
                fontWeight: 700,
                cursor: isSaving ? "not-allowed" : "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                opacity: isSaving ? 0.5 : 1,
                minHeight: "44px",
                minWidth: "44px",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!isSaving) {
                  e.currentTarget.style.borderColor = "var(--accent)";
                  e.currentTarget.style.color = "var(--accent)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border-strong)";
                e.currentTarget.style.color = "var(--text-secondary)";
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (!isSaving) {
                  handleSubmit();
                }
              }}
              disabled={isSaving}
              style={{
                background: "var(--accent)",
                color: "#07090E",
                border: "none",
                borderRadius: "var(--radius-btn)",
                padding: "10px 20px",
                fontFamily: "var(--font-display)",
                fontSize: "12px",
                fontWeight: 700,
                cursor: isSaving ? "not-allowed" : "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                opacity: isSaving ? 0.5 : 1,
                minHeight: "44px",
                minWidth: "44px",
                transition: "all 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!isSaving) {
                  e.currentTarget.style.background = "var(--accent-hover)";
                  e.currentTarget.style.boxShadow = "var(--shadow-glow-gold)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--accent)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              {isSaving ? "Saving..." : isEditing ? "Update Meeting" : "Create Meeting"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
