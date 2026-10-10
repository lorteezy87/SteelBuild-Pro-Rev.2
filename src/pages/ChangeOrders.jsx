/**
 * Project commercial control: complete evidence, explicit SOV decisions, and
 * origin-bound writes. The database owns numbering, approvals, and reversals.
 */
import React, { useState, useEffect, useMemo, useRef } from "react";
import { entities } from "@/api/supabaseClient";
import { computeRevisedContractValue } from "@/services/costRollup";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useOrg } from "@/components/shared/OrgContext";
import { useProjectId } from "@/hooks/useProjectId";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { useAutoOpenEdit } from "@/hooks/useAutoOpenEdit";
import { useAutoOpenCreate } from "@/hooks/useAutoOpenCreate";
import DeleteDialog from "@/components/shared/DeleteDialog";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import COFormModal from "@/components/changeorders/COFormModal";
import ChangeOrderImportModal from "@/components/changeorders/ChangeOrderImportModal";
import ChangeOrderApprovalDialog from "@/components/changeorders/ChangeOrderApprovalDialog";
import { toast } from "sonner";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import { toastCrudError } from "@/components/shared/crudFeedback";
import { usePermissions } from "@/services/permissions";
import { batchProcess } from "@/utils/batchProcess";
import { invalidateEntity } from "@/services/cacheRegistry";
import CoControlCenter from "./changeOrders/CoControlCenter";
import { reconcileSelectedIds, summarizeBulkResult } from "./changeOrders/changeOrderBulk";
import { changeOrderEvidenceKey, loadChangeOrderEvidence, assertChangeOrderEvidence } from "./changeOrders/evidence";
import { BulkActionBar } from "@/components/design-system";
import { presentGeneratedFile } from "@/lib/native/fileExport";
import { canMoveChangeOrder } from "@/lib/changeOrders/lifecycle";
import { getActiveOrgGeneration } from "@/lib/activeOrg";
import { getNumberedCreateRecovery, retainNumberedCreateRecovery, clearNumberedCreateRecovery, completeNumberedCreateRecovery } from "@/lib/numberedCreateRecovery";

const EMPTY = [];
const RECOVERY_NAMESPACE = "change-orders-register";
const reviewed = record => ({ updatedAt: record.updated_at ?? null, status: record.status, amount: record.co_amount ?? null });
export default function ChangeOrders() {
  const qc = useQueryClient();
  const projectId = useProjectId();
  const { currentOrg, isLoadingOrgs } = useOrg();
  const orgId = currentOrg?.id;
  const { can } = usePermissions();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [editor, setEditor] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [approval, setApproval] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [bulkAction, setBulkAction] = useState(null);
  const requestBusy = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const orgGeneration = getActiveOrgGeneration();
  const scope = useRef({ projectId, orgId, generation: 0, orgGeneration });
  if (scope.current.projectId !== projectId || scope.current.orgId !== orgId || scope.current.orgGeneration !== orgGeneration) {
    scope.current = { projectId, orgId, generation: scope.current.generation + 1, orgGeneration };
  }
  const origin = scope.current;
  const editorSequence = useRef(0);
  const deleteSequence = useRef(0);
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const permissions = useRef(can);
  permissions.current = can;
  const isCurrent = (captured) => mounted.current && scope.current === captured && captured.orgGeneration === getActiveOrgGeneration();
  const closeEditor = () => { editorSequence.current += 1; setEditor(null); };
  const openEditor = (record = null, prefill = null) => {
    if (!isCurrent(origin)) return;
    const recovery = record ? null : getNumberedCreateRecovery(RECOVERY_NAMESPACE, projectId);
    setEditor({ id: ++editorSequence.current, origin, record, clientOperationId: recovery?.operation || crypto.randomUUID(),
      recoveryPayload: recovery?.payload || null, prefill: recovery?.payload || prefill || { project_id: projectId } });
  };
  useEffect(() => {
    closeEditor(); setImportOpen(false); setDeleteTarget(null); setApproval(null);
    setSelectedIds(new Set()); setBulkAction(null);
  }, [projectId, orgId, orgGeneration]);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const evidence = useQuery({
    queryKey: changeOrderEvidenceKey(projectId, orgId),
    queryFn: () => loadChangeOrderEvidence(projectId, orgId),
    enabled: !!projectId && !!orgId && !isLoadingOrgs,
  });
  const snapshot = evidence.data?.projectId === projectId && evidence.data?.orgId === orgId ? evidence.data : null;
  const cos = snapshot?.cos || EMPTY;
  const sovItems = snapshot?.sovItems || EMPTY;
  const rfis = snapshot?.rfis || EMPTY;
  const projects = useMemo(() => snapshot ? [snapshot.project] : EMPTY, [snapshot]);
  const ready = !!snapshot && !evidence.isError && !evidence.isFetching;
  const activeEditor = editor?.origin === origin ? editor : null;
  const editing = activeEditor?.record;
  const prefill = activeEditor?.prefill;
  const assertWrite = (captured, action, recordId = null, targetProjectId = null) => {
    if (!isCurrent(captured)) throw new Error("Workspace or project changed. Reopen this operation.");
    if (!permissions.current(action, "change_order")) throw new Error("You do not have permission for this change-order action.");
    if (targetProjectId && targetProjectId !== captured.projectId) throw new Error("A change order cannot move to another project.");
    const proven = assertChangeOrderEvidence(qc, captured.projectId, captured.orgId);
    if (recordId && !proven.cos.some(co => co.id === recordId)) throw new Error("This change order is no longer in the selected project.");
    return proven;
  };
  const refreshCommercial = (captured) => Promise.all([
    invalidateEntity(qc, "change_order", captured.projectId),
    invalidateEntity(qc, "sov_item", captured.projectId),
  ]);
  useAutoOpenCreate(() => openEditor(), { enabled: ready && can("create", "change_order") });
  useAutoOpenEdit(cos, record => openEditor(record), { enabled: ready && can("edit", "change_order"), param: "recordId" });
  useRealtimeInvalidation("change_orders", projectId, [["change-orders", projectId]]);
  useRealtimeInvalidation("sov_items", projectId, [["change-orders", projectId]]);
  useRealtimeInvalidation("rfis", projectId, [["change-orders", projectId]]);

  useEffect(() => {
    const fromRfi = searchParams.get("fromRfi");
    if (!fromRfi || !ready || !can("create", "change_order")) return;
    const rfi = rfis.find(record => record.id === fromRfi);
    if (rfi) {
      const label = rfi.rfi_number ? `RFI ${rfi.rfi_number}` : "RFI";
      openEditor(null, {
        source_rfi_id: rfi.id, project_id: projectId,
        title: `${label}: ${rfi.title || rfi.subject || "cost change"}`.slice(0, 200),
        description: rfi.question || rfi.description || "", reason_code: "Design Change",
        co_amount: Number(rfi.cost_impact_amount) || 0, schedule_impact_days: Number(rfi.schedule_impact_days) || 0,
      });
    } else toast.error("The source RFI is not available in this project.");
    const next = new URLSearchParams(searchParams);
    next.delete("fromRfi");
    setSearchParams(next, { replace: true });
    // The completed snapshot and route determine when this handoff can be consumed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, ready, rfis, projectId, setSearchParams]);

  const saveMut = useMutation({
    mutationFn: async ({ draft, data }) => {
      if (requestBusy.current) throw new Error("Wait for the current commercial operation to finish.");
      const recordId = draft.record?.id;
      assertWrite(draft.origin, recordId ? "edit" : "create", recordId, data.project_id);
      if (data.status === "Approved" && draft.record?.status !== "Approved") assertWrite(draft.origin, "approve", recordId);
      if (data.status === "Void" && draft.record?.status !== "Void") assertWrite(draft.origin, "void", recordId);
      requestBusy.current = true;
      try {
        if (recordId) return await entities.ChangeOrder.update(recordId, data, { changeOrderReview: reviewed(draft.record) });
        const { co_number: _number, ...payload } = data;
        const attempted = draft.recoveryPayload || structuredClone({ ...payload, project_id: draft.origin.projectId });
        const reservation = retainNumberedCreateRecovery(RECOVERY_NAMESPACE, draft.origin.projectId, draft.clientOperationId, attempted, draft.origin.orgGeneration);
        if (reservation === undefined) throw new Error("This save is already resolved or another draft needs recovery. Close and reopen the editor.");
        try {
          const result = await entities.ChangeOrder.create(attempted, { clientOperationId: draft.clientOperationId });
          if (!isCurrent(draft.origin) || editorRef.current?.id !== draft.id) {
            throw Object.assign(new Error("The save completed for the previous draft. Reopen its editor to recover the saved change order."), { outcomeUnknown: true });
          }
          completeNumberedCreateRecovery(RECOVERY_NAMESPACE, draft.origin.projectId, draft.clientOperationId, draft.origin.orgGeneration);
          return result;
        } catch (error) {
          if (error?.outcomeUnknown === true) {
            draft.recoveryPayload = attempted;
            if (isCurrent(draft.origin)) setEditor(current => current?.id === draft.id ? { ...current, recoveryPayload: attempted } : current);
          } else if (!draft.recoveryPayload) clearNumberedCreateRecovery(RECOVERY_NAMESPACE, draft.origin.projectId, draft.clientOperationId, draft.origin.orgGeneration, reservation);
          throw error;
        }
      } finally { requestBusy.current = false; }
    },
    onSuccess: async (_saved, { draft }) => {
      await refreshCommercial(draft.origin);
      if (isCurrent(draft.origin) && editorRef.current?.id === draft.id) {
        closeEditor(); toast.success(draft.record ? "Change order updated" : "Change order created");
      }
    },
    onError: async (error, { draft }) => {
      await refreshCommercial(draft.origin);
      if (isCurrent(draft.origin) && editorRef.current?.id === draft.id) toastCrudError(error, "Failed to save change order");
    },
  });
  const deleteMut = useMutation({
    mutationFn: async (target) => {
      if (requestBusy.current) throw new Error("Wait for the current commercial operation to finish.");
      const proven = assertWrite(target.origin, "delete", target.record.id);
      if (proven.cos.find(co => co.id === target.record.id)?.status === "Approved") throw new Error("Void an approved change order before archiving it.");
      requestBusy.current = true;
      try { return await entities.ChangeOrder.delete(target.record.id); }
      finally { requestBusy.current = false; }
    },
    onSuccess: async (_saved, target) => {
      await refreshCommercial(target.origin);
      if (isCurrent(target.origin)) {
        setDeleteTarget(current => current === target ? null : current);
        setSelectedIds(current => new Set([...current].filter(id => id !== target.record.id)));
      }
      toast.success("Change order archived");
    },
    onError: error => toastCrudError(error, "Failed to archive change order"),
  });
  const runBulk = async (action, ids, captured, decision = null, reviewedRecords = null) => {
    if (!ids.length || requestBusy.current) throw new Error("Wait for the current commercial operation to finish.");
    ids.forEach(id => assertWrite(captured, action === "approve" ? "approve" : action === "delete" ? "delete" : "edit", id));
    requestBusy.current = true;
    setBulkAction(action);
    try {
      // A shared SOV line receives additions before deducts; each CO still reports its own result.
      const ordered = action === "approve" && decision?.sov_mode === "adjust_line"
        ? [...ids].sort((left, right) => Number(reviewedRecords?.find(co => co.id === right)?.co_amount || 0) - Number(reviewedRecords?.find(co => co.id === left)?.co_amount || 0)) : ids;
      const result = await batchProcess(ordered, async id => {
        const proven = assertWrite(captured, action === "approve" ? "approve" : action === "delete" ? "delete" : "edit", id);
        if (action === "delete") {
          if (proven.cos.find(co => co.id === id)?.status === "Approved") throw new Error("Void approved change orders before archiving.");
          return entities.ChangeOrder.delete(id);
        }
        const record = (reviewedRecords || proven.cos).find(co => co.id === id);
        if (!record) throw new Error("The reviewed change order is no longer available.");
        return entities.ChangeOrder.update(id, action === "approve" ? { ...decision, status: "Approved" } : { status: "Submitted" }, { changeOrderReview: reviewed(record) });
      }, action === "approve" && decision?.sov_mode === "adjust_line" ? 1 : 5);
      await refreshCommercial(captured);
      if (isCurrent(captured)) {
        setSelectedIds(current => new Set([...current].filter(id => !result.succeeded.some(success => success.item === id))));
        if (action === "approve") setApproval(current => current?.origin === captured
          ? (result.failed.length ? { ...current, records: current.records.filter(co => result.failed.some(failure => failure.item === co.id)) } : null) : current);
      }
      const outcome = summarizeBulkResult(action, ids.length, result.succeeded.length, result.failed.length);
      toast[outcome.level](outcome.message);
      if (result.failed.length) throw new Error(`${result.failed.length} change order(s) still need attention. ${toUserErrorMessage(result.failed[0].error, "Refresh and retry the remaining records.")}`);
    } finally {
      requestBusy.current = false;
      if (isCurrent(captured)) setBulkAction(null);
    }
  };
  const bulkSubmit = () => runBulk("submit", [...selectedIds], origin).catch(error => toastCrudError(error, "Failed to submit change orders"));
  const bulkDelete = () => {
    if (!window.confirm(`Archive ${selectedIds.size} change order(s)?`)) return;
    void runBulk("delete", [...selectedIds], origin).catch(error => toastCrudError(error, "Failed to archive change orders"));
  };
  const handleSave = data => {
    if (!activeEditor || editorRef.current?.id !== activeEditor.id || !isCurrent(activeEditor.origin)) return;
    return saveMut.mutateAsync({ draft: activeEditor, data });
  };

  const filtered = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    return cos.filter(co => (filter === "all" || co.status === filter) &&
      (!query || [co.co_number, co.title, co.description, co.reason_code].some(value => (value || "").toLowerCase().includes(query))));
  }, [cos, filter, debouncedSearch]);
  useEffect(() => {
    setSelectedIds(current => {
      const next = reconcileSelectedIds(current, filtered.map(co => co.id));
      return next.size === current.size ? current : next;
    });
  }, [filtered]);
  const toggleSelect = id => setSelectedIds(current => {
    const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const sourceRfi = rfis.find(rfi => rfi.id === (prefill?.source_rfi_id || editing?.source_rfi_id));
  const sourceRfiLabel = sourceRfi?.rfi_number ? `RFI ${sourceRfi.rfi_number}` : "";
  const retry = () => evidence.refetch();
  if (!projectId || !orgId) return <div className="sb-dashboard-reference-page" style={{ padding: 32 }}>Select a workspace and project to view change orders.</div>;
  if (!snapshot && (isLoadingOrgs || evidence.isPending)) return <div style={{ padding: 24 }}><LoadingSkeleton variant="table" rows={8} /></div>;
  if (!snapshot) return <div className="sb-dashboard-reference-page" role="alert" style={{ padding: 32 }}>
    <h2>Couldn’t load commercial records</h2><p>{toUserErrorMessage(evidence.error, "The complete project register is unavailable.")}</p>
    <button type="button" onClick={retry}>Retry</button>
  </div>;
  const liveProject = snapshot.project;
  const projectName = liveProject.name || "";
  const exportCsv = () => {
    // Quote every value and neutralize spreadsheet formulas in user-authored text.
    const cell = value => {
      let text = String(value ?? "");
      if (typeof value !== "number" && /^[=+@-]/.test(text.trimStart())) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const rows = [["CO #", "Title", "Status", "Reason Code", "Amount", "Sched Impact (d)", "Submitted", "Approved", "Approved By"],
      ...filtered.map(co => [co.co_number, co.title, co.status, co.reason_code, Number(co.co_amount), co.schedule_impact_days, co.submitted_date, co.approved_date, co.approved_by])];
    void presentGeneratedFile({ blob: new Blob([rows.map(row => row.map(cell).join(",")).join("\n")], { type: "text/csv" }),
      filename: `change-orders-${projectName.replace(/\s+/g, "-")}.csv`, title: "Change orders" });
  };
  return <div className="co-page">
    {!ready && <div role={evidence.isError ? "alert" : "status"} style={{ padding: 16, background: "var(--bg-surface)", color: "var(--text-secondary)" }}>
      {evidence.isError ? `Showing the last complete register. ${toUserErrorMessage(evidence.error, "Refresh failed.")}` : "Refreshing commercial records."}
      {" "}Saving and approvals are paused until the records are current.
      {evidence.isError && <button type="button" onClick={retry}>Retry</button>}
    </div>}
    <CoControlCenter projectName={projectName} cos={cos} filtered={filtered} search={search} onSearch={setSearch}
      statusFilter={filter} onFilterChange={setFilter}
      onOpenCo={co => openEditor(co)}
      onDeleteCo={ready && can("delete", "change_order") ? co => setDeleteTarget({ record: co, origin, key: ++deleteSequence.current }) : null}
      onExport={exportCsv}
      onCreate={ready && can("create", "change_order") ? () => openEditor() : null}
      onImport={ready && can("create", "change_order") ? () => setImportOpen(true) : null}
      baseContract={Number(liveProject.original_contract_value) || 0} revisedContract={computeRevisedContractValue(liveProject, cos)}
      projectHealth={liveProject.health_status || null}
      percentComplete={liveProject.scope_complete_pct_override != null ? Number(liveProject.scope_complete_pct_override) : null}
      selectedIds={selectedIds} onToggleSelect={toggleSelect}
      onToggleAll={checked => setSelectedIds(checked ? new Set(filtered.map(co => co.id)) : new Set())} />
    <BulkActionBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())} actions={[
      ...(can("edit", "change_order") ? [{ label: bulkAction === "submit" ? "SUBMITTING..." : "SUBMIT SELECTED", icon: "arrow", disabled: !ready || Boolean(bulkAction), onClick: bulkSubmit }] : []),
      ...(can("approve", "change_order") ? [{ label: bulkAction === "approve" ? "APPROVING..." : "APPROVE", icon: "check", disabled: !ready || Boolean(bulkAction),
        onClick: () => {
          const records = cos.filter(co => selectedIds.has(co.id));
          if (records.some(co => co.status === "Approved" || !canMoveChangeOrder(co.status, "Approved"))) {
            toast.error("Select only draft, submitted, or under-review change orders for approval."); return;
          }
          setApproval({ records, origin });
        } }] : []),
      ...(can("delete", "change_order") ? [{ label: bulkAction === "delete" ? "ARCHIVING..." : "ARCHIVE", icon: "x", variant: "danger",
        disabled: !ready || Boolean(bulkAction), onClick: bulkDelete }] : []),
    ]} />
    <COFormModal key={`editor-${activeEditor?.id || "closed"}`} open={!!activeEditor} onClose={closeEditor} onSave={handleSave} recoveryPending={!!activeEditor?.recoveryPayload}
      isSaving={saveMut.isPending} writesDisabled={!ready || !can(editing ? "edit" : "create", "change_order")}
      canApprove={can("approve", "change_order")} canVoid={can("void", "change_order")} co={editing} prefill={prefill} sovItems={sovItems}
      sourceRfiLabel={sourceRfiLabel} projects={projects} />
    <ChangeOrderApprovalDialog open={!!approval && approval.origin === origin} onClose={() => setApproval(null)}
      onConfirm={decision => runBulk("approve", approval.records.map(co => co.id), approval.origin, decision, approval.records)} isSaving={bulkAction === "approve"}
      changeOrders={approval?.records || EMPTY} sovItems={sovItems} />
    <ChangeOrderImportModal key={`import-${origin.generation}`} open={importOpen} projectId={projectId} projectName={projectName}
      projects={projects} onClose={() => { if (isCurrent(origin)) setImportOpen(false); }}
      assertMutationScope={targetId => assertWrite(origin, "create", null, targetId)} />
    <DeleteDialog key={`archive-${deleteTarget?.key || 'closed'}`} open={!!deleteTarget && deleteTarget.origin === origin}
      onClose={() => setDeleteTarget(current => current === deleteTarget ? null : current)}
      onConfirm={() => deleteTarget && deleteMut.mutateAsync(deleteTarget)} isDeleting={deleteMut.isPending}
      title="Archive Change Order"
      description={`Archive ${deleteTarget?.record?.co_number || "this change order"}? Historical financial links are preserved. Approved changes must be voided first.`} />
  </div>;
}
