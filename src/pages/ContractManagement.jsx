import React, { useState, useMemo } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getQueryKey } from "@/services/cacheRegistry";
import { computeRevisedContractValue } from "@/services/costRollup";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { formatCurrencyShort } from "@/components/shared/formatters";
import { CommandBar, Button } from "@/components/design-system";
import DeleteDialog from "@/components/shared/DeleteDialog";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import SOVFormModal from "@/components/sov/SOVFormModal";
import {
  appendRecordToCaches,
  replaceRecordInCaches,
  removeRecordFromCaches,
  invalidateCrudQueries,
  toastCrudError,
} from "@/components/shared/crudFeedback";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import { usePermissions } from "@/services/permissions";
import {
  sumApprovedChangeOrders,
  sumPendingChangeOrders,
} from "./contractManagement/contractManagementHelpers";
import {
  ContractOverviewPanel,
  ChangeOrdersTab,
  BillingSOVTab,
  ContractSummaryTab,
  TabButton,
} from "./contractManagement/ContractManagementUi";

const fmtShort = (v) => formatCurrencyShort(v);

export default function ContractManagement() {
  const { activeProject } = useProjectContext();
  const projectId = activeProject?.id;
  const [activeTab, setActiveTab] = useState("CHANGE ORDERS");
  const qc = useQueryClient();
  const { can } = usePermissions();

  // SOV CRUD state
  const [showSOVForm, setShowSOVForm] = useState(false);
  const [editingSOV, setEditingSOV] = useState(null);
  const [deleteSOVTarget, setDeleteSOVTarget] = useState(null);

  // Contract edit state
  const [editingContract, setEditingContract] = useState(false);
  const [contractForm, setContractForm] = useState({});

  // ── Queries ───────────────────────────────────────────────────────────────
  const {
    data: project,
    isLoading: projectLoading,
    isError: projectError,
    error: projectErrorValue,
    refetch: refetchProject,
  } = useQuery({
    queryKey: getQueryKey("project", projectId),
    queryFn: () => entities.Project.list(),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
    select: (projects) => (projects || []).find((p) => p.id === projectId),
  });

  const {
    data: changeOrders = [],
    isLoading: cosLoading,
    isError: cosError,
    error: cosErrorValue,
    refetch: refetchCos,
  } = useQuery({
    queryKey: getQueryKey("change_order", projectId),
    queryFn: () => entities.ChangeOrder.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: sovItems = [],
    isLoading: sovLoading,
    isError: sovError,
    error: sovErrorValue,
    refetch: refetchSov,
  } = useQuery({
    queryKey: getQueryKey("sov_item", projectId),
    queryFn: () => entities.SOVItem.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: expenses = [],
    isLoading: expensesLoading,
    isError: expensesError,
    error: expensesErrorValue,
    refetch: refetchExpenses,
  } = useQuery({
    queryKey: getQueryKey("expense", projectId),
    queryFn: () => entities.Expense.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });

  // ── Query key arrays for cache management ────────────────────────────────
  const sovQueryKeys = [getQueryKey("sov_item", projectId), ["sov_items"]];
  const coQueryKeys = [getQueryKey("change_order", projectId), ["change-orders"]];

  // ── Realtime invalidation ────────────────────────────────────────────────
  useRealtimeInvalidation("sov_items", projectId, sovQueryKeys);
  useRealtimeInvalidation("change_orders", projectId, coQueryKeys);

  // ── SOV Item Mutations ───────────────────────────────────────────────────
  const createSOVMut = useMutation({
    mutationFn: (data) => entities.SOVItem.create(withProjectId(data, projectId)),
    onSuccess: async (created) => {
      appendRecordToCaches(qc, sovQueryKeys, created, (record, key) => !key[1] || record.project_id === key[1]);
      await invalidateCrudQueries(qc, sovQueryKeys);
      toast.success("SOV line item created");
      setShowSOVForm(false);
    },
    onError: (e) => toastCrudError(e, "Failed to create SOV item"),
  });

  const updateSOVMut = useMutation({
    mutationFn: ({ id, data }) => entities.SOVItem.update(id, data),
    onSuccess: async (updated) => {
      replaceRecordInCaches(qc, sovQueryKeys, updated);
      await invalidateCrudQueries(qc, sovQueryKeys);
      toast.success("SOV line item updated");
      setEditingSOV(null);
      setShowSOVForm(false);
    },
    onError: (e) => toastCrudError(e, "Failed to update SOV item"),
  });

  const deleteSOVMut = useMutation({
    mutationFn: (id) => entities.SOVItem.delete(id),
    onSuccess: async (_, deletedId) => {
      removeRecordFromCaches(qc, sovQueryKeys, deletedId);
      await invalidateCrudQueries(qc, sovQueryKeys);
      toast.success("SOV line item deleted");
      setDeleteSOVTarget(null);
    },
    onError: (e) => toastCrudError(e, "Failed to delete SOV item"),
  });

  // ── Contract detail update mutation ──────────────────────────────────────
  const updateContractMut = useMutation({
    mutationFn: (data) => entities.Project.update(projectId, data),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: getQueryKey("project", projectId) });
      toast.success("Contract details updated");
      setEditingContract(false);
    },
    onError: (e) => toastCrudError(e, "Failed to update contract details"),
  });

  // ── SOV handlers ─────────────────────────────────────────────────────────
  const handleSOVSave = (data) => {
    if (editingSOV) {
      updateSOVMut.mutate({ id: editingSOV.id, data });
    } else {
      createSOVMut.mutate(data);
    }
  };

  const handleSOVEdit = (item) => {
    setEditingSOV(item);
    setShowSOVForm(true);
  };

  const handleSOVDelete = (item) => {
    setDeleteSOVTarget(item);
  };

  // ── Contract edit handlers ───────────────────────────────────────────────
  const handleEditContract = () => {
    setContractForm({
      original_contract_value: project?.original_contract_value || 0,
      contract_type: project?.contract_type || "",
    });
    setEditingContract(true);
  };

  const handleSaveContract = () => {
    updateContractMut.mutate({
      original_contract_value: Number(contractForm.original_contract_value) || 0,
      contract_type: contractForm.contract_type || null,
    });
  };

  const handleCancelContract = () => {
    setEditingContract(false);
    setContractForm({});
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const approvedCOTotal = useMemo(
    () => sumApprovedChangeOrders(changeOrders),
    [changeOrders],
  );

  const pendingCOTotal = useMemo(
    () => sumPendingChangeOrders(changeOrders),
    [changeOrders],
  );

  const originalValue = Number(project?.original_contract_value) || 0;
  // No revised_contract_value column exists — derive via the one shared definition.
  const revisedValue = computeRevisedContractValue(project, changeOrders);

  const isLoading = projectLoading || cosLoading || sovLoading || expensesLoading;
  const isError = projectError || cosError || sovError || expensesError;
  const loadError = projectErrorValue || cosErrorValue || sovErrorValue || expensesErrorValue;
  const refetchAll = () => {
    refetchProject();
    refetchCos();
    refetchSov();
    refetchExpenses();
  };

  // ── No project selected ───────────────────────────────────────────────────
  if (!projectId) return (
    <div className="sb-dashboard-reference-page" style={{ textAlign: "center", padding: "80px 24px" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{"\u{1F4CB}"}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: "var(--text-disabled)", marginBottom: 6 }}>Select a project</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>Use the project selector in the top right.</div>
    </div>
  );

  // ── Loading / error ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="sb-dashboard-reference-page" style={{ padding: "24px 28px" }}>
        <CommandBar
          eyebrow="CONTRACT"
          title="Contract Management"
          subtitle="Loading contract data"
        />
        <div style={{ marginTop: 20 }}>
          <LoadingSkeleton variant="table" rows={8} />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="sb-dashboard-reference-page" style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        gap: 16,
      }}>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>
          Couldn’t load contract data
        </p>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", margin: 0, textAlign: "center", maxWidth: 320 }}>
          {toUserErrorMessage(loadError, "Something went wrong. Try again.")}
        </p>
        <Button variant="outline" onClick={refetchAll}>Retry</Button>
      </div>
    );
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const TABS = ["CHANGE ORDERS", "BILLING & SOV", "CONTRACT SUMMARY"];

  return (
    <div className="sb-dashboard-reference-page" style={{ padding: "24px 28px", background: "var(--bg-page)", minHeight: "100vh" }}>
      <CommandBar
        eyebrow={project?.name || activeProject?.name || "PROJECT"}
        title="Contract Management"
        count={changeOrders?.length || 0}
        unit=" · CHANGE ORDERS"
        subtitle={`${fmtShort(revisedValue || 0)} revised contract · ${fmtShort(pendingCOTotal || 0)} pending CO value`}
      >
        {activeTab === "BILLING & SOV" && can("create", "sov_item") && (
          <button
            onClick={() => { setEditingSOV(null); setShowSOVForm(true); }}
            className="sbd-btn"
            style={{
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.10em", textTransform: "uppercase",
              padding: "6px 16px", background: "var(--accent)",
              color: "var(--bg-base)", border: "none",
              borderRadius: "var(--radius-btn)", cursor: "pointer",
            }}
          >
            + Add Line Item
          </button>
        )}
      </CommandBar>

      <ContractOverviewPanel
        project={project}
        approvedCOTotal={approvedCOTotal}
        pendingCOTotal={pendingCOTotal}
        revisedValue={revisedValue}
        editingContract={editingContract}
        contractForm={contractForm}
        setContractForm={setContractForm}
        onEditContract={can("edit", "contract") ? handleEditContract : null}
        onSaveContract={handleSaveContract}
        onCancelContract={handleCancelContract}
        isSaving={updateContractMut.isPending}
      />

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {TABS.map((tab) => (
          <TabButton key={tab} label={tab} active={activeTab === tab} onClick={() => setActiveTab(tab)} />
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "CHANGE ORDERS" && (
        <ChangeOrdersTab changeOrders={changeOrders} />
      )}
      {activeTab === "BILLING & SOV" && (
        <BillingSOVTab
          sovItems={sovItems}
          expenses={expenses}
          onAddSOV={can("create", "sov_item") ? () => { setEditingSOV(null); setShowSOVForm(true); } : null}
          onEditSOV={can("edit", "sov_item") ? handleSOVEdit : null}
          onDeleteSOV={can("delete", "sov_item") ? handleSOVDelete : null}
        />
      )}
      {activeTab === "CONTRACT SUMMARY" && (
        <ContractSummaryTab
          project={project}
          changeOrders={changeOrders}
          sovItems={sovItems}
          revisedValue={revisedValue}
        />
      )}

      {/* SOV Form Modal */}
      <SOVFormModal
        open={showSOVForm}
        onClose={() => { setShowSOVForm(false); setEditingSOV(null); }}
        onSave={handleSOVSave}
        sov={editingSOV}
        projects={[project].filter(Boolean)}
        activeProject={project || activeProject}
      />

      {/* Delete Confirmation */}
      <DeleteDialog
        open={!!deleteSOVTarget}
        onClose={() => setDeleteSOVTarget(null)}
        onConfirm={() => deleteSOVMut.mutate(deleteSOVTarget.id)}
        title="Delete SOV Line Item"
        description={`Delete line item "${deleteSOVTarget?.description || ""}"? This cannot be undone.`}
      />
    </div>
  );
}
