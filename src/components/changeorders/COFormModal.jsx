import React, { useState, useEffect, useId, useRef } from "react";
import { formatCurrency } from "../shared/formatters";
import PhoenixModal, { btnPrimary, btnSecondary, btnDanger, inputStyle, inputDisabledStyle, labelStyle } from "@/components/shared/PhoenixModal";
import RelatedScheduleTasksChips from "@/components/shared/RelatedScheduleTasksChips";
import { changeOrderStatusOptions } from "@/lib/changeOrders/lifecycle";
import { localToday } from "@/utils/dates";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import { buildChangeOrderPayload } from "./changeOrderPayload";

const empty = {
  project_id: "", project_name: "", title: "", description: "",
  reason_code: "Owner Request", status: "Draft", cost_code_id: "",
  submitted_date: "", approved_date: "", co_amount: 0, margin_percent: 0,
  schedule_impact_days: 0, approved_by: "", notes: "", attachments: "", co_number: "",
  source_rfi_id: null, sov_line_item_id: "", sov_line_number: null, sov_mode: "",
  decision_notes: "", void_reason: "",
};

function Field({ label, children, wide = false }) {
  const id = useId();
  // The single native control is nested and receives the matching id below.
  // eslint-disable-next-line jsx-a11y/label-has-for
  return <label htmlFor={id} style={{ display: "block", minWidth: 0, ...(wide ? { gridColumn: "1 / -1" } : {}) }}>
    <span style={labelStyle}>{label}</span>{React.cloneElement(children, { id })}
  </label>;
}

export default function COFormModal({ open, onClose, onSave, onDelete = null, isSaving = false, co, projects = [], prefill = null, sovItems = [], sourceRfiLabel = "", canApprove = true, canVoid = true, writesDisabled = false, recoveryPending = false }) {
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const draftKey = co ? `edit:${co.project_id}:${co.id}` : `new:${prefill?.project_id || ""}:${prefill?.source_rfi_id || ""}`;
  const initializedKey = useRef(null);
  const activeAttempt = useRef(null);

  useEffect(() => {
    if (!open) { initializedKey.current = null; return; }
    if (initializedKey.current === draftKey) return;
    initializedKey.current = draftKey;
    activeAttempt.current = null;
    setSaving(false);
    setForm({ ...empty, submitted_date: localToday(), ...(co || prefill || {}), ...(!co ? { co_number: "" } : {}) });
    setError("");
  }, [co, open, prefill, draftKey]);

  const busy = isSaving || saving;
  const locked = busy || writesDisabled;
  const approved = co?.status === "Approved";
  const approving = form.status === "Approved" && !approved;
  const selectedProject = projects.find(project => project.id === form.project_id);
  const projectSovItems = sovItems.filter(line => !line.project_id || line.project_id === form.project_id);
  const statuses = changeOrderStatusOptions(co?.status).filter(status => (status !== "Approved" || canApprove || approved) && (status !== "Void" || canVoid || co?.status === "Void"));
  const set = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  const close = () => { if (!busy) onClose(); };

  const handleSave = async () => {
    if (locked || activeAttempt.current) return;
    let payload;
    try {
      if (recoveryPending) payload = {};
      else {
      if (!form.project_id || !selectedProject) throw new Error("Choose an available project.");
      if (!form.title?.trim()) throw new Error("Enter a change-order title.");
      if (!form.reason_code) throw new Error("Choose a reason code.");
      payload = buildChangeOrderPayload(form, { existing: co, canApprove, canVoid });
      if (approving && form.sov_mode === "adjust_line" && !projectSovItems.some(line => line.id === form.sov_line_item_id)) throw new Error("Choose an existing SOV line from this project.");
      payload.project_name = selectedProject.name;
      payload.title = form.title.trim();
      }
    } catch (cause) {
      setError(toUserErrorMessage(cause));
      return;
    }
    const attempt = {};
    activeAttempt.current = attempt;
    setSaving(true);
    setError("");
    try { await onSave(payload); }
    catch (cause) { if (activeAttempt.current === attempt) setError(toUserErrorMessage(cause)); }
    finally {
      if (activeAttempt.current === attempt) { activeAttempt.current = null; setSaving(false); }
    }
  };

  return <PhoenixModal open={open} onClose={close} title={co ? `Edit ${co.co_number || "CO"}` : "New Change Order"} footer={<>
    {co && !approved && onDelete && <button type="button" style={{ ...btnDanger, marginRight: "auto" }} onClick={() => { if (!locked) onDelete(co); }} disabled={locked}>Delete</button>}
    <button type="button" style={btnSecondary} onClick={close} disabled={busy}>Cancel</button>
    <button type="button" style={btnPrimary} onClick={handleSave} disabled={locked}>{busy ? "Saving…" : recoveryPending ? "Recover saved change order" : co ? "Update" : "Create"}</button>
  </>}>
    {form.source_rfi_id && <p style={{ color: "var(--accent)", fontSize: 12 }}>Converted from {sourceRfiLabel || "a cost-impact RFI"}</p>}
    {error && <p role="alert" style={{ color: "var(--status-error)", fontSize: 13 }}>{error}</p>}
    {writesDisabled && <p role="status" style={{ color: "var(--status-warning)", fontSize: 13 }}>Saving is paused until project records are available.</p>}
    {recoveryPending && <p role="status" style={{ color: "var(--status-warning)", fontSize: 13 }}>The original save may have completed. Recover it with the same details before making further changes. This recovery stays available when you reopen the editor. After reloading or changing workspaces, check the register before creating another change order.</p>}
    {approved && <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>The approved amount, cost code, SOV relationship, and approval record are locked. Void this change order and issue a new one to change its commercial scope.</p>}
    <fieldset disabled={locked || recoveryPending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 14 }}>
      <Field label="CO Number"><input style={inputDisabledStyle} value={co?.co_number || ""} readOnly placeholder="Assigned when created" /></Field>
      <Field label="Project *"><select style={inputStyle} value={form.project_id} disabled={!!co} onChange={event => setForm(previous => ({ ...previous, project_id: event.target.value, sov_line_item_id: "", sov_line_number: null }))}>
        <option value="">Select project</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select></Field>
      <Field label="Title *" wide><input style={inputStyle} value={form.title || ""} onChange={event => set("title", event.target.value)} /></Field>
      <Field label="Description" wide><textarea style={{ ...inputStyle, minHeight: 72, resize: "vertical" }} value={form.description || ""} onChange={event => set("description", event.target.value)} /></Field>
      <Field label="Reason Code *"><select style={inputStyle} value={form.reason_code} onChange={event => set("reason_code", event.target.value)}>
        {["Owner Request", "Design Change", "Differing Conditions", "Scope Gap", "Error & Omission", "Weather", "Other"].map(reason => <option key={reason}>{reason}</option>)}
      </select></Field>
      <Field label="Status"><select style={inputStyle} value={form.status} onChange={event => setForm(previous => ({ ...previous, status: event.target.value, ...(event.target.value === "Approved" && !previous.approved_date ? { approved_date: localToday() } : {}) }))}>
        {statuses.map(status => <option key={status}>{status}</option>)}
      </select></Field>
      <Field label="CO Amount ($)"><input type="number" step="0.01" style={approved ? inputDisabledStyle : inputStyle} disabled={approved} value={form.co_amount ?? ""} onChange={event => set("co_amount", event.target.value)} /></Field>
      <Field label="Margin %"><input type="number" style={inputStyle} value={form.margin_percent ?? ""} onChange={event => set("margin_percent", event.target.value)} min="0" max="100" step="0.1" /></Field>
      <Field label="Margin $"><input style={inputDisabledStyle} value={formatCurrency((Number(form.co_amount) || 0) * (Number(form.margin_percent) || 0) / 100)} disabled readOnly /></Field>
      <Field label="Schedule Impact (days)"><input type="number" style={inputStyle} value={form.schedule_impact_days ?? ""} onChange={event => set("schedule_impact_days", event.target.value)} min="0" max="2147483647" step="1" /></Field>
      {approving && <Field label="SOV treatment *"><select style={inputStyle} value={form.sov_mode || ""} onChange={event => set("sov_mode", event.target.value)}>
        <option value="">Choose how approval affects SOV</option>
        <option value="new_line" disabled={Number(form.co_amount) < 0}>Create a new SOV line</option>
        <option value="adjust_line">Adjust an existing SOV line</option>
        <option value="none">Leave SOV unchanged</option>
      </select></Field>}
      <Field label={approving && form.sov_mode === "adjust_line" ? "SOV Line Item *" : "SOV Line Item"}><select style={inputStyle} value={form.sov_line_item_id || ""} disabled={approved || (approving && form.sov_mode !== "adjust_line")} onChange={event => {
        const line = projectSovItems.find(candidate => candidate.id === event.target.value);
        setForm(previous => ({ ...previous, sov_line_item_id: line?.id || "", sov_line_number: line?.line_item_number ?? null }));
      }}><option value="">No linked line</option>{projectSovItems.map(line => <option key={line.id} value={line.id}>#{line.line_item_number} · {line.description || "(no description)"}</option>)}</select></Field>
      {selectedProject && <Field label="Original Contract Value"><input style={inputDisabledStyle} value={formatCurrency(selectedProject.original_contract_value)} disabled readOnly /></Field>}
      <Field label="Submitted Date"><input type="date" style={inputStyle} value={form.submitted_date || ""} onChange={event => set("submitted_date", event.target.value)} /></Field>
      {(approving || approved) && <>
        <Field label={approving ? "Approved Date *" : "Approved Date"}><input type="date" style={approved ? inputDisabledStyle : inputStyle} readOnly={approved} value={approved ? co.approved_date || "" : form.approved_date || ""} onChange={event => set("approved_date", event.target.value)} /></Field>
        <Field label={approving ? "Approved By *" : "Approved By"}><input style={approved ? inputDisabledStyle : inputStyle} readOnly={approved} value={approved ? co.approved_by || "" : form.approved_by || ""} onChange={event => set("approved_by", event.target.value)} /></Field>
      </>}
      {approving && <p style={{ gridColumn: "1 / -1", color: "var(--text-secondary)", fontSize: 12, margin: 0 }}>
        {form.sov_mode === "new_line" ? `Approval will add a new SOV line for ${formatCurrency(Number(form.co_amount))}.` : form.sov_mode === "adjust_line" ? `Approval will adjust the selected SOV line by ${formatCurrency(Number(form.co_amount))}. A deduct reduces its value.` : form.sov_mode === "none" ? "Approval will update the change-order total without changing scheduled billing values." : "Choose the billing treatment explicitly before approving."}
      </p>}
      {form.status === "Rejected" && co?.status !== "Rejected" && <Field label="Rejection reason" wide><textarea style={inputStyle} value={form.decision_notes || ""} onChange={event => set("decision_notes", event.target.value)} /></Field>}
      {form.status === "Void" && co?.status !== "Void" && <Field label="Void reason" wide><textarea style={inputStyle} value={form.void_reason || ""} onChange={event => set("void_reason", event.target.value)} /></Field>}
      <Field label="Notes" wide><textarea style={{ ...inputStyle, minHeight: 56, resize: "vertical" }} value={form.notes || ""} onChange={event => set("notes", event.target.value)} /></Field>
      <Field label="Attachments (comma-separated)" wide><input style={inputStyle} value={form.attachments || ""} onChange={event => set("attachments", event.target.value)} placeholder="file1.pdf, file2.pdf" /></Field>
    </fieldset>
    {co?.id && form.project_id && <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--divider)" }}><RelatedScheduleTasksChips projectId={form.project_id} relatedField="related_change_order_ids" targetId={co.id} /></div>}
  </PhoenixModal>;
}
