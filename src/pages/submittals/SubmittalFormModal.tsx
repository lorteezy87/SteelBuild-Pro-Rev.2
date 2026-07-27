import { useRef, useState } from "react";
import type { ComponentType } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./uiCompat";
import AutoLinkSuggestions from "@/components/shared/AutoLinkSuggestions";
import DrawingSetSelectorRaw from "@/components/submittals/DrawingSetSelector";
import { STATUSES, TYPES, BIC_CHOICES } from "./format";
import { DRAWING_TYPES, type DrawingType } from "@/lib/submittalComponents";
import type { DrawingSet, Submittal } from "./types";

// DrawingSetSelector is still .jsx, so TS infers its array props from `[]`
// default params as `never[]`; cast at the boundary (removable once it is
// typed) so the typed parent can pass real arrays. Runtime is unchanged.
const DrawingSetSelector = DrawingSetSelectorRaw as unknown as ComponentType<Record<string, any>>;

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
  /**
   * Phase 3 splitting (flag `submittal_splitting`): when creating a CHILD via
   * "Spin off child", the parent submittal being split. Non-null only in the
   * spin-off flow; drives the "Spin off from …" title, the split-reason field,
   * and the `parent_submittal_id` / `split_reason` carried in the record. The
   * parent's project + drawing sets are prefilled into `initial` by the caller.
   */
  parentSubmittal?: Submittal | null;
  /**
   * Phase 4 per-drawing-type (flag `submittal_drawing_types`): when true, show a
   * Shop/Erection/Part multiselect. Selected types are emitted on the record as
   * `drawing_types` so the caller can create the component rows after insert.
   * Default false — the picker is hidden and no `drawing_types` key is emitted.
   */
  drawingTypesEnabled?: boolean;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (record: Record<string, any>) => void | Promise<void>;
}

export default function SubmittalFormModal({ open, initial, projectId, projectName, availableSets = [], allDrawings = [], allRfis = [], existingNumbers, parentSubmittal = null, drawingTypesEnabled = false, saving = false, onClose, onSubmit }: SubmittalFormModalProps) {
  // Only treat this as a spin-off when creating a NEW submittal from a parent —
  // never when editing an existing row (even a child row keeps its lineage via
  // its own parent_submittal_id, edited through the normal path, not re-split).
  const isSplit = !!parentSubmittal && !initial.id;
  const [splitReason, setSplitReason] = useState<string>(initial.split_reason || "");
  // Phase 4: which drawing types to start tracking on this submittal. Only used
  // on CREATE (an edit manages component rows through the detail panel instead).
  const [drawingTypes, setDrawingTypes] = useState<DrawingType[]>([]);
  const toggleDrawingType = (t: DrawingType) =>
    setDrawingTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
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
  const submitInFlight = useRef(false);

  const handleSubmit = async () => {
    if (saving || submitInFlight.current) return;
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
    const record: Record<string, any> = {
      ...form,
      project_id:    projectId,
      project_name:  projectName,
      round_number:  Number(form.round_number) || 1,
      submitted_date: form.submitted_date || null,
      required_date:  form.required_date  || null,
    };
    // Phase 3 splitting: on a spin-off, stamp the parent link + reason so the
    // new child's lineage is set at create time. Not a spin-off ⇒ these keys
    // are omitted entirely (a plain create is byte-identical to today).
    if (isSplit && parentSubmittal?.id) {
      record.parent_submittal_id = parentSubmittal.id;
      record.split_reason = splitReason.trim() || null;
    }
    // Phase 4: on CREATE, hand the caller the chosen drawing types so it can
    // create the component rows after the submittal insert. Omitted on edit and
    // when the flag is off (never emitted empty ⇒ plain create is unchanged).
    if (drawingTypesEnabled && !isEdit && drawingTypes.length > 0) {
      record.drawing_types = drawingTypes;
    }
    submitInFlight.current = true;
    try {
      await onSubmit(record);
    } finally {
      submitInFlight.current = false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>
            {isSplit
              ? `Spin off from "${parentSubmittal?.submittal_number || parentSubmittal?.title || "parent"}"`
              : isEdit ? "Edit Submittal" : "New Submittal"}
          </DialogTitle>
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
          {isSplit && (
            <div style={{ gridColumn: "1 / span 2" }}>
              <Label>Why is it being split off?</Label>
              <Input
                value={splitReason}
                onChange={(e) => setSplitReason(e.target.value)}
                placeholder="e.g. Gate Posts — field-verify before release"
              />
              <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                Shown on the parent's lineage. The parent's project + drawing sets are carried over.
              </div>
            </div>
          )}
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
          {/* Phase 4: which drawing types to track independently (Shop/Erection/
              Part). Create-only + flag-gated. Each selected type gets its own
              received + release tracking in the detail panel after creation. */}
          {drawingTypesEnabled && !isEdit && (
            <div style={{ gridColumn: "1 / span 2" }}>
              <Label>Drawing types to track</Label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                {DRAWING_TYPES.map((t) => {
                  const on = drawingTypes.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleDrawingType(t)}
                      aria-pressed={on}
                      style={{
                        padding: "4px 12px", borderRadius: 3, cursor: "pointer",
                        fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                        border: on ? "1px solid var(--accent)" : "1px solid var(--border-default)",
                        background: on ? "var(--accent-muted)" : "transparent",
                        color: on ? "var(--accent)" : "var(--text-muted)",
                      }}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
              <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                Optional — each type gets its own received + released-for-fab dates. You can also add these later from the detail panel.
              </div>
            </div>
          )}
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
            disabled={saving}
            style={{ padding: "8px 14px", background: "transparent", border: "1px solid var(--border-default)", borderRadius: 4, color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: "0.06em" }}
          >
            CANCEL
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{ padding: "8px 14px", background: "var(--accent)", color: "var(--on-accent)", border: "none", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: "0.06em" }}
          >
            {saving ? "SAVING..." : isSplit ? "CREATE CHILD" : isEdit ? "SAVE" : "CREATE"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
