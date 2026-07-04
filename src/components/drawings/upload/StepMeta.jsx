import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { DISCIPLINES, STAGES } from "./uploadWizardConstants";

// ─── Step 1: Set Name + optional defaults (BEFORE file selection) ─────
// The only required field is the Drawing Set Name. All other fields are
// defaults that get applied per-sheet unless the AI extraction finds
// something better (or the user edits the child rows on the review step).
export default function StepMeta({ meta, setMeta, onBack, onNext, projectName, existingSetNames = [] }) {
  const set = (k, v) => setMeta(p => ({ ...p, [k]: v }));
  const trimmedName = (meta.setName || "").trim();
  const canContinue = trimmedName.length > 0;
  const duplicate = canContinue && existingSetNames
    .map(s => s.toLowerCase())
    .includes(trimmedName.toLowerCase());

  return (
    <div>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.5 }}>
        Name this drawing package. You can adjust individual sheet details after
        the AI reads your files.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <Label>Project</Label>
          <Input value={projectName || "No project selected"} disabled />
        </div>

        <div style={{ gridColumn: "1 / -1" }}>
          <Label>
            Drawing Set Name <span style={{ color: "var(--status-error)" }}>*</span>
          </Label>
          <Input
            autoFocus
            placeholder="e.g. 100% CD Set — Rev 2"
            value={meta.setName}
            onChange={e => set("setName", e.target.value)}
            list="existing-set-names"
          />
          {existingSetNames.length > 0 && (
            <datalist id="existing-set-names">
              {existingSetNames.map(n => <option key={n} value={n} />)}
            </datalist>
          )}
          {duplicate && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-warning)", marginTop: 4, letterSpacing: "0.06em" }}>
              ⚠ A set with this name already exists in this project — new sheets will be added to it.
            </div>
          )}
        </div>

        <div>
          <Label>Drawing Set # (optional)</Label>
          <Input placeholder="e.g. 1 / 02 / P-03" value={meta.setNumber || ""} onChange={e => set("setNumber", e.target.value)} />
        </div>

        <div>
          <Label>Default Discipline (optional)</Label>
          <Select value={meta.discipline} onValueChange={v => set("discipline", v)}>
            <SelectTrigger><SelectValue placeholder="Structural" /></SelectTrigger>
            <SelectContent>{DISCIPLINES.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div>
          <Label>Default Stage (optional)</Label>
          <Select value={meta.defaultStage} onValueChange={v => set("defaultStage", v)}>
            <SelectTrigger><SelectValue placeholder="Not Started" /></SelectTrigger>
            <SelectContent>{STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div>
          <Label>Revision / Issuance (optional)</Label>
          <Input placeholder="Rev 2 / IFC / IFB" value={meta.revision} onChange={e => set("revision", e.target.value)} />
        </div>

        <div>
          <Label>Issue Date (optional)</Label>
          <Input type="date" value={meta.issueDate} onChange={e => set("issueDate", e.target.value)} />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Button variant="outline" onClick={onBack}><ChevronLeft style={{ width: 14, height: 14, marginRight: 4 }} /> Back</Button>
        <Button onClick={onNext} disabled={!canContinue}
          style={{ background: "var(--accent)", color: "#fff", border: "none", opacity: canContinue ? 1 : 0.5 }}>
          Next: Add Files <ChevronRight style={{ width: 14, height: 14, marginLeft: 4 }} />
        </Button>
      </div>
    </div>
  );
}
