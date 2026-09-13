import { useEffect, useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import { presentPieceControlError } from "@/lib/pieceControl/errorPresentation";
import type { LogisticsAction } from "@/lib/pieceControl/lifecycle";
import {
  fetchLogisticsSnapshot,
  transitionPieceLots,
} from "@/lib/pieceControl/logisticsRepository";
import {
  productionScopeFetchArg,
  productionScopeQueryKey,
  resolveProductionWorkPackageScope,
} from "@/lib/pieceControl/productionScope";
import { invalidatePieceControlQueries } from "@/lib/pieceControl/queryKeys";

const EMPTY_SELECTION: Record<LogisticsAction, string[]> = {
  ship: [],
  deliver: [],
  erect: [],
};

const PAST_LABEL: Record<LogisticsAction, string> = {
  ship: "Shipped",
  deliver: "Delivered",
  erect: "Erected",
};

export interface UsePieceLogisticsControlInput {
  projectId: string;
  pieceControlMode: string;
  workPackageId?: string;
}

export function usePieceLogisticsControl({
  projectId,
  pieceControlMode,
  workPackageId,
}: UsePieceLogisticsControlInput) {
  const enabled = pieceControlMode !== "off";
  const queryClient = useQueryClient();
  const lockedToWorkPackage = Boolean(workPackageId);
  const [boardWorkPackageFilter, setBoardWorkPackageFilter] = useState(
    workPackageId ?? "",
  );
  const [selectedByAction, setSelectedByAction] = useState<
    Record<LogisticsAction, string[]>
  >({ ...EMPTY_SELECTION });
  const [referenceByAction, setReferenceByAction] = useState<
    Record<LogisticsAction, Record<string, string>>
  >({ ship: {}, deliver: {}, erect: {} });
  const [historyPieceId, setHistoryPieceId] = useState<string | null>(null);

  useEffect(() => {
    if (workPackageId) setBoardWorkPackageFilter(workPackageId);
  }, [workPackageId]);

  const scopedWorkPackageId = useMemo(
    () =>
      resolveProductionWorkPackageScope(workPackageId, boardWorkPackageFilter),
    [workPackageId, boardWorkPackageFilter],
  );
  const logisticsScopeKey = productionScopeQueryKey(scopedWorkPackageId);

  const workPackagesQuery = useQuery({
    queryKey: ["piece-logistics-work-packages", projectId],
    queryFn: () => entities.WorkPackage.filter({ project_id: projectId }),
    enabled: enabled && !lockedToWorkPackage,
    staleTime: 30_000,
  });
  const snapshotQuery = useQuery({
    queryKey: ["piece-logistics", projectId, logisticsScopeKey] as const,
    queryFn: ({ queryKey }) =>
      fetchLogisticsSnapshot(
        queryKey[1],
        productionScopeFetchArg(queryKey[2]),
      ),
    enabled,
    placeholderData: keepPreviousData,
  });
  const transitionMutation = useMutation({
    mutationFn: ({ action }: { action: LogisticsAction }) =>
      transitionPieceLots(
        action,
        projectId,
        selectedByAction[action],
        referenceByAction[action],
      ),
    onSuccess: async (_, variables) => {
      toast.success(`${PAST_LABEL[variables.action]} selected piece lots.`);
      setSelectedByAction((current) => ({
        ...current,
        [variables.action]: [],
      }));
      setReferenceByAction((current) => ({
        ...current,
        [variables.action]: {},
      }));
      await invalidatePieceControlQueries(
        queryClient,
        projectId,
        "logistics",
      );
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(
          error,
          "The logistics update could not be recorded.",
        ),
      ),
  });

  const onBoardWorkPackageFilterChange = (value: string) => {
    setBoardWorkPackageFilter(value);
    setSelectedByAction({ ...EMPTY_SELECTION });
    setHistoryPieceId(null);
  };
  const selectAllForAction = (
    action: LogisticsAction,
    pieceIds: string[],
  ) => {
    setSelectedByAction((current) => ({
      ...current,
      [action]: pieceIds,
    }));
  };

  return {
    enabled,
    lockedToWorkPackage,
    boardWorkPackageFilter,
    selectedByAction,
    referenceByAction,
    historyPieceId,
    workPackagesQuery,
    snapshotQuery,
    transitionMutation,
    setSelectedByAction,
    setReferenceByAction,
    setHistoryPieceId,
    onBoardWorkPackageFilterChange,
    selectAllForAction,
  };
}
