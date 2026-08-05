// @ts-nocheck
/**
 * Presentational form/detail chrome for Backcharges.
 * BackchargeFormModal is also re-exported from pages/Backcharges for importers.
 */
import { useState } from "react";
import { formatUsd } from "./backchargesPageHelpers";
import { computeTmTicketTotal } from "@/lib/backcharge/cost";
import {
  BACKCHARGE_REASON_CODES,
  BACKCHARGE_REASON_LABELS,
  BACKCHARGE_STATUSES,
  BACKCHARGE_STATUS_LABELS,
  RESPONSIBLE_PARTY_TYPES,
} from "@/lib/backcharge/types";
import {
  bcMono,
  BACKCHARGE_CARD_STYLE as card,
  BACKCHARGE_INPUT_STYLE as input,
  BACKCHARGE_LABEL_STYLE as labelCss,
  BACKCHARGE_BTN_STYLE as btn,
  BACKCHARGE_BTN_PRIMARY_STYLE as btnPrimary,
  EMPTY_BACKCHARGE_FORM as EMPTY_FORM,
  EMPTY_TM_TICKET as EMPTY_TICKET,
} from "./backchargesUiHelpers";

export { bcMono };

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <span style={labelCss}>{label}</span>
      {children}
    </div>
  );
}

export function BackchargeFormModal({ open, initial, onClose, onSubmit, busy, changeOrders = [], rfis = [] }) {
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
          <div style={{ ...bcMono, fontSize: 13, fontWeight: 700, color: "var(--accent)", alignSelf: "center" }}>{formatUsd(preview)}</div>
          <button style={{ ...btnPrimary, fontSize: 9 }} disabled={busy} onClick={() => { onAdd(t); setT({ ...EMPTY_TICKET, ticket_date: localToday() }); }}>Add T&amp;M</button>
        </div>
      </div>
    </div>
  );
}

export function BackchargeDetailPanel({
  selected,
  tickets,
  events,
  onClose,
  onStatusChange,
  onEdit,
  onExport,
  onDelete,
  onDeleteTicket,
  onAddTicket,
  addTicketBusy,
}) {
  return (
    <div style={{ ...card, maxWidth: 1180, margin: "16px auto 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 15, color: "var(--text-primary)", fontWeight: 600 }}>{selected.title}</div>
          <div style={{ ...bcMono, fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
            {selected.responsible_party || "—"} ({selected.responsible_party_type}) · {BACKCHARGE_REASON_LABELS[selected.reason_code] || selected.reason_code}
          </div>
          {(selected.linked_co_number || selected.source_rfi_number) && (
            <div style={{ ...bcMono, fontSize: 10, color: "var(--accent)", marginTop: 2 }}>
              {selected.linked_co_number ? `CO ${selected.linked_co_number}` : ""}
              {selected.linked_co_number && selected.source_rfi_number ? " · " : ""}
              {selected.source_rfi_number ? `RFI ${selected.source_rfi_number}` : ""}
            </div>
          )}
        </div>
        <button onClick={onClose} style={{ ...btn, padding: "4px 8px" }}>✕</button>
      </div>

      {!selected.notice_date && (
        <div style={{ ...bcMono, fontSize: 10, color: "var(--status-error)", border: "1px solid var(--status-error)", borderRadius: 3, padding: "6px 8px", marginBottom: 10 }}>
          ⚠ No notice date on record — capture it to strengthen the defense package.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <select style={{ ...input, width: "auto", fontSize: 11 }} value={selected.status} onChange={(e) => onStatusChange(e.target.value)}>
          {BACKCHARGE_STATUSES.map((s) => <option key={s} value={s}>{BACKCHARGE_STATUS_LABELS[s]}</option>)}
        </select>
        <button style={btn} onClick={onEdit}>Edit</button>
        <button style={btnPrimary} onClick={onExport}>Defense Package</button>
        <button style={{ ...btn, color: "var(--status-error)", borderColor: "var(--status-error)" }} onClick={() => { if (confirm("Delete this backcharge?")) onDelete(); }}>Delete</button>
      </div>

      <div style={{ ...labelCss, marginBottom: 6 }}>T&amp;M cost build-up</div>
      {tickets.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {tickets.map((t) => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "5px 8px", background: "var(--bg-surface-low)", borderRadius: 3 }}>
              <div style={{ ...bcMono, fontSize: 11, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.ticket_date ? formatLocalDate(t.ticket_date) : ""} · {t.description || t.ticket_number || "T&M"}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flex: "0 0 auto" }}>
                <span style={{ ...bcMono, fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>{formatUsd(computeTmTicketTotal(t))}</span>
                <button onClick={() => onDeleteTicket(t.id)} style={{ ...btn, padding: "2px 6px", fontSize: 9, color: "var(--text-muted)" }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      ) : <div style={{ ...bcMono, fontSize: 11, color: "var(--text-muted)" }}>No T&amp;M tickets yet.</div>}
      <AddTicketRow onAdd={onAddTicket} busy={addTicketBusy} />

      <div style={{ ...labelCss, margin: "14px 0 6px" }}>Audit trail</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 180, overflow: "auto" }}>
        {events.length === 0 ? <div style={{ ...bcMono, fontSize: 11, color: "var(--text-muted)" }}>—</div> : events.map((e) => (
          <div key={e.id} style={{ ...bcMono, fontSize: 10, color: "var(--text-secondary)", display: "flex", gap: 8 }}>
            <span style={{ color: "var(--text-muted)", flex: "0 0 auto" }}>{e.created_at ? formatLocalDate(e.created_at) : ""}</span>
            <span style={{ color: "var(--accent)", flex: "0 0 auto", fontWeight: 700 }}>{e.event_type}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {e.from_status ? `${e.from_status}→${e.to_status} ` : ""}{e.detail || ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

