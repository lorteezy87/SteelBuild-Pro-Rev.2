import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function PunchlistFormModal({ projectId, onClose }) {
  const qc = useQueryClient();
  const [formData, setFormData] = useState({
    project_id: projectId,
    description: "",
    category: "Other",
    location: "",
    assigned_to: "",
    priority: "Medium",
    status: "Open",
    target_completion_date: "",
    percent_complete: "0",
    notes: "",
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const mutation = useMutation({
    mutationFn: (data) =>
      base44.entities.PunchlistItem.create({
        ...data,
        percent_complete: parseInt(data.percent_complete) || 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["punchlist"] });
      toast.success("Item added");
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  const categories = ["Structural", "Connections", "Painting/Coating", "Hardware", "Fit-Up", "Cleanup", "Documentation", "Other"];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--bg-surface-secondary)", border: "1px solid var(--border-default)", borderRadius: "16px", padding: "24px", maxWidth: "600px", width: "90%", maxHeight: "90vh", overflowY: "auto" }}>
        <h2 style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 20px 0", textTransform: "uppercase", letterSpacing: "0.10em" }}>Add Punchlist Item</h2>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Project</label>
            <select value={formData.project_id} onChange={(e) => setFormData({ ...formData, project_id: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} required>
              <option value="">Select project...</option>
              {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
          </div>

          <div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Description</label>
            <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="What needs to be done?" style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box", minHeight: "60px", resize: "vertical" }} required />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Category</label>
              <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }}>
                {categories.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </div>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Priority</label>
              <select value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }}>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Location</label>
            <input type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} placeholder="e.g., Grid A2, North Wall" style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Assigned To</label>
              <input type="text" value={formData.assigned_to} onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })} placeholder="Crew/Contractor" style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Target Date</label>
              <input type="date" value={formData.target_completion_date} onChange={(e) => setFormData({ ...formData, target_completion_date: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Status</label>
              <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }}>
                <option value="Open">Open</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="On Hold">On Hold</option>
                <option value="Deferred">Deferred</option>
              </select>
            </div>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Complete %</label>
              <input type="number" value={formData.percent_complete} onChange={(e) => setFormData({ ...formData, percent_complete: e.target.value })} min="0" max="100" style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          <div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Notes</label>
            <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box", minHeight: "60px", resize: "vertical" }} />
          </div>

          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 16px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, cursor: "pointer", transition: "background 0.15s", textTransform: "uppercase", letterSpacing: "0.08em" }}>Cancel</button>
            <button type="submit" disabled={mutation.isPending} style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: "8px", padding: "8px 16px", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, cursor: mutation.isPending ? "not-allowed" : "pointer", transition: "background 0.15s", textTransform: "uppercase", letterSpacing: "0.08em", opacity: mutation.isPending ? 0.5 : 1 }}>{mutation.isPending ? "Adding..." : "Add Item"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}