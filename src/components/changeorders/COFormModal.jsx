import React, { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "../shared/formatters";
import PhoenixModal, { btnPrimary, btnSecondary, inputStyle, inputDisabledStyle, FormField } from "@/components/shared/PhoenixModal";

const empty = {
  project_id: "", project_name: "", title: "", description: "",
  reason_code: "Owner Request", status: "Draft", cost_code_id: "",
  submitted_date: new Date().toISOString().split("T")[0],
  approved_date: null, co_amount: 0, margin_percent: 0, schedule_impact_days: 0,
  approved_by: "", notes: "", attachments: "",
  co_number: "",
};

export default function COFormModal({ open, onClose, onSave, co, projects = [], nextNumber }) {
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (co) setForm({ ...empty, ...co });
    else setForm({ ...empty, co_number: nextNumber || "" });
    setErrors({});
  }, [co, open, nextNumber]);

  const validate = () => {
    const e = {};
    if (!form.project_id) e.project_id = "Required";
    if (!form.title?.trim()) e.title = "Required";
    if (!form.reason_code) e.reason_code = "Required";
    // Negative values are allowed — they represent deducts / credits back to the GC/owner.
    if (form.co_amount !== 0 && form.co_amount !== "" && isNaN(Number(form.co_amount))) {
      e.co_amount = "Must be a valid number";
    }
    const mp = Number(form.margin_percent);
    if (isNaN(mp) || mp < 0 || mp > 100) {
      e.margin_percent = "Must be between 0 and 100";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    const data = {
      ...form,
      co_amount: Number(form.co_amount) || 0,
      margin_percent: Number(form.margin_percent) || 0,
      schedule_impact_days: Number(form.schedule_impact_days) || 0,
    };
    const proj = projects.find(p => p.id === form.project_id);
    if (proj) data.project_name = proj.name;
    onSave(data);
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const selectedProject = projects.find(p => p.id === form.project_id);
  const grid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 };

  return (
    <PhoenixModal
      open={open}
      onClose={onClose}
      title={co ? `Edit ${co.co_number || "CO"}` : "New Change Order"}
      footer={<>
        <button style={btnSecondary} onClick={onClose}>Cancel</button>
        <button style={btnPrimary} onClick={handleSave}>{co ? "Update" : "Create"}</button>
      </>}
    >
      <div style={grid}>
        <FormField label="CO Number">
          <input style={inputDisabledStyle} value={form.co_number || nextNumber || ""} disabled readOnly />
        </FormField>
        <FormField label="Project *" error={errors.project_id}>
          <Select value={form.project_id} onValueChange={v => set("project_id", v)} disabled={false}>
            <SelectTrigger disabled={false}><SelectValue placeholder="Select project" /></SelectTrigger>
            <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </FormField>
        <FormField label="Title *" error={errors.title} span2>
          <input style={inputStyle} value={form.title} onChange={e => set("title", e.target.value)} />
        </FormField>
        <FormField label="Description" span2>
          <textarea style={{ ...inputStyle, height: 72, resize: "vertical" }} value={form.description} onChange={e => set("description", e.target.value)} />
        </FormField>
        <FormField label="Reason Code *">
          <Select value={form.reason_code} onValueChange={v => set("reason_code", v)} disabled={false}>
            <SelectTrigger disabled={false}><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Owner Request","Design Change","Differing Conditions","Scope Gap","Error & Omission","Weather","Other"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Status" error={errors.status}>
          <Select value={form.status} onValueChange={v => set("status", v)} disabled={false}>
            <SelectTrigger disabled={false}><SelectValue /></SelectTrigger>
            <SelectContent>{["Draft","Submitted","Under Review","Approved","Rejected","Void"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        </FormField>
        <FormField label="CO Amount ($)" error={errors.co_amount}>
          <input type="number" style={inputStyle} value={form.co_amount} onChange={e => set("co_amount", e.target.value)} />
        </FormField>
        <FormField label="Margin %" error={errors.margin_percent}>
          <input type="number" style={inputStyle} value={form.margin_percent} onChange={e => set("margin_percent", e.target.value)} min="0" max="100" step="0.1" placeholder="0" />
        </FormField>
        {/* Live-calculated Margin $ — read-only helper, not persisted */}
        <FormField label="Margin $">
          <input
            style={inputDisabledStyle}
            value={formatCurrency((Number(form.co_amount) || 0) * (Number(form.margin_percent) || 0) / 100)}
            disabled
            readOnly
          />
        </FormField>
        <FormField label="Schedule Impact (days)">
          <input type="number" style={inputStyle} value={form.schedule_impact_days || 0} onChange={e => set("schedule_impact_days", e.target.value)} min="0" placeholder="0" />
        </FormField>
        {selectedProject && (
          <FormField label="Original Contract Value">
            <input style={inputDisabledStyle} value={formatCurrency(selectedProject.original_contract_value)} disabled readOnly />
          </FormField>
        )}
        <FormField label="Submitted Date">
          <input type="date" style={inputStyle} value={form.submitted_date} onChange={e => set("submitted_date", e.target.value)} />
        </FormField>
        <FormField label="Approved Date">
          <input type="date" style={inputStyle} value={form.approved_date || ""} onChange={e => set("approved_date", e.target.value)} />
        </FormField>
        <FormField label="Approved By">
          <input style={inputStyle} value={form.approved_by} onChange={e => set("approved_by", e.target.value)} />
        </FormField>
        <FormField label="Notes" span2>
          <textarea style={{ ...inputStyle, height: 56, resize: "vertical" }} value={form.notes} onChange={e => set("notes", e.target.value)} />
        </FormField>
        <FormField label="Attachments (comma-separated)" span2>
          <input style={inputStyle} value={form.attachments} onChange={e => set("attachments", e.target.value)} placeholder="file1.pdf, file2.pdf" />
        </FormField>
      </div>
    </PhoenixModal>
  );
}