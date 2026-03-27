import React, { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";

const INPUT_STYLE = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-input)",
  padding: "8px 10px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  boxSizing: "border-box",
};

const LABEL_STYLE = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.08em",
  color: "var(--text-muted)",
  textTransform: "uppercase",
  marginBottom: 4,
  display: "block",
};

const STATUS_OPTIONS = ["Draft", "In Review", "Approved", "Issued", "Superseded", "Archived"];
const CATEGORY_OPTIONS = ["Other", "Contracts", "IFC/Models", "Issued for Construction", "Submittals", "QA/QC", "Closeout"];
const DISCIPLINE_OPTIONS = ["General", "Structural", "Architectural", "MEP", "Civil", "Procurement"];

export default function DocumentEditModal({ projectId, doc, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => ({
    displayName: doc.displayName || "",
    documentNumber: doc.documentNumber || "",
    revisionNumber: doc.revisionNumber || "",
    status: doc.status || "Draft",
    category: doc.category || "Other",
    discipline: doc.discipline || "General",
    tags: (doc.tags || []).join(", "),
    description: doc.description || "",
    work_package_id: doc.work_package_id || doc.workPackageId || "",
    rfi_id: doc.rfi_id || doc.rfiId || "",
    delivery_id: doc.delivery_id || doc.deliveryId || "",
    change_order_id: doc.change_order_id || doc.changeOrderId || "",
    submittal_id: doc.submittal_id || doc.submittalId || "",
    is_current: doc.is_current ?? true,
  }));

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      displayName: doc.displayName || "",
      documentNumber: doc.documentNumber || "",
      revisionNumber: doc.revisionNumber || "",
      status: doc.status || "Draft",
      category: doc.category || "Other",
      discipline: doc.discipline || "General",
      tags: (doc.tags || []).join(", "),
      description: doc.description || "",
      work_package_id: doc.work_package_id || doc.workPackageId || "",
      rfi_id: doc.rfi_id || doc.rfiId || "",
      delivery_id: doc.delivery_id || doc.deliveryId || "",
      change_order_id: doc.change_order_id || doc.changeOrderId || "",
      submittal_id: doc.submittal_id || doc.submittalId || "",
      is_current: doc.is_current ?? true,
    }));
  }, [doc]);

  const mut = useMutation({
    mutationFn: (payload) => base44.entities.Document.update(doc.id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", projectId] });
      toast.success("Document updated");
      onClose();
    },
    onError: (err) => toast.error(err?.message || "Update failed"),
  });

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSave = () => {
    if (!form.displayName.trim()) {
      toast.error("Name is required");
      return;
    }
    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    mut.mutate({
      display_name: form.displayName,
      displayName: form.displayName,
      document_number: form.documentNumber,
      documentNumber: form.documentNumber,
      revision_number: form.revisionNumber,
      revisionNumber: form.revisionNumber,
      status: form.status,
      category: form.category,
      discipline: form.discipline,
      description: form.description,
      tags,
      work_package_id: form.work_package_id,
      rfi_id: form.rfi_id,
      delivery_id: form.delivery_id,
      change_order_id: form.change_order_id,
      submittal_id: form.submittal_id,
      is_current: form.is_current,
      project_id: projectId,
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2400,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          padding: 20,
          width: "90%",
          maxWidth: 720,
          maxHeight: "90vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em" }}>
            Edit Document
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18 }}
          >
            ×
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={LABEL_STYLE}>Display Name</label>
            <input style={INPUT_STYLE} value={form.displayName} onChange={(e) => set("displayName", e.target.value)} />
          </div>
          <div>
            <label style={LABEL_STYLE}>Document #</label>
            <input style={INPUT_STYLE} value={form.documentNumber} onChange={(e) => set("documentNumber", e.target.value)} />
          </div>
          <div>
            <label style={LABEL_STYLE}>Revision</label>
            <input style={INPUT_STYLE} value={form.revisionNumber} onChange={(e) => set("revisionNumber", e.target.value)} />
          </div>
          <div>
            <label style={LABEL_STYLE}>Status</label>
            <select style={INPUT_STYLE} value={form.status} onChange={(e) => set("status", e.target.value)}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={LABEL_STYLE}>Category</label>
            <select style={INPUT_STYLE} value={form.category} onChange={(e) => set("category", e.target.value)}>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={LABEL_STYLE}>Discipline</label>
            <select style={INPUT_STYLE} value={form.discipline} onChange={(e) => set("discipline", e.target.value)}>
              {DISCIPLINE_OPTIONS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={LABEL_STYLE}>Tags (comma separated)</label>
            <input style={INPUT_STYLE} value={form.tags} onChange={(e) => set("tags", e.target.value)} />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={LABEL_STYLE}>Description</label>
            <textarea
              style={{ ...INPUT_STYLE, minHeight: 80, fontFamily: "var(--font-body)" }}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={LABEL_STYLE}>Work Package ID</label>
            <input style={INPUT_STYLE} value={form.work_package_id} onChange={(e) => set("work_package_id", e.target.value)} />
          </div>
          <div>
            <label style={LABEL_STYLE}>RFI ID</label>
            <input style={INPUT_STYLE} value={form.rfi_id} onChange={(e) => set("rfi_id", e.target.value)} />
          </div>
          <div>
            <label style={LABEL_STYLE}>Delivery ID</label>
            <input style={INPUT_STYLE} value={form.delivery_id} onChange={(e) => set("delivery_id", e.target.value)} />
          </div>
          <div>
            <label style={LABEL_STYLE}>Change Order ID</label>
            <input style={INPUT_STYLE} value={form.change_order_id} onChange={(e) => set("change_order_id", e.target.value)} />
          </div>
          <div>
            <label style={LABEL_STYLE}>Submittal ID</label>
            <input style={INPUT_STYLE} value={form.submittal_id} onChange={(e) => set("submittal_id", e.target.value)} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18 }}>
            <input
              id="is_current"
              type="checkbox"
              checked={!!form.is_current}
              onChange={(e) => set("is_current", e.target.checked)}
            />
            <label htmlFor="is_current" style={{ ...LABEL_STYLE, marginBottom: 0, textTransform: "none", letterSpacing: 0 }}>
              Mark as current version
            </label>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 12px",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-btn)",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={mut.isPending}
            onClick={handleSave}
            style={{
              padding: "8px 16px",
              background: "var(--accent)",
              border: "1px solid var(--accent-border)",
              color: "#0A0A0B",
              borderRadius: "var(--radius-btn)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 800,
              cursor: mut.isPending ? "not-allowed" : "pointer",
              opacity: mut.isPending ? 0.6 : 1,
            }}
          >
            {mut.isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
