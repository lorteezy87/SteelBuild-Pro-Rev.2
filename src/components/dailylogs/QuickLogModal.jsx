import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";

const inputStyle = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  padding: "12px 14px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 13,
  minHeight: 44,
  outline: "none",
};

const labelStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 500,
  color: "var(--text-muted)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: 6,
};

export default function QuickLogModal({ open, onClose, onSave, workPackages = [], activeProject }) {
  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    date: today,
    wp_id: "",
    percent_complete: "",
    field_hours: "",
    activities: "",
  });

  useEffect(() => {
    if (open) {
      setForm({ date: today, wp_id: "", percent_complete: "", field_hours: "", activities: "" });
    }
  }, [open]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const selectedWP = workPackages.find(wp => wp.id === form.wp_id);

  // When WP changes, pre-fill current percent_complete
  const handleWPChange = (wpId) => {
    const wp = workPackages.find(w => w.id === wpId);
    set("wp_id", wpId);
    if (wp) set("percent_complete", wp.percent_complete ?? "");
  };

  const handleSave = () => {
    if (!form.date || !activeProject?.id) {
      alert("Date and project are required");
      return;
    }
    const wpProgress = form.wp_id ? JSON.stringify([{
      wp_id: form.wp_id,
      wp_number: selectedWP?.wp_number || "",
      wp_name: selectedWP?.name || "",
      percent_complete: Number(form.percent_complete) || 0,
      field_hours: Number(form.field_hours) || 0,
    }]) : "[]";

    const payload = {
      date: form.date,
      project_id: activeProject.id,
      project_name: activeProject.name || "",
      activities: form.activities,
      hours_worked: Number(form.field_hours) || 0,
      wp_progress: wpProgress,
      status: "Submitted",
    };
    onSave(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent style={{ maxWidth: 440, background: "var(--bg-surface-low)", border: "1px solid var(--accent-border)" }}>
        <DialogHeader>
          <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-primary)" }}>
            <Zap style={{ width: 16, height: 16, color: "#FFB300" }} />
            Quick Log
            {activeProject?.name && (
              <span style={{ fontSize: 9, color: "var(--text-muted)", marginLeft: 4 }}>{activeProject.name}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "4px 0" }}>
          {/* Date */}
          <div>
            <label style={labelStyle}>Date *</label>
            <input type="date" style={inputStyle} value={form.date} onChange={e => set("date", e.target.value)} />
          </div>

          {/* Work Package */}
          {workPackages.length > 0 && (
            <div>
              <label style={labelStyle}>Work Package</label>
              <select style={inputStyle} value={form.wp_id} onChange={e => handleWPChange(e.target.value)}>
                <option value="">— None —</option>
                {workPackages.map(wp => (
                  <option key={wp.id} value={wp.id}>{wp.wp_number} — {wp.name}</option>
                ))}
              </select>
              {selectedWP && (
                <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
                  Current: {selectedWP.percent_complete ?? 0}% complete · {selectedWP.phase}
                </div>
              )}
            </div>
          )}

          {/* Progress row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>% Complete</label>
              <input
                type="number"
                style={inputStyle}
                value={form.percent_complete}
                onChange={e => set("percent_complete", e.target.value)}
                min="0" max="100"
                placeholder={selectedWP?.percent_complete ?? "0"}
              />
            </div>
            <div>
              <label style={labelStyle}>Field Hours Today</label>
              <input
                type="number"
                style={inputStyle}
                value={form.field_hours}
                onChange={e => set("field_hours", e.target.value)}
                min="0" step="0.5"
                placeholder="0"
              />
            </div>
          </div>

          {/* Activity notes */}
          <div>
            <label style={labelStyle}>Activity Notes</label>
            <textarea
              style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
              value={form.activities}
              onChange={e => set("activities", e.target.value)}
              placeholder="Brief description of work done..."
            />
          </div>
        </div>

        <DialogFooter style={{ gap: 8 }}>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            style={{ background: "var(--accent)", color: "#fff", fontWeight: 700, minHeight: 44 }}
          >
            <Zap style={{ width: 14, height: 14, marginRight: 6 }} />
            Quick Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}