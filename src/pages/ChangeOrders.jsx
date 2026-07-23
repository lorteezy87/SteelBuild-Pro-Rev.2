/**
 * ChangeOrders — CO tracker rebuilt on Claude Design system.
 *
 * The page owns server-backed queries, mutations, RFI conversion, and
 * cache/permission authority. CoControlCenter owns the canonical summary,
 * filtering, decision queues, and table presentation.
 *
 * Negative amounts are supported and render with a minus sign +
 * red tint (per the baseline-audit D16 fix).
 */

import React, { useState, useEffect, useMemo } from "react";
import { entities } from "@/api/supabaseClient";
import { computeRevisedContractValue } from "@/services/costRollup";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useProjectId } from "@/hooks/useProjectId";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { useAutoOpenEdit } from "@/hooks/useAutoOpenEdit";
import { useAutoOpenCreate } from "@/hooks/useAutoOpenCreate";
import DeleteDialog from "@/components/shared/DeleteDialog";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import COFormModal from "@/components/changeorders/COFormModal";
import ChangeOrderImportModal from "@/components/changeorders/ChangeOrderImportModal";
import { getNextFormattedNumber } from "@/components/shared/numberSequencing";
import { toast } from "sonner";
import {
  appendRecordToCaches,
  replaceRecordInCaches,
  removeRecordFromCaches,
  toastCrudError,
} from "@/components/shared/crudFeedback";
import { usePermissions } from "@/services/permissions";
import { supabase } from "@/lib/supabase";
import { batchProcess } from "@/utils/batchProcess";
import { invalidateEntity } from "@/services/cacheRegistry";
import CoControlCenter from "./changeOrders/CoControlCenter";
import {
  buildApprovedPatch,
  buildSubmittedPatch,
  reconcileSelectedIds,
  summarizeBulkResult,
} from "./changeOrders/changeOrderBulk";
import ListTruncationNotice from "@/components/shared/ListTruncationNotice";

import { BulkActionBar } from "@/components/design-system";

export default function ChangeOrders() {
  const qc = useQueryClient();
  const projectId = useProjectId();
  const { activeProject } = useProjectContext();
  const { can } = usePermissions();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [prefill, setPrefill] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [bulkAction, setBulkAction] = useState(null);

  // Auto-open create modal when QuickAddFAB navigated here with ?new=1.
  useAutoOpenCreate(() => {
    setEditing(null);
    setModalOpen(true);
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  /* -- Data -- */
  const { data: cos = [], isLoading } = useQuery({
    queryKey: ["change-orders", projectId],
    queryFn: () =>
      projectId
        ? entities.ChangeOrder.filter({ project_id: projectId }, "-created_at")
        : [],
    enabled: !!projectId,
  });
  useAutoOpenEdit(cos, (changeOrder) => {
    setPrefill(null);
    setEditing(changeOrder);
    setModalOpen(true);
  }, { enabled: !isLoading, param: "recordId" });

  useRealtimeInvalidation("change_orders", projectId, [["change-orders", projectId]]);

  const coQueryKeys = [["change-orders", projectId], ["change_orders"]];

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  // SOV lines (to link a CO to a contract line) + cost-impact RFIs (eligible
  // to convert into a CO via ?fromRfi).
  const { data: sovItems = [] } = useQuery({
    queryKey: ["sov-items", projectId],
    queryFn: () => projectId
      ? entities.SOVItem.filter({ project_id: projectId }, "line_item_number")
      : [],
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });

  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis", projectId],
    queryFn: () => projectId
      ? entities.RFI.filter({ project_id: projectId }, "-created_at")
      : [],
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });

  // Convert a cost-impact RFI into a new CO: ?fromRfi=<id> opens the form
  // prefilled from the RFI (amount, schedule, title) tagged with source_rfi_id.
  // The param is stripped so a refresh / back navigation doesn't reopen it.
  useEffect(() => {
    const fromRfi = searchParams.get("fromRfi");
    if (!fromRfi || !rfis.length) return;
    const rfi = rfis.find((r) => r.id === fromRfi);
    if (rfi) {
      const label = rfi.rfi_number ? `RFI ${rfi.rfi_number}` : "RFI";
      setPrefill({
        source_rfi_id: rfi.id,
        project_id: projectId,
        title: `${label}: ${rfi.title || rfi.subject || "cost change"}`.slice(0, 200),
        description: rfi.question || rfi.description || "",
        reason_code: "Design Change",
        co_amount: Number(rfi.cost_impact_amount) || 0,
        schedule_impact_days: Number(rfi.schedule_impact_days) || 0,
      });
      setEditing(null);
      setModalOpen(true);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("fromRfi");
    setSearchParams(next, { replace: true });
  }, [searchParams, rfis, projectId, setSearchParams]);

  // Label for the "converted from RFI" banner — works for both a fresh
  // conversion (prefill) and editing an already-linked CO. Derived (not stored
  // in the form) so it never gets written back to the record.
  const activeSourceRfiId = prefill?.source_rfi_id || editing?.source_rfi_id || null;
  const sourceRfiLabel = useMemo(() => {
    if (!activeSourceRfiId) return "";
    const r = rfis.find((x) => x.id === activeSourceRfiId);
    return r?.rfi_number ? `RFI ${r.rfi_number}` : (r ? "the source RFI" : "");
  }, [activeSourceRfiId, rfis]);

  /* -- Mutations -- */
  const createMut = useMutation({
    mutationFn: async (d) => {
      const userTyped = (d.co_number || "").trim();
      let coNumber = userTyped;
      const targetProjectId = d.project_id || projectId || null;
      if (!targetProjectId) {
        throw new Error("Select a project before creating a change order.");
      }
      if (!coNumber && targetProjectId) {
        try {
          coNumber = await getNextFormattedNumber({
            projectId: targetProjectId,
            recordType: "CO",
            entityName: "ChangeOrder",
            fieldName: "co_number",
            prefix: "CO #",
          });
          if (!coNumber) {
            throw new Error("Unable to reserve a change order number. Please retry.");
          }
        } catch {
          throw new Error("Unable to reserve a change order number. Please retry.");
        }
      }
      if (!coNumber) throw new Error("Unable to reserve a change order number. Please retry.");
      return entities.ChangeOrder.create({
        ...d,
        co_number: coNumber,
        project_id: targetProjectId,
      });
    },
    onSuccess: (created) => {
      appendRecordToCaches(qc, coQueryKeys, created, (record, key) => !key[1] || record.project_id === key[1]);
      qc.invalidateQueries({ queryKey: ["change-orders"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      setModalOpen(false);
      setEditing(null);
      toast.success("Change order created");
    },
    onError: (e) => toastCrudError(e, "Failed to create change order"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => entities.ChangeOrder.update(id, data),
    onSuccess: (updated) => {
      replaceRecordInCaches(qc, coQueryKeys, updated);
      qc.invalidateQueries({ queryKey: ["change-orders"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      setModalOpen(false);
      setEditing(null);
      toast.success("Change order updated");
    },
    onError: (e) => toastCrudError(e, "Failed to update change order"),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => entities.ChangeOrder.delete(id),
    onSuccess: (_result, deletedId) => {
      removeRecordFromCaches(qc, coQueryKeys, deletedId);
      qc.invalidateQueries({ queryKey: ["change-orders"] });
      setDeleteTarget(null);
      toast.success("Change order deleted");
    },
    onError: (e) => toastCrudError(e, "Failed to delete change order"),
  });

  const reconcileBulkSelection = (succeeded) => {
    setSelectedIds((current) => reconcileSelectedIds(
      current,
      filtered.map((co) => co.id),
      succeeded.map(({ item }) => item),
    ));
  };

  const reportBulkResult = (action, total, result) => {
    const outcome = summarizeBulkResult(action, total, result.succeeded.length, result.failed.length);
    toast[outcome.level](outcome.message);
  };

  const bulkSubmit = async () => {
    const ids = [...selectedIds];
    if (!ids.length || bulkAction) return;

    setBulkAction("submit");
    try {
      const result = await batchProcess(
        ids,
        (id) => entities.ChangeOrder.update(id, buildSubmittedPatch(new Date().toISOString().split("T")[0])),
      );
      await invalidateEntity(qc, "change_order", projectId);
      reconcileBulkSelection(result.succeeded);
      reportBulkResult("submit", ids.length, result);
    } catch (error) {
      toastCrudError(error, "Failed to submit change orders");
    } finally {
      setBulkAction(null);
    }
  };

  const bulkApprove = async () => {
    const ids = [...selectedIds];
    if (!ids.length || bulkAction) return;

    setBulkAction("approve");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const approvedBy = user?.user_metadata?.full_name || user?.email?.split("@")[0] || null;
      if (!approvedBy) {
        toast.error("Could not identify the approver — sign in again before approving.");
        return;
      }

      const result = await batchProcess(
        ids,
        (id) => entities.ChangeOrder.update(
          id,
          buildApprovedPatch(new Date().toISOString().split("T")[0], approvedBy),
        ),
      );
      await invalidateEntity(qc, "change_order", projectId);
      reconcileBulkSelection(result.succeeded);
      reportBulkResult("approve", ids.length, result);
    } catch (error) {
      toastCrudError(error, "Failed to approve change orders");
    } finally {
      setBulkAction(null);
    }
  };

  const bulkDelete = async () => {
    const ids = [...selectedIds];
    if (!ids.length || bulkAction) return;
    if (!window.confirm(`Delete ${ids.length} change order(s)?`)) return;

    setBulkAction("delete");
    try {
      const result = await batchProcess(ids, (id) => entities.ChangeOrder.delete(id));
      await invalidateEntity(qc, "change_order", projectId);
      reconcileBulkSelection(result.succeeded);
      reportBulkResult("delete", ids.length, result);
    } catch (error) {
      toastCrudError(error, "Failed to delete change orders");
    } finally {
      setBulkAction(null);
    }
  };

  const handleSave = (d) => {
    if (editing) updateMut.mutate({ id: editing.id, data: d });
    else createMut.mutate(d);
  };

  /* -- Canonical list and financial context -- */
  // The canonical control center owns summary, filtering, status presentation,
  // and row rendering. The page retains server-backed queries and mutation
  // authority so financial and permission behavior cannot diverge.
  const liveProject = projects.find((p) => p.id === projectId) || activeProject;
  const baseContract = Number(liveProject?.original_contract_value) || 0;
  const revisedContract = computeRevisedContractValue(liveProject, cos);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return cos.filter((c) => {
      if (filter !== "all" && c.status !== filter) return false;
      if (!q) return true;
      return (
        (c.co_number || "").toLowerCase().includes(q) ||
        (c.title || "").toLowerCase().includes(q) ||
        (c.description || "").toLowerCase().includes(q) ||
        (c.reason_code || "").toLowerCase().includes(q)
      );
    });
  }, [cos, filter, debouncedSearch]);

  // Selection is scoped to the visible project/filter result set. This clears
  // stale IDs after query refreshes, project changes, and filter/search changes,
  // while retaining failed IDs after a partial bulk mutation.
  useEffect(() => {
    const visibleIds = filtered.map((co) => co.id);
    setSelectedIds((current) => {
      const next = reconcileSelectedIds(current, visibleIds);
      return next.size === current.size ? current : next;
    });
  }, [filtered, projectId]);

  const toggleSelect = (id) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = (checked) => {
    setSelectedIds(checked ? new Set(filtered.map((co) => co.id)) : new Set());
  };

  if (!projectId) {
    return (
      <div className="sb-dashboard-reference-page" style={{ padding: 32, textAlign: "center" }}>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14,
            color: "var(--text-secondary)",
          }}
        >
          Select a project to view change orders.
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="sb-dashboard-reference-page" style={{ padding: 24 }}>
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }

  const projectName = projects.find((p) => p.id === projectId)?.name || "";

  const exportCsv = () => {
    const rows = [
      ["CO #", "Title", "Status", "Reason Code", "Amount", "Sched Impact (d)", "Submitted", "Approved", "Approved By"].join(","),
      ...filtered.map((c) =>
        [
          c.co_number || "",
          `"${(c.title || "").replace(/"/g, '""')}"`,
          c.status || "",
          c.reason_code || "",
          c.co_amount ?? "",
          c.schedule_impact_days ?? "",
          c.submitted_date || "",
          c.approved_date || "",
          `"${(c.approved_by || "").replace(/"/g, '""')}"`,
        ].join(",")
      ),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `change-orders-${projectName.replace(/\s+/g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const modals = (
    <>
      <COFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); setPrefill(null); }}
        onSave={handleSave}
        isSaving={createMut.isPending || updateMut.isPending}
        co={editing}
        prefill={prefill}
        sovItems={sovItems}
        sourceRfiLabel={sourceRfiLabel}
        projects={projects}
        nextNumber=""
      />
      <ChangeOrderImportModal
        open={importOpen}
        projectId={projectId}
        projectName={projectName}
        projects={projects}
        onClose={() => setImportOpen(false)}
      />
      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        title="Delete Change Order"
        description={`Delete ${deleteTarget?.co_number}?`}
      />
    </>
  );

  return (
    <div className="co-page">
      <ListTruncationNotice count={cos.length} label="change orders" />
      <CoControlCenter
        projectName={projectName}
        cos={cos}
        filtered={filtered}
        search={search}
        onSearch={setSearch}
        statusFilter={filter}
        onFilterChange={setFilter}
        onOpenCo={(co) => { setEditing(co); setModalOpen(true); }}
        onExport={exportCsv}
        onCreate={can("create", "change_order") ? () => {
          setEditing(null);
          setPrefill(null);
          setModalOpen(true);
        } : null}
        onImport={can("create", "change_order") ? () => setImportOpen(true) : null}
        baseContract={baseContract}
        revisedContract={revisedContract}
        projectHealth={liveProject?.health_status || null}
        percentComplete={
          liveProject?.scope_complete_pct_override != null
            ? Number(liveProject.scope_complete_pct_override)
            : null
        }
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleAll={toggleAll}
      />
      <BulkActionBar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        actions={[
          {
            label: bulkAction === "submit" ? "SUBMITTING..." : "SUBMIT SELECTED",
            icon: "arrow",
            disabled: Boolean(bulkAction),
            onClick: bulkSubmit,
          },
          {
            label: bulkAction === "approve" ? "APPROVING..." : "APPROVE",
            icon: "check",
            disabled: Boolean(bulkAction),
            onClick: bulkApprove,
          },
          ...(can("delete", "change_order") ? [{
            label: bulkAction === "delete" ? "DELETING..." : "DELETE",
            icon: "x",
            variant: "danger",
            disabled: Boolean(bulkAction),
            onClick: bulkDelete,
          }] : []),
        ]}
      />
      {modals}
    </div>
  );
}
