import React, { useState, useMemo } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProjectContext } from "../components/shared/ProjectContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Pencil, Trash2, Plus, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import DeleteDialog from "../components/shared/DeleteDialog";
import { formatDate } from "../components/shared/formatters";
import { toast } from "sonner";
import { CommandBar, KpiTile } from "@/components/design-system";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { deriveOperationalConstraints } from "@/services/constraintEngine";
import { summarizeBlockingConstraints } from "@/services/scheduleGatekeeper";

const PHASE_COLORS = {
  Detailing:   { bg: "color-mix(in srgb, var(--phase-detailing) 12%, transparent)",  color: "var(--phase-detailing)",  border: "color-mix(in srgb, var(--phase-detailing) 30%, transparent)"  },
  Fabrication: { bg: "color-mix(in srgb, var(--phase-fab) 12%, transparent)",  color: "var(--phase-fab)",  border: "color-mix(in srgb, var(--phase-fab) 30%, transparent)"  },
  Delivery:    { bg: "color-mix(in srgb, var(--phase-delivery) 12%, transparent)",  color: "var(--phase-delivery)",  border: "color-mix(in srgb, var(--phase-delivery) 30%, transparent)"  },
  Erection:    { bg: "color-mix(in srgb, var(--phase-erection) 12%, transparent)",   color: "var(--phase-erection)",   border: "color-mix(in srgb, var(--phase-erection) 30%, transparent)"   },
};

const STATUS_CONFIG = {
  "Not Started": { bg: "color-mix(in srgb, var(--text-muted) 12%, transparent)", color: "var(--text-muted)", border: "color-mix(in srgb, var(--text-muted) 30%, transparent)", icon: "○" },
  "In Progress":  { bg: "color-mix(in srgb, var(--accent) 12%, transparent)",  color: "var(--accent)",   border: "color-mix(in srgb, var(--accent) 30%, transparent)",  icon: "◑" },
  "Complete":     { bg: "color-mix(in srgb, var(--status-success) 12%, transparent)", color: "var(--status-success)",  border: "color-mix(in srgb, var(--status-success) 30%, transparent)", icon: "✓" },
  "Delayed":      { bg: "color-mix(in srgb, var(--status-warning) 15%, transparent)", color: "var(--status-warning)",  border: "color-mix(in srgb, var(--status-warning) 40%, transparent)", icon: "⚠" },
};

const empty = {
  project_id: "", project_name: "", activity: "", phase: "Erection", crew: "",
  planned_start: "", planned_end: "", forecast_start: "", forecast_end: "",
  percent_complete: 0, constraints: "", status: "Not Started",
};

function LookAheadModal({ open, onClose, onSave, item, projects, isSaving = false, blockers = [] }) {
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

function StatusLozenge({ status }) {
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

function MiniProgressBar({ value }) {
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

function ConstraintRow({ blocker, wpLabelById, critical }) {
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

function FabricationShield({ shield, wpLabelById }) {
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

export default function LookAheadSchedule() {
  const qc = useQueryClient();
  const { activeProject } = useProjectContext();
  const [groupBy, setGroupBy] = useState("Phase");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current 2-week window

  const {
    data: items = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["lookahead", activeProject?.id],
    queryFn: () => activeProject?.id
      ? entities.LookAhead.filter({ project_id: activeProject.id }, "-created_at")
      : [],
    enabled: !!activeProject?.id,
  });
  const projects = [activeProject].filter(Boolean);

  // Blocking Fabrication Shield — deterministically derive the unresolved
  // High/Critical RFI constraints for this project and surface them so a
  // planner sees what gates fabrication/delivery/erection before scheduling.
  const { data: rfis = [] } = useQuery({
    queryKey: ["lookahead-rfis", activeProject?.id],
    queryFn: () => activeProject?.id
      ? entities.RFI.filter({ project_id: activeProject.id })
      : [],
    enabled: !!activeProject?.id,
  });
  const { data: workPackages = [] } = useQuery({
    queryKey: ["lookahead-wps", activeProject?.id],
    queryFn: () => activeProject?.id
      ? entities.WorkPackage.filter({ project_id: activeProject.id })
      : [],
    enabled: !!activeProject?.id,
  });
  const rfisById = useMemo(
    () => Object.fromEntries(rfis.map((r) => [String(r.id), r])),
    [rfis],
  );
  const wpLabelById = useMemo(
    () => Object.fromEntries(workPackages.map((w) => [String(w.id), w.wp_number || w.name || String(w.id).slice(0, 8)])),
    [workPackages],
  );
  const shield = useMemo(
    () => summarizeBlockingConstraints(deriveOperationalConstraints({ rfis }, {}), { rfisById }),
    [rfis, rfisById],
  );

  const createMut = useMutation({
    mutationFn: (d) => entities.LookAhead.create(withProjectId(d, activeProject?.id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lookahead"] });
      setModalOpen(false);
      setEditing(null);
      toast.success("Look-ahead item created");
    },
    onError: (err) => {
      toast.error(`Failed to create look-ahead item: ${toUserErrorMessage(err)}`);
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => entities.LookAhead.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lookahead"] });
      setModalOpen(false);
      setEditing(null);
      toast.success("Look-ahead item updated");
    },
    onError: (err) => {
      toast.error(`Failed to update look-ahead item: ${toUserErrorMessage(err)}`);
    },
  });
  const deleteMut = useMutation({
    mutationFn: id => entities.LookAhead.delete(id),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ["lookahead"] });
      if (editing?.id === deletedId) {
        setEditing(null);
        setModalOpen(false);
      }
      setDeleteTarget(null);
      toast.success("Look-ahead item deleted");
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Failed to delete look-ahead item")),
  });
  const handleSave = (d) => { if (editing) updateMut.mutate({ id: editing.id, data: d }); else createMut.mutate(d); };

  // Compute 2-week window based on weekOffset
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() + weekOffset * 14);
  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowStart.getDate() + 14);

  const fmtWindow = (d) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  // Group items — bucket once per (groupBy, items) instead of re-filtering the
  // full list once per group key on every render (was O(groups·items) each pass
  // and produced new key/array references that defeated row memoization).
  const { groupKeys, itemsByGroup } = useMemo(() => {
    const keyOf = (i) =>
      groupBy === "Phase" ? i.phase
        : groupBy === "Project" ? i.project_name
        : (i.crew || "No Crew");
    const byGroup = new Map();
    for (const i of items) {
      const k = keyOf(i);
      if (!k) continue;
      if (!byGroup.has(k)) byGroup.set(k, []);
      byGroup.get(k).push(i);
    }
    const keys = groupBy === "Phase"
      ? ["Detailing", "Fabrication", "Delivery", "Erection"]
      : Array.from(byGroup.keys());
    return { groupKeys: keys, itemsByGroup: byGroup };
  }, [groupBy, items]);

  const getGroupItems = (key) => itemsByGroup.get(key) || [];

  const stats = useMemo(() => {
    const total = items.length;
    const inProgress = items.filter(i => i.status === "In Progress").length;
    const complete = items.filter(i => i.status === "Complete").length;
    const delayed = items.filter(i => i.status === "Delayed").length;
    const avgProgress = total > 0
      ? Math.round(items.reduce((s, i) => s + (Number(i.percent_complete) || 0), 0) / total)
      : 0;
    return { total, inProgress, complete, delayed, avgProgress };
  }, [items]);

  if (!activeProject?.id) return (
    <div className="sb-dashboard-reference-page" style={{ textAlign: "center", padding: "80px 24px" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>Select a Project</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>Use the project selector in the top right to view the 2-week look-ahead.</div>
    </div>
  );

  return (
    <div className="sb-dashboard-reference-page" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CommandBar
        eyebrow={activeProject?.project_name || "SCHEDULE"}
        title="2-Week Look-Ahead"
        count={items.length}
        unit=" · ACTIVITIES"
        subtitle={`${fmtWindow(windowStart)} – ${fmtWindow(windowEnd)}`}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 6px", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 6 }}>
          <button
            onClick={() => setWeekOffset(o => o - 1)}
            style={{ display: "flex", alignItems: "center", padding: "4px 6px", background: "transparent", border: "none", borderRadius: 4, cursor: "pointer", color: "var(--text-secondary)" }}
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: weekOffset === 0 ? "var(--text-muted)" : "var(--accent)", background: "none", border: "none", cursor: weekOffset === 0 ? "default" : "pointer", letterSpacing: "0.08em", textTransform: "uppercase", padding: "4px 8px" }}
          >
            Today
          </button>
          <button
            onClick={() => setWeekOffset(o => o + 1)}
            style={{ display: "flex", alignItems: "center", padding: "4px 6px", background: "transparent", border: "none", borderRadius: 4, cursor: "pointer", color: "var(--text-secondary)" }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <div style={{ display: "flex", border: "1px solid var(--border-default)", borderRadius: 6, overflow: "hidden" }}>
          {["Phase", "Crew", "Project"].map(g => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              style={{
                padding: "6px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                border: "none",
                borderRight: g !== "Project" ? "1px solid var(--border-default)" : "none",
                background: groupBy === g ? "var(--accent-muted)" : "transparent",
                color: groupBy === g ? "var(--accent)" : "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              {g}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setEditing(null); setModalOpen(true); }}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--accent)", color: "var(--bg-base)", border: "none", borderRadius: "var(--radius-btn)", padding: "8px 14px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--accent-hover)"}
          onMouseLeave={e => e.currentTarget.style.background = "var(--accent)"}
        >
          <Plus size={12} /> Add Item
        </button>
        <button
          onClick={refetch}
          title="Refresh"
          style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-btn)", padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", cursor: "pointer", letterSpacing: "0.06em" }}
        >
          <RefreshCw size={12} />
        </button>
      </CommandBar>

      <FabricationShield shield={shield} wpLabelById={wpLabelById} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <KpiTile compact label="Activities"   value={stats.total}       color="var(--accent)" />
        <KpiTile compact label="In Progress"  value={stats.inProgress}  color="var(--phase-fabrication)" />
        <KpiTile compact label="Complete"     value={stats.complete}    color="var(--status-success)" />
        <KpiTile compact label="Delayed"      value={stats.delayed}     color="var(--status-error)" />
        <KpiTile compact label="Avg Progress" value={`${stats.avgProgress}%`} color="var(--phase-detailing)" />
      </div>

      {/* Table */}
      <div className="sbd-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <thead>
              <tr style={{ position: "sticky", top: 0, background: "var(--bg-surface-low)", zIndex: 2, borderBottom: "2px solid var(--border-default)" }}>
                {[
                  { label: "Activity",       width: "22%" },
                  { label: "Phase",          width: "9%"  },
                  { label: "Crew",           width: "9%"  },
                  { label: "Planned Start",  width: "9%"  },
                  { label: "Planned End",    width: "9%"  },
                  { label: "Forecast End",   width: "9%"  },
                  { label: "Progress",       width: "12%" },
                  { label: "Constraints",    width: "12%" },
                  { label: "Status",         width: "11%" },
                  { label: "",               width: "8%"  },
                ].map(col => (
                  <th
                    key={col.label}
                    style={{
                      width: col.width,
                      padding: "10px 12px",
                      textAlign: "left",
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={10} style={{ padding: 24 }}>
                    <LoadingSkeleton variant="table" rows={6} />
                  </td>
                </tr>
              )}

              {!isLoading && isError && (
                <tr>
                  <td colSpan={10} style={{ padding: "48px 24px", textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>
                      Couldn’t load look-ahead items
                    </div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", marginBottom: 16 }}>
                      {toUserErrorMessage(error, "Something went wrong. Try again.")}
                    </div>
                    <button
                      type="button"
                      onClick={() => refetch()}
                      style={{
                        background: "transparent",
                        color: "var(--accent)",
                        border: "1px solid var(--accent)",
                        borderRadius: "var(--radius-btn)",
                        padding: "8px 14px",
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: "pointer",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      Retry
                    </button>
                  </td>
                </tr>
              )}

              {!isLoading && !isError && items.length === 0 && (
                <tr>
                  <td colSpan={10}>
                    <div style={{ padding: "64px 24px", textAlign: "center" }}>
                      <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>No Look-Ahead Items</div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>
                        Start tracking upcoming work for this 2-week window.
                      </div>
                      <button
                        onClick={() => { setEditing(null); setModalOpen(true); }}
                        style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: "var(--radius-btn)", padding: "10px 20px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}
                      >
                        + Add First Look-Ahead Item
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading && !isError && groupKeys.map(key => {
                const grpItems = getGroupItems(key);
                if (grpItems.length === 0) return null;
                const phaseCfg = PHASE_COLORS[key];
                return (
                  <React.Fragment key={key}>
                    {/* Group header row */}
                    <tr style={{ background: "var(--bg-surface-low)" }}>
                      <td colSpan={10} style={{ padding: "7px 12px" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          background: phaseCfg?.bg || "color-mix(in srgb, var(--text-muted) 12%, transparent)",
                          color: phaseCfg?.color || "var(--text-muted)",
                          border: `1px solid ${phaseCfg?.border || "color-mix(in srgb, var(--text-muted) 30%, transparent)"}`,
                          borderRadius: 6, padding: "2px 10px",
                          fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                          textTransform: "uppercase", letterSpacing: "0.08em",
                        }}>
                          {key}
                          <span style={{ opacity: 0.6, fontSize: 9 }}>· {grpItems.length}</span>
                        </span>
                      </td>
                    </tr>
                    {grpItems.map((item, idx) => {
                      const isDelayed = item.status === "Delayed";
                      const forecastLate = item.forecast_end && item.planned_end && item.forecast_end > item.planned_end;
                      return (
                        <tr
                          key={item.id}
                          onClick={() => { setEditing(item); setModalOpen(true); }}
                          style={{
                            cursor: "pointer",
                            background: isDelayed ? "color-mix(in srgb, var(--status-warning) 4%, transparent)" : idx % 2 === 0 ? "var(--bg-surface)" : "var(--bg-surface-low)",
                            borderBottom: "1px solid var(--divider)",
                            transition: "background 0.12s",
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = "var(--hover-bg)"}
                          onMouseLeave={e => e.currentTarget.style.background = isDelayed ? "color-mix(in srgb, var(--status-warning) 4%, transparent)" : idx % 2 === 0 ? "var(--bg-surface)" : "var(--bg-surface-low)"}
                        >
                          <td style={{ padding: "10px 12px", fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>
                            {item.activity}
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            {item.phase && (
                              <span style={{
                                background: PHASE_COLORS[item.phase]?.bg || "color-mix(in srgb, var(--text-muted) 10%, transparent)",
                                color: PHASE_COLORS[item.phase]?.color || "var(--text-muted)",
                                fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                                borderRadius: 4, padding: "2px 6px", textTransform: "uppercase", letterSpacing: "0.06em",
                              }}>{item.phase}</span>
                            )}
                          </td>
                          <td style={{ padding: "10px 12px", fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)" }}>
                            {item.crew || "—"}
                          </td>
                          <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                            {formatDate(item.planned_start) || "—"}
                          </td>
                          <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                            {formatDate(item.planned_end) || "—"}
                          </td>
                          <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: forecastLate ? 700 : 400, color: forecastLate ? "var(--status-error)" : "var(--text-muted)" }}>
                            {formatDate(item.forecast_end) || "—"}
                            {forecastLate && <span style={{ marginLeft: 4, fontSize: 9 }}>⚠</span>}
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <MiniProgressBar value={item.percent_complete} />
                          </td>
                          <td style={{ padding: "10px 12px", fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {item.constraints || "—"}
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <StatusLozenge status={item.status} />
                          </td>
                          <td style={{ padding: "10px 12px" }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button
                                onClick={() => { setEditing(item); setModalOpen(true); }}
                                style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid var(--border-default)", borderRadius: 6, color: "var(--text-muted)", cursor: "pointer" }}
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                onClick={() => setDeleteTarget(item)}
                                style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid color-mix(in srgb, var(--status-error) 30%, transparent)", borderRadius: 6, color: "var(--status-error)", cursor: "pointer" }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <LookAheadModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
        item={editing}
        projects={projects}
        isSaving={createMut.isPending || updateMut.isPending}
        blockers={shield.blockers}
      />
      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (!deleteMut.isPending && deleteTarget?.id) deleteMut.mutate(deleteTarget.id); }}
        title="Delete Item"
        description={`Delete "${deleteTarget?.activity}"?`}
      />
    </div>
  );
}
