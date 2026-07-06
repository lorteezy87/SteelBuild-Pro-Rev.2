/**
 * ImpactBoardPanel — the on-skin Doc Control "Impacts" view (Slice 2c).
 *
 * Presentation-only re-skin of ImpactBoard onto the command_ui kit. The create /
 * move-status mutations, the "resolved/closed sets resolved_at" rule, permission
 * gate, and cache invalidation are UNCHANGED — reused verbatim; only the chrome
 * (card / add form / status columns / impact cards / priority chip) is swapped to
 * `cmd-*` primitives + the light palette. Root is `.detailing-cc` so the reused
 * `sbd-select`/`sbd-input` controls inherit the shipped light token cascade.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { usePermissions } from "@/services/permissions";
import { useDrawingImpacts } from "@/hooks/useDrawingImpacts";
import { useDrawingRegister } from "@/hooks/useDrawingRegister";
import { fmtDate } from "@/pages/drawingSubmittalHub/format";
import { Pill } from "@/components/command";
import type { PillTone } from "@/components/command";
import { IMPACT_STATUSES, attachableRegisterRows, groupImpactsByStatus } from "./docControl.derive";

const IMPACT_TYPES = [
  "fabrication", "erection", "embed", "anchor_bolts", "connections", "material_takeoff",
  "shop_drawing_required", "rfi_followup", "change_order", "field_rework",
];
const PRIORITIES = ["low", "medium", "high", "critical"];

/** Priority → kit Pill tone. Mirrors the legacy PRIORITY_TONE hues. */
function priorityTone(priority: string): PillTone {
  switch (priority) {
    case "critical": return "danger";
    case "high": return "warn";
    case "medium": return "info";
    default: return "neutral"; // low
  }
}

/** Status → header accent colour, mirroring the legacy STATUS_TONE. */
const STATUS_ACCENT: Record<string, string> = {
  open: "var(--cmd-warn)", in_review: "var(--cmd-info)", ready: "var(--cmd-good)",
  blocked: "var(--cmd-danger)", resolved: "var(--cmd-text-muted)", closed: "var(--cmd-text-muted)",
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

export function ImpactBoardPanel({ projectId }: { projectId: string | null }) {
  const { data: impacts = [], isLoading, error } = useDrawingImpacts(projectId);
  const { data: register = [] } = useDrawingRegister(projectId);
  const { can } = usePermissions();
  const canManage = can("approve", "drawing");
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ImpactForm>(EMPTY);

  const attachable = useMemo(() => attachableRegisterRows(register), [register]);
  const byStatus = useMemo(() => groupImpactsByStatus(impacts), [impacts]);

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

  if (!projectId) return <div style={{ padding: 24, color: "var(--cmd-text-muted)", fontSize: 13 }}>Select a project.</div>;
  if (isLoading) return <div style={{ padding: 24, color: "var(--cmd-text-muted)", fontSize: 13 }}>Loading impacts…</div>;
  if (error) return <div style={{ padding: 24, color: "var(--cmd-danger)", fontSize: 13 }}>Failed to load impacts: {(error as Error)?.message || "unknown"}</div>;

  return (
    <section className="detailing-cc" style={{ padding: 0, gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, color: "var(--cmd-text)", fontSize: 16, fontWeight: 700 }}>Impact Board</h3>
          <p style={{ margin: "4px 0 0", color: "var(--cmd-text-muted)", fontSize: 12 }}>Assignable downstream impacts of revisions — fab, erection, embeds, rework.</p>
        </div>
        {canManage && (
          <button type="button" className="cmd-btn cmd-btn--primary" onClick={() => setOpen((o) => !o)}>
            {open ? "Cancel" : "Add impact"}
          </button>
        )}
      </div>

      {canManage && open && (
        <div style={{ padding: 14, borderRadius: 10, background: "var(--cmd-surface)", border: "1px solid var(--cmd-border)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px,1fr))", gap: 10 }}>
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
            <button type="button" className="cmd-btn cmd-btn--primary" disabled={createMut.isPending || !form.drawing_id || !form.title.trim()} onClick={() => createMut.mutate()}>
              {createMut.isPending ? "Saving…" : "Save impact"}
            </button>
          </div>
        </div>
      )}

      {impacts.length === 0 ? (
        <div className="cmd-table-wrap">
          <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--cmd-text-muted)", fontSize: 13 }}>No impacts logged yet.</div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6 }}>
          {IMPACT_STATUSES.map((s) => (
            <div key={s} style={{ flex: "0 0 220px", minWidth: 220 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: STATUS_ACCENT[s] }}>
                {label(s)} <span style={{ color: "var(--cmd-text-muted)", fontVariantNumeric: "tabular-nums" }}>{byStatus[s].length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {byStatus[s].map((im) => (
                  <div key={im.id} style={{ padding: 10, borderRadius: 8, background: "var(--cmd-surface)", border: `1px solid color-mix(in srgb, ${STATUS_ACCENT[s]} 30%, var(--cmd-border))` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--cmd-text-muted)" }}>{label(im.impact_type)}</span>
                      <Pill tone={priorityTone(im.priority)}>{im.priority}</Pill>
                    </div>
                    <div style={{ color: "var(--cmd-text)", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{im.title}</div>
                    <div style={{ color: "var(--cmd-text-muted)", fontSize: 11, marginBottom: im.due_date || canManage ? 6 : 0 }}>
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
                        {IMPACT_STATUSES.map((st) => <option key={st} value={st}>{label(st)}</option>)}
                      </select>
                    )}
                  </div>
                ))}
                {byStatus[s].length === 0 && <div style={{ color: "var(--cmd-text-muted)", fontSize: 11, padding: "4px 2px" }}>—</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
