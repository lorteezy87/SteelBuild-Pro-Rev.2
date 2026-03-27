import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

const inputStyle = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: "8px",
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
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

export default function MeetingFormModal({ projectId, meeting, onSave, onClose, isSaving }) {
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
    }
  }, [meeting]);

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
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)",
          borderRadius: "16px",
          padding: "24px",
          maxWidth: "700px",
          width: "90%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "14px",
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: "0 0 20px 0",
            textTransform: "uppercase",
            letterSpacing: "0.10em",
          }}
        >
          {isEditing ? "Edit Meeting" : "New Meeting"}
        </h2>

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
            <textarea value={formData.attendees} onChange={set("attendees")} style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }} />
          </div>

          {/* Minutes */}
          <div>
            <label style={labelStyle}>Minutes</label>
            <textarea value={formData.minutes} onChange={set("minutes")} style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }} />
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
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "8px",
                padding: "8px 16px",
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                fontWeight: 700,
                cursor: isSaving ? "not-allowed" : "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                opacity: isSaving ? 0.5 : 1,
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
                color: "white",
                border: "none",
                borderRadius: "8px",
                padding: "8px 16px",
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                fontWeight: 700,
                cursor: isSaving ? "not-allowed" : "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                opacity: isSaving ? 0.5 : 1,
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
