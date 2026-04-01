import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProjectContext } from "../components/shared/useProjectContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Pencil, Trash2, Plus } from "lucide-react";
import ProgressBar from "../components/shared/ProgressBar";
import DeleteDialog from "../components/shared/DeleteDialog";
import { formatDate } from "../components/shared/formatters";
import { toast } from "sonner";

const HORIZON_DAYS = 21;
const empty = {
  project_id: "",
  project_name: "",
  activity: "",
  phase: "Erection",
  crew: "",
  planned_start: "",
  planned_end: "",
  forecast_start: "",
  forecast_end: "",
  percent_complete: 0,
  constraints: "",
  status: "Not Started",
};

const PHASE_TONE = {
  Detailing: {
    badgeBg: "rgba(0,229,255,0.10)",
    badgeColor: "var(--phase-detailing)",
    rail: "linear-gradient(180deg, rgba(0,229,255,0.95), rgba(0,229,255,0.30))",
  },
  Fabrication: {
    badgeBg: "rgba(255,107,0,0.12)",
    badgeColor: "var(--phase-fab)",
    rail: "linear-gradient(180deg, rgba(255,107,0,0.95), rgba(255,107,0,0.30))",
  },
  Delivery: {
    badgeBg: "rgba(0,200,83,0.12)",
    badgeColor: "var(--phase-delivery)",
    rail: "linear-gradient(180deg, rgba(0,200,83,0.95), rgba(0,200,83,0.30))",
  },
  Erection: {
    badgeBg: "rgba(255,214,0,0.12)",
    badgeColor: "var(--phase-erection)",
    rail: "linear-gradient(180deg, rgba(255,214,0,0.95), rgba(255,214,0,0.30))",
  },
};

const STATUS_TONE = {
  "Not Started": { color: "var(--text-muted)", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.07)" },
  "In Progress": { color: "var(--status-info)", bg: "var(--info-muted)", border: "var(--info-border)" },
  Complete: { color: "var(--status-success)", bg: "var(--success-muted)", border: "var(--success-border)" },
  Delayed: { color: "var(--status-error)", bg: "var(--danger-muted)", border: "var(--danger-border)" },
};

function LookAheadModal({ open, onClose, onSave, item, projects, isSaving = false }) {
  const [form, setForm] = useState(empty);
  React.useEffect(() => {
    setForm(item ? { ...empty, ...item } : empty);
  }, [item, open]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const save = () => {
    if (!form.activity || !form.project_id) return;
    const proj = projects.find((p) => p.id === form.project_id);
    onSave({ ...form, project_name: proj?.name || "", percent_complete: Number(form.percent_complete) });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Edit Look-Ahead Item" : "New Look-Ahead Item"}</DialogTitle>
          <DialogDescription>
            Plan near-term steel work, crew sequencing, and constraints for the active project.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-4">
          <div className="col-span-2">
            <Label>Activity *</Label>
            <Input value={form.activity} onChange={(e) => set("activity", e.target.value)} />
          </div>
          <div>
            <Label>Project *</Label>
            <Select value={form.project_id} onValueChange={(v) => set("project_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Phase</Label>
            <Select value={form.phase} onValueChange={(v) => set("phase", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["Detailing", "Fabrication", "Delivery", "Erection"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["Not Started", "In Progress", "Complete", "Delayed"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Crew</Label>
            <Input value={form.crew} onChange={(e) => set("crew", e.target.value)} />
          </div>
          <div>
            <Label>Planned Start</Label>
            <Input type="date" value={form.planned_start} onChange={(e) => set("planned_start", e.target.value)} />
          </div>
          <div>
            <Label>Planned End</Label>
            <Input type="date" value={form.planned_end} onChange={(e) => set("planned_end", e.target.value)} />
          </div>
          <div>
            <Label>Forecast Start</Label>
            <Input type="date" value={form.forecast_start} onChange={(e) => set("forecast_start", e.target.value)} />
          </div>
          <div>
            <Label>Forecast End</Label>
            <Input type="date" value={form.forecast_end} onChange={(e) => set("forecast_end", e.target.value)} />
          </div>
          <div>
            <Label>% Complete</Label>
            <Input type="number" min="0" max="100" value={form.percent_complete} onChange={(e) => set("percent_complete", e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label>Constraints</Label>
            <Input value={form.constraints} onChange={(e) => set("constraints", e.target.value)} placeholder="Pending RFI, crane access, released drawings..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button onClick={save} disabled={isSaving} className="bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-hover)]">
            {isSaving ? (item ? "Updating..." : "Creating...") : (item ? "Update Item" : "Create Item")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayDiff(from, to) {
  return Math.round((to.setHours(0, 0, 0, 0) - from.setHours(0, 0, 0, 0)) / 86400000);
}

function formatShort(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export default function LookAheadSchedule() {
  const qc = useQueryClient();
  const { activeProject } = useProjectContext();
  const [groupBy, setGroupBy] = useState("phase");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey: ["lookahead", activeProject?.id],
    queryFn: () => activeProject?.id ? base44.entities.LookAhead.filter({ project_id: activeProject.id }, "-created_date") : [],
    enabled: !!activeProject?.id,
    initialData: [],
  });

  const projects = [activeProject].filter(Boolean);

  const createMut = useMutation({
    mutationFn: (d) => base44.entities.LookAhead.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lookahead"] });
      setModalOpen(false);
      setEditing(null);
      toast.success("Look-ahead item created");
    },
    onError: (err) => toast.error(`Failed to create look-ahead item: ${err?.message || "Unknown error"}`),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.LookAhead.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lookahead"] });
      setModalOpen(false);
      setEditing(null);
      toast.success("Look-ahead item updated");
    },
    onError: (err) => toast.error(`Failed to update look-ahead item: ${err?.message || "Unknown error"}`),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.LookAhead.delete(id),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ["lookahead"] });
      if (editing?.id === deletedId) {
        setEditing(null);
        setModalOpen(false);
      }
      setDeleteTarget(null);
      toast.success("Look-ahead item deleted");
    },
    onError: () => toast.error("Failed to delete look-ahead item"),
  });

  const handleSave = (d) => {
    if (editing) updateMut.mutate({ id: editing.id, data: d });
    else createMut.mutate(d);
  };

  const today = startOfDay(new Date());
  const horizonEnd = new Date(today);
  horizonEnd.setDate(today.getDate() + HORIZON_DAYS - 1);
  const timelineDays = useMemo(() => Array.from({ length: HORIZON_DAYS }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return date;
  }), [today]);

  const preparedItems = useMemo(() => (
    items.map((item) => {
      const plannedStart = toDate(item.planned_start) || toDate(item.forecast_start);
      const plannedEnd = toDate(item.planned_end) || toDate(item.forecast_end) || plannedStart;
      const forecastEnd = toDate(item.forecast_end) || plannedEnd;
      const endForWindow = forecastEnd || plannedEnd || plannedStart;
      const startForWindow = plannedStart || today;
      const isVisible = !!endForWindow && endForWindow >= today && startForWindow <= horizonEnd;
      const constrained = Boolean(item.constraints?.trim());
      const delayed = item.status === "Delayed" || (forecastEnd && plannedEnd && forecastEnd > plannedEnd);
      const startsSoon = plannedStart && dayDiff(new Date(today), new Date(plannedStart)) <= 3 && dayDiff(new Date(today), new Date(plannedStart)) >= 0;
      return { ...item, plannedStart, plannedEnd, forecastEnd, isVisible, constrained, delayed, startsSoon };
    }).filter((item) => item.isVisible)
  ), [items, today, horizonEnd]);

  const groupedItems = useMemo(() => {
    const groups = {};
    preparedItems.forEach((item) => {
      const key = groupBy === "phase" ? item.phase || "Unassigned" : groupBy === "crew" ? item.crew || "No Crew" : item.status || "Unknown";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: "base" }));
  }, [preparedItems, groupBy]);

  const kpis = useMemo(() => {
    const delayed = preparedItems.filter((item) => item.delayed).length;
    const constrained = preparedItems.filter((item) => item.constrained).length;
    const thisWeek = preparedItems.filter((item) => item.plannedStart && dayDiff(new Date(today), new Date(item.plannedStart)) <= 6).length;
    const complete = preparedItems.filter((item) => Number(item.percent_complete) >= 100 || item.status === "Complete").length;
    return [
      { label: "Visible Items", value: preparedItems.length, tone: "var(--accent)" },
      { label: "Starting This Week", value: thisWeek, tone: "var(--status-info)" },
      { label: "Constrained", value: constrained, tone: constrained ? "var(--status-warning)" : "var(--text-muted)" },
      { label: "Delayed / Slipping", value: delayed, tone: delayed ? "var(--status-error)" : "var(--text-muted)" },
      { label: "Complete", value: complete, tone: "var(--status-success)" },
    ];
  }, [preparedItems, today]);

  if (!activeProject?.id) {
    return (
      <div style={{ textAlign: "center", padding: "96px 24px" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
          Select a project to open the look-ahead board
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-secondary)" }}>
          The schedule board is project-scoped and now tracks a rolling 3-week field horizon.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: "100%", paddingBottom: 24 }}>
      <div className="sbp-panel">
        <div className="sbp-panel-header" style={{ alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
              3-Week Look-Ahead
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              {formatShort(today)} - {formatShort(horizonEnd)} · {activeProject.name}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-btn)", padding: 3 }}>
              {[
                { id: "phase", label: "By Phase" },
                { id: "crew", label: "By Crew" },
                { id: "status", label: "By Status" },
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => setGroupBy(option.id)}
                  style={{
                    padding: "8px 12px",
                    border: "none",
                    borderRadius: "var(--radius-btn)",
                    background: groupBy === option.id ? "var(--accent)" : "transparent",
                    color: groupBy === option.id ? "var(--on-accent)" : "var(--text-secondary)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button className="btn-ghost" onClick={refetch}>Refresh</button>
            <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true); }}>
              <Plus className="w-3.5 h-3.5" style={{ marginRight: 6 }} />
              Add Item
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 12 }}>
        {kpis.map((card) => (
          <div key={card.label} className="kpi-card">
            <div className="kpi-label">{card.label}</div>
            <div className="kpi-value" style={{ color: card.tone }}>{card.value}</div>
            <div className="kpi-sub">Rolling 21-day execution window</div>
          </div>
        ))}
      </div>

      <div className="sbp-panel" style={{ overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "220px minmax(720px, 1fr)", borderBottom: "1px solid var(--divider)", position: "sticky", top: 0, zIndex: 4, background: "var(--bg-surface-mid)" }}>
          <div style={{ padding: "12px 16px", borderRight: "1px solid var(--divider)" }}>
            <div className="sbp-panel-title">{groupBy === "phase" ? "Phase Groups" : groupBy === "crew" ? "Crew Groups" : "Status Groups"}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${HORIZON_DAYS}, minmax(36px, 1fr))` }}>
            {timelineDays.map((day) => {
              const isToday = day.toDateString() === today.toDateString();
              const isWeekend = [0, 6].includes(day.getDay());
              return (
                <div key={day.toISOString()} style={{ padding: "10px 6px", borderLeft: "1px solid var(--divider)", background: isToday ? "rgba(255,107,0,0.10)" : isWeekend ? "rgba(255,255,255,0.02)" : "transparent", textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: isToday ? "var(--accent)" : "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    {day.toLocaleDateString("en-US", { weekday: "short" })}
                  </div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginTop: 4 }}>
                    {day.getDate()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-secondary)" }}>Loading look-ahead board...</div>
        ) : groupedItems.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
              No scheduled work in the next 3 weeks
            </div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-secondary)" }}>
              Add near-term field tasks, deliveries, and detailing milestones to populate the board.
            </div>
          </div>
        ) : groupedItems.map(([groupKey, groupItems]) => (
          <div key={groupKey} style={{ display: "grid", gridTemplateColumns: "220px minmax(720px, 1fr)", borderBottom: "1px solid var(--divider)" }}>
            <div style={{ padding: "16px", borderRight: "1px solid var(--divider)", background: "var(--bg-sidebar)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{groupKey}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>{groupItems.length}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {groupItems.map((item) => {
                  const tone = STATUS_TONE[item.status] || STATUS_TONE["Not Started"];
                  return (
                    <div key={item.id} style={{ padding: "10px 12px", border: "1px solid var(--border-default)", background: item.delayed ? "rgba(213,0,0,0.08)" : "var(--bg-surface)", borderRadius: "var(--radius-card)", boxShadow: item.startsSoon ? "0 0 0 1px rgba(255,107,0,0.16)" : "none" }}>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                        {item.activity}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                        <span style={{ padding: "3px 8px", borderRadius: "var(--radius-badge)", background: PHASE_TONE[item.phase]?.badgeBg || "rgba(255,255,255,0.04)", color: PHASE_TONE[item.phase]?.badgeColor || "var(--text-secondary)", border: "1px solid rgba(255,255,255,0.08)", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                          {item.phase || "Unassigned"}
                        </span>
                        <span style={{ padding: "3px 8px", borderRadius: "var(--radius-badge)", background: tone.bg, color: tone.color, border: `1px solid ${tone.border}`, fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                          {item.status}
                        </span>
                      </div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>
                        {formatDate(item.planned_start)} - {formatDate(item.forecast_end || item.planned_end)}
                      </div>
                      <ProgressBar value={item.percent_complete || 0} max={100} height="h-1.5" color={item.delayed ? "rose" : item.status === "Complete" ? "green" : "blue"} />
                      {item.constraints && <div style={{ marginTop: 8, fontFamily: "var(--font-body)", fontSize: 11, color: "var(--status-warning)", lineHeight: 1.4 }}>{item.constraints}</div>}
                      <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                        <button className="btn-ghost" style={{ padding: "6px 10px", fontSize: 9 }} onClick={() => { setEditing(item); setModalOpen(true); }}>
                          <Pencil className="w-3 h-3" style={{ marginRight: 4 }} />
                          Edit
                        </button>
                        <button className="btn-ghost" style={{ padding: "6px 10px", fontSize: 9, color: "var(--status-error)", borderColor: "var(--danger-border)" }} onClick={() => setDeleteTarget(item)}>
                          <Trash2 className="w-3 h-3" style={{ marginRight: 4 }} />
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ overflowX: "auto", background: "var(--bg-page)" }}>
              <div style={{ minWidth: HORIZON_DAYS * 36, display: "flex", flexDirection: "column" }}>
                {groupItems.map((item) => {
                  const tone = PHASE_TONE[item.phase] || PHASE_TONE.Erection;
                  const start = item.plannedStart || item.forecastEnd || today;
                  const end = item.forecastEnd || item.plannedEnd || start;
                  const clampedStart = start < today ? new Date(today) : start;
                  const clampedEnd = end > horizonEnd ? new Date(horizonEnd) : end;
                  const startIndex = Math.max(0, dayDiff(new Date(today), new Date(clampedStart)));
                  const endIndex = Math.min(HORIZON_DAYS - 1, dayDiff(new Date(today), new Date(clampedEnd)));
                  const span = Math.max(1, endIndex - startIndex + 1);

                  return (
                    <div key={item.id} style={{ position: "relative", height: 74, borderBottom: "1px solid var(--divider)" }}>
                      <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: `repeat(${HORIZON_DAYS}, minmax(36px, 1fr))` }}>
                        {timelineDays.map((day) => <div key={day.toISOString()} style={{ borderLeft: "1px solid var(--divider)", background: [0, 6].includes(day.getDay()) ? "rgba(255,255,255,0.015)" : "transparent" }} />)}
                      </div>
                      <div style={{ position: "absolute", left: `${(startIndex / HORIZON_DAYS) * 100}%`, top: 16, width: `${(span / HORIZON_DAYS) * 100}%`, minWidth: 18, padding: "10px 10px 10px 14px", borderRadius: "var(--radius-card)", background: item.delayed ? "linear-gradient(90deg, rgba(213,0,0,0.14), rgba(255,107,0,0.10))" : "linear-gradient(90deg, rgba(17,19,22,0.96), rgba(26,28,31,0.96))", border: `1px solid ${item.delayed ? "var(--danger-border)" : "var(--border-default)"}`, boxShadow: item.startsSoon ? "0 0 0 1px rgba(255,107,0,0.25), 0 0 20px rgba(255,107,0,0.10)" : "var(--shadow-card)" }}>
                        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, borderRadius: "var(--radius-card) 0 0 var(--radius-card)", background: tone.rail }} />
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {item.activity}
                          </div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: item.delayed ? "var(--status-error)" : "var(--text-muted)" }}>{span}d</div>
                        </div>
                        <div style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)" }}>
                            {formatDate(item.planned_start)} - {formatDate(item.forecast_end || item.planned_end)}
                          </div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)" }}>{item.percent_complete || 0}%</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <LookAheadModal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} onSave={handleSave} item={editing} projects={projects} isSaving={createMut.isPending || updateMut.isPending} />

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteMut.isPending && deleteTarget?.id) deleteMut.mutate(deleteTarget.id);
        }}
        title="Delete Item"
        description={`Delete "${deleteTarget?.activity}"?`}
      />
    </div>
  );
}
