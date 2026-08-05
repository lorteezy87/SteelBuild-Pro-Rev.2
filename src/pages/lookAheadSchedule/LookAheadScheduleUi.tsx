/**
 * Presentational UI for Look-Ahead Schedule.
 */
// @ts-nocheck
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle, ShieldAlert } from "lucide-react";

export const PHASE_COLORS = {
  Detailing:   { bg: "color-mix(in srgb, var(--phase-detailing) 12%, transparent)",  color: "var(--phase-detailing)",  border: "color-mix(in srgb, var(--phase-detailing) 30%, transparent)"  },
  Fabrication: { bg: "color-mix(in srgb, var(--phase-fab) 12%, transparent)",  color: "var(--phase-fab)",  border: "color-mix(in srgb, var(--phase-fab) 30%, transparent)"  },
  Delivery:    { bg: "color-mix(in srgb, var(--phase-delivery) 12%, transparent)",  color: "var(--phase-delivery)",  border: "color-mix(in srgb, var(--phase-delivery) 30%, transparent)"  },
  Erection:    { bg: "color-mix(in srgb, var(--phase-erection) 12%, transparent)",   color: "var(--phase-erection)",   border: "color-mix(in srgb, var(--phase-erection) 30%, transparent)"   },
};

export const STATUS_CONFIG = {
  "Not Started": { bg: "color-mix(in srgb, var(--text-muted) 12%, transparent)", color: "var(--text-muted)", border: "color-mix(in srgb, var(--text-muted) 30%, transparent)", icon: "○" },
  "In Progress":  { bg: "color-mix(in srgb, var(--accent) 12%, transparent)",  color: "var(--accent)",   border: "color-mix(in srgb, var(--accent) 30%, transparent)",  icon: "◑" },
  "Complete":     { bg: "color-mix(in srgb, var(--status-success) 12%, transparent)", color: "var(--status-success)",  border: "color-mix(in srgb, var(--status-success) 30%, transparent)", icon: "✓" },
  "Delayed":      { bg: "color-mix(in srgb, var(--status-warning) 15%, transparent)", color: "var(--status-warning)",  border: "color-mix(in srgb, var(--status-warning) 40%, transparent)", icon: "⚠" },
};

export const empty = {
  project_id: "", project_name: "", activity: "", phase: "Erection", crew: "",
  planned_start: "", planned_end: "", forecast_start: "", forecast_end: "",
  percent_complete: 0, constraints: "", status: "Not Started",
};

export function LookAheadModal({ open, onClose, onSave, item, projects, isSaving = false, blockers = [] }) {
  const [form, setForm] = useState(empty);
  const [acknowledged, setAcknowledged] = useState(false);
  React.useEffect(() => { setForm(item ? { ...empty, ...item } : empty); setAcknowledged(false); }, [item, open]);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const save = () => {
    if (!form.activity || !form.project_id) return;
    const proj = projects.find(p => p.id === form.project_id);
    onSave({ ...form, project_name: proj?.name || "", percent_complete: Number(form.percent_complete) });
  };
  const hasBlockers = blockers.length > 0;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{item ? "Edit Look-Ahead Item" : "New Look-Ahead Item"}</DialogTitle></DialogHeader>
        {hasBlockers && (
          <div style={{
            display: "flex", gap: 10, alignItems: "flex-start",
            background: "color-mix(in srgb, var(--status-error) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--status-error) 40%, transparent)",
            borderRadius: 8, padding: "10px 12px", marginTop: 4,
          }}>
            <ShieldAlert size={16} style={{ color: "var(--status-error)", flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--status-error)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {blockers.length} critical RFI {blockers.length === 1 ? "constraint" : "constraints"} active on this project
              </div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.5 }}>
                Confirm this work does not depend on unresolved information before scheduling it. Blocking:{" "}
                {blockers.slice(0, 3).map((b) => `RFI ${b.rfiNumber || b.sourceRef || "?"}`).join(", ")}
                {blockers.length > 3 ? ` +${blockers.length - 3} more` : ""}.
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)" }}>
                <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
                I confirm this activity is not blocked by the constraints above.
              </label>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4 py-4">
          <div className="col-span-2">
            <Label>Activity *</Label>
            <Input
              autoFocus
              value={form.activity}
              onChange={e => set("activity", e.target.value)}
              placeholder="e.g., Erect columns at Grid A-4"
            />
          </div>
          <div>
            <Label>Project *</Label>
            <Select value={form.project_id} onValueChange={v => set("project_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Phase</Label>
            <Select value={form.phase} onValueChange={v => set("phase", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["Detailing","Fabrication","Delivery","Erection"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["Not Started","In Progress","Complete","Delayed"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Crew</Label><Input value={form.crew} onChange={e => set("crew", e.target.value)} /></div>
          <div><Label>Planned Start</Label><Input type="date" value={form.planned_start} onChange={e => set("planned_start", e.target.value)} /></div>
          <div><Label>Planned End</Label><Input type="date" value={form.planned_end} onChange={e => set("planned_end", e.target.value)} /></div>
          <div><Label>Forecast Start</Label><Input type="date" value={form.forecast_start} onChange={e => set("forecast_start", e.target.value)} /></div>
          <div><Label>Forecast End</Label><Input type="date" value={form.forecast_end} onChange={e => set("forecast_end", e.target.value)} /></div>
          <div><Label>% Complete</Label><Input type="number" min="0" max="100" value={form.percent_complete} onChange={e => set("percent_complete", e.target.value)} /></div>
          <div className="col-span-2">
            <Label>Constraints</Label>
            <Input value={form.constraints} onChange={e => set("constraints", e.target.value)} placeholder="e.g. Pending RFI-005, material delay" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button onClick={save} disabled={isSaving || (hasBlockers && !acknowledged)} className="bg-slate-900 hover:bg-slate-800">
            {isSaving ? (item ? "Updating..." : "Creating...") : (item ? "Update" : "Create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StatusLozenge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG["Not Started"];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
      borderRadius: 6, padding: "3px 8px",
      fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
      textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap",
    }}>
      <span style={{ fontSize: 10 }}>{cfg.icon}</span>
      {status}
    </span>
  );
}

export function MiniProgressBar({ value }) {
  const pct = Math.min(100, Math.max(0, value || 0));
  const color = pct >= 100 ? "var(--status-success)" : pct >= 50 ? "var(--accent)" : "var(--status-warning)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 5, background: "var(--bg-surface-low)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", minWidth: 28, textAlign: "right" }}>
        {pct}%
      </span>
    </div>
  );
}

export function ConstraintRow({ blocker, wpLabelById, critical }) {
  const accent = critical ? "var(--status-error)" : "var(--status-warning)";
  const wpLabel = blocker.workPackageId
    ? (wpLabelById[blocker.workPackageId] || String(blocker.workPackageId).slice(0, 8))
    : null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      padding: "6px 0", borderTop: "1px solid var(--divider)",
    }}>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: accent,
        border: `1px solid ${accent}`, borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap",
      }}>
        {critical ? "CRITICAL" : "HIGH"}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
        RFI {blocker.rfiNumber || (blocker.sourceRef ? blocker.sourceRef.replace(/^RFI[\s#-]*/i, "") : "?")}
      </span>
      <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)", flex: 1, minWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {blocker.title}
      </span>
      {blocker.ballInCourt && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
          BIC: {blocker.ballInCourt}
        </span>
      )}
      {wpLabel && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
          {wpLabel}
        </span>
      )}
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 9, whiteSpace: "nowrap",
        color: blocker.overdue ? "var(--status-error)" : "var(--text-muted)",
        fontWeight: blocker.overdue ? 700 : 400,
      }}>
        {blocker.dueDate ? `Due ${blocker.dueDate}${blocker.overdue ? " · OVERDUE" : ""}` : "No due date"}
      </span>
    </div>
  );
}

export function FabricationShield({ shield, wpLabelById }) {
  if (!shield || shield.state === "clear") return null;
  const blocked = shield.state === "blocked";
  const accent = blocked ? "var(--status-error)" : "var(--status-warning)";
  const tint = blocked ? "color-mix(in srgb, var(--status-error) 8%, transparent)" : "color-mix(in srgb, var(--status-warning) 8%, transparent)";
  return (
    <div style={{ background: tint, border: `1px solid ${accent}`, borderRadius: 10, padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {blocked ? <ShieldAlert size={16} style={{ color: accent }} /> : <AlertTriangle size={16} style={{ color: accent }} />}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Blocking Fabrication Shield
        </span>
        <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)" }}>
          {shield.blockers.length} critical · {shield.warnings.length} high — unresolved RFIs that gate fabrication/delivery/erection
        </span>
      </div>
      <div style={{ marginTop: 8 }}>
        {shield.blockers.map((b) => <ConstraintRow key={b.constraintId || b.sourceRef} blocker={b} wpLabelById={wpLabelById} critical />)}
        {shield.warnings.map((b) => <ConstraintRow key={b.constraintId || b.sourceRef} blocker={b} wpLabelById={wpLabelById} critical={false} />)}
      </div>
    </div>
  );
}

