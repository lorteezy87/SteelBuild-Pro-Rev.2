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
import { Pencil, Trash2, Plus } from "lucide-react";
import StatusBadge from "../components/shared/StatusBadge";
import ProgressBar from "../components/shared/ProgressBar";
import DeleteDialog from "../components/shared/DeleteDialog";
import { formatDate } from "../components/shared/formatters";
import { toast } from "sonner";

const PHASE_COLORS = { Detailing: "bg-indigo-100 text-indigo-700", Fabrication: "bg-amber-100 text-amber-700", Delivery: "bg-emerald-100 text-emerald-700", Erection: "bg-rose-100 text-rose-700" };

const empty = { project_id: "", project_name: "", activity: "", phase: "Erection", crew: "", planned_start: "", planned_end: "", forecast_start: "", forecast_end: "", percent_complete: 0, constraints: "", status: "Not Started" };

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
          <div className="col-span-2"><Label>Activity *</Label><Input value={form.activity} onChange={e => set("activity", e.target.value)} /></div>
          <div><Label>Project *</Label>
            <Select value={form.project_id} onValueChange={v => set("project_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Phase</Label>
            <Select value={form.phase} onValueChange={v => set("phase", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["Detailing","Fabrication","Delivery","Erection"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Status</Label>
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
          <div className="col-span-2"><Label>Constraints</Label><Input value={form.constraints} onChange={e => set("constraints", e.target.value)} placeholder="e.g. Pending RFI-005, material delay" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button onClick={save} disabled={isSaving} className="bg-slate-900 hover:bg-slate-800">{isSaving ? (item ? "Updating..." : "Creating...") : (item ? "Update" : "Create")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function LookAheadSchedule() {
  const qc = useQueryClient();
  const { activeProject } = useProjectContext();
  const [groupBy, setGroupBy] = useState("Phase");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

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
      qc.invalidateQueries(["lookahead"]);
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
      qc.invalidateQueries(["lookahead"]);
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
      qc.invalidateQueries(["lookahead"]);
      if (editing?.id === deletedId) {
        setEditing(null);
        setModalOpen(false);
      }
      setDeleteTarget(null);
      toast.success("Look-ahead item deleted");
    },
    onError: () => {
      toast.error("Failed to delete look-ahead item");
    },
  });
  const handleSave = (d) => { if (editing) updateMut.mutate({ id: editing.id, data: d }); else createMut.mutate(d); };

  // Compute 2-week window
  const today = new Date();
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 14);

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
      <div style={{ fontSize: 40, marginBottom: 12 }}>👁</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "rgba(220,225,240,0.45)", marginBottom: 6 }}>Select a project to view the Look-Ahead</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "rgba(200,210,230,0.30)" }}>Use the project selector in the top right.</div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">2-Week Look-Ahead</h1>
          <p className="text-sm text-slate-500">{today.toLocaleDateString("en-US", { month: "long", day: "numeric" })} – {weekEnd.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border rounded-md overflow-hidden">
            {["Phase", "Crew", "Project"].map(g => (
              <button key={g} onClick={() => setGroupBy(g)} className={`px-3 py-1.5 text-xs font-medium ${groupBy === g ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{g}</button>
            ))}
          </div>
          <Button size="sm" onClick={() => { setEditing(null); setModalOpen(true); }} className="bg-slate-900 hover:bg-slate-800"><Plus className="w-3.5 h-3.5 mr-1" />Add Item</Button>
          <Button variant="outline" size="sm" onClick={refetch}>Refresh</Button>
        </div>
      </div>

      <div style={{background:"var(--bg-surface)",border:"1px solid var(--border-default)",borderRadius:2,overflowX:"auto"}}>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="text-xs font-semibold">Activity</TableHead>
              <TableHead className="text-xs font-semibold">Phase</TableHead>
              <TableHead className="text-xs font-semibold">Crew</TableHead>
              <TableHead className="text-xs font-semibold">Planned Start</TableHead>
              <TableHead className="text-xs font-semibold">Planned End</TableHead>
              <TableHead className="text-xs font-semibold">Forecast End</TableHead>
              <TableHead className="text-xs font-semibold w-28">% Complete</TableHead>
              <TableHead className="text-xs font-semibold">Constraints</TableHead>
              <TableHead className="text-xs font-semibold">Status</TableHead>
              <TableHead className="text-xs font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={10} className="text-center py-8 text-slate-400">Loading...</TableCell></TableRow>
              : groupKeys.map(key => {
                const grpItems = getGroupItems(key);
                if (grpItems.length === 0) return null;
                return (
                  <React.Fragment key={key}>
                    <TableRow className="bg-slate-100">
                      <TableCell colSpan={10} className="text-sm font-semibold text-slate-700 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold mr-2 ${PHASE_COLORS[key] || "bg-slate-200 text-slate-700"}`}>{key}</span>
                        {grpItems.length} item{grpItems.length !== 1 ? "s" : ""}
                      </TableCell>
                    </TableRow>
                    {grpItems.map(item => (
                      <TableRow key={item.id} className={`hover:bg-slate-50/50 cursor-pointer ${item.status === "Delayed" ? "bg-rose-50/30" : ""}`} onClick={() => { setEditing(item); setModalOpen(true); }}>
                        <TableCell className="text-sm font-medium">{item.activity}</TableCell>
                        <TableCell><span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${PHASE_COLORS[item.phase] || ""}`}>{item.phase}</span></TableCell>
                        <TableCell className="text-sm">{item.crew || "—"}</TableCell>
                        <TableCell className="text-sm">{formatDate(item.planned_start)}</TableCell>
                        <TableCell className="text-sm">{formatDate(item.planned_end)}</TableCell>
                        <TableCell className={`text-sm ${item.forecast_end && item.planned_end && item.forecast_end > item.planned_end ? "text-rose-600 font-medium" : ""}`}>{formatDate(item.forecast_end)}</TableCell>
                        <TableCell><ProgressBar value={item.percent_complete || 0} max={100} height="h-1.5" color={item.percent_complete >= 100 ? "green" : "blue"} /></TableCell>
                        <TableCell className="text-sm text-slate-500 max-w-[120px] truncate">{item.constraints || "—"}</TableCell>
                        <TableCell><StatusBadge status={item.status} /></TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(item); setModalOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-500" onClick={() => setDeleteTarget(item)}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                );
              })}
            {!isLoading && items.length === 0 && <TableRow><TableCell colSpan={10} className="text-center py-8 text-slate-400">No look-ahead items. Add your first!</TableCell></TableRow>}
          </TableBody>
        </Table>
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
        onConfirm={() => {
          if (!deleteMut.isPending && deleteTarget?.id) {
            deleteMut.mutate(deleteTarget.id);
          }
        }}
        title="Delete Item"
        description={`Delete "${deleteTarget?.activity}"?`}
      />
    </div>
  );
}
