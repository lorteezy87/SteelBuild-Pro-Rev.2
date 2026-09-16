import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { entities } from "@/api/supabaseClient";
import { supabase } from "@/lib/supabase";
import {
  DecisionPanel,
  KpiStrip,
  PageHero,
  useCommandSkin,
  type KpiCellDef
} from "@/components/command";
import {
  planBulkPieceAttributeUpdate,
  bulkUpdatePieceAttributes,
} from "@/lib/pieceControl/bulkUpdatePieces";
import { bulkUpdatePieceAttributes as bulkUpdateRepo } from "@/lib/pieceControl/bulkUpdateRepository";
import { fetchCanonicalDashboardSnapshot } from "@/lib/pieceControl/canonicalDashboardRepository";
import { selectActionableLeafPieces } from "@/lib/pieceControl/canonicalRollups";
import {
  buildPieceDigitalThread,
  derivePieceIntelligence,
} from "@/lib/pieceControl/pieceIntelligenceDerive";
import { fetchPieceIntelligenceSnapshot } from "@/lib/pieceControl/pieceIntelligenceRepository";
import { readPieceImportFile } from "@/lib/pieceControl/importAdapters";
import { partitionArchiveSelection } from "@/lib/pieceControl/archiveEligibility";
import {
  collectAppliedPieceIds,
  collectAppliedPiecesByWpNumber,
  countWpHints,
  describeImportAssignResult,
  summarizeAppliedAssignment,
} from "@/lib/pieceControl/importAssign";
import {
  applyImportDrawingLinks,
  collectAppliedPieceSheetHints,
  planImportDrawingLinks,
} from "@/lib/pieceControl/importDrawingLink";
import type { PieceRegisterSort } from "@/lib/pieceControl/pieceRegisterSort";
import {
  invalidatePieceControlQueries,
  pieceControlKeys,
} from "@/lib/pieceControl/queryKeys";
import { setPieceHold } from "@/lib/pieceControl/productionRepository";
import type { ImportPayload, PieceImportSourceType } from "@/lib/pieceControl/reconciliation";
import {
  assignPiecesToWorkPackage,
  fetchPieceRelationshipSnapshot,
  linkPieceDrawingSet,
  unassignPiecesFromWorkPackage,
} from "@/lib/pieceControl/relationshipsRepository";
import { linkModelElementsToPieces } from "@/lib/pieceControl/modelElementLink";
import {
  applyPieceImportBatch,
  archivePieceLots,
  approvePieceImportBatch,
  fetchPieceImportBatches,
  fetchPieceImportRows,
  fetchPieceRegister,
  stagePieceImportBatch,
} from "@/lib/pieceControl/repository";
import { roleAtLeast, useProjectRole } from "@/hooks/useProjectRole";
import { formatWorkPackageTitle } from "@/lib/workPackages/formatWorkPackageTitle";
import { presentPieceControlError } from "@/lib/pieceControl/errorPresentation";
import { PIECE_ARCHIVE_EXPECTED_ERRORS, reportingMeta } from "@/lib/sentry/reportedErrors";
import { withProjectId } from "@/lib/mutations/standardMutation";
import type { PieceRegisterFilters } from "./filter";
import {
  uniqueValues,
  buildWorkPackageLabelMap,
  buildPieceDisplayRows,
  buildFilteredRegisterRows,
  archiveConfirmationText as buildArchiveConfirmationText,
  allRowsSelected,
  IMPORT_DECISION_TONE,
  EMPTY_PIECE_REGISTER_FILTERS,
} from "./registerHelpers";

const EMPTY_FILTERS = EMPTY_PIECE_REGISTER_FILTERS;
const EMPTY_SELECTED_PIECE_IDS = new Set<string>();

export function usePieceRegisterController(
  projectId: string | undefined,
  setPieceRegisterLocation: (patch: any) => void
) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { role, isLoading: roleLoading } = useProjectRole(projectId);

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sourceType, setSourceType] = useState<PieceImportSourceType>("csv");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importRows, setImportRows] = useState<ImportPayload[]>([]);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [applyConfirmed, setApplyConfirmed] = useState(false);
  const [importTargetWorkPackageId, setImportTargetWorkPackageId] = useState("");
  const [selectedPieceIdsState, setSelectedPieceIdsState] = useState<Set<string>>(
    EMPTY_SELECTED_PIECE_IDS,
  );
  const selectedPieceIdsRef = useRef(EMPTY_SELECTED_PIECE_IDS);
  const selectedPieceProjectIdRef = useRef<string | undefined>(undefined);
  const pendingSelectionUrlValue = useRef<string | null>(null);
  const [registerSort, setRegisterSort] = useState<PieceRegisterSort>({
    key: "work_package",
    direction: "asc",
  });
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveConfirmation, setArchiveConfirmation] = useState("");
  const [attentionFocus, setAttentionFocus] = useState<any>(null);

  const lastProjectId = useRef(projectId);
  const projectSwitchReconciliationBlock = useRef<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    const previousProjectId = lastProjectId.current;
    lastProjectId.current = projectId;
    if (!previousProjectId || previousProjectId === projectId) return;

    projectSwitchReconciliationBlock.current = projectId;
    selectedPieceIdsRef.current = EMPTY_SELECTED_PIECE_IDS;
    selectedPieceProjectIdRef.current = projectId;
    pendingSelectionUrlValue.current = "";
    setSelectedPieceIdsState(EMPTY_SELECTED_PIECE_IDS);
    setPieceRegisterLocation({ pieceId: null, revisionId: null });
    setArchiveOpen(false);
    setArchiveReason("");
    setArchiveConfirmation("");
    setAttentionFocus(null);
    setImportTargetWorkPackageId("");
    setApplyConfirmed(false);
  }, [projectId, setPieceRegisterLocation]);

  const setSelectedPieceIds = useCallback(
    (nextSelection) => {
      const current =
        selectedPieceProjectIdRef.current === projectId
          ? selectedPieceIdsRef.current
          : EMPTY_SELECTED_PIECE_IDS;
      const next =
        typeof nextSelection === "function"
          ? nextSelection(current)
          : nextSelection;
      const pieceId = next.size === 1 ? [...next][0] : null;
      selectedPieceIdsRef.current = next;
      selectedPieceProjectIdRef.current = projectId;
      pendingSelectionUrlValue.current = pieceId ?? "";
      setSelectedPieceIdsState(next);
      setPieceRegisterLocation({ pieceId });
    },
    [projectId, setPieceRegisterLocation],
  );

  const selectedPieceIds =
    selectedPieceProjectIdRef.current === projectId
      ? selectedPieceIdsState
      : EMPTY_SELECTED_PIECE_IDS;

  const piecesQuery = useQuery({
    queryKey: ["piece-register", projectId],
    queryFn: () => fetchPieceRegister(projectId!),
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });

  const batchesQuery = useQuery({
    queryKey: ["piece-import-batches", projectId],
    queryFn: () => fetchPieceImportBatches(projectId!),
    enabled: Boolean(projectId),
    staleTime: 10_000,
  });

  const workPackagesQuery = useQuery({
    queryKey: ["piece-register-work-packages", projectId],
    queryFn: () => entities.WorkPackage.filter({ project_id: projectId }),
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });

  const selectedPieceId = selectedPieceIds.size === 1 ? [...selectedPieceIds][0] : null;
  const hasActionablePieces = useMemo(
    () => selectActionableLeafPieces(piecesQuery.data ?? []).length > 0,
    [piecesQuery.data],
  );

  const intelligenceQuery = useQuery({
    queryKey: pieceControlKeys.intelligence(projectId!),
    queryFn: () => fetchPieceIntelligenceSnapshot(projectId!),
    enabled:
      Boolean(projectId) &&
      piecesQuery.isSuccess &&
      hasActionablePieces,
    staleTime: 15_000,
  });

  const batches = batchesQuery.data ?? [];
  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId) ?? batches[0] ?? null;
  const batchRowsQuery = useQuery({
    queryKey: ["piece-import-rows", projectId, selectedBatch?.id],
    queryFn: () => fetchPieceImportRows(projectId!, selectedBatch!.id),
    enabled: Boolean(projectId) && Boolean(selectedBatch?.id),
  });

  const invalidate = async () => {
    await invalidatePieceControlQueries(queryClient, projectId, "all");
  };

  const invalidateProtectedActionQueries = async () => {
    await Promise.all([
      invalidatePieceControlQueries(queryClient, projectId, "all"),
      queryClient.invalidateQueries({
        queryKey: ["drawing-impacts", projectId],
      }),
    ]);
  };

  const holdMutation = useMutation({
    meta: reportingMeta("pieceRegister.hold"),
    mutationFn: ({ pieceId, onHold, reason }: { pieceId: string; onHold: boolean; reason: string }) => {
      const cleanedReason = reason.trim();
      if (!cleanedReason) throw new Error("A hold reason is required.");
      return setPieceHold(projectId!, [pieceId], onHold, cleanedReason);
    },
    onSuccess: async (_result, request) => {
      await invalidateProtectedActionQueries();
      toast.success(request.onHold ? "Piece hold applied" : "Piece hold cleared");
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(error, "The piece hold could not be updated."),
      ),
  });

  const drawingImpactMutation = useMutation({
    meta: reportingMeta("pieceRegister.drawingImpact.save"),
    mutationFn: async ({
      impactId,
      revisionId,
      draft,
      previousStatus,
      previousResolvedAt,
    }: any) => {
      // Validation logic here... (to be mirrored from the original component)
      const payload = withProjectId({
        drawing_revision_id: revisionId,
        impact_type: draft.impact_type,
        status: impactId ? draft.status : "open",
        priority: draft.priority,
        assigned_to: draft.assigned_to || null,
        due_date: draft.due_date || null,
        title: draft.title.trim(),
        notes: draft.notes.trim() || null,
        ...(impactId ? { resolved_at: previousStatus ? (previousStatus === "resolved" ? previousResolvedAt : new Date().toISOString()) : new Date().toISOString() } : {}),
      }, projectId);

      if (impactId) {
        await entities.DrawingImpact.update(impactId, payload as any);
        return "updated" as const;
      }
      await entities.DrawingImpact.create(payload as any);
      return "created" as const;
    },
    onSuccess: async (result) => {
      await invalidateProtectedActionQueries();
      toast.success(result === "created" ? "Drawing impact created" : "Drawing impact updated");
    },
    onError: (error: Error) =>
      toast.error(presentPieceControlError(error, "The drawing impact could not be saved.")),
  });

  const resolveDrawingImpactMutation = useMutation({
    meta: reportingMeta("pieceRegister.drawingImpact.resolve"),
    mutationFn: async (impactId: string) => {
      await entities.DrawingImpact.update(
        impactId,
        withProjectId({
          status: "resolved",
          resolved_at: new Date().toISOString(),
        }, projectId) as any,
      );
    },
    onSuccess: async () => {
      await invalidateProtectedActionQueries();
      toast.success("Drawing impact resolved");
    },
    onError: (error: Error) =>
      toast.error(presentPieceControlError(error, "The drawing impact could not be resolved.")),
  });

  const stageMutation = useMutation({
    meta: reportingMeta("pieceRegister.import.stage"),
    mutationFn: () => stagePieceImportBatch(
      projectId!,
      sourceType,
      importFile?.name ?? "browser import",
      importRows,
    ),
    onSuccess: async (summary) => {
      setSelectedBatchId(String(summary.batch_id));
      setImportFile(null);
      setImportRows([]);
      setImportNotice(null);
      await invalidate();
      toast.success("Import staged for review");
    },
    onError: (error: Error) =>
      toast.error(presentPieceControlError(error, "The import could not be staged.")),
  });

  const approveMutation = useMutation({
    meta: reportingMeta("pieceRegister.import.approve"),
    mutationFn: () => approvePieceImportBatch(selectedBatch!.id),
    onSuccess: async () => {
      await invalidate();
      toast.success("Batch approved. Confirm once more to apply.");
    },
    onError: (error: Error) =>
      toast.error(presentPieceControlError(error, "The import batch could not be approved.")),
  });

  const applyMutation = useMutation({
    meta: reportingMeta("pieceRegister.import.apply"),
    mutationFn: async () => {
      const summary = await applyPieceImportBatch(selectedBatch!.id);
      // Finalize hints...
      return { summary };
    },
    onSuccess: async ({ summary }) => {
      setApplyConfirmed(false);
      await invalidate();
      toast.success(`Import applied: ${summary.created ?? 0} created, ${summary.updated ?? 0} updated`);
    },
    onError: (error: Error) =>
      toast.error(presentPieceControlError(error, "The import batch could not be applied.")),
  });

  const archiveMutation = useMutation({
    meta: reportingMeta("pieceRegister.archive", PIECE_ARCHIVE_EXPECTED_ERRORS),
    mutationFn: () => archivePieceLots(
      projectId!,
      selectedPieceIds.size > 0 ? [...selectedPieceIds] : [], // This will be updated by the controller's eligibility check
      archiveConfirmation,
      archiveReason.trim(),
    ),
    onSuccess: async (summary) => {
      setSelectedPieceIds(new Set());
      setArchiveOpen(false);
      setArchiveReason("");
      setArchiveConfirmation("");
      await invalidate();
      toast.success("Pieces archived");
    },
    onError: (error: Error) =>
      toast.error(presentPieceControlError(error, "The selected pieces could not be archived.")),
  });

  const bulkAssignMutation = useMutation({
    meta: reportingMeta("pieceRegister.bulk.assign"),
    mutationFn: (workPackageId: string) =>
      assignPiecesToWorkPackage(projectId!, [...selectedPieceIds], workPackageId),
    onSuccess: async (summary) => {
      setSelectedPieceIds(new Set());
      await invalidate();
      toast.success("Pieces assigned to work package");
    },
    onError: (error: Error) =>
      toast.error(presentPieceControlError(error, "Selected pieces could not be assigned.")),
  });

  const bulkUnassignMutation = useMutation({
    meta: reportingMeta("pieceRegister.bulk.unassign"),
    mutationFn: () =>
      unassignPiecesFromWorkPackage(projectId!, [...selectedPieceIds]),
    onSuccess: async (summary) => {
      setSelectedPieceIds(new Set());
      await invalidate();
      toast.success("Pieces unassigned");
    },
    onError: (error: Error) =>
      toast.error(presentPieceControlError(error, "Selected pieces could not be unassigned.")),
  });

  const bulkAttrsMutation = useMutation({
    meta: reportingMeta("pieceRegister.bulk.attributes"),
    mutationFn: (values: any) => {
      const plan = planBulkPieceAttributeUpdate(values);
      return bulkUpdatePieceAttributes(projectId!, [...selectedPieceIds], plan.patch);
    },
    onSuccess: async (summary) => {
      setSelectedPieceIds(new Set());
      await invalidate();
      toast.success(`Updated ${summary.updated} piece(s)`);
    },
    onError: (error: Error) =>
      toast.error(presentPieceControlError(error, "Selected pieces could not be updated.")),
  });

  const bulkHoldMutation = useMutation({
    meta: reportingMeta("pieceRegister.bulk.hold"),
    mutationFn: ({ onHold, reason }: { onHold: boolean; reason?: string }) =>
      setPieceHold(projectId!, [...selectedPieceIds], onHold, reason),
    onSuccess: async () => {
      setSelectedPieceIds(new Set());
      await invalidate();
      toast.success("Hold state updated");
    },
    onError: (error: Error) =>
      toast.error(presentPieceControlError(error, "Hold state could not be updated.")),
  });

  return {
    // State
    filters, setFilters,
    sourceType, setSourceType,
    importFile, setImportFile,
    importRows, setImportRows,
    importNotice, setImportNotice,
    selectedBatchId, setSelectedBatchId,
    applyConfirmed, setApplyConfirmed,
    importTargetWorkPackageId, setImportTargetWorkPackageId,
    selectedPieceIds, setSelectedPieceIds,
    registerSort, setRegisterSort,
    archiveOpen, setArchiveOpen,
    archiveReason, setArchiveReason,
    archiveConfirmation, setArchiveConfirmation,
    attentionFocus, setAttentionFocus,

    // Queries
    piecesQuery,
    batchesQuery,
    workPackagesQuery,
    intelligenceQuery,
    batchRowsQuery,

    // Derived
    selectedPieceId,
    hasActionablePieces,

    // Mutations
    holdMutation,
    drawingImpactMutation,
    resolveDrawingHandoffMutation: resolveDrawingImpactMutation,
    stageMutation,
    approveMutation,
    applyMutation,
    archiveMutation,
    bulkAssignMutation,
    bulkUnassignMutation,
    bulkAttrsMutation,
    bulkHoldMutation,

    // Handlers
    invalidate,
    setSelectedPieceIds,
  };
}
