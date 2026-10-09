import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import { useOrg } from "@/components/shared/OrgContext";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { getActiveOrgGeneration } from "@/lib/activeOrg";
import { clearNumberedCreateRecovery, completeNumberedCreateRecovery, getNumberedCreateRecovery, retainNumberedCreateRecovery } from "@/lib/numberedCreateRecovery";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import { invalidateEntities } from "@/services/cacheRegistry";
import { usePermissions } from "@/services/permissions";
import { assertContractEvidence, contractEvidenceKey, loadContractEvidence } from "./evidence";
import {
  createContractEditForm,
  createContractUpdatePayload,
  deriveContractPageFinancials,
  type ContractEditForm,
  type ContractSovItem,
  type SovCreatePayload,
  type SovUpdatePayload,
} from "./contractManagement.derive";

interface SovDraft {
  record: ContractSovItem | null;
  clientOperationId: string;
  uncertainPayload: SovCreatePayload | null;
}
const SOV_RECOVERY_NAMESPACE = "contract-management-sov";

export function useContractManagement(projectId: string | null | undefined) {
  const queryClient = useQueryClient();
  // The JavaScript context infers `never` under strictNullChecks; keep the
  // consumed boundary explicit until the provider itself is typed.
  const { currentOrg, isLoadingOrgs } = useOrg() as { currentOrg: { id: string } | null; isLoadingOrgs: boolean };
  const orgId = currentOrg?.id;
  const { can } = usePermissions();
  const permissions = useRef(can);
  permissions.current = can;
  const generation = getActiveOrgGeneration();
  const scope = useMemo(() => ({ projectId, orgId, isLoadingOrgs, generation }), [projectId, orgId, isLoadingOrgs, generation]);
  const currentScope = useRef<typeof scope | null>(scope);
  currentScope.current = scope;
  const [editor, setEditor] = useState<SovDraft | null>(null);
  const currentEditor = useRef<SovDraft | null>(null);
  const [recoveryDraft, setRecoveryDraft] = useState<SovDraft | null>(null);
  const [deleteSOVTarget, setDeleteTarget] = useState<ContractSovItem | null>(null);
  const currentDelete = useRef<ContractSovItem | null>(null);
  const [contractDraft, setContractDraft] = useState<object | null>(null);
  const currentContractDraft = useRef<object | null>(null);
  const [contractForm, setContractForm] = useState<ContractEditForm>({});
  const pendingWrite = useRef(false);

  useEffect(() => {
    currentEditor.current = null; currentDelete.current = null; currentContractDraft.current = null;
    setEditor(null); setRecoveryDraft(null); setDeleteTarget(null); setContractDraft(null); setContractForm({});
    currentScope.current = scope;
    return () => { if (currentScope.current === scope) currentScope.current = null; };
  }, [scope]);

  const evidence = useQuery({
    queryKey: contractEvidenceKey(projectId, orgId),
    queryFn: () => loadContractEvidence(projectId!, orgId!),
    enabled: Boolean(projectId && orgId && !isLoadingOrgs),
  });
  const snapshot = evidence.data?.projectId === projectId && evidence.data?.orgId === orgId ? evidence.data : undefined;
  const project = snapshot?.project;
  const changeOrders = snapshot?.changeOrders ?? [];
  const sovItems = snapshot?.sovItems ?? [];
  const expenses = snapshot?.expenses ?? [];
  const ready = Boolean(snapshot && !evidence.isError && !evidence.isFetching && orgId && !isLoadingOrgs);
  const evidenceKeys = useMemo(() => [[...contractEvidenceKey(projectId, orgId)]], [projectId, orgId]);
  useRealtimeInvalidation(snapshot ? "sov_items" : "", projectId, evidenceKeys);
  useRealtimeInvalidation(snapshot ? "change_orders" : "", projectId, evidenceKeys);
  useRealtimeInvalidation(snapshot ? "expenses" : "", projectId, evidenceKeys);

  const isCurrent = () => currentScope.current === scope && getActiveOrgGeneration() === scope.generation;
  const assertWrite = (action: "create" | "edit" | "delete", entity: "sov_item" | "contract", recordId?: string, targetProjectId = projectId) => {
    if (!isCurrent() || !projectId || !orgId || isLoadingOrgs) throw new Error("Workspace or project changed. Reopen this operation.");
    if (!permissions.current(action, entity)) throw new Error("You do not have permission for this action.");
    if (targetProjectId !== projectId) throw new Error("An SOV line cannot move to another project.");
    const complete = assertContractEvidence(queryClient, projectId, orgId);
    if (recordId && !complete.sovItems.some(row => row.id === recordId)) throw new Error("This SOV line is no longer in the selected project.");
    return complete;
  };
  const refresh = () => {
    void invalidateEntities(queryClient, ["sov_item", "project"], projectId);
  };
  const closeEditor = (draft: SovDraft | null) => {
    if (!isCurrent() || currentEditor.current !== draft) return;
    currentEditor.current = null; setEditor(null); setRecoveryDraft(null);
  };
  const openEditor = (record: ContractSovItem | null = null) => {
    try {
      assertWrite(record ? "edit" : "create", "sov_item", record?.id);
      // The displayed row is the review. Background reads cannot replace it.
      const recovery = !record && projectId ? getNumberedCreateRecovery(SOV_RECOVERY_NAMESPACE, projectId) : null;
      const draft: SovDraft = {
        record: record ? { ...record } : null,
        clientOperationId: recovery?.operation ?? crypto.randomUUID(),
        uncertainPayload: recovery ? recovery.payload as SovCreatePayload : null,
      };
      currentEditor.current = draft; setEditor(draft); setRecoveryDraft(recovery ? draft : null);
    } catch (error) { toast.error(toUserErrorMessage(error)); }
  };

  const saveMutation = useMutation({
    mutationFn: async ({ draft, data, recover = false }: { draft: SovDraft | null; data?: SovUpdatePayload; recover?: boolean }) => {
      if (!draft || currentEditor.current !== draft || !isCurrent()) throw new Error("This is a previous SOV draft. Reopen it before saving.");
      if (pendingWrite.current) throw new Error("Wait for the current operation to finish.");
      if (draft.uncertainPayload && !recover) throw new Error("Recover the original uncertain save before changing this draft.");
      if (recover) {
        if (draft.record || !draft.uncertainPayload) throw new Error("There is no uncertain create to recover.");
        data = draft.uncertainPayload;
      }
      if (!data) throw new Error("The SOV draft is missing. Reopen it before saving.");
      const id = draft.record?.id;
      assertWrite(id ? "edit" : "create", "sov_item", id, data.project_id ?? projectId);
      const { project_id: _projectId, project_name: _projectName, sov_id: _sovId, line_item_number: _line, ...editable } = data;
      const createPayload: SovCreatePayload = structuredClone({ ...editable, project_id: projectId! });
      const recovering = Boolean(draft.uncertainPayload);
      const reservation = id ? undefined : retainNumberedCreateRecovery(SOV_RECOVERY_NAMESPACE, projectId!, draft.clientOperationId, createPayload, scope.generation);
      if (!id && reservation === undefined) throw new Error("This save is already complete or another draft is waiting. Close and reopen the SOV editor.");
      pendingWrite.current = true;
      try {
        const saved = id
          ? await entities.SOVItem.update(id, editable, { sovItemReview: { updatedAt: draft.record!.updated_at ?? null } })
          : await entities.SOVItem.create(createPayload, { clientOperationId: draft.clientOperationId });
        const currentDraft = isCurrent() && currentEditor.current === draft;
        if (!id && currentDraft) completeNumberedCreateRecovery(SOV_RECOVERY_NAMESPACE, projectId!, draft.clientOperationId, scope.generation);
        refresh();
        if (currentDraft) { closeEditor(draft); toast.success(id ? "SOV line item updated" : "SOV line item created"); }
        return saved;
      } catch (error) {
        if (!id) {
          const outcomeUnknown = Boolean(error && typeof error === "object" && "outcomeUnknown" in error && error.outcomeUnknown);
          if (recovering || outcomeUnknown) {
            draft.uncertainPayload = createPayload;
            retainNumberedCreateRecovery(SOV_RECOVERY_NAMESPACE, projectId!, draft.clientOperationId, createPayload, scope.generation);
            if (isCurrent() && currentEditor.current === draft) setRecoveryDraft(draft);
          } else clearNumberedCreateRecovery(SOV_RECOVERY_NAMESPACE, projectId!, draft.clientOperationId, scope.generation, reservation);
        }
        throw error;
      } finally { pendingWrite.current = false; }
    },
    onError: (error, variables) => { if (isCurrent() && currentEditor.current === variables.draft) toast.error(toUserErrorMessage(error, "Failed to save SOV item")); },
  });
  const saveDraft = saveMutation.mutateAsync;
  const saveSOV = useCallback((data: SovUpdatePayload) => saveDraft({ draft: editor, data }), [editor, saveDraft]);
  const recoverSOV = useCallback(() => saveDraft({ draft: editor, recover: true }), [editor, saveDraft]);

  const setDeleteSOVTarget = (record: ContractSovItem | null) => {
    if (!record) {
      if (currentDelete.current === deleteSOVTarget && isCurrent()) { currentDelete.current = null; setDeleteTarget(null); }
      return;
    }
    try {
      assertWrite("delete", "sov_item", record.id);
      const target = { ...record }; currentDelete.current = target; setDeleteTarget(target);
    } catch (error) { toast.error(toUserErrorMessage(error)); }
  };
  const deleteMutation = useMutation({
    mutationFn: async (target: ContractSovItem | null) => {
      if (!target || currentDelete.current !== target || !isCurrent()) throw new Error("This is a previous delete dialog. Reopen it before deleting.");
      if (pendingWrite.current) throw new Error("Wait for the current operation to finish.");
      assertWrite("delete", "sov_item", target.id);
      pendingWrite.current = true;
      try {
        await entities.SOVItem.delete(target.id);
        refresh();
        if (isCurrent()) toast.success("SOV line item deleted");
      } finally { pendingWrite.current = false; }
    },
    onError: (error, target) => { if (isCurrent() && currentDelete.current === target) toast.error(toUserErrorMessage(error, "Failed to delete SOV item")); },
  });

  const updateContractMutation = useMutation({
    mutationFn: async ({ draft, form }: { draft: object | null; form: ContractEditForm }) => {
      if (!draft || currentContractDraft.current !== draft || !isCurrent()) throw new Error("This is a previous contract draft. Reopen it before saving.");
      if (pendingWrite.current) throw new Error("Wait for the current operation to finish.");
      assertWrite("edit", "contract");
      pendingWrite.current = true;
      try {
        const saved = await entities.Project.update(projectId!, createContractUpdatePayload(form));
        refresh();
        if (isCurrent() && currentContractDraft.current === draft) {
          currentContractDraft.current = null; setContractDraft(null); setContractForm({}); toast.success("Contract details updated");
        }
        return saved;
      } finally { pendingWrite.current = false; }
    },
    onError: (error, variables) => { if (isCurrent() && currentContractDraft.current === variables.draft) toast.error(toUserErrorMessage(error, "Failed to update contract details")); },
  });
  const openContractEdit = () => {
    try {
      const complete = assertWrite("edit", "contract");
      const draft = {}; currentContractDraft.current = draft; setContractDraft(draft);
      setContractForm(createContractEditForm(complete.project));
    } catch (error) { toast.error(toUserErrorMessage(error)); }
  };
  const cancelContractEdit = () => {
    if (!isCurrent() || currentContractDraft.current !== contractDraft) return;
    currentContractDraft.current = null; setContractDraft(null); setContractForm({});
  };

  return {
    project, changeOrders, sovItems, expenses,
    financials: deriveContractPageFinancials(project, changeOrders),
    isLoading: !snapshot && !evidence.isError,
    isError: evidence.isError,
    loadError: evidence.error,
    hasSnapshot: Boolean(snapshot),
    writesDisabled: !ready,
    refetchAll: () => { void evidence.refetch(); },
    showSOVForm: Boolean(editor), editingSOV: editor?.record ?? null,
    openSOVCreate: () => openEditor(), openSOVEdit: openEditor,
    closeSOVForm: () => closeEditor(editor), saveSOV, recoverSOV,
    requiresSOVRecovery: recoveryDraft === editor && Boolean(recoveryDraft),
    sovInitialValues: editor?.uncertainPayload ?? null,
    isSavingSOV: saveMutation.isPending && saveMutation.variables?.draft === editor,
    deleteSOVTarget, setDeleteSOVTarget,
    deleteSOV: () => deleteMutation.mutateAsync(deleteSOVTarget),
    isDeletingSOV: deleteMutation.isPending,
    editingContract: Boolean(contractDraft), contractForm, setContractForm,
    openContractEdit, cancelContractEdit,
    saveContract: () => updateContractMutation.mutate({ draft: contractDraft, form: contractForm }),
    isSavingContract: updateContractMutation.isPending && updateContractMutation.variables?.draft === contractDraft,
  };
}
