import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "../shared/formatters";

const empty = {
  project_id: "", project_name: "", application_number: 1,
  period_from: "", period_to: "", line_item_number: 1,
  description: "", scheduled_value: 0,
  previous_percent_complete: 0, current_percent_complete: 0,
  retainage_percent: 10, status: "Draft",
};

export default function SOVFormModal({ open, onClose, onSave, sov, projects = [], nextId, activeProject }) {
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (sov) {
      setForm({ ...empty, ...sov });
    } else {
      setForm({
        ...empty,
        sov_id: nextId || "",
        project_id: activeProject?.id || "",
        project_name: activeProject?.name || "",
      });
    }
    setErrors({});
  }, [sov, open, nextId, activeProject?.id]);

  const validate = () => {
    const e = {};
    if (!form.project_id) e.project_id = "Required";
    if (!form.description.trim()) e.description = "Required";
    if (Number(form.scheduled_value) <= 0) e.scheduled_value = "Must be > 0";
    if (Number(form.current_percent_complete) < Number(form.previous_percent_complete)) {
      e.current_percent_complete = "Cannot be less than previous %";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    const data = {
      ...form,
      application_number: Number(form.application_number) || 1,
      line_item_number: Number(form.line_item_number) || 1,
      scheduled_value: Number(form.scheduled_value) || 0,
      previous_percent_complete: Number(form.previous_percent_complete) || 0,
      current_percent_complete: Number(form.current_percent_complete) || 0,
      retainage_percent: Number(form.retainage_percent) || 0,
    };
    const proj = projects.find(p => p.id === form.project_id);
    if (proj) data.project_name = proj.name;
    onSave(data);
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Calculated fields
  const sv = Number(form.scheduled_value) || 0;
  const prevPct = Number(form.previous_percent_complete) || 0;
  const curPct = Number(form.current_percent_complete) || 0;
  const thisPeriod = sv * ((curPct - prevPct) / 100);
  const toDate = sv * (curPct / 100);
  const balance = sv - toDate;
  const retPct = Number(form.retainage_percent) || 0;
  const retAmt = toDate * (retPct / 100);
  const netToDate = toDate - retAmt;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sov ? "Edit SOV Line Item" : "New SOV Line Item"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
          <div>
            <Label>SOV ID</Label>
            <Input value={form.sov_id || nextId || ""} disabled className="bg-slate-50" />
          </div>
          <div>
            <Label>Project *</Label>
            <Select value={form.project_id} onValueChange={v => set("project_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
              <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
            {errors.project_id && <p className="text-xs text-rose-500 mt-1">{errors.project_id}</p>}
          </div>
          <div>
            <Label>Application #</Label>
            <Input type="number" value={form.application_number} onChange={e => set("application_number", e.target.value)} />
          </div>
          <div>
            <Label>Line Item #</Label>
            <Input type="number" value={form.line_item_number} onChange={e => set("line_item_number", e.target.value)} />
          </div>
          <div>
            <Label>Period From</Label>
            <Input type="date" value={form.period_from} onChange={e => set("period_from", e.target.value)} />
          </div>
          <div>
            <Label>Period To</Label>
            <Input type="date" value={form.period_to} onChange={e => set("period_to", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Description *</Label>
            <Input value={form.description} onChange={e => set("description", e.target.value)} />
            {errors.description && <p className="text-xs text-rose-500 mt-1">{errors.description}</p>}
          </div>
          <div>
            <Label>Scheduled Value *</Label>
            <Input type="number" value={form.scheduled_value} onChange={e => set("scheduled_value", e.target.value)} />
            {errors.scheduled_value && <p className="text-xs text-rose-500 mt-1">{errors.scheduled_value}</p>}
          </div>
          <div>
            <Label>Previous % Complete</Label>
            <Input type="number" min="0" max="100" value={form.previous_percent_complete} onChange={e => set("previous_percent_complete", e.target.value)} />
          </div>
          <div>
            <Label>Current % Complete</Label>
            <Input type="number" min="0" max="100" value={form.current_percent_complete} onChange={e => set("current_percent_complete", e.target.value)} />
            {errors.current_percent_complete && <p className="text-xs text-rose-500 mt-1">{errors.current_percent_complete}</p>}
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
          {/* Calculated fields display */}
          <div className="sm:col-span-2 rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ background: "var(--info-muted)", border: "1px solid var(--info-border)" }}>
            <div>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>This Period</p>
              <p className="text-sm font-semibold">{formatCurrency(thisPeriod)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">To Date</p>
              <p className="text-sm font-semibold">{formatCurrency(toDate)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Balance to Finish</p>
              <p className="text-sm font-semibold">{formatCurrency(balance)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Retainage</p>
              <p className="text-sm font-semibold">{formatCurrency(retAmt)}</p>
            </div>
            <div className="sm:col-span-4">
              <p className="text-xs text-slate-500">Net to Date</p>
              <p className="text-sm font-bold text-blue-700">{formatCurrency(netToDate)}</p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} style={{ background: "var(--accent)", color: "#fff" }}>{sov ? "Update" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}