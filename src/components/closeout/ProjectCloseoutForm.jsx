import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function ProjectCloseoutForm({ projectId }) {
  const qc = useQueryClient();
  const [formData, setFormData] = useState({
    project_id: projectId,
    closeout_status: "In Progress",
    completion_date: new Date().toISOString().split("T")[0],
    handover_date: "",
    final_inspection_completed: false,
    punch_list_cleared: false,
    all_invoices_processed: false,
    warranties_registered: false,
    as_built_docs_completed: false,
    permits_closed: false,
  });

  const mutation = useMutation({
    mutationFn: (data) => base44.entities.ProjectCloseout.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["closeouts"] });
      toast.success("Closeout initiated");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "24px", maxWidth: "600px" }}>
      <h2 style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 20px 0", textTransform: "uppercase", letterSpacing: "0.10em" }}>Initiate Project Closeout</h2>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div>
          <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Completion Date</label>
          <input type="date" value={formData.completion_date} onChange={(e) => setFormData({ ...formData, completion_date: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} required />
        </div>

        <div>
          <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Handover Date</label>
          <input type="date" value={formData.handover_date} onChange={(e) => setFormData({ ...formData, handover_date: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
        </div>

        <div style={{ background: "var(--bg-input)", padding: "12px", borderRadius: "8px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: "12px" }}>Closeout Requirements</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {[
              { key: "final_inspection_completed", label: "Final inspection completed" },
              { key: "punch_list_cleared", label: "Punchlist fully cleared" },
              { key: "all_invoices_processed", label: "All invoices processed" },
              { key: "warranties_registered", label: "Warranties registered" },
              { key: "as_built_docs_completed", label: "As-built docs completed" },
              { key: "permits_closed", label: "All permits closed" },
            ].map((item) => (
              <label key={item.key} style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: "var(--font-body)", fontSize: "11px", color: "var(--text-secondary)", cursor: "pointer" }}>
                <input type="checkbox" checked={formData[item.key]} onChange={(e) => setFormData({ ...formData, [item.key]: e.target.checked })} style={{ cursor: "pointer" }} />
                {item.label}
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="submit" disabled={mutation.isPending} style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: "8px", padding: "8px 16px", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, cursor: mutation.isPending ? "not-allowed" : "pointer", transition: "background 0.15s", textTransform: "uppercase", letterSpacing: "0.08em", opacity: mutation.isPending ? 0.5 : 1 }}>
            {mutation.isPending ? "Creating..." : "Start Closeout"}
          </button>
        </div>
      </form>
    </div>
  );
}