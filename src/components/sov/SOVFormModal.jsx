import React, { useState, useEffect, useRef } from "react";
import PhoenixModal from "@/components/shared/PhoenixModal";
import { validateSovValues } from "@/pages/sov/importBatch";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, roundCurrency } from "../shared/formatters";

const empty = {
  project_id: "", project_name: "", application_number: 1,
  period_from: null, period_to: null, line_item_number: 1,
  description: "", scheduled_value: 0,
  previous_percent_complete: 0, current_percent_complete: 0,
  retainage_percent: 10, status: "Draft",
  submitted_date: null, payment_received_date: null,
};

/**
 * @typedef {Partial<import("@/api/client/supabaseTypes").RowWithAliases<"sov_items">>} SovFormRecord
 * @param {{
 * open: boolean, onClose: () => void,
 * onSave: (payload: Record<string, unknown>) => unknown,
 * onRecover?: (() => unknown) | null, requiresRecovery?: boolean,
 * onDelete?: (() => void) | null, isSaving?: boolean, writesDisabled?: boolean,
 * sov?: SovFormRecord | null, initialValues?: SovFormRecord | null,
 * projects?: Array<{ id: string, name?: string | null }>, nextId?: string,
 * activeProject?: { id: string, name?: string | null } | null
 * }} props
 */
export default function SOVFormModal({ open, onClose, onSave, onRecover = null, requiresRecovery = false, onDelete = null, isSaving = false, writesDisabled = false, sov, initialValues = null, projects = [], nextId, activeProject }) {
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const initializedDraft = useRef(null);
  const draftKey = sov ? `edit:${sov.id}` : `new:${activeProject?.id || ""}`;
  const busy = saving || isSaving;
  const close = () => { if (!busy) onClose(); };

  useEffect(() => {
    if (!open) { initializedDraft.current = null; return; }
    if (initializedDraft.current === draftKey) return;
    initializedDraft.current = draftKey;
    if (sov) {
      setForm({ ...empty, ...sov });
    } else {
      setForm({
        ...empty,
        ...(initialValues || {}),
        sov_id: nextId || "",
        project_id: activeProject?.id || "",
        project_name: activeProject?.name || "",
      });
    }
    setErrors({});
    setSaveError("");
    setSaving(false);
  }, [draftKey, sov, initialValues, open, nextId, activeProject?.id, activeProject?.name]);

  const validate = () => {
    const e = {};
    if (!form.project_id) e.project_id = "Required";
    if (!form.description.trim()) e.description = "Required";
    if (Number(form.scheduled_value) <= 0) e.scheduled_value = "Must be > 0";
    if (Number(form.previous_percent_complete) < 0 || Number(form.previous_percent_complete) > 100) {
      e.previous_percent_complete = "Must be between 0 and 100";
    }
    if (Number(form.current_percent_complete) < 0 || Number(form.current_percent_complete) > 100) {
      e.current_percent_complete = "Must be between 0 and 100";
    } else if (Number(form.current_percent_complete) < Number(form.previous_percent_complete)) {
      e.current_percent_complete = "Cannot be less than previous %";
    }
    // payment_received_date must not precede submitted_date
    if (form.payment_received_date && form.submitted_date) {
      if (new Date(form.payment_received_date) < new Date(form.submitted_date)) {
        e.payment_received_date = "Cannot be before Date Submitted";
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (busy || writesDisabled) return;
    setSaveError("");
    if (requiresRecovery) {
      if (!onRecover) { setSaveError("Reopen the original uncertain save recovery before creating another line."); return; }
      setSaving(true);
      try { await onRecover(); }
      catch (error) { setSaveError(toUserErrorMessage(error, "Recovery failed. Retry this same save.")); }
      finally { setSaving(false); }
      return;
    }
    if (!validate()) return;
    try { validateSovValues(form); } catch (error) { setSaveError(toUserErrorMessage(error)); return; }
    // Whitelist only editable SOV columns — never spread full record
    // (is_deleted / deleted_at / metadata / derived fields).
    const data = {
      project_id: form.project_id,
      project_name: form.project_name || "",
      application_number: Number(form.application_number) || 1,
      period_from: form.period_from || null,
      period_to: form.period_to || null,
      line_item_number: Number(form.line_item_number) || 1,
      description: form.description || "",
      scheduled_value: Number(form.scheduled_value) || 0,
      previous_percent_complete: Number(form.previous_percent_complete) || 0,
      current_percent_complete: Number(form.current_percent_complete) || 0,
      retainage_percent: Number(form.retainage_percent) || 0,
      status: form.status || "Draft",
      submitted_date: form.submitted_date || null,
      payment_received_date: form.payment_received_date || null,
    };
    if (form.sov_id) data.sov_id = form.sov_id;
    const proj = projects.find(p => p.id === form.project_id);
    if (proj) data.project_name = proj.name;
    setSaving(true);
    try {
      await onSave(data);
    } catch (error) {
      setSaveError(toUserErrorMessage(error, "The SOV line could not be saved. Your draft has been retained."));
    } finally {
      setSaving(false);
    }
  };

  const today = () => new Date().toISOString().split("T")[0];

  const set = (k, v) => {
    setForm(p => {
      const next = { ...p, [k]: v };
      // Auto-populate billing dates on status transitions (editable, not locked)
      if (k === "status") {
        if (v === "Submitted" && !next.submitted_date) {
          next.submitted_date = today();
        }
        if (v === "Paid" && !next.payment_received_date) {
          next.payment_received_date = today();
        }
      }
      return next;
    });
  };

  // Calculated fields
  const sv = Number(form.scheduled_value) || 0;
  const prevPct = Number(form.previous_percent_complete) || 0;
  const curPct = Number(form.current_percent_complete) || 0;
  const thisPeriod = roundCurrency(sv * ((curPct - prevPct) / 100));
  const toDate = roundCurrency(sv * (curPct / 100));
  const balance = roundCurrency(sv - toDate);
  const retPct = Number(form.retainage_percent) || 0;
  const retAmt = roundCurrency(toDate * (retPct / 100));
  const netToDate = roundCurrency(toDate - retAmt);

  return (
    <PhoenixModal open={open} onClose={close} title={sov ? "Edit SOV Line Item" : "New SOV Line Item"} footer={<>
      {onDelete && <Button variant="destructive" disabled={busy || writesDisabled} onClick={onDelete}>Delete line</Button>}
      <Button variant="outline" onClick={close} disabled={busy}>Cancel</Button>
      <Button onClick={handleSave} disabled={busy || writesDisabled} style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
        {busy ? "Saving…" : requiresRecovery ? "Recover saved line" : sov ? "Update" : "Create"}
      </Button>
    </>}>
      {saveError && <p role="alert" style={{ color: "var(--status-error)" }}>{saveError}</p>}
      {requiresRecovery && <p role="status">The previous save may have completed. Recover that exact save before changing this draft.</p>}
      {writesDisabled && <p role="status">Refresh complete project evidence before saving this draft.</p>}
      <fieldset disabled={busy || writesDisabled || requiresRecovery} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
          <div>
            <Label>SOV ID</Label>
            <Input
              value={form.sov_id || nextId || ""}
              placeholder="Assigned on save"
              disabled
              style={{background:"var(--bg-surface-low)"}}
            />
          </div>
          <div>
            <Label>Project *</Label>
            <Select value={form.project_id} onValueChange={v => set("project_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
              <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
            {errors.project_id && <p className="text-xs mt-1" style={{ color: "var(--status-error)" }}>{errors.project_id}</p>}
          </div>
          <div>
            <Label>Application #</Label>
            <Input type="number" value={form.application_number} onChange={e => set("application_number", e.target.value)} />
          </div>
          <div>
            <Label>Line Item #</Label>
            <Input
              type="number"
              value={sov ? form.line_item_number : ""}
              placeholder="Assigned on save"
              disabled
              style={{background:"var(--bg-surface-low)"}}
            />
          </div>
          <div>
            <Label>Period From</Label>
            <Input type="date" value={form.period_from || ""} onChange={e => set("period_from", e.target.value)} />
          </div>
          <div>
            <Label>Period To</Label>
            <Input type="date" value={form.period_to || ""} onChange={e => set("period_to", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Description *</Label>
            <Input value={form.description} onChange={e => set("description", e.target.value)} />
            {errors.description && <p className="text-xs mt-1" style={{ color: "var(--status-error)" }}>{errors.description}</p>}
          </div>
          <div>
            <Label>Scheduled Value *</Label>
            <Input type="number" value={form.scheduled_value} onChange={e => set("scheduled_value", e.target.value)} />
            {errors.scheduled_value && <p className="text-xs mt-1" style={{ color: "var(--status-error)" }}>{errors.scheduled_value}</p>}
          </div>
          <div>
            <Label>Previous % Complete</Label>
            <Input type="number" min="0" max="100" value={form.previous_percent_complete} onChange={e => set("previous_percent_complete", e.target.value)} />
            {errors.previous_percent_complete && <p className="text-xs mt-1" style={{ color: "var(--status-error)" }}>{errors.previous_percent_complete}</p>}
          </div>
          <div>
            <Label>Current % Complete</Label>
            <Input type="number" min="0" max="100" value={form.current_percent_complete} onChange={e => set("current_percent_complete", e.target.value)} />
            {errors.current_percent_complete && <p className="text-xs mt-1" style={{ color: "var(--status-error)" }}>{errors.current_percent_complete}</p>}
          </div>
          <div>
            <Label>Retainage %</Label>
            <Input type="number" value={form.retainage_percent} onChange={e => set("retainage_percent", e.target.value)} />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["Draft", "Submitted", "Certified", "Paid"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {/* ── Billing Workflow ── */}
          <div className="sm:col-span-2" style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 10, marginTop: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--accent)", textTransform: "uppercase", fontWeight: 700 }}>Billing Workflow</span>
          </div>
          <div>
            <Label>Date Submitted to GC</Label>
            <Input type="date" value={form.submitted_date || ""} onChange={e => set("submitted_date", e.target.value)} />
          </div>
          <div>
            <Label>Date Payment Received</Label>
            <Input type="date" value={form.payment_received_date || ""} onChange={e => set("payment_received_date", e.target.value)} />
            {errors.payment_received_date && <p className="text-xs mt-1" style={{ color: "var(--status-error)" }}>{errors.payment_received_date}</p>}
          </div>
          {/* DSO helper — read-only, shows days to payment or days outstanding */}
          {form.submitted_date && (
            <div className="sm:col-span-2">
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
                {form.payment_received_date
                  ? `Days to payment: ${Math.max(0, Math.round((new Date(form.payment_received_date) - new Date(form.submitted_date)) / 86400000))}`
                  : `Days outstanding: ${Math.max(0, Math.round((Date.now() - new Date(form.submitted_date)) / 86400000))}`
                }
              </span>
            </div>
          )}
          {/* Calculated fields display */}
          <div className="sm:col-span-2 rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ background: "var(--info-muted)", border: "1px solid var(--info-border)" }}>
            <div>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>This Period</p>
              <p className="text-sm font-semibold">{formatCurrency(thisPeriod)}</p>
            </div>
            <div>
              <p style={{fontFamily:"var(--font-mono)",fontSize:10,color:"var(--text-muted)"}}>To Date</p>
              <p className="text-sm font-semibold">{formatCurrency(toDate)}</p>
            </div>
            <div>
              <p style={{fontFamily:"var(--font-mono)",fontSize:10,color:"var(--text-muted)"}}>Balance to Finish</p>
              <p className="text-sm font-semibold">{formatCurrency(balance)}</p>
            </div>
            <div>
              <p style={{fontFamily:"var(--font-mono)",fontSize:10,color:"var(--text-muted)"}}>Retainage</p>
              <p className="text-sm font-semibold">{formatCurrency(retAmt)}</p>
            </div>
            <div className="sm:col-span-4">
              <p style={{fontFamily:"var(--font-mono)",fontSize:10,color:"var(--text-muted)"}}>Net to Date</p>
              <p className="text-sm font-bold" style={{ color: "var(--accent)" }}>{formatCurrency(netToDate)}</p>
            </div>
          </div>
      </fieldset>
    </PhoenixModal>
  );
}
