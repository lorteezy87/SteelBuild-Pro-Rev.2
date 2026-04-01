import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

const STAGES = ["Not Started", "OFA", "BFA", "OFS", "BFS", "FFF", "Released"];
function normalizeRevisionNumber(value, fallback = "0") {
  if (value == null || value === "") return fallback;
  return String(value).trim() || fallback;
}

function incrementRevisionLabel(value) {
  const current = normalizeRevisionNumber(value, "0");
  if (/^\d+$/.test(current)) return String(Number(current) + 1);
  if (/^[A-Z]$/i.test(current)) {
    const code = current.toUpperCase().charCodeAt(0);
    return code >= 65 && code < 90 ? String.fromCharCode(code + 1) : `${current}-1`;
  }
  const numericTail = current.match(/^(.*?)(\d+)$/);
  if (numericTail) {
    const [, prefix, digits] = numericTail;
    return `${prefix}${String(Number(digits) + 1).padStart(digits.length, "0")}`;
  }
  return `${current} Rev 2`;
}

const empty = {
  sheet_number: "", title: "", project_id: "", project_name: "",
  discipline: "Structural", revision_number: "0", stage: "Not Started",
  submitted_date: "", return_date: "", due_date: "",
  reviewer: "", spec_section: "", notes: "", linked_rfi_ids: "",
  priority_flag: false, override_reason: "", drawing_set_name: "",
};

export default function DrawingFormModal({ open, onClose, onSave, drawing, projects = [], nextId, activeProject }) {
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    if (drawing) {
      setForm({
        ...empty,
        ...drawing,
        project_id: drawing.project_id || activeProject?.id || "",
        project_name: drawing.project_name || activeProject?.name || "",
        submitted_date: drawing.submitted_date || "",
        return_date: drawing.return_date || "",
        due_date: drawing.due_date || "",
        linked_rfi_ids: drawing.linked_rfi_ids || "",
        notes: drawing.notes || "",
        reviewer: drawing.reviewer || "",
        spec_section: drawing.spec_section || "",
        override_reason: drawing.override_reason || "",
        priority_flag: !!drawing.priority_flag,
        drawing_set_name: drawing.drawing_set_name || "",
      });
    } else {
      setForm({
        ...empty,
        drawing_id: nextId || "",
        project_id: activeProject?.id || "",
        project_name: activeProject?.name || "",
      });
    }
    setErrors({});
  }, [drawing, open, nextId, activeProject?.id, activeProject?.name]);

  const validate = () => {
    const e = {};
    if (!form.sheet_number.trim()) e.sheet_number = "Required";
    if (!form.title.trim()) e.title = "Required";
    if (!form.project_id) e.project_id = "Required";
    if (!form.discipline) e.discipline = "Required";
    if (!form.drawing_set_name?.trim()) e.drawing_set_name = "Required";

    if (drawing && form.stage !== drawing.stage) {
      if (drawing.stage === "Released" && !form.override_reason?.trim()) {
        e.override_reason = "Released is terminal. Provide an override reason.";
      } else if (drawing.stage !== "Released") {
        const curIdx = STAGES.indexOf(drawing.stage);
        const newIdx = STAGES.indexOf(form.stage);
        if (newIdx !== curIdx + 1 && newIdx !== curIdx) {
          e.stage = `Can only advance one step. Next valid: ${STAGES[curIdx + 1] || "none"}`;
        }
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    const proj = projects.find(p => p.id === form.project_id) || activeProject;
    const data = {
      ...form,
      sheet_number: form.sheet_number.trim(),
      title: form.title.trim(),
      reviewer: form.reviewer?.trim() || "",
      spec_section: form.spec_section?.trim() || "",
      notes: form.notes?.trim() || "",
      linked_rfi_ids: form.linked_rfi_ids?.trim() || "",
      override_reason: form.override_reason?.trim() || "",
      drawing_set_name: form.drawing_set_name?.trim() || "",
      revision_number: normalizeRevisionNumber(form.revision_number),
      priority_flag: !!form.priority_flag,
      project_id: form.project_id || activeProject?.id || "",
      project_name: proj?.name || form.project_name || "",
      submitted_date: form.submitted_date || "",
      return_date: form.return_date || "",
      due_date: form.due_date || "",
    };
    // Increment rev on BFA or BFS transition (return from review)
    if (drawing && (form.stage === "BFA" || form.stage === "BFS") && drawing.stage !== form.stage) {
      data.revision_number = incrementRevisionLabel(drawing.revision_number);
    }
    onSave(data);
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const allowedStages = drawing
    ? (() => {
        const curIdx = STAGES.indexOf(drawing.stage);
        if (drawing.stage === "Released") return ["Released"];
        const next = curIdx + 1 < STAGES.length ? [STAGES[curIdx + 1]] : [];
        return [drawing.stage, ...next];
      })()
    : ["Not Started"];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{drawing ? `Edit Drawing ${drawing.sheet_number}` : "Create Drawing"}</DialogTitle>
          <DialogDescription>
            Maintain the drawing record, required metadata, set assignment, and current submittal stage.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
          <div>
            <Label>Drawing ID</Label>
            <Input value={form.drawing_id || nextId || ""} disabled className="bg-slate-50" />
          </div>
          <div>
            <Label>Sheet Number *</Label>
            <Input value={form.sheet_number} onChange={e => set("sheet_number", e.target.value)} />
            {errors.sheet_number && <p className="text-xs text-rose-500 mt-1">{errors.sheet_number}</p>}
          </div>
          <div className="sm:col-span-2">
            <Label>Title *</Label>
            <Input value={form.title} onChange={e => set("title", e.target.value)} />
            {errors.title && <p className="text-xs text-rose-500 mt-1">{errors.title}</p>}
          </div>
          <div className="sm:col-span-2">
            <Label>Drawing Set Name *</Label>
            <Input value={form.drawing_set_name} onChange={e => set("drawing_set_name", e.target.value)} placeholder="Anchor Bolts / Main Steel / Stair 1 / etc." />
            {errors.drawing_set_name && <p className="text-xs text-rose-500 mt-1">{errors.drawing_set_name}</p>}
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
            <Label>Discipline *</Label>
            <Select value={form.discipline} onValueChange={v => set("discipline", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Structural", "Arch", "MEP", "Civil", "Misc Metals"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Revision #</Label>
            <Input value={form.revision_number} onChange={e => set("revision_number", e.target.value)} placeholder="0 / A / IFC Rev 1" />
          </div>
          <div>
            <Label>Stage</Label>
            <Select value={form.stage} onValueChange={v => set("stage", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{allowedStages.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
            {errors.stage && <p className="text-xs text-rose-500 mt-1">{errors.stage}</p>}
          </div>
          {drawing?.stage === "Released" && (
            <div className="sm:col-span-2">
              <Label>Override Reason (required to change Released)</Label>
              <Input value={form.override_reason} onChange={e => set("override_reason", e.target.value)} />
              {errors.override_reason && <p className="text-xs text-rose-500 mt-1">{errors.override_reason}</p>}
            </div>
          )}
          <div>
            <Label>Submitted Date</Label>
            <Input type="date" value={form.submitted_date} onChange={e => set("submitted_date", e.target.value)} />
          </div>
          <div>
            <Label>Return Date</Label>
            <Input type="date" value={form.return_date} onChange={e => set("return_date", e.target.value)} />
          </div>
          <div>
            <Label>Due Date</Label>
            <Input type="date" value={form.due_date} onChange={e => set("due_date", e.target.value)} />
          </div>
          <div>
            <Label>Reviewer / EOR</Label>
            <Input value={form.reviewer} onChange={e => set("reviewer", e.target.value)} />
          </div>
          <div>
            <Label>Spec Section</Label>
            <Input value={form.spec_section} onChange={e => set("spec_section", e.target.value)} />
          </div>
          <div>
            <Label>Linked RFI IDs</Label>
            <Input value={form.linked_rfi_ids} onChange={e => set("linked_rfi_ids", e.target.value)} placeholder="Comma-separated" />
          </div>
          <div className="flex items-center gap-2 pt-4">
            <Checkbox checked={form.priority_flag} onCheckedChange={v => set("priority_flag", v)} />
            <Label>Priority Flag</Label>
          </div>
          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} className="bg-teal-600 hover:bg-teal-700">{drawing ? "Save Changes" : "Create Drawing"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
