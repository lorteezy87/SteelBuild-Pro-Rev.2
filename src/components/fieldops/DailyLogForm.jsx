import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import PhotoStripUploader from "@/components/shared/PhotoStripUploader";
import MultiSelectChips from "@/components/shared/MultiSelectChips";

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

// Coerce JSONB values that may come back from Postgres as strings or null.
function asArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export default function DailyLogForm({ projectId, log, onSave, onClose, isSaving }) {
  const isEditing = !!log;

  const [formData, setFormData] = useState({
    project_id: projectId,
    date: new Date().toISOString().split("T")[0],
    superintendent: "",
    crew_name: "",
    headcount: "",
    hours_worked: "",
    weather_description: "",
    temperature: "",
    wind_speed: "",
    activities: "",
    equipment_used: "",
    materials_received: "",
    delays: "",
    delay_hours: "",
    safety_incidents: 0,
    safety_notes: "",
    photos: [],
    related_action_item_ids: [],
    related_rfi_ids: [],
  });

  useEffect(() => {
    if (log) {
      setFormData({
        ...log,
        photos: asArray(log.photos),
        related_action_item_ids: asArray(log.related_action_item_ids),
        related_rfi_ids: asArray(log.related_rfi_ids),
      });
    }
  }, [log]);

  // ── Action Items + RFIs for cross-link multi-selects (project-scoped) ──
  const { data: actionItems = [] } = useQuery({
    queryKey: ["action-items-for-link", formData.project_id],
    queryFn: () =>
      formData.project_id
        ? base44.entities.ActionItem.filter({ project_id: formData.project_id })
        : Promise.resolve([]),
    enabled: !!formData.project_id,
    staleTime: 60 * 1000,
  });

  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis-for-link", formData.project_id],
    queryFn: () =>
      formData.project_id
        ? base44.entities.RFI.filter({ project_id: formData.project_id })
        : Promise.resolve([]),
    enabled: !!formData.project_id,
    staleTime: 60 * 1000,
  });

  const actionItemOptions = useMemo(
    () =>
      actionItems.map((a) => ({
        id: a.id,
        label: a.title || a.description?.slice(0, 40) || `Item ${a.id?.slice(0, 6)}`,
        sublabel: a.status || "",
      })),
    [actionItems]
  );

  const rfiOptions = useMemo(
    () =>
      rfis.map((r) => ({
        id: r.id,
        label: r.rfi_number || r.title || `RFI ${r.id?.slice(0, 6)}`,
        sublabel: r.title && r.rfi_number ? r.title : r.status || "",
      })),
    [rfis]
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.project_id) {
      alert("Select a project before saving a daily log.");
      return;
    }
    onSave({
      ...formData,
      headcount: parseInt(formData.headcount) || 0,
      hours_worked: parseFloat(formData.hours_worked) || 0,
      // temperature and wind_speed are TEXT in the daily_logs schema — keep them
      // as strings (or null) so PostgREST doesn't choke on a number→text mismatch.
      temperature: formData.temperature === "" || formData.temperature == null ? null : String(formData.temperature),
      wind_speed: formData.wind_speed === "" || formData.wind_speed == null ? null : String(formData.wind_speed),
      delay_hours: parseFloat(formData.delay_hours) || 0,
      safety_incidents: parseInt(formData.safety_incidents) || 0,
      photos: asArray(formData.photos),
      related_action_item_ids: asArray(formData.related_action_item_ids),
      related_rfi_ids: asArray(formData.related_rfi_ids),
    });
  };

  const set = (field) => (e) => setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  const setField = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "12px",
        padding: "20px",
      }}
    >
      <h3
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
          fontWeight: 700,
          color: "var(--text-primary)",
          margin: "0 0 16px 0",
          textTransform: "uppercase",
          letterSpacing: "0.10em",
        }}
      >
        {isEditing ? "Edit Daily Log" : "New Daily Log"}
      </h3>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Date & Superintendent */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={formData.date} onChange={set("date")} style={inputStyle} required />
          </div>
          <div>
            <label style={labelStyle}>Superintendent</label>
            <input type="text" value={formData.superintendent} onChange={set("superintendent")} style={inputStyle} />
          </div>
        </div>

        {/* Crew & Hours */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
          <div>
            <label style={labelStyle}>Crew Name</label>
            <input type="text" value={formData.crew_name} onChange={set("crew_name")} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Headcount</label>
            <input type="number" value={formData.headcount} onChange={set("headcount")} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Hours Worked</label>
            <input type="number" step="0.5" value={formData.hours_worked} onChange={set("hours_worked")} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Temperature (°F)</label>
            <input type="number" value={formData.temperature} onChange={set("temperature")} style={inputStyle} />
          </div>
        </div>

        {/* Weather & Wind */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px" }}>
          <div>
            <label style={labelStyle}>Weather</label>
            <input
              type="text"
              value={formData.weather_description}
              onChange={set("weather_description")}
              placeholder="Sunny, Cloudy, Rainy, etc."
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Wind Speed (mph)</label>
            <input type="number" step="0.5" value={formData.wind_speed} onChange={set("wind_speed")} style={inputStyle} />
          </div>
        </div>

        {/* Activities */}
        <div>
          <label style={labelStyle}>Activities Performed</label>
          <textarea
            value={formData.activities}
            onChange={set("activities")}
            placeholder="Describe work performed, progress, accomplishments..."
            style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
          />
        </div>

        {/* Equipment & Materials */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={labelStyle}>Equipment Used</label>
            <textarea value={formData.equipment_used} onChange={set("equipment_used")} style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }} />
          </div>
          <div>
            <label style={labelStyle}>Materials Received</label>
            <textarea value={formData.materials_received} onChange={set("materials_received")} style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }} />
          </div>
        </div>

        {/* Delays */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px" }}>
          <div>
            <label style={labelStyle}>Delays / Issues</label>
            <textarea value={formData.delays} onChange={set("delays")} style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }} />
          </div>
          <div>
            <label style={labelStyle}>Delay Hours</label>
            <input type="number" step="0.5" value={formData.delay_hours} onChange={set("delay_hours")} style={inputStyle} />
          </div>
        </div>

        {/* Safety */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={labelStyle}>Safety Incidents</label>
            <input type="number" min="0" value={formData.safety_incidents} onChange={set("safety_incidents")} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Safety Notes</label>
            <input type="text" value={formData.safety_notes} onChange={set("safety_notes")} style={inputStyle} />
          </div>
        </div>

        {/* Related links — Action Items + RFIs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <MultiSelectChips
            label="Related Action Items"
            value={formData.related_action_item_ids}
            options={actionItemOptions}
            onChange={(v) => setField("related_action_item_ids", v)}
            placeholder={actionItemOptions.length === 0 ? "No items in project" : "Add action item..."}
          />
          <MultiSelectChips
            label="Related RFIs"
            value={formData.related_rfi_ids}
            options={rfiOptions}
            onChange={(v) => setField("related_rfi_ids", v)}
            placeholder={rfiOptions.length === 0 ? "No RFIs in project" : "Add RFI..."}
          />
        </div>

        {/* Photos */}
        <PhotoStripUploader
          label="Photos"
          value={formData.photos}
          onChange={(v) => setField("photos", v)}
          disabled={isSaving}
        />

        {/* Actions */}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "var(--bg-surface-secondary)",
              border: "1px solid var(--border-default)",
              borderRadius: "8px",
              padding: "8px 16px",
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              fontWeight: 700,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
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
            {isSaving ? "Saving..." : isEditing ? "Update Log" : "Save Log"}
          </button>
        </div>
      </form>
    </div>
  );
}
