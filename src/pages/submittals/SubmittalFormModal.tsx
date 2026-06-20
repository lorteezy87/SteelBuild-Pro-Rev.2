import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./uiCompat";
import AutoLinkSuggestions from "@/components/shared/AutoLinkSuggestions";
import DrawingSetSelector from "@/components/submittals/DrawingSetSelector";
import { STATUSES, TYPES, BIC_CHOICES } from "./format";
import type { DrawingSet, Submittal } from "./types";

interface SubmittalFormModalProps {
  open: boolean;
  initial: Submittal;
  projectId?: string;
  projectName?: string;
  availableSets?: DrawingSet[];
  allDrawings?: any[];
  allRfis?: any[];
  /** Submittal numbers already used in this project (excluding the row being
   *  edited) — used to block a duplicate before it 409s on the unique index. */
  existingNumbers?: Set<string>;
  onClose: () => void;
  onSubmit: (record: Record<string, any>) => void | Promise<void>;
}

export default function SubmittalFormModal({ open, initial, projectId, projectName, availableSets = [], allDrawings = [], allRfis = [], existingNumbers, onClose, onSubmit }: SubmittalFormModalProps) {
  const [form, setForm] = useState({
    submittal_number: initial.submittal_number || "",
    title:            initial.title            || "",
    submittal_type:   initial.submittal_type   || "Shop Drawing",
    discipline:       initial.discipline       || "",
    spec_section:     initial.spec_section     || "",
    revision:         initial.revision         || "0",
    round_number:     initial.round_number     || 1,
    submitted_date:   initial.submitted_date   || "",
    required_date:    initial.required_date    || "",
    status:           initial.status           || "Draft",
    ball_in_court:    initial.ball_in_court    || "EOR",
    submitted_by:     initial.submitted_by     || "",
    reviewer:         initial.reviewer         || "",
    notes:            initial.notes            || "",
    drawing_set_ids:  Array.isArray(initial.drawing_set_ids) ? initial.drawing_set_ids : [],
  });

  const setField = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));
  const isEdit = !!initial.id;

  const handleSubmit = async () => {
    const number = form.submittal_number.trim();
    if (!number || !form.title.trim()) {
      toast.error("Submittal number + title are required");
      return;
    }
    // Block a duplicate up front (the DB enforces unique (project_id,
    // submittal_number); without this the user gets a raw 409). The set the
    // parent passes already excludes the row being edited, so re-saving an
    // edit with its own number is fine.
    if (existingNumbers?.has(number)) {
      toast.error(`Submittal # "${number}" already exists in this project — use a different number.`);
      return;
    }
    const record = {
      ...form,
      project_id:    projectId,
      project_name:  projectName,
      round_number:  Number(form.round_number) || 1,
      submitted_date: form.submitted_date || null,
      required_date:  form.required_date  || null,
    };
    await onSubmit(record);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Submittal" : "New Submittal"}</DialogTitle>
        </DialogHeader>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
          <div style={{ gridColumn: "1 / span 1" }}>
            <Label>Submittal # *</Label>
            <Input value={form.submittal_number} onChange={(e) => setField("submittal_number", e.target.value)} placeholder="e.g. 05-1000" />
          </div>
          <div>
            <Label>Revision</Label>
            <Input value={form.revision} onChange={(e) => setField("revision", e.target.value)} placeholder="0" />
          </div>
          <div style={{ gridColumn: "1 / span 2" }}>
            <Label>Title *</Label>
            <Input value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="Structural steel shop drawings - Area A" />
          </div>
          <div style={{ gridColumn: "1 / span 2" }}>
            <AutoLinkSuggestions
              entity={form}
              sources={{ drawings: allDrawings, workPackages: [], rfis: allRfis }}
              onLink={(suggestion) => {
                if (suggestion.type === "drawing") {
                  const drawing = suggestion.matchedEntity;
                  if (drawing?.drawing_set_id && !form.drawing_set_ids.includes(drawing.drawing_set_id)) {
                    setField("drawing_set_ids", [...form.drawing_set_ids, drawing.drawing_set_id]);
                  }
                }
              }}
            />
          </div>
          <div style={{ gridColumn: "1 / span 2" }}>
            <Label>Linked Drawing Sets</Label>
            <DrawingSetSelector
              value={form.drawing_set_ids}
              onChange={(next) => setField("drawing_set_ids", next)}
              availableSets={availableSets}
            />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={form.submittal_type} onValueChange={(v) => setField("submittal_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Discipline</Label>
            <Input value={form.discipline} onChange={(e) => setField("discipline", e.target.value)} placeholder="Structural" />
          </div>
          <div>
            <Label>Spec Section</Label>
            <Input value={form.spec_section} onChange={(e) => setField("spec_section", e.target.value)} placeholder="051200" />
          </div>
          <div>
            <Label>Round</Label>
            <Input type="number" min="1" value={form.round_number} onChange={(e) => setField("round_number", e.target.value)} />
          </div>
          <div>
            <Label>Submitted Date</Label>
            <Input type="date" value={form.submitted_date} onChange={(e) => setField("submitted_date", e.target.value)} />
          </div>
          <div>
            <Label>Required Date</Label>
            <Input type="date" value={form.required_date} onChange={(e) => setField("required_date", e.target.value)} />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setField("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ball-in-court</Label>
            <Select value={form.ball_in_court} onValueChange={(v) => setField("ball_in_court", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BIC_CHOICES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Submitted By</Label>
            <Input value={form.submitted_by} onChange={(e) => setField("submitted_by", e.target.value)} placeholder="Detailer / fabricator" />
          </div>
          <div>
            <Label>Reviewer</Label>
            <Input value={form.reviewer} onChange={(e) => setField("reviewer", e.target.value)} placeholder="EOR / Architect" />
          </div>
          <div style={{ gridColumn: "1 / span 2" }}>
            <Label>Notes</Label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder="Transmittal scope, cover letter text, known issues…"
              style={{ width: "100%", padding: "8px 10px", fontSize: 12, fontFamily: "var(--font-body)", borderRadius: 4, resize: "vertical" }}
            />
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={onClose}
            style={{ padding: "8px 14px", background: "transparent", border: "1px solid var(--border-default)", borderRadius: 4, color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: "0.06em" }}
          >
            CANCEL
          </button>
          <button
            onClick={handleSubmit}
            style={{ padding: "8px 14px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: "0.06em" }}
          >
            {isEdit ? "SAVE" : "CREATE"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
