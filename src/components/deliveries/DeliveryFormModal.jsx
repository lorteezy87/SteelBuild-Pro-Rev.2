import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function DeliveryFormModal({ projectId, onClose, delivery = null }) {
  const qc = useQueryClient();
  const isEdit = !!delivery;

  const statusList = ["Scheduled", "In Transit", "Delivered", "Partial", "Rejected", "Delayed"];

  const emptyForm = {
    project_id: projectId || "",
    project_name: "",
    delivery_title: "",
    work_package_id: "",
    vendor: "",
    po_number: "",
    scheduled_date: "",
    required_date: "",
    actual_date: "",
    status: "Scheduled",
    priority: "Normal",
    pieces: "",
    weight_tons: "",
    description: "",
    notes: "",
    special_instructions: "",
    carrier: "",
    tracking_number: "",
    received_by: "",
    receiving_location: "",
    contact_name: "",
    contact_phone: "",
    inspection_required: false,
    delivery_type: "",
    procurement_category: "",
  };

  const [formData, setFormData] = useState(delivery ? { ...emptyForm, ...delivery } : emptyForm);

  useEffect(() => {
    setFormData(delivery ? { ...emptyForm, ...delivery } : { ...emptyForm, project_id: projectId || "" });
  }, [delivery, projectId]);

  // Auto-populate project_name whenever project_id changes or projects load
  useEffect(() => {
    if (formData.project_id && projects.length > 0) {
      const proj = projects.find(p => String(p.id) === String(formData.project_id));
      if (proj) {
        const name = proj.name || proj.project_name || "";
        if (name && formData.project_name !== name) {
          setFormData(prev => ({ ...prev, project_name: name }));
        }
      }
    }
  }, [formData.project_id, projects]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages", formData.project_id],
    queryFn: () =>
      formData.project_id ? base44.entities.WorkPackage.filter({ project_id: formData.project_id }) : Promise.resolve([]),
    initialData: [],
  });

  const mutation = useMutation({
    mutationFn: (data) =>
      isEdit ? base44.entities.Delivery.update(delivery.id, data) : base44.entities.Delivery.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deliveries"] });
      toast.success(isEdit ? "Delivery updated" : "Delivery created");
      onClose();
    },
    onError: (err) => toast.error((isEdit ? "Update" : "Create") + " failed: " + err.message),
  });

  const set = (k, v) => setFormData((p) => ({ ...p, [k]: v }));

  const handleSubmit = () => {
    if (!formData.delivery_title?.trim()) {
      toast.error("Delivery title is required");
      return;
    }
    if (!formData.project_id) {
      toast.error("Select a project");
      return;
    }
    if (!formData.vendor.trim()) {
      toast.error("Vendor is required");
      return;
    }
    if (!formData.scheduled_date) {
      toast.error("Scheduled date required");
      return;
    }
    if (
      formData.required_date &&
      formData.scheduled_date &&
      new Date(formData.scheduled_date) > new Date(formData.required_date)
    ) {
      toast.warning("Scheduled date is after required date — verify this is intentional");
    }
    const proj = projects.find(p => p.id === formData.project_id);
    const wp = workPackages.find(w => w.id === formData.work_package_id);
    mutation.mutate({
      ...formData,
      delivery_title: formData.delivery_title.trim(),
      project_name: proj?.name || proj?.project_name || formData.project_name || "",
      description: wp ? (wp.name || wp.wp_number || formData.description || "") : formData.description || "",
      pieces: parseInt(formData.pieces) || 0,
      weight_tons: parseFloat(formData.weight_tons) || 0,
    });
  };

  const labelStyle = {
    fontFamily: "var(--font-mono)",
    fontSize: 8,
    fontWeight: 700,
    color: "var(--text-muted)",
    letterSpacing: "0.10em",
    textTransform: "uppercase",
    display: "block",
    marginBottom: 4,
  };

  const inputStyle = {
    width: "100%",
    background: "var(--bg-input)",
    border: "1px solid var(--border-default)",
    borderRadius: "var(--radius-input)",
    padding: "10px 12px",
    color: "var(--text-primary)",
    fontFamily: "var(--font-body)",
    fontSize: 12,
    outline: "none",
    boxSizing: "border-box",
  };

  const riskScheduling =
    formData.required_date &&
    formData.scheduled_date &&
    new Date(formData.scheduled_date) > new Date(formData.required_date);

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
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          maxWidth: 720,
          width: "92%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 24px 14px",
            borderBottom: "1px solid var(--divider)",
            background: "var(--bg-sidebar)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 14,
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
            }}
          >
            {isEdit ? "Edit Delivery" : "New Delivery"}
          </h2>
          {isEdit && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["In Transit", "Delivered", "Partial", "Rejected"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() =>
                    mutation.mutate({
                      ...formData,
                      status: s,
                      actual_date: s === "Delivered" ? new Date().toISOString().split("T")[0] : formData.actual_date,
                    })
                  }
                  style={{
                    padding: "6px 10px",
                    borderRadius: "var(--radius-btn)",
                    border: "1px solid var(--border-default)",
                    background: formData.status === s ? "var(--accent)" : "transparent",
                    color: formData.status === s ? "var(--accent-text)" : "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                  }}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <SectionLabel>Delivery Info</SectionLabel>
            <div>
              <label style={labelStyle}>Delivery Title *</label>
              <input
                type="text"
                value={formData.delivery_title}
                onChange={(e) => set("delivery_title", e.target.value)}
                style={inputStyle}
                placeholder="e.g. Anchor Bolts — Phase 1, HSS Columns Load 3"
                required
              />
            </div>

            <SectionLabel>Project & Assignment</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Project {projectId ? "(auto)" : "*"}</label>
                {projectId ? (
                  <div style={{ ...inputStyle, background: "var(--bg-surface-secondary)", color: "var(--accent)", fontWeight: 600, display: "flex", alignItems: "center" }}>
                    {formData.project_name || projects.find(p => String(p.id) === String(projectId))?.name || "—"}
                  </div>
                ) : (
                  <select value={formData.project_id} onChange={(e) => set("project_id", e.target.value)} style={inputStyle} required>
                    <option value="">Select project...</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label style={labelStyle}>Work Package</label>
                <select value={formData.work_package_id} onChange={(e) => set("work_package_id", e.target.value)} style={inputStyle}>
                  <option value="">Optional</option>
                  {workPackages.map((wp) => (
                    <option key={wp.id} value={wp.id}>
                      {wp.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <SectionLabel>Shipment Details</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Vendor *</label>
                <input type="text" value={formData.vendor} onChange={(e) => set("vendor", e.target.value)} style={inputStyle} required />
              </div>
              <div>
                <label style={labelStyle}>PO Number</label>
                <input type="text" value={formData.po_number} onChange={(e) => set("po_number", e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Delivery Type</label>
                <input type="text" value={formData.delivery_type} onChange={(e) => set("delivery_type", e.target.value)} style={inputStyle} placeholder="Freight, Will-Call, etc." />
              </div>
              <div>
                <label style={labelStyle}>Procurement Category</label>
                <input type="text" value={formData.procurement_category} onChange={(e) => set("procurement_category", e.target.value)} style={inputStyle} placeholder="Steel, Joists, Misc Metals..." />
              </div>
            </div>

            <SectionLabel>Scheduling</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Scheduled Date *</label>
                <input type="date" value={formData.scheduled_date} onChange={(e) => set("scheduled_date", e.target.value)} style={inputStyle} required />
              </div>
              <div>
                <label style={labelStyle}>Required On Site</label>
                <input type="date" value={formData.required_date || ""} onChange={(e) => set("required_date", e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Actual Date</label>
                <input type="date" value={formData.actual_date || ""} onChange={(e) => set("actual_date", e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Status</label>
                <select value={formData.status} onChange={(e) => set("status", e.target.value)} style={inputStyle}>
                  {statusList.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Priority</label>
                <select value={formData.priority} onChange={(e) => set("priority", e.target.value)} style={inputStyle}>
                  {["Critical", "High", "Normal", "Low"].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Inspection Required</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8, height: 40 }}>
                  <input
                    type="checkbox"
                    checked={!!formData.inspection_required}
                    onChange={(e) => set("inspection_required", e.target.checked)}
                    style={{ width: 16, height: 16 }}
                  />
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)" }}>Yes</span>
                </div>
              </div>
            </div>
            {riskScheduling && (
              <div
                style={{
                  background: "rgba(234,179,8,0.15)",
                  border: "1px solid rgba(234,179,8,0.4)",
                  padding: "8px 10px",
                  borderRadius: "var(--radius-btn)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--status-warning)",
                }}
              >
                Scheduled date is after required on-site date — scheduling risk
              </div>
            )}

            <SectionLabel>Material</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => set("description", e.target.value)}
                  style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
                  placeholder="Material description, specs, etc."
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Pieces</label>
                  <input type="number" value={formData.pieces} onChange={(e) => set("pieces", e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Weight (Tons)</label>
                  <input type="number" step="0.1" value={formData.weight_tons} onChange={(e) => set("weight_tons", e.target.value)} style={inputStyle} />
                </div>
              </div>
            </div>

            <SectionLabel>Logistics</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Carrier</label>
                <input type="text" value={formData.carrier || ""} onChange={(e) => set("carrier", e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Tracking Number</label>
                <input type="text" value={formData.tracking_number || ""} onChange={(e) => set("tracking_number", e.target.value)} style={inputStyle} />
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <label style={labelStyle}>Special Instructions</label>
                <textarea
                  value={formData.special_instructions || ""}
                  onChange={(e) => set("special_instructions", e.target.value)}
                  style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
                  placeholder="Crane required, escort, laydown constraints..."
                />
              </div>
            </div>

            <SectionLabel>Contacts & Receiving</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Vendor Contact</label>
                <input type="text" value={formData.contact_name || ""} onChange={(e) => set("contact_name", e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Contact Phone</label>
                <input type="text" value={formData.contact_phone || ""} onChange={(e) => set("contact_phone", e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Receiving Location</label>
                <input
                  type="text"
                  value={formData.receiving_location || ""}
                  onChange={(e) => set("receiving_location", e.target.value)}
                  style={inputStyle}
                  placeholder="Gate / Bay / Laydown area"
                />
              </div>
              <div>
                <label style={labelStyle}>Received By</label>
                <input
                  type="text"
                  value={formData.received_by || ""}
                  onChange={(e) => set("received_by", e.target.value)}
                  style={inputStyle}
                  placeholder="Name of receiver"
                />
              </div>
            </div>

            <SectionLabel>Notes</SectionLabel>
            <textarea
              value={formData.notes}
              onChange={(e) => set("notes", e.target.value)}
              style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
              placeholder="Delivery notes, issues, exceptions"
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 24px",
            borderTop: "1px solid var(--divider)",
            background: "var(--bg-surface)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-btn)",
              padding: "10px 16px",
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={mutation.isPending}
            style={{
              background: "var(--accent)",
              color: "var(--accent-text)",
              border: "1px solid var(--accent)",
              borderRadius: "var(--radius-btn)",
              padding: "10px 20px",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              cursor: mutation.isPending ? "not-allowed" : "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              opacity: mutation.isPending ? 0.6 : 1,
            }}
          >
            {mutation.isPending ? (isEdit ? "Saving..." : "Creating...") : isEdit ? "Save Changes" : "Create Delivery"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        fontWeight: 700,
        color: "var(--accent)",
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        borderLeft: "3px solid var(--accent)",
        paddingLeft: 8,
        marginTop: 8,
      }}
    >
      {children}
    </div>
  );
}
