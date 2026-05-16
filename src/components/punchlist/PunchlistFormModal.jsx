import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import PhotoStripUploader from "@/components/shared/PhotoStripUploader";
import { MapPin } from "lucide-react";
import { useFormValidation } from "@/hooks/useFormValidation";
import { useFocusTrap } from "@/hooks/useFocusTrap";

const emptyForm = {
  project_id: "",
  description: "",
  category: "Other",
  location: "",
  assigned_to: "",
  priority: "Medium",
  status: "Open",
  target_completion_date: "",
  percent_complete: "0",
  notes: "",
  photos: [],
  drawing_id: "",
  inspection_id: "",
};

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

export default function PunchlistFormModal({ projectId, item = null, onClose, onSave, isSaving = false }) {
  const { fieldErrors, runValidation, clearField } = useFormValidation("punchlist_item");
  const trapRef = useFocusTrap(true);
  const [formData, setFormData] = useState({ ...emptyForm, project_id: projectId || "" });
  const isEditing = !!item;

  useEffect(() => {
    setFormData(
      item
        ? {
            ...emptyForm,
            ...item,
            percent_complete: String(item.percent_complete ?? "0"),
            photos: asArray(item.photos),
            drawing_id: item.drawing_id || "",
            inspection_id: item.inspection_id || "",
          }
        : { ...emptyForm, project_id: projectId || "" }
    );
  }, [item, projectId]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  // Drawings list for the optional drawing_id selector (C2 — floor-plan
  // markup data model). Per-project, soft-delete-filtered by the entity
  // client. Empty when no project picked yet.
  const { data: drawings = [] } = useQuery({
    queryKey: ["drawings-for-punchlist", formData.project_id],
    queryFn: () =>
      formData.project_id
        ? base44.entities.Drawing.filter({ project_id: formData.project_id }, "-updated_at", 200)
        : Promise.resolve([]),
    enabled: !!formData.project_id,
    staleTime: 60 * 1000,
  });

  const handleSubmit = () => {
    if (isSaving) return;
    const validationPayload = { ...formData, title: formData.description, due_date: formData.target_completion_date };
    if (!runValidation(validationPayload)) return;
    onSave?.({
      ...formData,
      percent_complete: parseInt(formData.percent_complete) || 0,
      photos: asArray(formData.photos),
      drawing_id: formData.drawing_id || null,
      inspection_id: formData.inspection_id || null,
    });
  };

  const categories = ["Structural", "Connections", "Painting/Coating", "Hardware", "Fit-Up", "Cleanup", "Documentation", "Other"];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={(e) => { if (e.target === e.currentTarget && !isSaving) onClose(); }}>
      <div ref={trapRef} className="sbd-card-strong" role="dialog" aria-modal="true" style={{ background: "var(--bg-surface-secondary)", border: "1px solid var(--border-default)", borderRadius: "16px", padding: "24px", maxWidth: "600px", width: "90%", maxHeight: "90vh", overflowY: "auto" }}>
        <h2 style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 20px 0", textTransform: "uppercase", letterSpacing: "0.10em" }}>{isEditing ? "Edit Punchlist Item" : "Add Punchlist Item"}</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={labelStyle}>Project</label>
            <select value={formData.project_id} onChange={(e) => { setFormData({ ...formData, project_id: e.target.value }); clearField("project_id"); }} style={{ ...inputStyle, borderColor: fieldErrors.project_id ? "var(--status-error)" : undefined }}>
              <option value="">Select project...</option>
              {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
            {fieldErrors.project_id && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)", marginTop: 2, display: "block" }}>{fieldErrors.project_id}</span>}
          </div>

          <div>
            <label style={labelStyle}>Description</label>
            <textarea value={formData.description} onChange={(e) => { setFormData({ ...formData, description: e.target.value }); clearField("title"); }} placeholder="What needs to be done?" style={{ ...inputStyle, minHeight: "60px", resize: "vertical", borderColor: fieldErrors.title ? "var(--status-error)" : undefined }} />
            {fieldErrors.title && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)", marginTop: 2, display: "block" }}>{fieldErrors.title}</span>}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={labelStyle}>Category</label>
              <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} style={inputStyle}>
                {categories.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Priority</label>
              <select value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value })} style={inputStyle}>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Location</label>
            <input type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} placeholder="e.g., Grid A2, North Wall" style={inputStyle} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={labelStyle}>Assigned To</label>
              <input type="text" value={formData.assigned_to} onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })} placeholder="Crew/Contractor" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Target Date</label>
              <input type="date" value={formData.target_completion_date} onChange={(e) => setFormData({ ...formData, target_completion_date: e.target.value })} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} style={inputStyle}>
                <option value="Open">Open</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="On Hold">On Hold</option>
                <option value="Deferred">Deferred</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Complete %</label>
              <input type="number" value={formData.percent_complete} onChange={(e) => setFormData({ ...formData, percent_complete: e.target.value })} min="0" max="100" style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Notes</label>
            <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }} />
          </div>

          {/* Optional drawing pin (C2 data model) — surfaced as a
              non-blocking optional field. The actual pin-drop UI in
              the Drawing Viewer is deferred (see Field overhaul brief
              C2 flag), but the link itself + a "Mark on drawing"
              hand-off button are wired so once the AnnotationLayer
              modal lands the round-trip is one keystroke away. */}
          {drawings.length > 0 && (
            <div>
              <label style={labelStyle}>Linked Drawing (optional)</label>
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  value={formData.drawing_id || ""}
                  onChange={(e) => setFormData({ ...formData, drawing_id: e.target.value })}
                  style={{ ...inputStyle, flex: 1 }}
                >
                  <option value="">— No drawing —</option>
                  {drawings.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.sheet_number || d.drawing_number || ""} {d.title ? `· ${d.title}` : ""}
                    </option>
                  ))}
                </select>
                {formData.drawing_id && (
                  <button
                    type="button"
                    onClick={() => {
                      // FLAG: Per the Field overhaul brief C2, the
                      // pin-drop UI in the Drawing Viewer is deferred.
                      // For now this opens the drawing in viewer with
                      // a hint param so the deferred pin-mode work can
                      // recognise the entry-point without re-plumbing.
                      const url = `/DrawingViewer?drawingId=${formData.drawing_id}&pinTarget=punchlist${item?.id ? `&punchlistId=${item.id}` : ""}`;
                      window.open(url, "_blank");
                    }}
                    title="Open drawing in viewer (pin-drop UI is deferred — see brief)"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: "var(--bg-surface)",
                      color: "var(--accent)",
                      border: "1px solid var(--accent)",
                      borderRadius: 8,
                      padding: "0 12px",
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <MapPin size={11} /> Mark on drawing
                  </button>
                )}
              </div>
            </div>
          )}

          <PhotoStripUploader
            label="Photos"
            value={formData.photos}
            onChange={(v) => setFormData({ ...formData, photos: v })}
            disabled={isSaving}
          />

          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} disabled={isSaving} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 16px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, cursor: isSaving ? "not-allowed" : "pointer", textTransform: "uppercase", letterSpacing: "0.08em", opacity: isSaving ? 0.5 : 1 }}>Cancel</button>
            <button type="button" onClick={handleSubmit} disabled={isSaving || !formData.project_id || !formData.description?.trim()} style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: "8px", padding: "8px 16px", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, cursor: isSaving || !formData.project_id || !formData.description?.trim() ? "not-allowed" : "pointer", textTransform: "uppercase", letterSpacing: "0.08em", opacity: isSaving || !formData.project_id || !formData.description?.trim() ? 0.5 : 1 }}>{isSaving ? (isEditing ? "Saving..." : "Adding...") : (isEditing ? "Save Item" : "Add Item")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
