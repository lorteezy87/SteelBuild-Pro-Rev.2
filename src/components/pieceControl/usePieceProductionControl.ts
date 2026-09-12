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
import {
  advancePieceStation,
  advancePieceStations,
  fetchProductionSnapshot,
  setPieceHold,
  splitPieceLot,
  type LotAllocation,
} from "@/lib/pieceControl/productionRepository";
import {
  productionScopeFetchArg,
  productionScopeQueryKey,
  resolveProductionWorkPackageScope,
} from "@/lib/pieceControl/productionScope";
import {
  invalidatePieceControlQueries,
  pieceControlKeys,
} from "@/lib/pieceControl/queryKeys";
import { selectProductionPiece } from "./pieceProductionControl.derive";

export interface UsePieceProductionControlInput {
  projectId: string;
  pieceControlMode: string;
  workPackageId?: string;
}

export function usePieceProductionControl({
  projectId,
  pieceControlMode,
  workPackageId,
}: UsePieceProductionControlInput) {
  const queryClient = useQueryClient();
  const enabled = pieceControlMode !== "off";
  const lockedToWorkPackage = Boolean(workPackageId);
  const [boardWorkPackageFilter, setBoardWorkPackageFilter] = useState(
    workPackageId ?? "",
  );
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [bulkStationKey, setBulkStationKey] = useState("");
  const [bulkOverrideReason, setBulkOverrideReason] = useState("");
  const [splitRows, setSplitRows] = useState<LotAllocation[]>([
    { lot_code: "A", quantity: 0 },
    { lot_code: "B", quantity: 0 },
  ]);
  const [overrideStationKey, setOverrideStationKey] = useState<string | null>(
    null,
  );
  const [overrideReason, setOverrideReason] = useState("");
  const [holdReason, setHoldReason] = useState("");

  useEffect(() => {
    if (workPackageId) setBoardWorkPackageFilter(workPackageId);
  }, [workPackageId]);

  const scopedWorkPackageId = useMemo(
    () =>
      resolveProductionWorkPackageScope(workPackageId, boardWorkPackageFilter),
    [workPackageId, boardWorkPackageFilter],
  );
  const productionScopeKey = productionScopeQueryKey(scopedWorkPackageId);
  const workPackagesQuery = useQuery({
    queryKey: pieceControlKeys.productionWorkPackages(projectId),
    queryFn: () => entities.WorkPackage.filter({ project_id: projectId }),
    enabled: enabled && !lockedToWorkPackage,
    staleTime: 30_000,
  });
  const snapshotQuery = useQuery({
    queryKey: pieceControlKeys.productionBoard(
      projectId,
      productionScopeKey,
    ),
    queryFn: () =>
      fetchProductionSnapshot(
        projectId,
        productionScopeFetchArg(productionScopeKey),
      ),
    enabled,
    placeholderData: keepPreviousData,
  });
  const selectedPiece = selectProductionPiece(
    snapshotQuery.data?.pieces ?? [],
    selectedPieceId,
  );
  const invalidateProduction = async () => {
    await invalidatePieceControlQueries(queryClient, projectId, "production");
  };
  const splitMutation = useMutation({
    mutationFn: () => splitPieceLot(projectId, selectedPiece!.id, splitRows),
    onSuccess: async () => {
      toast.success("Piece lot split into production lots.");
      setSelectedPieceId(null);
      await invalidateProduction();
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(error, "The piece lot could not be split."),
      ),
  });
  const advanceMutation = useMutation({
    mutationFn: ({
      stationKey,
      override,
      reason,
    }: {
      stationKey: string;
      override: boolean;
      reason?: string;
    }) =>
      advancePieceStation(
        projectId,
        selectedPiece!.id,
        stationKey,
        override,
        reason,
      ),
    onSuccess: async () => {
      toast.success("Production station recorded.");
      setOverrideStationKey(null);
      setOverrideReason("");
      await invalidateProduction();
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(
          error,
          "The production station could not be recorded.",
        ),
      ),
  });
  const bulkAdvanceMutation = useMutation({
    mutationFn: ({
      pieceIds,
      stationKey,
      override,
      reason,
    }: {
      pieceIds: string[];
      stationKey?: string | null;
      override?: boolean;
      reason?: string;
    }) =>
      advancePieceStations(projectId, pieceIds, {
        stationKey,
        override,
        overrideReason: reason,
      }),
    onSuccess: async (result) => {
      const advanced = result.advanced ?? 0;
      const unchanged = result.unchanged ?? 0;
      toast.success(
        unchanged > 0
          ? `Advanced ${advanced} lot${advanced === 1 ? "" : "s"} (${unchanged} already complete).`
          : `Advanced ${advanced} lot${advanced === 1 ? "" : "s"}.`,
      );
      setBulkSelectedIds([]);
      setBulkOverrideReason("");
      await invalidateProduction();
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(
          error,
          "The bulk production update could not be recorded.",
        ),
      ),
  });
  const holdMutation = useMutation({
    mutationFn: ({ onHold, reason }: { onHold: boolean; reason?: string }) =>
      setPieceHold(projectId, [selectedPiece!.id], onHold, reason),
    onSuccess: async (_data, variables) => {
      toast.success(variables.onHold ? "Hold applied." : "Hold released.");
      setHoldReason("");
      await invalidateProduction();
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(error, "The hold state could not be updated."),
      ),
  });

  const toggleBulkSelected = (pieceId: string, checked: boolean) => {
    setBulkSelectedIds((current) => {
      if (checked) {
        return current.includes(pieceId) ? current : [...current, pieceId];
      }
      return current.filter((id) => id !== pieceId);
    });
  };
  const onBoardWorkPackageFilterChange = (value: string) => {
    setBoardWorkPackageFilter(value);
    setBulkSelectedIds([]);
    setSelectedPieceId(null);
    setOverrideStationKey(null);
    setOverrideReason("");
  };

  return {
    enabled,
    lockedToWorkPackage,
    boardWorkPackageFilter,
    selectedPieceId,
    bulkSelectedIds,
    bulkStationKey,
    bulkOverrideReason,
    splitRows,
    overrideStationKey,
    overrideReason,
    holdReason,
    workPackagesQuery,
    snapshotQuery,
    splitMutation,
    advanceMutation,
    bulkAdvanceMutation,
    holdMutation,
    setSelectedPieceId,
    setBulkSelectedIds,
    setBulkStationKey,
    setBulkOverrideReason,
    setSplitRows,
    setOverrideStationKey,
    setOverrideReason,
    setHoldReason,
    toggleBulkSelected,
    onBoardWorkPackageFilterChange,
  };
}
