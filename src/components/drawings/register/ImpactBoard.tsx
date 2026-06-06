/**
 * ImpactBoard — stored, assignable downstream impacts of drawing revisions, as a
 * status-column board. PM+ can create an impact against a sheet's current
 * revision and move it through open → in_review → ready / blocked → resolved /
 * closed. Counts here feed the register's open-impact column. (Live, non-owned
 * signals stay in the derived readiness read-model; this is the action list.)
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { usePermissions } from "@/services/permissions";
import { useDrawingImpacts, type DrawingImpactRow } from "@/hooks/useDrawingImpacts";
import { useDrawingRegister } from "@/hooks/useDrawingRegister";
import { fmtDate } from "@/pages/drawingSubmittalHub/format";

const muted = "var(--text-muted)";
const primary = "var(--text-primary)";
const mono = "var(--font-mono)";

const STATUSES = ["open", "in_review", "ready", "blocked", "resolved", "closed"] as const;
const IMPACT_TYPES = [
  "fabrication", "erection", "embed", "anchor_bolts", "connections", "material_takeoff",
  "shop_drawing_required", "rfi_followup", "change_order", "field_rework",
];
const PRIORITIES = ["low", "medium", "high", "critical"];

const PRIORITY_TONE: Record<string, string> = {
  low: "var(--text-muted)", medium: "var(--status-info)",
  high: "var(--status-warning)", critical: "var(--status-error)",
};
const STATUS_TONE: Record<string, string> = {
  open: "var(--status-warning)", in_review: "var(--status-info)", ready: "var(--status-success)",
  blocked: "var(--status-error)", resolved: "var(--text-muted)", closed: "var(--text-muted)",
};
const label = (s: string) => s.replace(/_/g, " ");

interface ImpactForm {
  drawing_id: string;
  impact_type: string;
  title: string;
  priority: string;
  due_date: string;
}
const EMPTY: ImpactForm = { drawing_id: "", impact_type: IMPACT_TYPES[0], title: "", priority: "medium", due_date: "" };

export function ImpactBoard({ projectId }: { projectId: string | null }) {
  const { data: impacts = [], isLoading, error } = useDrawingImpacts(projectId);
  const { data: register = [] } = useDrawingRegister(projectId);
  const { can } = usePermissions();
  const canManage = can("approve", "drawing");
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ImpactForm>(EMPTY);

  const attachable = useMemo(() => register.filter((r) => !!r.current_revision_id), [register]);
  const byStatus = useMemo(() => {
    const m: Record<string, DrawingImpactRow[]> = {};
    for (const s of STATUSES) m[s] = [];
    for (const im of impacts) (m[im.status] ?? (m[im.status] = [])).push(im);
    return m;
  }, [impacts]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["drawing-impacts", projectId] });
    qc.invalidateQueries({ queryKey: ["drawing-register"] });
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const sheet = attachable.find((r) => r.drawing_id === form.drawing_id);
      if (!sheet?.current_revision_id) throw new Error("Pick a sheet with a current revision");
      if (!form.title.trim()) throw new Error("Title is required");
      await entities.DrawingImpact.create({
        project_id: projectId as string,
        drawing_revision_id: sheet.current_revision_id,
        impact_type: form.impact_type,
        status: "open",
        priority: form.priority,
        title: form.title.trim(),
        due_date: form.due_date || null,
      } as never);
    },
    onSuccess: () => { invalidate(); toast.success("Impact added"); setForm(EMPTY); setOpen(false); },
    onError: (e) => toast.error("Failed to add impact: " + ((e as Error)?.message || "unknown")),
  });

  const statusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const done = status === "resolved" || status === "closed";
      await entities.DrawingImpact.update(id, {
        status,
        resolved_at: done ? new Date().toISOString() : null,
      } as never);
    },
    onSuccess: () => invalidate(),
    onError: (e) => toast.error("Failed to move impact: " + ((e as Error)?.message || "unknown")),
  });

  if (!projectId) return <div style={{ padding: 24, color: muted, fontSize: 13 }}>Select a project.</div>;
  if (isLoading) return <div style={{ padding: 24, color: muted, fontSize: 13 }}>Loading impacts…</div>;
  if (error) return <div style={{ padding: 24, color: "var(--status-error)", fontSize: 13 }}>Failed to load impacts: {(error as Error)?.message || "unknown"}</div>;

  return (
    <section className="sbd-card" style={{ padding: 16, borderRadius: 14, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, color: primary, fontSize: 16 }}>Impact Board</h3>
          <p style={{ margin: "4px 0 0", color: muted, fontSize: 12 }}>Assignable downstream impacts of revisions — fab, erection, embeds, rework.</p>
        </div>
        {canManage && (
          <button type="button" className="sbd-btn sbd-btn-primary" onClick={() => setOpen((o) => !o)}>
            {open ? "Cancel" : "Add impact"}
          </button>
        )}
      </div>

      {canManage && open && (
        <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px,1fr))", gap: 10 }}>
          <select className="sbd-select" value={form.drawing_id} onChange={(e) => setForm((f) => ({ ...f, drawing_id: e.target.value }))}>
            <option value="">Select sheet…</option>
            {attachable.map((r) => <option key={r.drawing_id} value={r.drawing_id}>{r.sheet_number} · {r.current_revision}</option>)}
          </select>
          <select className="sbd-select" value={form.impact_type} onChange={(e) => setForm((f) => ({ ...f, impact_type: e.target.value }))}>
            {IMPACT_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </select>
          <select className="sbd-select" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
          </select>
          <input className="sbd-input" type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
          <input className="sbd-input" placeholder="Impact title *" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} style={{ gridColumn: "1 / -1" }} />
          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="sbd-btn sbd-btn-primary" disabled={createMut.isPending || !form.drawing_id || !form.title.trim()} onClick={() => createMut.mutate()}>
              {createMut.isPending ? "Saving…" : "Save impact"}
            </button>
          </div>
        </div>
      )}

      {impacts.length === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center", color: muted, fontSize: 13 }}>No impacts logged yet.</div>
      ) : (
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6 }}>
          {STATUSES.map((s) => (
            <div key={s} style={{ flex: "0 0 220px", minWidth: 220 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontFamily: mono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: STATUS_TONE[s] }}>
                {label(s)} <span className="sbd-num" style={{ color: muted }}>{byStatus[s].length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {byStatus[s].map((im) => {
                  const pTone = PRIORITY_TONE[im.priority] || muted;
                  return (
                    <div key={im.id} style={{ padding: 10, borderRadius: 8, background: "var(--bg-surface-low)", border: `1px solid color-mix(in srgb, ${STATUS_TONE[s]} 30%, var(--border-default))` }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontFamily: mono, fontSize: 8, fontWeight: 800, textTransform: "uppercase", color: muted }}>{label(im.impact_type)}</span>
                        <span style={{ fontFamily: mono, fontSize: 8, fontWeight: 800, textTransform: "uppercase", color: pTone }}>{im.priority}</span>
                      </div>
                      <div style={{ color: primary, fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{im.title}</div>
                      <div style={{ color: muted, fontSize: 11, marginBottom: im.due_date || canManage ? 6 : 0 }}>
                        {im.sheet_number || "—"}{im.revision_code ? ` · ${im.revision_code}` : ""}
                        {im.due_date ? ` · due ${fmtDate(im.due_date)}` : ""}
                      </div>
                      {canManage && (
                        <select
                          className="sbd-select"
                          value={im.status}
                          disabled={statusMut.isPending}
                          onChange={(e) => statusMut.mutate({ id: im.id, status: e.target.value })}
                          style={{ fontSize: 11, width: "100%" }}
                        >
                          {STATUSES.map((st) => <option key={st} value={st}>{label(st)}</option>)}
                        </select>
                      )}
                    </div>
                  );
                })}
                {byStatus[s].length === 0 && <div style={{ color: muted, fontSize: 11, padding: "4px 2px" }}>—</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
