/**
 * TransmittalLogPanel — the on-skin Doc Control "Transmittals" view (Slice 2c).
 *
 * Presentation-only re-skin of TransmittalLog onto the command_ui kit. The create
 * mutation (transmittal header + per-sheet item attachment), the incoming/outgoing
 * field routing, permission gate, and cache invalidation are UNCHANGED — reused
 * verbatim; only the chrome (card / log form / sheet-picker / table / direction
 * chip) is swapped to `cmd-*` primitives. Root is `.detailing-cc` so the reused
 * `sbd-input`/`sbd-select` controls inherit the shipped light token cascade.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { usePermissions } from "@/services/permissions";
import { useTransmittals } from "@/hooks/useTransmittals";
import { useDrawingRegister } from "@/hooks/useDrawingRegister";
import { fmtDate } from "@/pages/drawingSubmittalHub/format";
import { Pill } from "@/components/command";
import type { PillTone } from "@/components/command";
import { attachableRegisterRows, resolveTransmittalDisplay } from "./docControl.derive";

/** Direction → kit Pill tone. Mirrors the legacy DIRECTION_TONE hues. */
function directionTone(direction: string): PillTone {
  if (direction === "incoming") return "info";
  if (direction === "outgoing") return "good";
  return "neutral"; // internal
}

interface FormState {
  transmittal_number: string;
  direction: "incoming" | "outgoing" | "internal";
  party: string;
  subject: string;
  date: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  transmittal_number: "", direction: "incoming", party: "", subject: "", date: "", notes: "",
};

export function TransmittalLogPanel({ projectId }: { projectId: string | null }) {
  const { data: transmittals = [], isLoading, error } = useTransmittals(projectId);
  const { data: register = [] } = useDrawingRegister(projectId);
  const { can } = usePermissions();
  const canCreate = can("create", "drawing");
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const attachable = useMemo(() => attachableRegisterRows(register), [register]);

  const createMut = useMutation({
    mutationFn: async () => {
      const num = form.transmittal_number.trim();
      if (!num) throw new Error("Transmittal number is required");
      const incoming = form.direction === "incoming";
      const transmittal = await entities.DrawingTransmittal.create({
        project_id: projectId as string,
        transmittal_number: num,
        direction: form.direction,
        received_from: incoming ? (form.party.trim() || null) : null,
        sent_to: incoming ? null : (form.party.trim() || null),
        subject: form.subject.trim() || null,
        date_sent: !incoming ? (form.date || null) : null,
        date_received: incoming ? (form.date || null) : null,
        notes: form.notes.trim() || null,
      } as never);
      const tid = (transmittal as { id: string }).id;
      const items = [...selected]
        .map((drawingId) => attachable.find((r) => r.drawing_id === drawingId)?.current_revision_id)
        .filter(Boolean) as string[];
      for (const revId of items) {
        await entities.DrawingTransmittalItem.create({
          project_id: projectId as string,
          transmittal_id: tid,
          drawing_revision_id: revId,
        } as never);
      }
      return items.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["drawing-transmittals", projectId] });
      toast.success(`Transmittal logged${n ? ` · ${n} sheet${n === 1 ? "" : "s"}` : ""}`);
      setForm(EMPTY_FORM); setSelected(new Set()); setOpen(false);
    },
    onError: (e) => toast.error("Failed to log transmittal: " + ((e as Error)?.message || "unknown")),
  });

  const toggleSheet = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (!projectId) return <div style={{ padding: 24, color: "var(--cmd-text-muted)", fontSize: 13 }}>Select a project.</div>;
  if (isLoading) return <div style={{ padding: 24, color: "var(--cmd-text-muted)", fontSize: 13 }}>Loading transmittals…</div>;
  if (error) return <div style={{ padding: 24, color: "var(--cmd-danger)", fontSize: 13 }}>Failed to load transmittals: {(error as Error)?.message || "unknown"}</div>;

  return (
    <section className="detailing-cc" style={{ padding: 0, gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, color: "var(--cmd-text)", fontSize: 16, fontWeight: 700 }}>Transmittals</h3>
          <p style={{ margin: "4px 0 0", color: "var(--cmd-text-muted)", fontSize: 12 }}>
            Distribution log — who received which revisions, and when.
          </p>
        </div>
        {canCreate && (
          <button type="button" className="cmd-btn cmd-btn--primary" onClick={() => setOpen((o) => !o)}>
            {open ? "Cancel" : "Log transmittal"}
          </button>
        )}
      </div>

      {canCreate && open && (
        <div style={{ padding: 14, borderRadius: 10, background: "var(--cmd-surface)", border: "1px solid var(--cmd-border)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 10 }}>
            <input className="sbd-input" placeholder="Transmittal # *" value={form.transmittal_number}
              onChange={(e) => setForm((f) => ({ ...f, transmittal_number: e.target.value }))} />
            <select className="sbd-select" value={form.direction}
              onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value as FormState["direction"] }))}>
              <option value="incoming">Incoming</option>
              <option value="outgoing">Outgoing</option>
              <option value="internal">Internal</option>
            </select>
            <input className="sbd-input" placeholder={form.direction === "incoming" ? "Received from" : "Sent to"}
              value={form.party} onChange={(e) => setForm((f) => ({ ...f, party: e.target.value }))} />
            <input className="sbd-input" type="date" value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            <input className="sbd-input" placeholder="Subject" value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} style={{ gridColumn: "1 / -1" }} />
            <input className="sbd-input" placeholder="Notes" value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} style={{ gridColumn: "1 / -1" }} />
          </div>

          <div style={{ fontSize: 9, color: "var(--cmd-text-muted)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", margin: "6px 0" }}>
            Attach sheets ({selected.size} selected)
          </div>
          <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--cmd-border)", borderRadius: 8, padding: 6 }}>
            {attachable.length === 0 ? (
              <div style={{ color: "var(--cmd-text-muted)", fontSize: 12, padding: 8 }}>No sheets with a current revision to attach.</div>
            ) : attachable.map((r) => (
              <label key={r.drawing_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 6px", cursor: "pointer", fontSize: 12, color: "var(--cmd-text)" }}>
                <input type="checkbox" className="cmd-check" checked={selected.has(r.drawing_id)} onChange={() => toggleSheet(r.drawing_id)} />
                <span style={{ fontWeight: 700 }}>{r.sheet_number || "—"}</span>
                <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--cmd-text-muted)" }}>{r.current_revision || ""}</span>
                <span style={{ color: "var(--cmd-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sheet_title || ""}</span>
              </label>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <button type="button" className="cmd-btn cmd-btn--ghost" onClick={() => { setForm(EMPTY_FORM); setSelected(new Set()); setOpen(false); }}>Cancel</button>
            <button type="button" className="cmd-btn cmd-btn--primary" disabled={createMut.isPending || !form.transmittal_number.trim()}
              onClick={() => createMut.mutate()}>
              {createMut.isPending ? "Saving…" : "Save transmittal"}
            </button>
          </div>
        </div>
      )}

      {transmittals.length === 0 ? (
        <div className="cmd-table-wrap">
          <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--cmd-text-muted)", fontSize: 13 }}>No transmittals logged yet.</div>
        </div>
      ) : (
        <div className="cmd-table-wrap">
          <table className="cmd-table">
            <thead>
              <tr>
                <th>Transmittal #</th>
                <th>Dir.</th>
                <th>Party</th>
                <th>Subject</th>
                <th>Date</th>
                <th style={{ textAlign: "center" }}>Sheets</th>
              </tr>
            </thead>
            <tbody>
              {transmittals.map((t) => {
                const { party, date } = resolveTransmittalDisplay(t);
                return (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 700, color: "var(--cmd-text)", whiteSpace: "nowrap" }}>{t.transmittal_number}</td>
                    <td><Pill tone={directionTone(t.direction)}>{t.direction}</Pill></td>
                    <td style={{ color: "var(--cmd-text)" }}>{party || "—"}</td>
                    <td style={{ color: "var(--cmd-text-muted)", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.subject || "—"}</td>
                    <td style={{ color: "var(--cmd-text-muted)", whiteSpace: "nowrap" }}>{date ? fmtDate(date) : "—"}</td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{ fontVariantNumeric: "tabular-nums", color: t.item_count > 0 ? "var(--cmd-text)" : "var(--cmd-text-muted)" }}>{t.item_count}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
