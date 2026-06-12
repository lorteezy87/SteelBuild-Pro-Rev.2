/**
 * Backcharges — Backcharge / CO Defense web entry (Phase 1).
 *
 * PM logs a backcharge (who/what/why/$ + the contractually-critical notice date),
 * attaches T&M cost build-up tickets, and generates a defense package (manifest
 * CSV + cover README) backed by an append-only timestamped audit trail. Reads/
 * writes go through the typed repository (src/lib/backcharge); the server RLS
 * enforces pm+ for writes.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { formatLocalDate, localToday } from "@/utils/dates";
import { downloadTextFile } from "@/lib/exports/fabRelease";
import {
  addTmTicket,
  createBackcharge,
  listBackcharges,
  listEvents,
  listTmTickets,
  softDeleteBackcharge,
  softDeleteTmTicket,
  updateBackcharge,
} from "@/lib/backcharge/repository";
import { computeTmTicketTotal, rollupBackcharges } from "@/lib/backcharge/cost";
import {
  buildBackchargeRegisterCsv,
  buildDefenseManifestCsv,
  suggestDefenseFilename,
} from "@/lib/backcharge/defensePackage";
import { buildDefensePdf } from "@/lib/backcharge/defensePdf";
import { entities } from "@/api/supabaseClient";
import {
  BACKCHARGE_REASON_CODES,
  BACKCHARGE_REASON_LABELS,
  BACKCHARGE_STATUSES,
  BACKCHARGE_STATUS_LABELS,
  RESPONSIBLE_PARTY_TYPES,
} from "@/lib/backcharge/types";

const mono = { fontFamily: "var(--font-mono, ui-monospace, monospace)" };
const usd = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const card = { background: "var(--bg-surface-secondary)", border: "1px solid var(--border-default)", borderRadius: 4, padding: 16 };
const input = { ...mono, width: "100%", boxSizing: "border-box", fontSize: 12, padding: "7px 9px", borderRadius: 3, background: "var(--bg-input, var(--bg-surface-low))", border: "1px solid var(--border-default)", color: "var(--text-primary)", outline: "none" };
const labelCss = { ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: 4 };
const btn = { ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: "7px 14px", borderRadius: 3, border: "1px solid var(--border-default)", cursor: "pointer" };
const btnPrimary = { ...btn, background: "var(--accent-muted)", borderColor: "var(--accent)", color: "var(--accent)" };

const STATUS_TONE = {
  draft: "var(--text-muted)", notice_sent: "var(--status-info)", pending: "var(--status-warning)",
  disputed: "var(--status-error)", approved: "var(--status-success)", rejected: "var(--text-muted)",
  collected: "var(--status-success)", void: "var(--text-muted)",
};

const EMPTY_FORM = {
  title: "", description: "", responsible_party: "", responsible_party_type: "subcontractor",
  reason_code: "rework", status: "draft", amount: "", incident_date: "", notice_date: "",
  backcharge_number: "", notes: "", linked_co_id: "", source_rfi_id: "",
};

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <span style={labelCss}>{label}</span>
      {children}
    </div>
  );
}

function BackchargeFormModal({ open, initial, onClose, onSubmit, busy, changeOrders = [], rfis = [] }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  if (!open) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const ready = form.title.trim().length > 0;
  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16, overflow: "auto" }} onClick={onClose}>
      <div style={{ ...card, width: 560, maxWidth: "94vw", maxHeight: "92vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 14px", fontSize: 16, color: "var(--text-primary)" }}>{initial?.id ? "Edit Backcharge" : "New Backcharge"}</h3>
        <Field label="Title *"><input style={input} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Cleanup of debris left by Acme Erectors" autoFocus /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Responsible party"><input style={input} value={form.responsible_party} onChange={(e) => set("responsible_party", e.target.value)} placeholder="Sub / vendor name" /></Field>
          <Field label="Party type">
            <select style={input} value={form.responsible_party_type} onChange={(e) => set("responsible_party_type", e.target.value)}>
              {RESPONSIBLE_PARTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Reason">
            <select style={input} value={form.reason_code} onChange={(e) => set("reason_code", e.target.value)}>
              {BACKCHARGE_REASON_CODES.map((r) => <option key={r} value={r}>{BACKCHARGE_REASON_LABELS[r]}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select style={input} value={form.status} onChange={(e) => set("status", e.target.value)}>
              {BACKCHARGE_STATUSES.map((s) => <option key={s} value={s}>{BACKCHARGE_STATUS_LABELS[s]}</option>)}
            </select>
          </Field>
          <Field label="Amount ($)"><input style={input} type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0.00" /></Field>
          <Field label="Backcharge #"><input style={input} value={form.backcharge_number} onChange={(e) => set("backcharge_number", e.target.value)} placeholder="BC-001" /></Field>
          <Field label="Incident date"><input style={input} type="date" value={form.incident_date || ""} onChange={(e) => set("incident_date", e.target.value)} /></Field>
          <Field label="Notice date (contractual)"><input style={input} type="date" value={form.notice_date || ""} onChange={(e) => set("notice_date", e.target.value)} /></Field>
          <Field label="Linked change order">
            <select style={input} value={form.linked_co_id || ""} onChange={(e) => set("linked_co_id", e.target.value)}>
              <option value="">— none —</option>
              {changeOrders.map((co) => <option key={co.id} value={co.id}>{co.co_number ? `${co.co_number} · ` : ""}{co.title || "(untitled)"}</option>)}
            </select>
          </Field>
          <Field label="Source RFI">
            <select style={input} value={form.source_rfi_id || ""} onChange={(e) => set("source_rfi_id", e.target.value)}>
              <option value="">— none —</option>
              {rfis.map((r) => <option key={r.id} value={r.id}>{r.rfi_number ? `${r.rfi_number} · ` : ""}{r.title || "(untitled)"}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Description / basis"><textarea style={{ ...input, minHeight: 64, resize: "vertical" }} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What happened, what it cost you, why they're responsible." /></Field>
        <Field label="Notes"><textarea style={{ ...input, minHeight: 40, resize: "vertical" }} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <button style={{ ...btn, background: "var(--bg-page)", color: "var(--text-muted)" }} onClick={onClose} disabled={busy}>Cancel</button>
          <button
            style={{ ...btnPrimary, opacity: ready && !busy ? 1 : 0.5, cursor: ready && !busy ? "pointer" : "not-allowed" }}
            disabled={!ready || busy}
            onClick={() => onSubmit({
              ...form,
              amount: form.amount === "" ? 0 : Number(form.amount),
              incident_date: form.incident_date || null,
              notice_date: form.notice_date || null,
              linked_co_id: form.linked_co_id || null,
              source_rfi_id: form.source_rfi_id || null,
            })}
          >
            {busy ? "Saving…" : initial?.id ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

const EMPTY_TICKET = { ticket_number: "", ticket_date: "", description: "", labor_hours: "", labor_rate: "", equipment_cost: "", material_cost: "", markup_percent: "", signed_by: "" };

function AddTicketRow({ onAdd, busy }) {
  const [t, setT] = useState({ ...EMPTY_TICKET, ticket_date: localToday() });
  const set = (k, v) => setT((p) => ({ ...p, [k]: v }));
  const preview = computeTmTicketTotal({
    labor_hours: Number(t.labor_hours) || 0, labor_rate: Number(t.labor_rate) || 0,
    equipment_cost: Number(t.equipment_cost) || 0, material_cost: Number(t.material_cost) || 0,
    markup_percent: Number(t.markup_percent) || 0,
  });
  const num = (k, ph) => <input style={{ ...input, fontSize: 11 }} type="number" value={t[k]} onChange={(e) => set(k, e.target.value)} placeholder={ph} />;
  return (
    <div style={{ ...card, padding: 12, marginTop: 8, background: "var(--bg-surface-low)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        <div><span style={labelCss}>Ticket #</span><input style={{ ...input, fontSize: 11 }} value={t.ticket_number} onChange={(e) => set("ticket_number", e.target.value)} /></div>
        <div><span style={labelCss}>Date</span><input style={{ ...input, fontSize: 11 }} type="date" value={t.ticket_date} onChange={(e) => set("ticket_date", e.target.value)} /></div>
        <div style={{ gridColumn: "span 2" }}><span style={labelCss}>Description</span><input style={{ ...input, fontSize: 11 }} value={t.description} onChange={(e) => set("description", e.target.value)} /></div>
        <div><span style={labelCss}>Labor hrs</span>{num("labor_hours", "0")}</div>
        <div><span style={labelCss}>Labor rate</span>{num("labor_rate", "0")}</div>
        <div><span style={labelCss}>Equipment $</span>{num("equipment_cost", "0")}</div>
        <div><span style={labelCss}>Material $</span>{num("material_cost", "0")}</div>
        <div><span style={labelCss}>Markup %</span>{num("markup_percent", "0")}</div>
        <div style={{ gridColumn: "span 2" }}><span style={labelCss}>Signed by (field)</span><input style={{ ...input, fontSize: 11 }} value={t.signed_by} onChange={(e) => set("signed_by", e.target.value)} /></div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
          <div style={{ ...mono, fontSize: 13, fontWeight: 700, color: "var(--accent)", alignSelf: "center" }}>{usd(preview)}</div>
          <button style={{ ...btnPrimary, fontSize: 9 }} disabled={busy} onClick={() => { onAdd(t); setT({ ...EMPTY_TICKET, ticket_date: localToday() }); }}>Add T&amp;M</button>
        </div>
      </div>
    </div>
  );
}

export default function Backcharges() {
  const { activeProject } = useProjectContext();
  const projectId = activeProject?.id;
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data: backcharges = [], isLoading } = useQuery({
    queryKey: ["backcharges", projectId],
    queryFn: () => listBackcharges(projectId),
    enabled: !!projectId,
  });
  const rollup = useMemo(() => rollupBackcharges(backcharges), [backcharges]);
  const selected = backcharges.find((b) => b.id === selectedId) || null;

  // Change orders + RFIs for the link pickers / resolved numbers in the package.
  const { data: changeOrders = [] } = useQuery({ queryKey: ["change_orders", projectId], queryFn: () => entities.ChangeOrder.filter({ project_id: projectId }), enabled: !!projectId, staleTime: 60_000 });
  const { data: rfis = [] } = useQuery({ queryKey: ["rfis", projectId], queryFn: () => entities.RFI.filter({ project_id: projectId }), enabled: !!projectId, staleTime: 60_000 });
  const coById = useMemo(() => new Map((changeOrders || []).map((c) => [c.id, c])), [changeOrders]);
  const rfiById = useMemo(() => new Map((rfis || []).map((r) => [r.id, r])), [rfis]);
  const withLinkNumbers = (bc) => (bc ? {
    ...bc,
    linked_co_number: bc.linked_co_id ? coById.get(bc.linked_co_id)?.co_number || null : null,
    source_rfi_number: bc.source_rfi_id ? rfiById.get(bc.source_rfi_id)?.rfi_number || null : null,
  } : bc);

  const { data: tickets = [] } = useQuery({ queryKey: ["backcharge-tickets", selectedId], queryFn: () => listTmTickets(selectedId), enabled: !!selectedId });
  const { data: events = [] } = useQuery({ queryKey: ["backcharge-events", selectedId], queryFn: () => listEvents(selectedId), enabled: !!selectedId });

  const refetchAll = () => {
    qc.invalidateQueries({ queryKey: ["backcharges", projectId] });
    if (selectedId) {
      qc.invalidateQueries({ queryKey: ["backcharge-tickets", selectedId] });
      qc.invalidateQueries({ queryKey: ["backcharge-events", selectedId] });
    }
  };

  const createMut = useMutation({
    mutationFn: (form) => createBackcharge({ ...form, project_id: projectId }),
    onSuccess: (bc) => { refetchAll(); setFormOpen(false); setEditing(null); setSelectedId(bc.id); toast.success("Backcharge created"); },
    onError: (e) => toast.error(e?.message?.includes("row-level security") ? "Only PM+ can create backcharges." : `Create failed: ${e?.message}`),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, patch, prev }) => updateBackcharge(id, patch, prev),
    onSuccess: () => { refetchAll(); setFormOpen(false); setEditing(null); toast.success("Saved"); },
    onError: (e) => toast.error(`Save failed: ${e?.message}`),
  });
  const addTicketMut = useMutation({
    mutationFn: (t) => addTmTicket({
      ...t, backcharge_id: selectedId, project_id: projectId,
      labor_hours: Number(t.labor_hours) || 0, labor_rate: Number(t.labor_rate) || 0,
      equipment_cost: Number(t.equipment_cost) || 0, material_cost: Number(t.material_cost) || 0,
      markup_percent: Number(t.markup_percent) || 0, ticket_date: t.ticket_date || null,
    }),
    onSuccess: () => { refetchAll(); toast.success("T&M ticket added"); },
    onError: (e) => toast.error(`Add failed: ${e?.message}`),
  });
  const delTicketMut = useMutation({ mutationFn: (id) => softDeleteTmTicket(id), onSuccess: () => { refetchAll(); }, onError: (e) => toast.error(`Delete failed: ${e?.message}`) });
  const delMut = useMutation({ mutationFn: (id) => softDeleteBackcharge(id), onSuccess: () => { refetchAll(); setSelectedId(null); toast.success("Deleted"); }, onError: (e) => toast.error(`Delete failed: ${e?.message}`) });

  const exportDefense = async (bc0) => {
    try {
      const bc = withLinkNumbers(bc0);
      const [tks, evs] = await Promise.all([listTmTickets(bc.id), listEvents(bc.id)]);
      const stem = suggestDefenseFilename(bc, activeProject);
      buildDefensePdf({ backcharge: bc, tickets: tks, events: evs, project: activeProject }).save(`${stem}.pdf`);
      downloadTextFile(buildDefenseManifestCsv(bc, tks, evs), `${stem}_manifest.csv`, "text/csv;charset=utf-8");
      toast.success("Defense package exported (PDF + CSV)");
    } catch (e) { toast.error(`Export failed: ${e?.message}`); }
  };

  if (!projectId) return <div style={{ ...mono, padding: 24, color: "var(--text-muted)" }}>Select a project to manage backcharges.</div>;

  return (
    <div style={{ padding: 20, maxWidth: 1180, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, color: "var(--text-primary)" }}>Backcharge Defense</h1>
          <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Log backcharges, build T&amp;M cost, generate a defensible package with a timestamped audit trail.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn} disabled={backcharges.length === 0} onClick={() => downloadTextFile(buildBackchargeRegisterCsv(backcharges), `backcharge_register.csv`, "text/csv;charset=utf-8")}>Export Register</button>
          <button style={btnPrimary} onClick={() => { setEditing(null); setFormOpen(true); }}>+ New Backcharge</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        {[
          { k: "Open exposure", v: usd(rollup.open), tone: "var(--status-warning)" },
          { k: "Total logged", v: usd(rollup.total), tone: "var(--text-primary)" },
          { k: "Collected", v: usd(rollup.collected), tone: "var(--status-success)" },
          { k: "Count", v: rollup.count, tone: "var(--accent)" },
        ].map((kpi) => (
          <div key={kpi.k} style={card}>
            <div style={labelCss}>{kpi.k}</div>
            <div style={{ ...mono, fontSize: 20, fontWeight: 700, color: kpi.tone }}>{kpi.v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 1fr" : "1fr", gap: 16 }}>
        <div style={card}>
          <div style={{ ...labelCss, marginBottom: 10 }}>Backcharges</div>
          {isLoading ? (
            <div style={{ ...mono, fontSize: 12, color: "var(--text-muted)" }}>Loading…</div>
          ) : backcharges.length === 0 ? (
            <div style={{ ...mono, fontSize: 12, color: "var(--text-muted)" }}>No backcharges yet. Log the first one to start a defense file.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {backcharges.map((b) => (
                <button key={b.id} onClick={() => setSelectedId(b.id)} style={{
                  textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                  padding: "9px 11px", borderRadius: 3, cursor: "pointer",
                  background: selectedId === b.id ? "var(--accent-muted)" : "var(--bg-surface-low)",
                  border: `1px solid ${selectedId === b.id ? "var(--accent)" : "var(--border-default)"}`,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {b.backcharge_number ? `${b.backcharge_number} · ` : ""}{b.title}
                    </div>
                    <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
                      {b.responsible_party || "—"} · {b.notice_date ? `notice ${formatLocalDate(b.notice_date)}` : "no notice"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flex: "0 0 auto" }}>
                    <div style={{ ...mono, fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{usd(b.amount)}</div>
                    <div style={{ ...mono, fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: STATUS_TONE[b.status] || "var(--text-muted)" }}>{BACKCHARGE_STATUS_LABELS[b.status] || b.status}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {selected && (
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 15, color: "var(--text-primary)", fontWeight: 600 }}>{selected.title}</div>
                <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                  {selected.responsible_party || "—"} ({selected.responsible_party_type}) · {BACKCHARGE_REASON_LABELS[selected.reason_code] || selected.reason_code}
                </div>
                {(selected.linked_co_id || selected.source_rfi_id) && (
                  <div style={{ ...mono, fontSize: 10, color: "var(--accent)", marginTop: 2 }}>
                    {selected.linked_co_id && coById.get(selected.linked_co_id) ? `CO ${coById.get(selected.linked_co_id).co_number || "—"}` : ""}
                    {selected.linked_co_id && selected.source_rfi_id ? " · " : ""}
                    {selected.source_rfi_id && rfiById.get(selected.source_rfi_id) ? `RFI ${rfiById.get(selected.source_rfi_id).rfi_number || "—"}` : ""}
                  </div>
                )}
              </div>
              <button onClick={() => setSelectedId(null)} style={{ ...btn, padding: "4px 8px" }}>✕</button>
            </div>

            {!selected.notice_date && (
              <div style={{ ...mono, fontSize: 10, color: "var(--status-error)", border: "1px solid var(--status-error)", borderRadius: 3, padding: "6px 8px", marginBottom: 10 }}>
                ⚠ No notice date on record — capture it to strengthen the defense package.
              </div>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <select style={{ ...input, width: "auto", fontSize: 11 }} value={selected.status} onChange={(e) => updateMut.mutate({ id: selected.id, patch: { status: e.target.value }, prev: selected })}>
                {BACKCHARGE_STATUSES.map((s) => <option key={s} value={s}>{BACKCHARGE_STATUS_LABELS[s]}</option>)}
              </select>
              <button style={btn} onClick={() => { setEditing(selected); setFormOpen(true); }}>Edit</button>
              <button style={btnPrimary} onClick={() => exportDefense(selected)}>Defense Package</button>
              <button style={{ ...btn, color: "var(--status-error)", borderColor: "var(--status-error)" }} onClick={() => { if (confirm("Delete this backcharge?")) delMut.mutate(selected.id); }}>Delete</button>
            </div>

            <div style={{ ...labelCss, marginBottom: 6 }}>T&amp;M cost build-up</div>
            {tickets.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {tickets.map((t) => (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "5px 8px", background: "var(--bg-surface-low)", borderRadius: 3 }}>
                    <div style={{ ...mono, fontSize: 11, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.ticket_date ? formatLocalDate(t.ticket_date) : ""} · {t.description || t.ticket_number || "T&M"}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flex: "0 0 auto" }}>
                      <span style={{ ...mono, fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>{usd(computeTmTicketTotal(t))}</span>
                      <button onClick={() => delTicketMut.mutate(t.id)} style={{ ...btn, padding: "2px 6px", fontSize: 9, color: "var(--text-muted)" }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)" }}>No T&amp;M tickets yet.</div>}
            <AddTicketRow onAdd={(t) => addTicketMut.mutate(t)} busy={addTicketMut.isPending} />

            <div style={{ ...labelCss, margin: "14px 0 6px" }}>Audit trail</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 180, overflow: "auto" }}>
              {events.length === 0 ? <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)" }}>—</div> : events.map((e) => (
                <div key={e.id} style={{ ...mono, fontSize: 10, color: "var(--text-secondary)", display: "flex", gap: 8 }}>
                  <span style={{ color: "var(--text-muted)", flex: "0 0 auto" }}>{e.created_at ? formatLocalDate(e.created_at) : ""}</span>
                  <span style={{ color: "var(--accent)", flex: "0 0 auto", fontWeight: 700 }}>{e.event_type}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.from_status ? `${e.from_status}→${e.to_status} ` : ""}{e.detail || ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <BackchargeFormModal
        key={editing?.id || "new"}
        open={formOpen}
        initial={editing}
        changeOrders={changeOrders}
        rfis={rfis}
        busy={createMut.isPending || updateMut.isPending}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={(form) => {
          if (editing?.id) {
            const { id: _id, ...patch } = form;
            updateMut.mutate({ id: editing.id, patch, prev: editing });
          } else {
            createMut.mutate(form);
          }
        }}
      />
    </div>
  );
}
