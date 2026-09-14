import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import {
  appendRecordToCaches,
  invalidateCrudQueries,
  removeRecordFromCaches,
  replaceRecordInCaches,
  toastCrudError,
} from "@/components/shared/crudFeedback";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import {
  assertProjectId,
  withProjectId,
} from "@/lib/mutations/standardMutation";
import { getQueryKey } from "@/services/cacheRegistry";
import {
  createContractEditForm,
  createContractUpdatePayload,
  deriveContractPageFinancials,
  type ContractChangeOrder,
  type ContractEditForm,
  type ContractExpense,
  type ContractProject,
  type ContractSovItem,
  type SovCreatePayload,
  type SovUpdatePayload,
} from "./contractManagement.derive";

interface SovUpdateInput {
  id: string;
  data: SovUpdatePayload;
}

export function useContractManagement(projectId: string | null | undefined) {
  const queryClient = useQueryClient();
  const [showSOVForm, setShowSOVForm] = useState(false);
  const [editingSOV, setEditingSOV] = useState<ContractSovItem | null>(null);
  const [deleteSOVTarget, setDeleteSOVTarget] = useState<ContractSovItem | null>(null);
  const [editingContract, setEditingContract] = useState(false);
  const [contractForm, setContractForm] = useState<ContractEditForm>({});

  // This hook survives project selection changes. A draft belongs only to
  // the project whose contract was opened, never the next selected project.
  useEffect(() => {
    setEditingContract(false);
    setContractForm({});
  }, [projectId]);

  const projectQuery = useQuery({
    queryKey: getQueryKey("project", projectId),
    queryFn: () => entities.Project.list(),
    enabled: Boolean(projectId),
    staleTime: 5 * 60 * 1000,
    select: (projects): ContractProject | undefined =>
      projects.find((project) => project.id === projectId),
  });
  const changeOrdersQuery = useQuery({
    queryKey: getQueryKey("change_order", projectId),
    queryFn: () => entities.ChangeOrder.filter({ project_id: projectId }),
    enabled: Boolean(projectId),
    staleTime: 5 * 60 * 1000,
  });
  const sovItemsQuery = useQuery({
    queryKey: getQueryKey("sov_item", projectId),
    queryFn: () => entities.SOVItem.filter({ project_id: projectId }),
    enabled: Boolean(projectId),
    staleTime: 5 * 60 * 1000,
  });
  const expensesQuery = useQuery({
    queryKey: getQueryKey("expense", projectId),
    queryFn: () => entities.Expense.filter({ project_id: projectId }),
    enabled: Boolean(projectId),
    staleTime: 5 * 60 * 1000,
  });

  const project = projectQuery.data;
  const changeOrders = (changeOrdersQuery.data || []) as ContractChangeOrder[];
  const sovItems = (sovItemsQuery.data || []) as ContractSovItem[];
  const expenses = (expensesQuery.data || []) as ContractExpense[];
  const sovQueryKeys = useMemo(
    () => [getQueryKey("sov_item", projectId), ["sov_items"]],
    [projectId],
  );
  const coQueryKeys = useMemo(
    () => [getQueryKey("change_order", projectId), ["change-orders"]],
    [projectId],
  );

  useRealtimeInvalidation("sov_items", projectId, sovQueryKeys);
  useRealtimeInvalidation("change_orders", projectId, coQueryKeys);

  const createSOVMutation = useMutation({
    mutationFn: (data: Omit<SovCreatePayload, "project_id">) =>
      entities.SOVItem.create(withProjectId(data, projectId)),
    onSuccess: async (created) => {
      appendRecordToCaches(
        queryClient,
        sovQueryKeys,
        created,
      );
      await invalidateCrudQueries(queryClient, sovQueryKeys);
      toast.success("SOV line item created");
      setShowSOVForm(false);
    },
    onError: (error) => toastCrudError(error, "Failed to create SOV item"),
  });

  const updateSOVMutation = useMutation({
    mutationFn: ({ id, data }: SovUpdateInput) => entities.SOVItem.update(id, data),
    onSuccess: async (updated) => {
      replaceRecordInCaches(queryClient, sovQueryKeys, updated);
      await invalidateCrudQueries(queryClient, sovQueryKeys);
      toast.success("SOV line item updated");
      setEditingSOV(null);
      setShowSOVForm(false);
    },
    onError: (error) => toastCrudError(error, "Failed to update SOV item"),
  });

  const deleteSOVMutation = useMutation({
    mutationFn: (id: string) => entities.SOVItem.delete(id),
    onSuccess: async (_, deletedId) => {
      removeRecordFromCaches(queryClient, sovQueryKeys, deletedId);
      await invalidateCrudQueries(queryClient, sovQueryKeys);
      toast.success("SOV line item deleted");
      setDeleteSOVTarget(null);
    },
    onError: (error) => toastCrudError(error, "Failed to delete SOV item"),
  });

  const updateContractMutation = useMutation({
    mutationFn: (form: ContractEditForm) => {
      assertProjectId(projectId);
      return entities.Project.update(projectId, createContractUpdatePayload(form));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: getQueryKey("project", projectId),
      });
      toast.success("Contract details updated");
      setEditingContract(false);
    },
    onError: (error) =>
      toastCrudError(error, "Failed to update contract details"),
  });

  const openSOVCreate = () => {
    setEditingSOV(null);
    setShowSOVForm(true);
  };
  const openSOVEdit = (item: ContractSovItem) => {
    setEditingSOV(item);
    setShowSOVForm(true);
  };
  const closeSOVForm = () => {
    setShowSOVForm(false);
    setEditingSOV(null);
  };
  const saveSOV = (data: SovUpdatePayload) => {
    if (editingSOV) {
      updateSOVMutation.mutate({ id: editingSOV.id, data });
    } else {
      createSOVMutation.mutate(data as Omit<SovCreatePayload, "project_id">);
    }
  };
  const openContractEdit = () => {
    setContractForm(createContractEditForm(project));
    setEditingContract(true);
  };
  const cancelContractEdit = () => {
    setEditingContract(false);
    setContractForm({});
  };
  const refetchAll = () => {
    void projectQuery.refetch();
    void changeOrdersQuery.refetch();
    void sovItemsQuery.refetch();
    void expensesQuery.refetch();
  };

  const financials = useMemo(
    () => deriveContractPageFinancials(project, changeOrders),
    [project, changeOrders],
  );

  return {
    project,
    changeOrders,
    sovItems,
    expenses,
    financials,
    isLoading:
      projectQuery.isLoading ||
      changeOrdersQuery.isLoading ||
      sovItemsQuery.isLoading ||
      expensesQuery.isLoading,
    isError:
      projectQuery.isError ||
      changeOrdersQuery.isError ||
      sovItemsQuery.isError ||
      expensesQuery.isError,
    loadError:
      projectQuery.error ||
      changeOrdersQuery.error ||
      sovItemsQuery.error ||
      expensesQuery.error,
    refetchAll,
    showSOVForm,
    editingSOV,
    deleteSOVTarget,
    setDeleteSOVTarget,
    openSOVCreate,
    openSOVEdit,
    closeSOVForm,
    saveSOV,
    deleteSOV: () => {
      if (deleteSOVTarget) deleteSOVMutation.mutate(deleteSOVTarget.id);
    },
    editingContract,
    contractForm,
    setContractForm,
    openContractEdit,
    cancelContractEdit,
    saveContract: () => updateContractMutation.mutate(contractForm),
    isSavingContract: updateContractMutation.isPending,
  };
}
