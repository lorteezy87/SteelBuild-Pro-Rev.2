import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function DeliveryFormModal({ projectId, onClose, delivery = null }) {
  const qc = useQueryClient();
  const isEdit = !!delivery;

  const emptyForm = {
    project_id: projectId || "",
    work_package_id: "",
    vendor: "",
    po_number: "",
    scheduled_date: "",
    actual_date: "",
    status: "Scheduled",
    pieces: "",
    weight_tons: "",
    description: "",
    notes: "",
    carrier: "",
    tracking_number: "",
    received_by: "",
  };

  const [formData, setFormData] = useState(
    delivery ? { ...emptyForm, ...delivery } : emptyForm
  );

  useEffect(() => {
    setFormData(
      delivery
        ? { ...emptyForm, ...delivery }
        : { ...emptyForm, project_id: projectId || "" }
    );
  }, [delivery, projectId]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages", formData.project_id],
    queryFn: () =>
      formData.project_id
        ? base44.entities.WorkPackage.filter({ project_id: formData.project_id })
        : Promise.resolve([]),
    initialData: [],
  });

  const mutation = useMutation({
    mutationFn: (data) =>
      isEdit
        ? base44.entities.Delivery.update(delivery.id, data)
        : base44.entities.Delivery.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deliveries"] });
      toast.success(isEdit ? "Delivery updated" : "Delivery created");
      onClose();
    },
    onError: (err) =>
      toast.error((isEdit ? "Update" : "Create") + " failed: " + err.message),
  });

  const set = (k, v) => setFormData((p) => ({ ...p, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.project_id) { toast.error("Select a project"); return; }
    if (!formData.vendor.trim()) { toast.error("Vendor is required"); return; }
    if (!formData.scheduled_date) { toast.error("Scheduled date required"); return; }
    mutation.mutate({
      ...formData,
      pieces: parseInt(formData.pieces) || 0,
      weight_tons: parseFloat(formData.weight_tons) || 0,
    });
  };

  const inputStyle = {
    width: "100%", background: "var(--bg-input)",
    border: "1px solid var(--border-default)", borderRadius: "8px",
    padding: "8px 12px", color: "var(--text-primary)",
    fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box",
  };

  const labelStyle = {
    fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)",
    letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px",
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--bg-surface-secondary)", border: "1px solid var(--border-default)",
        borderRadius: "16px", padding: "24px", maxWidth: "640px", width: "90%",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{
            fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700,
            color: "var(--text-primary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.10em",
          }}>
            {isEdit ? "Edit Delivery" : "New Delivery"}
          </h2>
          {isEdit && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["In Transit", "Delivered", "Partial", "Rejected"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    mutation.mutate({
                      ...formData,
                      status: s,
                      actual_date:
                        s === "Delivered"
                          ? new Date().toISOString().split("T")[0]
                          : formData.actual_date,
                    });
                  }}
                  style={{
                    padding: "4px 10px", borderRadius: 6,
                    border: "1px solid var(--border-default)",
                    background: formData.status === s ? "var(--accent)" : "transparent",
                    color: formData.status === s ? "#fff" : "var(--text-muted)",
                    fontFamily: "var(--font-mono)", fontSize: 8, cursor: "pointer",
                    fontWeight: 700, letterSpacing: "0.06em",
                  }}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={labelStyle}>Project *</label>
              <select value={formData.project_id} onChange={(e) => set("project_id", e.target.value)} style={inputStyle} required>
                <option value="">Select project...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Work Package</label>
              <select value={formData.work_package_id} onChange={(e) => set("work_package_id", e.target.value)} style={inputStyle}>
                <option value="">Optional</option>
                {workPackages.map((wp) => (
                  <option key={wp.id} value={wp.id}>{wp.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={labelStyle}>Vendor *</label>
              <input type="text" value={formData.vendor} onChange={(e) => set("vendor", e.target.value)} style={inputStyle} required />
            </div>
            <div>
              <label style={labelStyle}>PO Number</label>
              <input type="text" value={formData.po_number} onChange={(e) => set("po_number", e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={labelStyle}>Scheduled Date *</label>
              <input type="date" value={formData.scheduled_date} onChange={(e) => set("scheduled_date", e.target.value)} style={inputStyle} required />
            </div>
            <div>
              <label style={labelStyle}>Actual Date</label>
              <input type="date" value={formData.actual_date || ""} onChange={(e) => set("actual_date", e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={formData.status} onChange={(e) => set("status", e.target.value)} style={inputStyle}>
                {["Scheduled", "In Transit", "Delivered", "Partial", "Rejected"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Pieces</label>
              <input type="number" value={formData.pieces} onChange={(e) => set("pieces", e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Weight (Tons)</label>
              <input type="number" step="0.1" value={formData.weight_tons} onChange={(e) => set("weight_tons", e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={labelStyle}>Carrier</label>
              <input type="text" value={formData.carrier || ""} onChange={(e) => set("carrier", e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Tracking Number</label>
              <input type="text" value={formData.tracking_number || ""} onChange={(e) => set("tracking_number", e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => set("description", e.target.value)}
              style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }}
              placeholder="Material description, specs, etc."
            />
          </div>

          <div>
            <label style={labelStyle}>Received By</label>
            <input
              type="text"
              value={formData.received_by || ""}
              onChange={(e) => set("received_by", e.target.value)}
              style={inputStyle}
              placeholder="Name of person receiving delivery"
            />
          </div>

          <div>
            <label style={labelStyle}>Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => set("notes", e.target.value)}
              style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }}
              placeholder="Delivery notes, issues, special instructions"
            />
          </div>

          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "var(--bg-surface)", border: "1px solid var(--border-default)",
                borderRadius: "8px", padding: "8px 16px", color: "var(--text-primary)",
                fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700,
                cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              style={{
                background: "var(--accent)", color: "white", border: "none",
                borderRadius: "8px", padding: "8px 20px", fontFamily: "var(--font-mono)",
                fontSize: "10px", fontWeight: 700,
                cursor: mutation.isPending ? "not-allowed" : "pointer",
                textTransform: "uppercase", letterSpacing: "0.08em",
                opacity: mutation.isPending ? 0.5 : 1,
              }}
            >
              {mutation.isPending
                ? (isEdit ? "Saving..." : "Creating...")
                : (isEdit ? "Save Changes" : "Create Delivery")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}