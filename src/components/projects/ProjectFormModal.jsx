import React, { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PhoenixModal, { btnPrimary, btnSecondary, inputStyle, FormField } from "@/components/shared/PhoenixModal";

const empty = {
  project_number: "", name: "", client: "", general_contractor: "", engineer_of_record: "",
  project_manager: "", superintendent: "", contract_type: "Lump Sum",
  original_contract_value: 0, start_date: "", target_completion_date: "",
  forecast_completion_date: "", phase: "Detailing", health_status: "On Track",
  retainage_percent: 10, contingency_amount: 0, address: "", notes: "",
};

export default function ProjectFormModal({ open, onClose, onSave, project }) {
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setForm(project ? { ...empty, ...project } : empty);
    setErrors({});
  }, [project, open]);

  const validate = () => {
    const e = {};
    if (!form.project_number?.trim()) e.project_number = "Required";
    if (!form.name?.trim()) e.name = "Required";
    if (!form.client?.trim()) e.client = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    await onSave({
      ...form,
      original_contract_value: Number(form.original_contract_value) || 0,
      retainage_percent: Number(form.retainage_percent) || 0,
      contingency_amount: Number(form.contingency_amount) || 0,
    });
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const grid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 };

  return (
    <PhoenixModal
      open={open}
      onClose={onClose}
      title={project ? "Edit Project" : "Create Project"}
      footer={<>
        <button style={btnSecondary} onClick={onClose}>Cancel</button>
        <button style={btnPrimary} onClick={handleSave}>{project ? "Save Changes" : "Create Project"}</button>
      </>}
    >
      <div style={grid}>
        <FormField label="Project Number *" error={errors.project_number}>
          <input style={inputStyle} value={form.project_number} onChange={e => set("project_number", e.target.value)} />
        </FormField>
        <FormField label="Name *" error={errors.name}>
          <input style={inputStyle} value={form.name} onChange={e => set("name", e.target.value)} />
        </FormField>
        <FormField label="Client *" error={errors.client}>
          <input style={inputStyle} value={form.client} onChange={e => set("client", e.target.value)} />
        </FormField>
        <FormField label="General Contractor">
          <input style={inputStyle} value={form.general_contractor} onChange={e => set("general_contractor", e.target.value)} />
        </FormField>
        <FormField label="Engineer of Record">
          <input style={inputStyle} value={form.engineer_of_record} onChange={e => set("engineer_of_record", e.target.value)} />
        </FormField>
        <FormField label="Project Manager">
          <input style={inputStyle} value={form.project_manager} onChange={e => set("project_manager", e.target.value)} />
        </FormField>
        <FormField label="Superintendent">
          <input style={inputStyle} value={form.superintendent} onChange={e => set("superintendent", e.target.value)} />
        </FormField>
        <FormField label="Contract Type">
          <Select value={form.contract_type} onValueChange={v => set("contract_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["Lump Sum","T&M","GMP"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        </FormField>
        <FormField label="Original Contract Value ($)">
          <input type="number" style={inputStyle} value={form.original_contract_value} onChange={e => set("original_contract_value", e.target.value)} />
        </FormField>
        <FormField label="Retainage %">
          <input type="number" style={inputStyle} value={form.retainage_percent} onChange={e => set("retainage_percent", e.target.value)} />
        </FormField>
        <FormField label="Contingency Amount ($)">
          <input type="number" style={inputStyle} value={form.contingency_amount} onChange={e => set("contingency_amount", e.target.value)} />
        </FormField>
        <FormField label="Phase">
          <Select value={form.phase} onValueChange={v => set("phase", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["Detailing","Fabrication","Erection","Closeout"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        </FormField>
        <FormField label="Health Status">
          <Select value={form.health_status} onValueChange={v => set("health_status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["On Track","Watch","At Risk"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        </FormField>
        <FormField label="Start Date">
          <input type="date" style={inputStyle} value={form.start_date} onChange={e => set("start_date", e.target.value)} />
        </FormField>
        <FormField label="Target Completion">
          <input type="date" style={inputStyle} value={form.target_completion_date} onChange={e => set("target_completion_date", e.target.value)} />
        </FormField>
        <FormField label="Forecast Completion">
          <input type="date" style={inputStyle} value={form.forecast_completion_date} onChange={e => set("forecast_completion_date", e.target.value)} />
        </FormField>
        <FormField label="Address" span2>
          <input style={inputStyle} value={form.address} onChange={e => set("address", e.target.value)} />
        </FormField>
        <FormField label="Notes" span2>
          <textarea style={{ ...inputStyle, height: 72, resize: "vertical" }} value={form.notes} onChange={e => set("notes", e.target.value)} />
        </FormField>
      </div>
    </PhoenixModal>
  );
}
