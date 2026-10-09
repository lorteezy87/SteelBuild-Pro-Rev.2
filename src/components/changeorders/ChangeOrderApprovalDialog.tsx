import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties } from "react";
import PhoenixModal, { inputStyle, labelStyle } from "@/components/shared/PhoenixModal";
import { isChangeOrderDate, validateChangeOrderDecision } from "@/lib/changeOrders/lifecycle";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import { localToday } from "@/utils/dates";

export interface ChangeOrderApprovalDecision {
  approved_by: string;
  approved_date: string;
  sov_mode: "new_line" | "adjust_line" | "none";
  sov_line_item_id: string | null;
}
export interface ChangeOrderApprovalDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (decision: ChangeOrderApprovalDecision) => Promise<unknown>;
  isSaving?: boolean;
  changeOrders: Array<{ id: string; co_number?: string | null; co_amount?: number | string | null }>;
  sovItems: Array<{ id: string; line_item_number?: number | null; description?: string | null }>;
}
const fieldStyle = inputStyle as CSSProperties;
const label = labelStyle as CSSProperties;
const button: CSSProperties = { minHeight: 44, padding: "10px 16px", borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--bg-surface-low)", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function ChangeOrderApprovalDialog({ open, onClose, onConfirm, isSaving = false, changeOrders, sovItems }: ChangeOrderApprovalDialogProps) {
  const id = useId();
  const [approver, setApprover] = useState("");
  const [date, setDate] = useState(localToday);
  const [treatment, setTreatment] = useState<ChangeOrderApprovalDecision["sov_mode"] | "">("");
  const [lineId, setLineId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const activeAttempt = useRef<object | null>(null);
  const initializedKey = useRef<string | null>(null);
  const selectionKey = JSON.stringify(changeOrders.map(co => [co.id, co.co_amount]).sort((left, right) => String(left[0]).localeCompare(String(right[0]))));

  useEffect(() => {
    if (!open) { initializedKey.current = null; return; }
    if (initializedKey.current === selectionKey) return;
    initializedKey.current = selectionKey;
    activeAttempt.current = null;
    setSaving(false); setApprover(""); setDate(localToday()); setTreatment(""); setLineId(""); setError("");
  }, [open, selectionKey]);

  const amountsKnown = changeOrders.length > 0 && changeOrders.every(co => co.co_amount !== null && co.co_amount !== undefined && co.co_amount !== "" && Number.isFinite(Number(co.co_amount)));
  const total = changeOrders.reduce((sum, co) => sum + Number(co.co_amount), 0);
  const validAmounts = amountsKnown && Number.isFinite(total);
  const hasDeduct = changeOrders.some(co => Number(co.co_amount) < 0);
  const busy = isSaving || saving;
  const close = () => { if (!busy && !activeAttempt.current) onClose(); };
  const confirm = async () => {
    if (busy || activeAttempt.current || !validAmounts) return;
    let decision: ChangeOrderApprovalDecision;
    try {
      if (!isChangeOrderDate(date)) throw new Error("Enter a valid approval date.");
      if (treatment === "") throw new Error("Choose an explicit SOV treatment before approval.");
      if (treatment === "adjust_line" && !sovItems.some(line => line.id === lineId)) throw new Error("Choose an existing SOV line to adjust.");
      decision = { approved_by: approver.trim(), approved_date: date, sov_mode: treatment, sov_line_item_id: treatment === "adjust_line" ? lineId : null };
      for (const co of changeOrders) validateChangeOrderDecision("Submitted", { ...decision, status: "Approved", co_amount: Number(co.co_amount) });
    } catch (cause) { setError(toUserErrorMessage(cause)); return; }
    const attempt = {};
    activeAttempt.current = attempt; setSaving(true); setError("");
    try { await onConfirm(decision); }
    catch (cause) { if (activeAttempt.current === attempt) setError(toUserErrorMessage(cause)); }
    finally { if (activeAttempt.current === attempt) { activeAttempt.current = null; setSaving(false); } }
  };

  return <PhoenixModal open={open} onClose={close} title="Approve change orders" maxWidth={620} footer={<>
    <button type="button" style={button} disabled={busy} onClick={close}>Cancel</button>
    <button type="button" style={{ ...button, background: "var(--accent)", color: "var(--on-accent)", borderColor: "var(--accent)" }} disabled={busy || !validAmounts} onClick={() => { void confirm(); }}>{busy ? "Approving…" : `Approve ${changeOrders.length} change order${changeOrders.length === 1 ? "" : "s"}`}</button>
  </>}>
    <p style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 0 }}>Review the commercial value and choose how these approvals affect scheduled billing.</p>
    <div style={{ border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden", marginBottom: 20 }}>
      <ul aria-label="Change orders to approve" style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: 160, overflowY: "auto" }}>
        {changeOrders.map(co => <li key={co.id} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "10px 14px", borderBottom: "1px solid var(--divider)", fontSize: 13 }}><span>{co.co_number || "Unnumbered change order"}</span><span style={{ fontFamily: "var(--font-mono)" }}>{co.co_amount != null && co.co_amount !== "" && Number.isFinite(Number(co.co_amount)) ? currency.format(Number(co.co_amount)) : "Amount unavailable"}</span></li>)}
      </ul>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: 14, gap: 16, background: "var(--bg-surface-low)" }}><span style={{ fontSize: 12, fontWeight: 600 }}>Total approval value</span><output aria-label="Total approval value" style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700 }}>{validAmounts ? currency.format(total) : "—"}</output></div>
    </div>
    {!validAmounts && <p role="alert" style={{ color: "var(--status-error)", fontSize: 13 }}>Load at least one change order with a known, finite amount before approving.</p>}
    {error && <p role="alert" style={{ color: "var(--status-error)", fontSize: 13 }}>{error}</p>}
    <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "grid", gap: 16 }}>
      <label htmlFor={`${id}-approver`}><span style={label}>Approved By</span><input id={`${id}-approver`} style={fieldStyle} value={approver} onChange={event => setApprover(event.target.value)} autoComplete="name" /></label>
      <label htmlFor={`${id}-date`}><span style={label}>Approved Date</span><input id={`${id}-date`} style={fieldStyle} type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <label htmlFor={`${id}-treatment`}><span style={label}>SOV treatment</span><select id={`${id}-treatment`} style={fieldStyle} value={treatment} onChange={event => setTreatment(event.target.value as typeof treatment)}>
        <option value="">Choose how approval affects SOV</option><option value="new_line" disabled={hasDeduct}>Create a new SOV line for each change order</option><option value="adjust_line">Adjust an existing SOV line</option><option value="none">Leave SOV unchanged</option>
      </select></label>
      {hasDeduct && <p style={{ color: "var(--status-warning)", fontSize: 12, margin: 0 }}>This selection includes a deduct. Adjust an existing SOV line or leave SOV unchanged.</p>}
      {treatment === "adjust_line" && <label htmlFor={`${id}-line`}><span style={label}>Existing SOV line</span><select id={`${id}-line`} style={fieldStyle} value={lineId} onChange={event => setLineId(event.target.value)}><option value="">Choose an existing line</option>{sovItems.map(line => <option key={line.id} value={line.id}>#{line.line_item_number} · {line.description || "(no description)"}</option>)}</select></label>}
      <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 13 }}>
        {treatment === "new_line" ? `Approval will create ${changeOrders.length} new SOV line${changeOrders.length === 1 ? "" : "s"}, one for each change order, totaling ${currency.format(total)}.` : treatment === "adjust_line" ? `Approval will adjust the selected line by ${currency.format(total)}. Deducts reduce its value; the line cannot fall below zero.` : treatment === "none" ? "Approval will update the change-order total without changing scheduled billing values." : "No SOV treatment has been selected."}
      </p>
    </fieldset>
  </PhoenixModal>;
}
