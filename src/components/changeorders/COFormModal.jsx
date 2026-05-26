import React, { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "../shared/formatters";
import PhoenixModal, { btnPrimary, btnSecondary, inputStyle, inputDisabledStyle, FormField } from "@/components/shared/PhoenixModal";
// `inputDisabledStyle` is no longer used for CO Number — it stays imported for
// the read-only Margin $ helper / Original Contract Value fields below.
import RelatedScheduleTasksChips from "@/components/shared/RelatedScheduleTasksChips";

const empty = {
  project_id: "", project_name: "", title: "", description: "",
  reason_code: "Owner Request", status: "Draft", cost_code_id: "",
  submitted_date: new Date().toISOString().split("T")[0],
  approved_date: null, co_amount: 0, margin_percent: 0, schedule_impact_days: 0,
  approved_by: "", notes: "", attachments: "",
  co_number: "",
  source_rfi_id: null, sov_line_item_id: "", sov_line_number: null,
};

export default function COFormModal({ open, onClose, onSave, isSaving, co, projects = [], nextNumber, prefill = null, sovItems = [], sourceRfiLabel = "" }) {
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (co) setForm({ ...empty, ...co });
    // For new COs, seed from `prefill` (e.g. when converting a cost-impact RFI)
    // and leave co_number BLANK so the "Auto-assigned …" placeholder shows. The
    // createMut on the parent page fills a fresh "CO #NNN" via
    // getNextFormattedNumber if the user saves without typing one in.
    else setForm({ ...empty, ...(prefill || {}) });
    setErrors({});
  }, [co, open, prefill]);

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
      sov_line_item_id: form.sov_line_item_id || null,
      sov_line_number: form.sov_line_number ?? null,
      source_rfi_id: form.source_rfi_id || null,
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
        <button style={btnPrimary} onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving…" : co ? "Update" : "Create"}
        </button>
      </>}
    >
      {form.source_rfi_id && (
        <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 6, background: "var(--accent-muted)", border: "1px solid var(--accent-border)", color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em" }}>
          ⤷ Converted from {sourceRfiLabel || "a cost-impact RFI"}
        </div>
      )}
      <div style={grid}>
        <FormField label="CO Number">
          {/* User-assignable, RFI-style. Edit mode shows the existing
              number; new mode shows blank with "Auto-assigned if blank"
              placeholder so the user can either type their own or leave
              empty to let the createMut auto-format the next free
              "CO #NNN" via getNextFormattedNumber. */}
          {co ? (
            <input
              style={inputStyle}
              value={form.co_number || ""}
              onChange={(e) => set("co_number", e.target.value)}
              placeholder="CO #001"
            />
          ) : (
            <input
              style={{ ...inputStyle, opacity: 0.7 }}
              value={form.co_number || ""}
              onChange={(e) => set("co_number", e.target.value)}
              placeholder={nextNumber ? `Auto-assigned: ${nextNumber}` : "Auto-assigned if blank"}
            />
          )}
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
        <FormField label="SOV Line Item">
          <Select
            value={form.sov_line_item_id || "none"}
            onValueChange={(v) => {
              if (v === "none") { setForm(p => ({ ...p, sov_line_item_id: "", sov_line_number: null })); return; }
              const item = sovItems.find(s => s.id === v);
              setForm(p => ({ ...p, sov_line_item_id: v, sov_line_number: item ? item.line_item_number : null }));
            }}
          >
            <SelectTrigger><SelectValue placeholder="Link to SOV line (optional)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— None —</SelectItem>
              {sovItems.map(s => (
                <SelectItem key={s.id} value={s.id}>{`#${s.line_item_number} · ${s.description || "(no description)"}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
      {/* Inbound chips — schedule tasks that link to this CO. Read-only;
          edit the link from the schedule task's LINKS tab. Only renders
          when we're editing an existing CO. */}
      {co?.id && form.project_id && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--divider)" }}>
          <RelatedScheduleTasksChips
            projectId={form.project_id}
            relatedField="related_change_order_ids"
            targetId={co.id}
          />
        </div>
      )}
    </PhoenixModal>
  );
}