/**
 * PayApplications — G702/G703 pay-application entry + AIA PDF export (Phase 2).
 *
 * PM creates an application for a billing period (lines drafted from the SOV,
 * carrying prior completed work forward), enters % complete + stored materials
 * per G703 line, sees the live G702 summary, and exports the AIA pay app to PDF.
 * All math via the G702 engine (src/lib/payapp) on integer-cents money.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { entities } from "@/api/supabaseClient";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { formatLocalDate, localToday } from "@/utils/dates";
import { formatMoney, sumMoney } from "@/lib/money";
import { logActivity } from "@/services/auditLogger";
import {
  createPayApplication,
  listLines,
  listPayApplications,
  softDeletePayApplication,
  updateLine,
  updatePayApplication,
} from "@/lib/payapp/repository";
import { computeG702, lineFigures } from "@/lib/payapp/g702";
import { PAY_APP_STATUSES, PAY_APP_STATUS_LABELS } from "@/lib/payapp/types";
import { buildPayAppPdf, suggestPayAppFilename } from "@/lib/payapp/payAppPdf";

const mono = { fontFamily: "var(--font-mono, ui-monospace, monospace)" };
const card = { background: "var(--bg-surface-secondary)", border: "1px solid var(--border-default)", borderRadius: 4, padding: 16 };
const input = { ...mono, boxSizing: "border-box", fontSize: 12, padding: "6px 8px", borderRadius: 3, background: "var(--bg-input, var(--bg-surface-low))", border: "1px solid var(--border-default)", color: "var(--text-primary)", outline: "none" };
const lbl = { ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: 4 };
const btn = { ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: "7px 14px", borderRadius: 3, border: "1px solid var(--border-default)", cursor: "pointer" };
const btnP = { ...btn, background: "var(--accent-muted)", borderColor: "var(--accent)", color: "var(--accent)" };
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function NewAppModal({ open, defaultRetainage, onClose, onCreate, busy }) {
  const [periodFrom, setFrom] = useState("");
  const [periodTo, setTo] = useState(localToday());
  const [retainage, setRetainage] = useState(String(defaultRetainage ?? 10));
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }} onClick={onClose}>
      <div style={{ ...card, width: 440, maxWidth: "92vw" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 14px", fontSize: 16, color: "var(--text-primary)" }}>New Pay Application</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div><span style={lbl}>Period from</span><input style={{ ...input, width: "100%" }} type="date" value={periodFrom} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><span style={lbl}>Period to</span><input style={{ ...input, width: "100%" }} type="date" value={periodTo} onChange={(e) => setTo(e.target.value)} /></div>
          <div><span style={lbl}>Retainage %</span><input style={{ ...input, width: "100%" }} type="number" value={retainage} onChange={(e) => setRetainage(e.target.value)} /></div>
        </div>
        <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginBottom: 14 }}>Lines are drafted from this project&apos;s Schedule of Values; prior completed work carries forward.</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button style={{ ...btn, background: "var(--bg-page)", color: "var(--text-muted)" }} onClick={onClose} disabled={busy}>Cancel</button>
          <button style={btnP} disabled={busy} onClick={() => onCreate({ periodFrom: periodFrom || null, periodTo: periodTo || null, retainagePercent: num(retainage) })}>{busy ? "Creating…" : "Create"}</button>
        </div>
      </div>
    </div>
  );
}

export default function PayApplications() {
  const { activeProject } = useProjectContext();
  const projectId = activeProject?.id;
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [newOpen, setNewOpen] = useState(false);

  const { data: payApps = [], isLoading } = useQuery({ queryKey: ["pay_applications", projectId], queryFn: () => listPayApplications(projectId), enabled: !!projectId });
  const { data: sovItems = [] } = useQuery({
    queryKey: ["sov_items_payapp", projectId],
    queryFn: async () => {
      const { data } = await supabase.from("sov_items").select("id, line_item_number, description, scheduled_value").eq("project_id", projectId).eq("is_deleted", false);
      return data || [];
    },
    enabled: !!projectId,
  });
  const { data: changeOrders = [] } = useQuery({ queryKey: ["change_orders", projectId], queryFn: () => entities.ChangeOrder.filter({ project_id: projectId }), enabled: !!projectId, staleTime: 60_000 });

  const contract = useMemo(() => ({
    originalContractSum: num(activeProject?.original_contract_value),
    netChangeOrders: sumMoney((changeOrders || []).filter((co) => String(co.status).toLowerCase() === "approved").map((co) => co.co_amount)),
    retainagePercent: num(activeProject?.retainage_percent),
  }), [activeProject, changeOrders]);

  const selectedApp = payApps.find((a) => a.id === selectedId) || null;
  const { data: lines = [] } = useQuery({ queryKey: ["payapp_lines", selectedId], queryFn: () => listLines(selectedId), enabled: !!selectedId });
  const g702 = useMemo(() => (selectedApp ? computeG702({
    contract: { originalContractSum: num(selectedApp.original_contract_sum), netChangeOrders: num(selectedApp.net_change_orders), retainagePercent: num(selectedApp.retainage_percent) },
    lines,
    lessPreviousCertificates: num(selectedApp.less_previous_certificates),
  }) : null), [selectedApp, lines]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["pay_applications", projectId] });
    if (selectedId) qc.invalidateQueries({ queryKey: ["payapp_lines", selectedId] });
  };

  const createMut = useMutation({
    mutationFn: (input) => createPayApplication({ projectId, ...input }, { sovItems, contract }),
    onSuccess: (app) => { logActivity("pay_application", "created", app, { projectId }); refresh(); setNewOpen(false); setSelectedId(app.id); toast.success(`Pay Application #${app.application_number} created`); },
    onError: (e) => toast.error(e?.message?.includes("row-level security") ? "Only PM+ can create pay applications." : `Create failed: ${e?.message}`),
  });
  const lineMut = useMutation({
    mutationFn: ({ line, edit }) => updateLine(line, edit, num(selectedApp?.retainage_percent)),
    onSuccess: () => refresh(),
    onError: (e) => toast.error(`Update failed: ${e?.message}`),
  });
  const statusMut = useMutation({ mutationFn: ({ id, status }) => updatePayApplication(id, { status }), onSuccess: (data, { status }) => { logActivity("pay_application", "status_changed", data, { projectId, description: `→ ${status}` }); refresh(); toast.success("Updated"); }, onError: (e) => toast.error(`Update failed: ${e?.message}`) });
  const delMut = useMutation({ mutationFn: (id) => softDeletePayApplication(id), onSuccess: (_r, id) => { logActivity("pay_application", "deleted", { id, project_id: projectId }, { projectId }); refresh(); setSelectedId(null); toast.success("Deleted"); }, onError: (e) => toast.error(`Delete failed: ${e?.message}`) });

  const exportPdf = () => {
    try {
      buildPayAppPdf({ app: selectedApp, lines, project: activeProject }).save(`${suggestPayAppFilename(selectedApp, activeProject)}.pdf`);
      toast.success("Pay application PDF exported");
    } catch (e) { toast.error(`Export failed: ${e?.message}`); }
  };

  if (!projectId) return <div style={{ ...mono, padding: 24, color: "var(--text-muted)" }}>Select a project to manage pay applications.</div>;

  const summary = g702 && [
    ["1 Original contract sum", g702.originalContractSum],
    ["2 Net change orders", g702.netChangeOrders],
    ["3 Contract sum to date", g702.contractSumToDate],
    ["4 Completed & stored to date", g702.totalCompletedStored],
    ["5 Retainage", g702.totalRetainage],
    ["6 Earned less retainage", g702.totalEarnedLessRetainage],
    ["7 Less previous certificates", g702.lessPreviousCertificates],
    ["8 CURRENT PAYMENT DUE", g702.currentPaymentDue],
    ["9 Balance to finish", g702.balanceToFinish],
  ];

  return (
    <div style={{ padding: 20, maxWidth: 1240, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, color: "var(--text-primary)" }}>Pay Applications</h1>
          <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>AIA G702/G703 from the SOV — enter progress, export the certificate.</div>
        </div>
        <button style={btnP} disabled={sovItems.length === 0} title={sovItems.length === 0 ? "Add SOV line items first" : undefined} onClick={() => setNewOpen(true)}>+ New Application</button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {isLoading ? <span style={{ ...mono, fontSize: 12, color: "var(--text-muted)" }}>Loading…</span>
          : payApps.length === 0 ? <span style={{ ...mono, fontSize: 12, color: "var(--text-muted)" }}>No pay applications yet.</span>
            : payApps.map((a) => (
              <button key={a.id} onClick={() => setSelectedId(a.id)} style={{
                ...card, padding: "10px 14px", cursor: "pointer", textAlign: "left",
                borderColor: selectedId === a.id ? "var(--accent)" : "var(--border-default)",
                background: selectedId === a.id ? "var(--accent-muted)" : "var(--bg-surface-secondary)",
              }}>
                <div style={{ ...mono, fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>App #{a.application_number}</div>
                <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>{a.period_to ? formatLocalDate(a.period_to) : "—"} · {PAY_APP_STATUS_LABELS[a.status] || a.status}</div>
                <div style={{ ...mono, fontSize: 12, color: "var(--accent)", marginTop: 2 }}>{formatMoney(a.current_payment_due)}</div>
              </button>
            ))}
      </div>

      {selectedApp && (
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, alignItems: "start" }}>
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>G702 Summary</div>
              <button onClick={() => setSelectedId(null)} style={{ ...btn, padding: "3px 7px" }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 12 }}>
              {summary.map(([k, v], i) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "3px 0", borderTop: i > 0 ? "1px solid var(--border-subtle, var(--border-default))" : "none" }}>
                  <span style={{ ...mono, fontSize: 10, color: k.includes("CURRENT") ? "var(--accent)" : "var(--text-muted)", fontWeight: k.includes("CURRENT") ? 700 : 400 }}>{k}</span>
                  <span style={{ ...mono, fontSize: 11, fontWeight: 700, color: k.includes("CURRENT") ? "var(--accent)" : "var(--text-primary)" }}>{formatMoney(v)}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <select style={{ ...input, width: "auto" }} value={selectedApp.status} onChange={(e) => statusMut.mutate({ id: selectedApp.id, status: e.target.value })}>
                {PAY_APP_STATUSES.map((s) => <option key={s} value={s}>{PAY_APP_STATUS_LABELS[s]}</option>)}
              </select>
              <button style={btnP} onClick={exportPdf}>Export PDF</button>
              <button style={{ ...btn, color: "var(--status-error)", borderColor: "var(--status-error)" }} onClick={() => { if (confirm("Delete this pay application?")) delMut.mutate(selectedApp.id); }}>Delete</button>
            </div>
          </div>

          <div style={{ ...card, overflowX: "auto" }}>
            <div style={{ ...lbl, marginBottom: 8 }}>G703 Continuation Sheet — enter % complete &amp; stored</div>
            <table style={{ ...mono, width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ color: "var(--text-muted)", textAlign: "right" }}>
                  <th style={{ textAlign: "left", padding: 4 }}>#</th>
                  <th style={{ textAlign: "left", padding: 4 }}>Description</th>
                  <th style={{ padding: 4 }}>Scheduled</th>
                  <th style={{ padding: 4 }}>Previous</th>
                  <th style={{ padding: 4 }}>This period</th>
                  <th style={{ padding: 4 }}>% compl</th>
                  <th style={{ padding: 4 }}>Stored</th>
                  <th style={{ padding: 4 }}>Total</th>
                  <th style={{ padding: 4 }}>Balance</th>
                  <th style={{ padding: 4 }}>Retainage</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const f = lineFigures(l);
                  return (
                    <tr key={l.id} style={{ borderTop: "1px solid var(--border-default)", textAlign: "right" }}>
                      <td style={{ textAlign: "left", padding: 4, color: "var(--text-muted)" }}>{l.line_item_number}</td>
                      <td style={{ textAlign: "left", padding: 4, color: "var(--text-primary)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.description}</td>
                      <td style={{ padding: 4, color: "var(--text-secondary)" }}>{formatMoney(l.scheduled_value)}</td>
                      <td style={{ padding: 4, color: "var(--text-muted)" }}>{formatMoney(l.work_completed_previous)}</td>
                      <td style={{ padding: 4, color: "var(--text-primary)" }}>{formatMoney(l.work_completed_this_period)}</td>
                      <td style={{ padding: 4 }}>
                        <input style={{ ...input, width: 56, textAlign: "right", padding: "3px 5px" }} type="number" defaultValue={num(l.percent_complete)}
                          onBlur={(e) => { const v = num(e.target.value); if (v !== num(l.percent_complete)) lineMut.mutate({ line: l, edit: { percentComplete: v } }); }} />
                      </td>
                      <td style={{ padding: 4 }}>
                        <input style={{ ...input, width: 76, textAlign: "right", padding: "3px 5px" }} type="number" defaultValue={num(l.materials_stored)}
                          onBlur={(e) => { const v = num(e.target.value); if (v !== num(l.materials_stored)) lineMut.mutate({ line: l, edit: { materialsStored: v } }); }} />
                      </td>
                      <td style={{ padding: 4, color: "var(--text-primary)", fontWeight: 700 }}>{formatMoney(f.totalCompletedStored)}</td>
                      <td style={{ padding: 4, color: "var(--text-muted)" }}>{formatMoney(f.balanceToFinish)}</td>
                      <td style={{ padding: 4, color: "var(--text-secondary)" }}>{formatMoney(l.retainage)}</td>
                    </tr>
                  );
                })}
                {lines.length === 0 && <tr><td colSpan={10} style={{ padding: 10, color: "var(--text-muted)", textAlign: "center" }}>No lines.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <NewAppModal
        open={newOpen}
        defaultRetainage={contract.retainagePercent}
        busy={createMut.isPending}
        onClose={() => setNewOpen(false)}
        onCreate={(input) => createMut.mutate(input)}
      />
    </div>
  );
}
