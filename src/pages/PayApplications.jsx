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
import { localToday } from "@/utils/dates";
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
import PayApplicationsControlCenter from "./payApplications/PayApplicationsControlCenter";
import { assertProjectId, toUserErrorMessage } from "@/lib/mutations/standardMutation";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { Button } from "@/components/design-system";

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
  const [ccSearch, setCcSearch] = useState("");
  const [ccStatusFilter, setCcStatusFilter] = useState("all");

  const {
    data: payApps = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({ queryKey: ["pay_applications", projectId], queryFn: () => listPayApplications(projectId), enabled: !!projectId });
  const { data: sovItems = [] } = useQuery({
    queryKey: ["sov_items_payapp", projectId],
    queryFn: async () => {
      const { data } = await supabase.from("sov_items").select("id, line_item_number, description, scheduled_value").eq("project_id", projectId).eq("is_deleted", false);
      return data || [];
    },
    enabled: !!projectId,
  });
  // Key must be the cacheRegistry `change_order` primary (hyphenated). It was
  // ["change_orders", projectId], which no invalidation ever matched — so
  // approving a CO left this pay app billing against a stale contract sum.
  const { data: changeOrders = [] } = useQuery({ queryKey: ["change-orders", projectId], queryFn: () => entities.ChangeOrder.filter({ project_id: projectId }), enabled: !!projectId, staleTime: 60_000 });

  const contract = useMemo(() => ({
    originalContractSum: num(activeProject?.original_contract_value),
    netChangeOrders: sumMoney((changeOrders || []).filter((co) => String(co.status).toLowerCase() === "approved").map((co) => co.co_amount)),
    retainagePercent: num(activeProject?.retainage_percent),
  }), [activeProject, changeOrders]);

  const selectedApp = payApps.find((a) => a.id === selectedId) || null;
  // Only a DRAFT pay app is editable — once submitted/approved/paid the G703
  // figures are a billing record (locked in the UI here + by the DB trigger, C2).
  const isDraft = selectedApp?.status === "draft";
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
    mutationFn: (input) => {
      assertProjectId(projectId);
      return createPayApplication({ projectId, ...input }, { sovItems, contract });
    },
    onSuccess: (app) => { logActivity("pay_application", "created", app, { projectId }); refresh(); setNewOpen(false); setSelectedId(app.id); toast.success(`Pay Application #${app.application_number} created`); },
    onError: (e) => {
      const msg = toUserErrorMessage(e);
      toast.error(msg.includes("row-level security") ? "Only PM+ can create pay applications." : `Create failed: ${msg}`);
    },
  });
  const lineMut = useMutation({
    mutationFn: ({ line, edit }) => updateLine(line, edit, num(selectedApp?.retainage_percent)),
    onSuccess: (_app, { line, edit }) => {
      // Audit every figure change (previously silently unlogged — §23).
      const desc = edit.percentComplete != null
        ? `G703 line ${line.line_item_number ?? line.id}: % complete ${num(line.percent_complete)} → ${edit.percentComplete}`
        : `G703 line ${line.line_item_number ?? line.id}: stored ${num(line.materials_stored)} → ${edit.materialsStored}`;
      logActivity("pay_application", "updated", { id: selectedApp?.id, project_id: projectId, application_number: selectedApp?.application_number }, { projectId, description: desc });
      refresh();
    },
    onError: (e) => toast.error(`Update failed: ${toUserErrorMessage(e)}`),
  });
  const statusMut = useMutation({
    mutationFn: ({ id, status }) => updatePayApplication(id, { status }),
    onSuccess: (data, { status }) => { logActivity("pay_application", "status_changed", data, { projectId, description: `→ ${status}` }); refresh(); toast.success("Updated"); },
    onError: (e) => toast.error(`Update failed: ${toUserErrorMessage(e)}`),
  });
  const delMut = useMutation({
    mutationFn: (id) => softDeletePayApplication(id),
    onSuccess: (_r, id) => { logActivity("pay_application", "deleted", { id, project_id: projectId }, { projectId }); refresh(); setSelectedId(null); toast.success("Deleted"); },
    onError: (e) => toast.error(`Delete failed: ${toUserErrorMessage(e)}`),
  });

  const exportPdf = () => {
    try {
      buildPayAppPdf({ app: selectedApp, lines, project: activeProject }).save(`${suggestPayAppFilename(selectedApp, activeProject)}.pdf`);
      toast.success("Pay application PDF exported");
    } catch (e) { toast.error(`Export failed: ${toUserErrorMessage(e)}`); }
  };

  if (!projectId) return <div style={{ ...mono, padding: 24, color: "var(--text-muted)" }}>Select a project to manage pay applications.</div>;

  // Gate fetch states at the page shell — PayApplicationsControlCenter has no loading props.
  if (isLoading) {
    return (
      <div style={{ padding: 24 }}>
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        gap: 16,
      }}>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>
          Couldn’t load pay applications
        </p>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", margin: 0, textAlign: "center", maxWidth: 320 }}>
          {toUserErrorMessage(error, "Something went wrong. Try again.")}
        </p>
        <Button variant="outline" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  // G702 summary rows used by the canonical control-center editor.
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

  // Filtered list used by the canonical control-center table.
  const ccFiltered = payApps.filter((a) => {
    if (a.is_deleted) return false;
    if (ccStatusFilter !== "all" && a.status !== ccStatusFilter) return false;
    if (ccSearch.trim()) {
      const q = ccSearch.trim().toLowerCase();
      const appNum = String(a.application_number || "").toLowerCase();
      const period = `${a.period_from || ""} ${a.period_to || ""}`.toLowerCase();
      const notes = (a.notes || "").toLowerCase();
      if (!appNum.includes(q) && !period.includes(q) && !notes.includes(q)) return false;
    }
    return true;
  });

  return (
      <>
        <PayApplicationsControlCenter
          projectName={activeProject?.name || "Project"}
          payApps={payApps}
          filtered={ccFiltered}
          search={ccSearch}
          onSearch={setCcSearch}
          statusFilter={ccStatusFilter}
          onStatusFilter={setCcStatusFilter}
          onOpen={(app) => setSelectedId(app.id)}
          onExport={selectedId ? exportPdf : null}
          onCreate={sovItems.length > 0 ? () => setNewOpen(true) : null}
          canCreate={sovItems.length > 0}
        />
        {selectedApp && (
          <div style={{ padding: "0 20px 20px", maxWidth: 1240, margin: "0 auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, alignItems: "start" }}>
              <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>G702 Summary — App #{selectedApp.application_number}</div>
                  <button onClick={() => setSelectedId(null)} style={{ ...btn, padding: "3px 7px" }}>✕</button>
                </div>
                {summary && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 12 }}>
                    {summary.map(([k, v], i) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "3px 0", borderTop: i > 0 ? "1px solid var(--border-subtle, var(--border-default))" : "none" }}>
                        <span style={{ ...mono, fontSize: 10, color: k.includes("CURRENT") ? "var(--accent)" : "var(--text-muted)", fontWeight: k.includes("CURRENT") ? 700 : 400 }}>{k}</span>
                        <span style={{ ...mono, fontSize: 11, fontWeight: 700, color: k.includes("CURRENT") ? "var(--accent)" : "var(--text-primary)" }}>{formatMoney(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <select style={{ ...input, width: "auto" }} value={selectedApp.status} onChange={(e) => statusMut.mutate({ id: selectedApp.id, status: e.target.value })}>
                    {PAY_APP_STATUSES.map((s) => <option key={s} value={s}>{PAY_APP_STATUS_LABELS[s]}</option>)}
                  </select>
                  <button style={btnP} onClick={exportPdf}>Export PDF</button>
                  <button style={{ ...btn, color: "var(--status-error)", borderColor: "var(--status-error)", opacity: isDraft ? 1 : 0.4, cursor: isDraft ? "pointer" : "not-allowed" }} disabled={!isDraft} title={isDraft ? "" : "Only a draft pay application can be deleted — set status to void instead."} onClick={() => { if (confirm("Delete this pay application?")) delMut.mutate(selectedApp.id); }}>Delete</button>
                </div>
              </div>
              <div style={{ ...card, overflowX: "auto" }}>
                <div style={{ ...lbl, marginBottom: 8 }}>G703 Continuation Sheet — {isDraft ? "enter % complete & stored" : <span style={{ color: "var(--status-warning, var(--accent))" }}>🔒 {PAY_APP_STATUS_LABELS[selectedApp.status] || selectedApp.status} — figures locked</span>}</div>
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
                            <input style={{ ...input, width: 56, textAlign: "right", padding: "3px 5px", opacity: isDraft ? 1 : 0.55 }} type="number" defaultValue={num(l.percent_complete)} disabled={!isDraft}
                              onBlur={(e) => { const v = num(e.target.value); if (v !== num(l.percent_complete)) lineMut.mutate({ line: l, edit: { percentComplete: v } }); }} />
                          </td>
                          <td style={{ padding: 4 }}>
                            <input style={{ ...input, width: 76, textAlign: "right", padding: "3px 5px", opacity: isDraft ? 1 : 0.55 }} type="number" defaultValue={num(l.materials_stored)} disabled={!isDraft}
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
          </div>
        )}
        <NewAppModal
          open={newOpen}
          defaultRetainage={contract.retainagePercent}
          busy={createMut.isPending}
          onClose={() => setNewOpen(false)}
          onCreate={(input) => createMut.mutate(input)}
        />
      </>
    );
}
