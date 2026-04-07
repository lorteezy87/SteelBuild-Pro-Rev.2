import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProjectContext } from "../components/shared/useProjectContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Trash2, Plus, ChevronLeft, ChevronRight, RefreshCw, Calendar } from "lucide-react";
import DeleteDialog from "../components/shared/DeleteDialog";
import { formatDate } from "../components/shared/formatters";
import { toast } from "sonner";

const PHASE_COLORS = {
  Detailing:   { bg: "rgba(99,102,241,0.12)",  color: "rgb(99,102,241)",  border: "rgba(99,102,241,0.3)"  },
  Fabrication: { bg: "rgba(245,158,11,0.12)",  color: "rgb(245,158,11)",  border: "rgba(245,158,11,0.3)"  },
  Delivery:    { bg: "rgba(16,185,129,0.12)",  color: "rgb(16,185,129)",  border: "rgba(16,185,129,0.3)"  },
  Erection:    { bg: "rgba(239,68,68,0.12)",   color: "rgb(239,68,68)",   border: "rgba(239,68,68,0.3)"   },
};

const STATUS_CONFIG = {
  "Not Started": { bg: "rgba(100,116,139,0.12)", color: "rgb(100,116,139)", border: "rgba(100,116,139,0.3)", icon: "○" },
  "In Progress":  { bg: "rgba(37,99,235,0.12)",  color: "rgb(37,99,235)",   border: "rgba(37,99,235,0.3)",  icon: "◑" },
  "Complete":     { bg: "rgba(16,185,129,0.12)", color: "rgb(16,185,129)",  border: "rgba(16,185,129,0.3)", icon: "✓" },
  "Delayed":      { bg: "rgba(245,158,11,0.15)", color: "rgb(245,158,11)",  border: "rgba(245,158,11,0.4)", icon: "⚠" },
};

const empty = {
  project_id: "", project_name: "", activity: "", phase: "Erection", crew: "",
  planned_start: "", planned_end: "", forecast_start: "", forecast_end: "",
  percent_complete: 0, constraints: "", status: "Not Started",
};

function LookAheadModal({ open, onClose, onSave, item, projects, isSaving = false }) {
  const [form, setForm] = useState(empty);
  React.useEffect(() => { setForm(item ? { ...empty, ...item } : empty); }, [item, open]);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const save = () => {
    if (!form.activity || !form.project_id) return;
    const proj = projects.find(p => p.id === form.project_id);
    onSave({ ...form, project_name: proj?.name || "", percent_complete: Number(form.percent_complete) });
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{item ? "Edit Look-Ahead Item" : "New Look-Ahead Item"}</DialogTitle></DialogHeader>
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
          <Button onClick={save} disabled={isSaving} className="bg-slate-900 hover:bg-slate-800">
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

export default function LookAheadSchedule() {
  const qc = useQueryClient();
  const { activeProject } = useProjectContext();
  const [groupBy, setGroupBy] = useState("Phase");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current 2-week window

  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey: ["lookahead", activeProject?.id],
    queryFn: () => activeProject?.id
      ? base44.entities.LookAhead.filter({ project_id: activeProject.id }, "-created_date")
      : [],
    enabled: !!activeProject?.id,
  });
  const projects = [activeProject].filter(Boolean);

  const createMut = useMutation({
    mutationFn: d => base44.entities.LookAhead.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lookahead"] });
      setModalOpen(false);
      setEditing(null);
      toast.success("Look-ahead item created");
    },
    onError: (err) => {
      toast.error(`Failed to create look-ahead item: ${err?.message || "Unknown error"}`);
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.LookAhead.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lookahead"] });
      setModalOpen(false);
      setEditing(null);
      toast.success("Look-ahead item updated");
    },
    onError: (err) => {
      toast.error(`Failed to update look-ahead item: ${err?.message || "Unknown error"}`);
    },
  });
  const deleteMut = useMutation({
    mutationFn: id => base44.entities.LookAhead.delete(id),
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
  const handleSave = (d) => { if (editing) updateMut.mutate({ id: editing.id, data: d }); else createMut.mutate(d); };

  // Compute 2-week window based on weekOffset
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() + weekOffset * 14);
  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowStart.getDate() + 14);

  const fmtWindow = (d) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  // Group items
  const groupKeys = groupBy === "Phase" ? ["Detailing", "Fabrication", "Delivery", "Erection"]
    : groupBy === "Project" ? [...new Set(items.map(i => i.project_name).filter(Boolean))]
    : [...new Set(items.map(i => i.crew || "No Crew").filter(Boolean))];

  const getGroupItems = (key) => {
    if (groupBy === "Phase") return items.filter(i => i.phase === key);
    if (groupBy === "Project") return items.filter(i => i.project_name === key);
    return items.filter(i => (i.crew || "No Crew") === key);
  };

  if (!activeProject?.id) return (
    <div style={{ textAlign: "center", padding: "80px 24px" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>Select a Project</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>Use the project selector in the top right to view the 2-week look-ahead.</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            2-Week Look-Ahead
          </h1>
          {/* Week nav */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <button
              onClick={() => setWeekOffset(o => o - 1)}
              style={{ display: "flex", alignItems: "center", padding: "2px 6px", background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", borderRadius: 6, cursor: "pointer", color: "var(--text-secondary)" }}
            >
              <ChevronLeft size={14} />
            </button>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", letterSpacing: "0.04em" }}>
              {fmtWindow(windowStart)} – {fmtWindow(windowEnd)}
            </span>
            <button
              onClick={() => setWeekOffset(o => o + 1)}
              style={{ display: "flex", alignItems: "center", padding: "2px 6px", background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", borderRadius: 6, cursor: "pointer", color: "var(--text-secondary)" }}
            >
              <ChevronRight size={14} />
            </button>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase" }}
              >
                Today
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Group by */}
          <div style={{ display: "flex", border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden" }}>
            {["Phase", "Crew", "Project"].map(g => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                style={{
                  padding: "6px 12px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  border: "none",
                  borderRight: g !== "Project" ? "1px solid var(--border-default)" : "none",
                  background: groupBy === g ? "var(--accent)" : "var(--bg-surface)",
                  color: groupBy === g ? "white" : "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                {g}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setEditing(null); setModalOpen(true); }}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--accent)", color: "white", border: "none", borderRadius: "var(--radius-btn)", padding: "7px 14px", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--accent-hover)"}
            onMouseLeave={e => e.currentTarget.style.background = "var(--accent)"}
          >
            <Plus size={12} /> Add Item
          </button>
          <button
            onClick={refetch}
            style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-btn)", padding: "7px 12px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em" }}
          >
            <RefreshCw size={11} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", overflow: "hidden" }}>
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
                <tr><td colSpan={10} style={{ padding: "48px", textAlign: "center", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11 }}>Loading...</td></tr>
              )}

              {!isLoading && items.length === 0 && (
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

              {!isLoading && groupKeys.map(key => {
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
                          background: phaseCfg?.bg || "rgba(100,116,139,0.12)",
                          color: phaseCfg?.color || "var(--text-muted)",
                          border: `1px solid ${phaseCfg?.border || "rgba(100,116,139,0.3)"}`,
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
                            background: isDelayed ? "rgba(245,158,11,0.04)" : idx % 2 === 0 ? "var(--bg-surface)" : "var(--bg-surface-low)",
                            borderBottom: "1px solid var(--divider)",
                            transition: "background 0.12s",
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = "var(--hover-bg)"}
                          onMouseLeave={e => e.currentTarget.style.background = isDelayed ? "rgba(245,158,11,0.04)" : idx % 2 === 0 ? "var(--bg-surface)" : "var(--bg-surface-low)"}
                        >
                          <td style={{ padding: "10px 12px", fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>
                            {item.activity}
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            {item.phase && (
                              <span style={{
                                background: PHASE_COLORS[item.phase]?.bg || "rgba(100,116,139,0.1)",
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
                                style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, color: "var(--status-error)", cursor: "pointer" }}
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
