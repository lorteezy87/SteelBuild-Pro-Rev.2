import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCanonicalReportingRealtime } from "@/hooks/useCanonicalReportingRealtime";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Boxes,
  Database,
  Factory,
  FileUp,
  GitCompareArrows,
  GitBranch,
  PackageOpen,
  LayoutGrid,
  Scale,
  Settings2,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import "@/styles/command.css";
import "@/styles/piece-control-command.css";
import { entities } from "@/api/supabaseClient";
import type { DrawingImpactRow } from "@/hooks/useDrawingImpacts";
import { supabase } from "@/lib/supabase";
import {
  DecisionPanel,
  KpiStrip,
  PageHero,
  useCommandSkin,
  type KpiCellDef
} from "@/components/command";
import { PieceAttentionPanel } from "@/components/pieceControl/PieceAttentionPanel";
import { PieceControlModeBadge } from "@/components/pieceControl/PieceControlModeBadge";
import CanonicalFabReleasePanel from "@/components/pieceControl/CanonicalFabReleasePanel";
import { PieceLifecycleStrip } from "@/components/pieceControl/PieceLifecycleStrip";
import PieceRelationshipManager from "@/components/pieceControl/PieceRelationshipManager";
import PackageBoard from "@/components/pieceControl/PackageBoard";
import { PieceProductionControl } from "@/components/pieceControl/PieceProductionControl";
import { PieceLogisticsControl } from "@/components/pieceControl/PieceLogisticsControl";
import { PieceControlPilotReadiness } from "@/components/pieceControl/PieceControlPilotReadiness";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { photoFor } from "@/config/launcherConfig";
import { planBulkPieceAttributeUpdate } from "@/lib/pieceControl/bulkUpdatePieces";
import { bulkUpdatePieceAttributes } from "@/lib/pieceControl/bulkUpdateRepository";
import { fetchCanonicalDashboardSnapshot } from "@/lib/pieceControl/canonicalDashboardRepository";
import { selectActionableLeafPieces } from "@/lib/pieceControl/canonicalRollups";
import {
  buildPieceDigitalThread,
  derivePieceIntelligence,
} from "@/lib/pieceControl/pieceIntelligenceDerive";
import { fetchPieceIntelligenceSnapshot } from "@/lib/pieceControl/pieceIntelligenceRepository";
import { readPieceImportFile } from "@/lib/pieceControl/importAdapters";
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
import {
  buildPieceControlSummary,
  modePresentation,
  type PieceAttentionItem,
  type PieceControlMode,
} from "@/lib/pieceControl/presentation";
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
import { withProjectId } from "@/lib/mutations/standardMutation";
import type { PieceRegisterFilters } from "./pieceRegister/filter";
import {
  uniqueValues,
  buildWorkPackageLabelMap,
  buildPieceDisplayRows,
  buildFilteredRegisterRows,
  archiveConfirmationText as buildArchiveConfirmationText,
  allRowsSelected,
  IMPORT_DECISION_TONE,
  EMPTY_PIECE_REGISTER_FILTERS,
  PIECE_REGISTER_VIEW_LABELS,
  PIECE_REGISTER_VIEW_IDS,
} from "./pieceRegister/registerHelpers";
import { PieceRegisterArchiveDialog } from "./pieceRegister/PieceRegisterArchiveDialog";
import { PieceRegisterRegisterView } from "./pieceRegister/PieceRegisterRegisterView";
import { PieceDigitalThread } from "./pieceRegister/PieceDigitalThread";
import {
  PieceRevisionImpactView,
  type DrawingImpactAssigneeOption,
  type DrawingImpactDraft,
} from "./pieceRegister/PieceRevisionImpactView";
import { PieceRegisterImportView } from "./pieceRegister/PieceRegisterImportView";
import {
  deriveOverviewWorkPackages,
  selectUpcomingShipments,
} from "./pieceRegister/overviewDerive";
import PieceRegisterOverview from "./pieceRegister/PieceRegisterOverview";
import {
  parsePieceRegisterLocation,
  writePieceRegisterLocation,
} from "./pieceRegister/pieceRegisterLocation";

const EMPTY_FILTERS = EMPTY_PIECE_REGISTER_FILTERS;
const EMPTY_SELECTED_PIECE_IDS = new Set<string>();

const REGISTER_VIEW_ICONS = {
  overview: Boxes,
  impact: GitCompareArrows,
  register: PackageOpen,
  board: LayoutGrid,
  import: FileUp,
  relationships: GitBranch,
  production: Factory,
  logistics: Truck,
  settings: Settings2,
} as const;

const REGISTER_VIEWS = PIECE_REGISTER_VIEW_IDS.map((id) => ({
  id,
  label: PIECE_REGISTER_VIEW_LABELS[id],
  icon: REGISTER_VIEW_ICONS[id],
}));

type PieceRegisterView = (typeof PIECE_REGISTER_VIEW_IDS)[number];

type PieceHoldRequest = {
  pieceId: string;
  onHold: boolean;
  reason: string;
};

type DrawingImpactWriteRequest = {
  impactId: string | null;
  revisionId: string;
  draft: DrawingImpactDraft;
  previousStatus: DrawingImpactRow["status"] | null;
  previousResolvedAt: string | null;
};

const DRAWING_IMPACT_TYPES = new Set([
  "fabrication",
  "erection",
  "embed",
  "anchor_bolts",
  "connections",
  "material_takeoff",
  "shop_drawing_required",
  "rfi_followup",
  "change_order",
  "field_rework",
]);
const DRAWING_IMPACT_STATUSES = new Set([
  "open",
  "in_review",
  "ready",
  "blocked",
  "resolved",
  "closed",
]);
const DRAWING_IMPACT_PRIORITIES = new Set([
  "low",
  "medium",
  "high",
  "critical",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DrawingImpactAssigneeRpcRow = {
  user_id: string;
  display_name: string;
  project_role: string;
};

type DrawingImpactAssigneeRpcError = {
  message: string;
};

type DrawingImpactAssigneeRpcResponse = {
  data: unknown;
  error: DrawingImpactAssigneeRpcError | null;
};

function isDrawingImpactAssigneeRpcRow(
  value: unknown,
): value is DrawingImpactAssigneeRpcRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<DrawingImpactAssigneeRpcRow>;
  return (
    typeof row.user_id === "string" &&
    UUID_PATTERN.test(row.user_id) &&
    typeof row.display_name === "string" &&
    Boolean(row.display_name.trim()) &&
    typeof row.project_role === "string" &&
    Boolean(row.project_role.trim())
  );
}

function drawingImpactAssigneeLabel(row: DrawingImpactAssigneeRpcRow): string {
  return `${row.display_name.trim()} · ${row.project_role.replace(/_/g, " ")}`;
}

function isTerminalDrawingImpactStatus(
  status: DrawingImpactRow["status"],
): boolean {
  return status === "resolved" || status === "closed";
}

export default function PieceRegister() {
  useCommandSkin();
  const { activeProject, updateActiveProject } = useProjectContext() as any;
  const projectId = activeProject?.id as string | undefined;
  // Two people working the same register: refetch on the other's station
  // advance / ship / hold instead of waiting for the 30s staleTime.
  useCanonicalReportingRealtime(projectId);
  const mode = String(activeProject?.piece_control_mode ?? "off") as PieceControlMode;
  const enabled = Boolean(projectId && mode !== "off");
  const queryClient = useQueryClient();
  const { role, isLoading: roleLoading } = useProjectRole(projectId);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useMemo(
    () => parsePieceRegisterLocation(searchParams),
    [searchParams],
  );
  const activeView = location.view;
  const setPieceRegisterLocation = useCallback(
    (patch: Parameters<typeof writePieceRegisterLocation>[1]) => {
      setSearchParams(
        (current) => writePieceRegisterLocation(current, patch),
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const setActiveView = useCallback(
    (view: PieceRegisterView) => setPieceRegisterLocation({ view }),
    [setPieceRegisterLocation],
  );
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sourceType, setSourceType] = useState<PieceImportSourceType>("csv");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importRows, setImportRows] = useState<ImportPayload[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [applyConfirmed, setApplyConfirmed] = useState(false);
  const [importTargetWorkPackageId, setImportTargetWorkPackageId] = useState("");
  const [selectedPieceIdsState, setSelectedPieceIdsState] = useState<Set<string>>(
    EMPTY_SELECTED_PIECE_IDS,
  );
  const selectedPieceIdsRef = useRef(EMPTY_SELECTED_PIECE_IDS);
  const selectedPieceProjectIdRef = useRef<string | undefined>(undefined);
  const pendingSelectionUrlValue = useRef<string | null>(null);
  const setSelectedPieceIds: typeof setSelectedPieceIdsState = useCallback(
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
  const [registerSort, setRegisterSort] = useState<PieceRegisterSort>({
    key: "work_package",
    direction: "asc",
  });
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveConfirmation, setArchiveConfirmation] = useState("");
  const [attentionFocus, setAttentionFocus] = useState<PieceAttentionItem["key"] | null>(null);

  const lastProjectId = useRef(projectId);
  const projectSwitchReconciliationBlock = useRef<string | null>(null);
  const isRealProjectSwitch = Boolean(
    projectId && lastProjectId.current && lastProjectId.current !== projectId,
  );
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

  const piecesQuery = useQuery({
    queryKey: ["piece-register", projectId],
    queryFn: () => fetchPieceRegister(projectId!),
    enabled,
    staleTime: 30_000,
  });
  const batchesQuery = useQuery({
    queryKey: ["piece-import-batches", projectId],
    queryFn: () => fetchPieceImportBatches(projectId!),
    enabled,
    staleTime: 10_000,
  });
  const workPackagesQuery = useQuery({
    queryKey: ["piece-register-work-packages", projectId],
    queryFn: () => entities.WorkPackage.filter({ project_id: projectId }),
    enabled,
    staleTime: 30_000,
  });
  const selectedPieceId =
    selectedPieceIds.size === 1 ? [...selectedPieceIds][0] : null;
  const hasActionablePieces = useMemo(
    () => selectActionableLeafPieces(piecesQuery.data ?? []).length > 0,
    [piecesQuery.data],
  );
  const intelligenceQuery = useQuery({
    queryKey: pieceControlKeys.intelligence(projectId!),
    queryFn: () => fetchPieceIntelligenceSnapshot(projectId!),
    enabled:
      enabled &&
      piecesQuery.isSuccess &&
      hasActionablePieces &&
      (activeView === "overview" ||
        activeView === "impact" ||
        Boolean(selectedPieceId)),
    staleTime: 15_000,
  });
  const intelligenceModel = useMemo(
    () => intelligenceQuery.data
      ? derivePieceIntelligence(intelligenceQuery.data, new Date())
      : null,
    [intelligenceQuery.data],
  );
  const selectedPieceThread = useMemo(
    () => selectedPieceId && intelligenceQuery.data
      ? buildPieceDigitalThread(selectedPieceId, intelligenceQuery.data)
      : null,
    [intelligenceQuery.data, selectedPieceId],
  );
  const selectedRevisionImpact = useMemo(() => {
    if (
      !location.revisionId ||
      !intelligenceQuery.data ||
      !intelligenceModel?.revisions.some(
        (revision) => revision.revisionId === location.revisionId,
      )
    ) {
      return null;
    }
    const matching = intelligenceQuery.data.drawingImpacts.filter(
      (impact) => impact.drawing_revision_id === location.revisionId,
    );
    return matching.find(
      (impact) => impact.status !== "resolved" && impact.status !== "closed",
    ) ?? matching[0] ?? null;
  }, [intelligenceModel, intelligenceQuery.data, location.revisionId]);

  const batches = batchesQuery.data ?? [];
  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId) ?? batches[0] ?? null;
  const batchRowsQuery = useQuery({
    queryKey: ["piece-import-rows", projectId, selectedBatch?.id],
    queryFn: () => fetchPieceImportRows(projectId!, selectedBatch!.id),
    enabled: enabled && Boolean(selectedBatch?.id),
  });

  const workPackageMap = useMemo(
    () => buildWorkPackageLabelMap(workPackagesQuery.data ?? []),
    [workPackagesQuery.data],
  );
  const displayRows = useMemo(
    () => buildPieceDisplayRows(piecesQuery.data, workPackageMap),
    [piecesQuery.data, workPackageMap],
  );
  // Where the selected batch's applied pieces sit in the live register, so
  // the Imports tab shows "204 of 204 in WP-014" instead of a blank dropdown.
  const appliedAssignment = useMemo(
    () =>
      batchRowsQuery.data && piecesQuery.data
        ? summarizeAppliedAssignment(
            batchRowsQuery.data,
            piecesQuery.data,
            (id) => workPackageMap.get(id) ?? id,
          )
        : null,
    [batchRowsQuery.data, piecesQuery.data, workPackageMap],
  );
  const appliedSheetHintCount = useMemo(
    () => collectAppliedPieceSheetHints(batchRowsQuery.data ?? []).length,
    [batchRowsQuery.data],
  );
  const selectedPieceRecord = useMemo(
    () => (piecesQuery.data ?? []).find((piece) => piece.id === selectedPieceId) ?? null,
    [piecesQuery.data, selectedPieceId],
  );
  const actionablePieceIds = useMemo(
    () =>
      new Set(
        selectActionableLeafPieces(displayRows).map((piece) => piece.id),
      ),
    [displayRows],
  );
  const lastObservedPieceUrlValue = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!projectId || !piecesQuery.isSuccess) return;

    if (projectSwitchReconciliationBlock.current === projectId) {
      if (!location.pieceId) {
        projectSwitchReconciliationBlock.current = null;
        pendingSelectionUrlValue.current = null;
        lastObservedPieceUrlValue.current = null;
      }
      return;
    }

    const requestedPieceId = location.pieceId;
    if (requestedPieceId) {
      pendingSelectionUrlValue.current = null;
      lastObservedPieceUrlValue.current = requestedPieceId;
      if (!actionablePieceIds.has(requestedPieceId)) {
        selectedPieceIdsRef.current = EMPTY_SELECTED_PIECE_IDS;
        selectedPieceProjectIdRef.current = projectId;
        pendingSelectionUrlValue.current = "";
        setSelectedPieceIdsState(EMPTY_SELECTED_PIECE_IDS);
        setPieceRegisterLocation({ pieceId: null });
        return;
      }

      if (
        selectedPieceProjectIdRef.current !== projectId ||
        selectedPieceIdsRef.current.size !== 1 ||
        !selectedPieceIdsRef.current.has(requestedPieceId)
      ) {
        const next = new Set([requestedPieceId]);
        selectedPieceIdsRef.current = next;
        selectedPieceProjectIdRef.current = projectId;
        setSelectedPieceIdsState(next);
      }
      return;
    }

    if (pendingSelectionUrlValue.current === "") {
      pendingSelectionUrlValue.current = null;
      lastObservedPieceUrlValue.current = null;
      return;
    }

    pendingSelectionUrlValue.current = null;
    const previousUrlValue = lastObservedPieceUrlValue.current;
    lastObservedPieceUrlValue.current = null;
    if (previousUrlValue) {
      selectedPieceIdsRef.current = EMPTY_SELECTED_PIECE_IDS;
      selectedPieceProjectIdRef.current = projectId;
      setSelectedPieceIdsState(EMPTY_SELECTED_PIECE_IDS);
    }
  }, [
    actionablePieceIds,
    location.pieceId,
    piecesQuery.isSuccess,
    projectId,
    setPieceRegisterLocation,
  ]);
  useEffect(() => {
    if (activeView !== "impact" || !location.revisionId) return;
    if (!intelligenceQuery.isSuccess || !intelligenceModel) return;
    if (intelligenceQuery.data.availability.relationships !== "available") return;
    const revisionIsAccessible = intelligenceModel.revisions.some(
      (revision) => revision.revisionId === location.revisionId,
    );
    if (!revisionIsAccessible) {
      setPieceRegisterLocation({ revisionId: null });
    }
  }, [
    activeView,
    intelligenceModel,
    intelligenceQuery.data,
    intelligenceQuery.isSuccess,
    location.revisionId,
    setPieceRegisterLocation,
  ]);
  const overviewSnapshotQuery = useQuery({
    queryKey: ["canonical-reporting", projectId],
    queryFn: () => fetchCanonicalDashboardSnapshot(projectId!),
    enabled:
      enabled &&
      activeView === "overview" &&
      piecesQuery.isSuccess &&
      hasActionablePieces,
    staleTime: 30_000,
  });
  const overviewWorkPackages = useMemo(
    () => deriveOverviewWorkPackages(overviewSnapshotQuery.data),
    [overviewSnapshotQuery.data],
  );
  const upcomingShipments = useMemo(
    () => selectUpcomingShipments(overviewWorkPackages),
    [overviewWorkPackages],
  );
  const filteredRows = useMemo(
    () => buildFilteredRegisterRows(displayRows, filters, attentionFocus, registerSort),
    [attentionFocus, displayRows, filters, registerSort],
  );
  const canBulkUpdate = enabled && !roleLoading && roleAtLeast(role, "field");
  const canArchive = enabled && !roleLoading && roleAtLeast(role, "admin");
  const canManagePieceHold = enabled && !roleLoading && roleAtLeast(role, "field");
  const canManageDrawingImpacts = enabled && !roleLoading && roleAtLeast(role, "pm");
  const canLoadImpactAssignees =
    canManageDrawingImpacts &&
    activeView === "impact" &&
    Boolean(location.revisionId) &&
    intelligenceQuery.data?.availability.impacts === "available";
  const impactAssigneesQuery = useQuery({
    queryKey: ["drawing-impact-assignees", projectId],
    queryFn: async () => {
      const callRpc = supabase.rpc.bind(supabase) as unknown as (
        functionName: "list_drawing_impact_assignees",
        args: { p_project_id: string },
      ) => Promise<DrawingImpactAssigneeRpcResponse>;
      const { data, error } = await callRpc(
        "list_drawing_impact_assignees",
        { p_project_id: projectId! },
      );
      if (error) throw new Error(error.message);
      if (!Array.isArray(data) || !data.every(isDrawingImpactAssigneeRpcRow)) {
        throw new Error("Project assignee roster returned an invalid response.");
      }
      return data.map<DrawingImpactAssigneeOption>((row) => ({
        userId: row.user_id,
        label: drawingImpactAssigneeLabel(row),
      }));
    },
    enabled: canLoadImpactAssignees,
    staleTime: 30_000,
  });
  const impactAssignees = impactAssigneesQuery.data ?? [];
  const impactAssigneesLoading =
    canLoadImpactAssignees && impactAssigneesQuery.isLoading;
  const allFilteredSelected = allRowsSelected(filteredRows, selectedPieceIds);
  const archiveConfirmationText = buildArchiveConfirmationText(selectedPieceIds.size);

  const profiles = useMemo(() => uniqueValues(displayRows.map((row) => row.profile)), [displayRows]);
  const grades = useMemo(() => uniqueValues(displayRows.map((row) => row.material_grade)), [displayRows]);
  const lifecycles = useMemo(() => uniqueValues(displayRows.map((row) => row.lifecycle_status)), [displayRows]);
  const sources = useMemo(() => uniqueValues(displayRows.map((row) => row.source_system)), [displayRows]);
  const presentation = useMemo(
    () => buildPieceControlSummary(selectActionableLeafPieces(displayRows)),
    [displayRows],
  );
  const modeInfo = modePresentation(mode);
  const kpiCells: KpiCellDef[] = [
    {
      label: "Total Pieces",
      value: presentation.totalPieces.toLocaleString(),
      Icon: Boxes,
    },
    {
      label: "Known Tons",
      value: presentation.knownTons.toFixed(1),
      Icon: Scale,
    },
    {
      label: "In Fabrication",
      value: presentation.inFabricationPieces.toLocaleString(),
      tone: "info",
      Icon: Factory,
    },
    {
      label: "Ready to Ship",
      value: presentation.readyToShipPieces.toLocaleString(),
      tone: "good",
      Icon: Truck,
    },
    {
      label: "Exceptions",
      value: presentation.attention
        .reduce((total, item) => total + item.count, 0)
        .toLocaleString(),
      tone: presentation.attention.length > 0 ? "warn" : "good",
      Icon: AlertTriangle,
    },
  ];

  // Archive / bulk-assign / bulk-hold change production + logistics eligibility
  // too, so use the shared "all" scope instead of a hand-rolled key list that
  // left the station board, logistics and release gate stale.
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
    mutationFn: ({ pieceId, onHold, reason }: PieceHoldRequest) => {
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
    mutationFn: async ({
      impactId,
      revisionId,
      draft,
      previousStatus,
      previousResolvedAt,
    }: DrawingImpactWriteRequest) => {
      if (impactAssigneesLoading || impactAssigneesQuery.error) {
        throw new Error("Project assignee roster is unavailable.");
      }
      if (!DRAWING_IMPACT_TYPES.has(draft.impact_type)) {
        throw new Error("Select a valid impact type.");
      }
      if (!DRAWING_IMPACT_STATUSES.has(draft.status)) {
        throw new Error("Select a valid impact status.");
      }
      if (!DRAWING_IMPACT_PRIORITIES.has(draft.priority)) {
        throw new Error("Select a valid impact priority.");
      }
      const title = draft.title.trim();
      if (!title) throw new Error("Impact title is required.");
      const assignedTo = draft.assigned_to.trim();
      if (
        assignedTo &&
        (!UUID_PATTERN.test(assignedTo) ||
          !impactAssignees.some((member) => member.userId === assignedTo))
      ) {
        throw new Error("Select an assigned project member.");
      }
      if (
        impactId &&
        (!previousStatus || !DRAWING_IMPACT_STATUSES.has(previousStatus))
      ) {
        throw new Error("The current drawing impact status is unavailable.");
      }
      const nextStatusIsTerminal = isTerminalDrawingImpactStatus(draft.status);
      const previousStatusIsTerminal = previousStatus
        ? isTerminalDrawingImpactStatus(previousStatus)
        : false;
      const resolvedAt = nextStatusIsTerminal
        ? previousStatusIsTerminal
          ? previousResolvedAt
          : new Date().toISOString()
        : null;
      const payload = withProjectId({
        drawing_revision_id: revisionId,
        impact_type: draft.impact_type,
        status: impactId ? draft.status : "open",
        priority: draft.priority,
        assigned_to: assignedTo || null,
        due_date: draft.due_date || null,
        title,
        notes: draft.notes.trim() || null,
        ...(impactId
          ? { resolved_at: resolvedAt }
          : {}),
      }, projectId);

      if (impactId) {
        await entities.DrawingImpact.update(impactId, payload as never);
        return "updated" as const;
      }
      await entities.DrawingImpact.create(payload as never);
      return "created" as const;
    },
    onSuccess: async (result) => {
      await invalidateProtectedActionQueries();
      toast.success(
        result === "created" ? "Drawing impact created" : "Drawing impact updated",
      );
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(error, "The drawing impact could not be saved."),
      ),
  });

  const resolveDrawingImpactMutation = useMutation({
    mutationFn: async (impactId: string) => {
      await entities.DrawingImpact.update(
        impactId,
        withProjectId({
          status: "resolved",
          resolved_at: new Date().toISOString(),
        }, projectId) as never,
      );
    },
    onSuccess: async () => {
      await invalidateProtectedActionQueries();
      toast.success("Drawing impact resolved");
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(error, "The drawing impact could not be resolved."),
      ),
  });

  /** Best-effort re-link after register writes that can change piece_mark. */
  const relinkModelElements = async () => {
    if (!projectId || !enabled) return null;
    try {
      return await linkModelElementsToPieces(projectId);
    } catch {
      return null;
    }
  };

  const finalizeImportedBatchHints = async (batchId: string) => {
    const rows = await fetchPieceImportRows(projectId!, batchId);
    let assigned = 0;
    // Pieces the RPC found already in the target package. Apply with a package
    // selected assigns as part of apply, so a second click here is all
    // "unchanged" — that is not "no hints found" and must not read as such.
    let unchanged = 0;
    let linked = 0;

    if (importTargetWorkPackageId) {
      const pieceIds = collectAppliedPieceIds(rows);
      if (pieceIds.length > 0) {
        const summary = await assignPiecesToWorkPackage(
          projectId!,
          pieceIds,
          importTargetWorkPackageId,
        );
        assigned += Number(summary.assigned ?? pieceIds.length);
        unchanged += Number(summary.unchanged ?? 0);
      }
    } else {
      const byWpNumber = collectAppliedPiecesByWpNumber(rows);
      const livePackages = (workPackagesQuery.data ?? []) as Array<{
        id: string;
        wp_number?: string | null;
      }>;
      for (const [wpNumber, pieceIds] of Object.entries(byWpNumber)) {
        const match = livePackages.find(
          (wp) =>
            String(wp.wp_number ?? "").trim().toLowerCase() ===
            wpNumber.trim().toLowerCase(),
        );
        if (!match || pieceIds.length === 0) continue;
        const summary = await assignPiecesToWorkPackage(
          projectId!,
          pieceIds,
          match.id,
        );
        assigned += Number(summary.assigned ?? pieceIds.length);
        unchanged += Number(summary.unchanged ?? 0);
      }
    }

    const hints = collectAppliedPieceSheetHints(rows);
    if (hints.length > 0) {
      const snapshot = await fetchPieceRelationshipSnapshot(projectId!);
      const plan = planImportDrawingLinks(hints, snapshot.drawings);
      const result = await applyImportDrawingLinks(plan, (pieceId, drawingSetId) =>
        linkPieceDrawingSet(projectId!, pieceId, drawingSetId),
      );
      linked = result.linked;
    }

    return {
      assigned,
      unchanged,
      linked,
      pieceCount: collectAppliedPieceIds(rows).length,
      sheetHintCount: hints.length,
      wpHintCount: countWpHints(rows),
    };
  };

  const stageMutation = useMutation({
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
      await invalidate();
      toast.success("Import staged for review");
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(error, "The import could not be staged."),
      ),
  });
  const approveMutation = useMutation({
    mutationFn: () => approvePieceImportBatch(selectedBatch!.id),
    onSuccess: async () => {
      await invalidate();
      toast.success("Batch approved. Confirm once more to apply.");
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(error, "The import batch could not be approved."),
      ),
  });
  const applyMutation = useMutation({
    mutationFn: async () => {
      const summary = await applyPieceImportBatch(selectedBatch!.id);
      const hints = await finalizeImportedBatchHints(selectedBatch!.id);
      return { summary, ...hints };
    },
    onSuccess: async ({ summary, assigned, linked }) => {
      setApplyConfirmed(false);
      // Re-link before invalidate so the refetch sees fresh piece_id rows.
      const linkSummary = await relinkModelElements();
      await invalidate();
      const parts = [
        `Import applied: ${summary.created ?? 0} created, ${summary.updated ?? 0} updated`,
      ];
      if (assigned > 0) parts.push(`${assigned} assigned to work package`);
      if (linked > 0) parts.push(`${linked} drawing link(s)`);
      if (linkSummary && Number(linkSummary.linked ?? 0) > 0) {
        parts.push(`${linkSummary.linked} model mark(s) linked`);
      }
      toast.success(parts.join(" · "));
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(error, "The import batch could not be applied."),
      ),
  });
  const assignImportMutation = useMutation({
    mutationFn: () => finalizeImportedBatchHints(selectedBatch!.id),
    onSuccess: async (result) => {
      await invalidate();
      const target = importTargetWorkPackageId
        ? (workPackagesQuery.data ?? []).find((wp) => wp.id === importTargetWorkPackageId) ?? null
        : null;
      const { tone, message } = describeImportAssignResult({
        ...result,
        targetLabel: target
          ? formatWorkPackageTitle(target)
          : importTargetWorkPackageId || null,
      });
      if (tone === "success") toast.success(message);
      else if (tone === "warning") toast.warning(message);
      else toast.message(message);
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(
          error,
          "Imported pieces could not be assigned or linked.",
        ),
      ),
  });
  const archiveMutation = useMutation({
    mutationFn: () => archivePieceLots(
      projectId!,
      [...selectedPieceIds],
      archiveConfirmation,
      archiveReason.trim(),
    ),
    onSuccess: async (summary) => {
      const archived = Number(summary.archived ?? selectedPieceIds.size);
      setSelectedPieceIds(new Set());
      setArchiveOpen(false);
      setArchiveReason("");
      setArchiveConfirmation("");
      await invalidate();
      toast.success(`${archived} piece${archived === 1 ? "" : "s"} archived`);
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(error, "The selected pieces could not be archived."),
      ),
  });
  const bulkAssignMutation = useMutation({
    mutationFn: (workPackageId: string) =>
      assignPiecesToWorkPackage(projectId!, [...selectedPieceIds], workPackageId),
    onSuccess: async (summary) => {
      setSelectedPieceIds(new Set());
      await invalidate();
      toast.success(
        `${summary.assigned ?? selectedPieceIds.size} piece(s) assigned to work package`,
      );
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(error, "Selected pieces could not be assigned."),
      ),
  });
  const bulkUnassignMutation = useMutation({
    mutationFn: () =>
      unassignPiecesFromWorkPackage(projectId!, [...selectedPieceIds]),
    onSuccess: async (summary) => {
      setSelectedPieceIds(new Set());
      await invalidate();
      toast.success(
        `${summary.unassigned ?? selectedPieceIds.size} piece(s) unassigned`,
      );
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(error, "Selected pieces could not be unassigned."),
      ),
  });
  const bulkAttrsMutation = useMutation({
    mutationFn: (values: {
      updateSequence: boolean;
      updateArea: boolean;
      sequenceNumber: string;
      erectionArea: string;
    }) => {
      const plan = planBulkPieceAttributeUpdate(values);
      if (plan.fields.length === 0) {
        throw new Error("Select at least one field to update.");
      }
      return bulkUpdatePieceAttributes(
        projectId!,
        [...selectedPieceIds],
        plan.patch,
      );
    },
    onSuccess: async (summary) => {
      setSelectedPieceIds(new Set());
      await invalidate();
      toast.success(
        `Updated ${summary.updated} piece(s)` +
          (summary.unchanged ? ` · ${summary.unchanged} unchanged` : ""),
      );
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(error, "Selected pieces could not be updated."),
      ),
  });
  const bulkHoldMutation = useMutation({
    mutationFn: ({ onHold, reason }: { onHold: boolean; reason?: string }) =>
      setPieceHold(projectId!, [...selectedPieceIds], onHold, reason),
    onSuccess: async (_result, variables) => {
      const count = selectedPieceIds.size;
      setSelectedPieceIds(new Set());
      await invalidate();
      toast.success(
        variables.onHold
          ? `Hold applied to ${count} piece(s)`
          : `Hold cleared on ${count} piece(s)`,
      );
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(error, "Hold state could not be updated."),
      ),
  });
  const bulkPending =
    bulkAssignMutation.isPending ||
    bulkUnassignMutation.isPending ||
    bulkAttrsMutation.isPending ||
    bulkHoldMutation.isPending ||
    archiveMutation.isPending;

  const toggleAllFiltered = () => {
    setSelectedPieceIds((current) => {
      const next = new Set(current);
      if (allFilteredSelected) filteredRows.forEach((piece) => next.delete(piece.id));
      else filteredRows.forEach((piece) => next.add(piece.id));
      return next;
    });
  };

  const openArchiveDialog = () => {
    setArchiveReason("");
    setArchiveConfirmation("");
    setArchiveOpen(true);
  };

  const clearRegisterFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAttentionFocus(null);
  };

  const updateRegisterFilters = (patch: Partial<PieceRegisterFilters>) => {
    setAttentionFocus(null);
    setFilters((current) => ({ ...current, ...patch }));
  };

  const handleLifecycleSelect = (lifecycle: string) => {
    setAttentionFocus(null);
    setFilters({ ...EMPTY_FILTERS, lifecycle });
    setActiveView("register");
  };

  const handleAttentionSelect = (key: PieceAttentionItem["key"]) => {
    setFilters(EMPTY_FILTERS);
    setAttentionFocus(key);
    setActiveView("register");
  };

  const handleModeChanged = (nextMode: PieceControlMode) => {
    updateActiveProject?.({ piece_control_mode: nextMode });
    if (nextMode !== "off") setActiveView("import");
  };

  const handleFile = async (file: File | null) => {
    setImportFile(file);
    setImportRows([]);
    if (!file) return;
    try {
      const rows = await readPieceImportFile(file, sourceType);
      if (rows.length === 0) throw new Error("No import rows were found");
      setImportRows(rows);
    } catch (error) {
      setImportFile(null);
      toast.error(error instanceof Error ? error.message : "Unable to read import file");
    }
  };

  if (!projectId) {
    return (
      <div className="piece-control-command" data-skin="command">
        <PageHero
          Icon={Database}
          title="Select a project"
          subtitle="The Piece Register is always scoped to one project."
          photoSrc={photoFor("PieceRegister") ?? undefined}
        />
      </div>
    );
  }

  if (mode === "off") {
    return (
      <div className="piece-control-command" data-skin="command">
        <PageHero
          Icon={ShieldCheck}
          title="Set up the Piece Register"
          subtitle="Start in Shadow review to import and compare piece data without replacing current production records."
          projectName={activeProject?.name}
          photoSrc={photoFor("PieceRegister") ?? undefined}
        >
          <PieceControlModeBadge presentation={modeInfo} />
        </PageHero>

        <section className="piece-register-setup-steps" aria-label="Piece Register setup steps">
            {[
              ["1", "Start Shadow review", "Existing production and release workflows remain unchanged."],
              ["2", "Stage a piece file", "Upload CSV or JSON, review matches and exceptions, then approve the batch."],
              ["3", "Run the workflow", "Organize lots, advance shop stations, and record logistics from one project register."],
            ].map(([step, title, description]) => (
              <div key={step} className="piece-register-setup-step">
                <div className="piece-register-setup-step__number">
                  {step}
                </div>
                <h2>{title}</h2>
                <p>{description}</p>
              </div>
            ))}
        </section>

        <DecisionPanel title="Piece Register setup">
          <div className="piece-register-setup-notice">
              <ShieldCheck size={18} />
              <div>
                <strong>Admin setup required</strong>
                <p>
                  A project owner or admin must move this project from Not set up to
                  Shadow review below. Shadow review creates the register without replacing
                  current downstream workflows.
                </p>
              </div>
          </div>
        </DecisionPanel>

        <div className="piece-register-embedded-workspace">
          <PieceControlPilotReadiness
              projectId={projectId}
              currentMode="off"
              onModeChanged={handleModeChanged}
            />
        </div>
      </div>
    );
  }

  return (
    <div className="piece-control-command" data-skin="command">
      <PageHero
        Icon={Boxes}
        title="Piece Register"
        subtitle="Controlled piece, lot, production, and logistics record."
        projectName={activeProject?.name}
        photoSrc={photoFor("PieceRegister") ?? undefined}
      >
        <div className="piece-register-hero-actions">
          <PieceControlModeBadge presentation={modeInfo} />
          <button
            type="button"
            className="cmd-btn cmd-btn--primary"
            onClick={() => setActiveView("import")}
          >
            <FileUp size={16} />
            Import pieces
          </button>
        </div>
      </PageHero>

      {piecesQuery.isLoading ? (
        <DecisionPanel title="Piece Register status">
          <div className="piece-operation-state is-loading">
            Loading the Piece Register…
          </div>
        </DecisionPanel>
      ) : piecesQuery.error ? (
        <DecisionPanel title="Piece Register status">
          <div className="piece-operation-state is-error">
            <strong>The Piece Register could not be loaded.</strong>
            <span>
              {presentPieceControlError(
                piecesQuery.error,
                "Piece Register data could not be loaded.",
              )}
            </span>
            <button
              type="button"
              onClick={() => void piecesQuery.refetch()}
              className="cmd-btn cmd-btn--secondary"
            >
              Try again
            </button>
          </div>
        </DecisionPanel>
      ) : (
        <>
          <KpiStrip cells={kpiCells} />

          <div className="piece-register-summary">
            <DecisionPanel title="Piece lifecycle">
              <PieceLifecycleStrip
                items={presentation.lifecycle}
                totalPieces={presentation.totalPieces}
                onSelect={handleLifecycleSelect}
              />
            </DecisionPanel>
            <DecisionPanel title="Needs attention">
              <PieceAttentionPanel
                items={presentation.attention}
                emptyMessage="No piece exceptions."
                onSelect={handleAttentionSelect}
              />
            </DecisionPanel>
          </div>
        </>
      )}

      <nav aria-label="Piece Register sections" className="piece-register-nav">
        {REGISTER_VIEWS.map(({ id, label, icon: Icon }) => {
          const selected = activeView === id;
          return (
            <button
              key={id}
              type="button"
              aria-current={selected ? "page" : undefined}
              onClick={() => setActiveView(id)}
              className={`piece-register-nav__item${selected ? " is-active" : ""}`}
            >
              <Icon size={16} />
              {label}
            </button>
          );
        })}
      </nav>

        {archiveOpen && (
          <PieceRegisterArchiveDialog
            selectedCount={selectedPieceIds.size}
            archiveReason={archiveReason}
            archiveConfirmation={archiveConfirmation}
            archiveConfirmationText={archiveConfirmationText}
            isPending={archiveMutation.isPending}
            onReasonChange={setArchiveReason}
            onConfirmationChange={setArchiveConfirmation}
            onCancel={() => setArchiveOpen(false)}
            onConfirm={() => archiveMutation.mutate()}
          />
        )}

        {activeView === "overview" && !piecesQuery.isLoading && !piecesQuery.error && (
          <PieceRegisterOverview
            displayRowCount={actionablePieceIds.size}
            overviewQueryState={{
              isLoading: overviewSnapshotQuery.isLoading,
              error: overviewSnapshotQuery.error,
              refetch: () => overviewSnapshotQuery.refetch(),
            }}
            overviewWorkPackages={overviewWorkPackages}
            upcomingShipments={upcomingShipments}
            intelligence={intelligenceModel}
            intelligenceState={{
              isLoading: intelligenceQuery.isLoading,
              error: intelligenceQuery.error,
              refetch: () => intelligenceQuery.refetch(),
            }}
            onOpenImport={() => setActiveView("import")}
            onOpenLogistics={() => setActiveView("logistics")}
            onReviewRevision={() =>
              setPieceRegisterLocation({ view: "impact", focus: "revision" })
            }
            onSelectRevision={(revisionId) =>
              setPieceRegisterLocation({ view: "impact", revisionId })
            }
            onSelectPiece={(pieceId) =>
              setPieceRegisterLocation({ view: "register", pieceId })
            }
            onOpenRelationships={(revisionId) =>
              setPieceRegisterLocation({
                view: "relationships",
                focus: "revision",
                revisionId,
                pieceId: null,
              })
            }
          />
        )}

        {activeView === "impact" && (
          <section
            className="piece-register-embedded-workspace"
            aria-label="Revision Impact workspace"
          >
            {piecesQuery.isLoading ? (
              <div className="piece-operation-state is-loading">
                Loading the project piece register…
              </div>
            ) : piecesQuery.error ? (
              <div className="piece-operation-state is-error">
                <strong>Revision evidence could not be loaded.</strong>
                <p>The active project piece register is unavailable.</p>
              </div>
            ) : !hasActionablePieces ? (
              <div className="piece-operation-state">
                <strong>No active pieces are available for revision review.</strong>
                <p>Use the controlled import workflow to establish the register first.</p>
                <button
                  type="button"
                  className="cmd-btn cmd-btn--primary"
                  onClick={() => setActiveView("import")}
                >
                  Import pieces
                </button>
              </div>
            ) : intelligenceQuery.isLoading ? (
              <div className="piece-operation-state is-loading">
                Loading exact revision evidence…
              </div>
            ) : intelligenceQuery.error ? (
              <div className="piece-operation-state is-error">
                <strong>Revision evidence could not be loaded.</strong>
                <p>
                  {presentPieceControlError(
                    intelligenceQuery.error,
                    "Revision evidence is unavailable.",
                  )}
                </p>
                <button
                  type="button"
                  className="cmd-btn cmd-btn--secondary"
                  onClick={() => void intelligenceQuery.refetch()}
                >
                  Try again
                </button>
              </div>
            ) : intelligenceModel ? (
              <>
                <PieceRevisionImpactView
                  model={intelligenceModel}
                  selectedRevisionId={
                    isRealProjectSwitch ? null : location.revisionId
                  }
                  onSelectRevision={(revisionId) =>
                    setPieceRegisterLocation({ revisionId })
                  }
                  onSelectPiece={(pieceId) =>
                    setSelectedPieceIds(new Set([pieceId]))
                  }
                  canManageImpacts={
                    canManageDrawingImpacts &&
                    intelligenceQuery.data?.availability.impacts === "available"
                  }
                  selectedImpact={selectedRevisionImpact}
                  assignees={impactAssignees}
                  assigneesLoading={impactAssigneesLoading}
                  assigneesUnavailable={Boolean(
                    impactAssigneesQuery.error,
                  )}
                  impactPending={
                    drawingImpactMutation.isPending ||
                    resolveDrawingImpactMutation.isPending
                  }
                  onSaveImpact={
                    location.revisionId
                      ? (impactId, draft) =>
                          drawingImpactMutation.mutateAsync({
                            impactId,
                            revisionId: location.revisionId!,
                            draft,
                            previousStatus: selectedRevisionImpact?.status ?? null,
                            previousResolvedAt:
                              selectedRevisionImpact?.resolved_at ?? null,
                          })
                      : undefined
                  }
                  onResolveImpact={(impactId) =>
                    resolveDrawingImpactMutation.mutateAsync(impactId)
                  }
                />
                {selectedPieceId ? (
                  selectedPieceThread ? (
                    <PieceDigitalThread
                      thread={selectedPieceThread}
                      onClose={() => setSelectedPieceIds(new Set())}
                      canManageHold={canManagePieceHold}
                      pieceOnHold={Boolean(selectedPieceRecord?.on_hold)}
                      holdPending={holdMutation.isPending}
                      onSetHold={(request) =>
                        holdMutation.mutateAsync({
                          pieceId: selectedPieceId,
                          ...request,
                        })
                      }
                      onOpenRelationships={() =>
                        setPieceRegisterLocation({
                          view: "relationships",
                          focus: "revision",
                          pieceId: selectedPieceId,
                          revisionId: location.revisionId,
                        })
                      }
                      onOpenRelease={canManageDrawingImpacts && selectedPieceRecord?.work_package_id
                        ? () =>
                            setPieceRegisterLocation({
                              view: "board",
                              focus: "release",
                              pieceId: selectedPieceId,
                            })
                        : undefined}
                    />
                  ) : (
                    <div className="piece-operation-state is-error">
                      Piece evidence is unavailable for this selection.
                    </div>
                  )
                ) : null}
              </>
            ) : (
              <div className="piece-operation-state is-error">
                Revision evidence is unavailable.
              </div>
            )}
          </section>
        )}

        {activeView === "register" && (
          <PieceRegisterRegisterView
            filters={filters}
            updateRegisterFilters={updateRegisterFilters}
            workPackages={(workPackagesQuery.data ?? []) as Array<{
              id: string;
              wp_number?: string | null;
              name?: string | null;
            }>}
            profiles={profiles}
            grades={grades}
            lifecycles={lifecycles}
            sources={sources}
            attentionFocus={attentionFocus}
            clearRegisterFilters={clearRegisterFilters}
            filteredRows={filteredRows as any}
            displayRows={displayRows as any}
            registerSort={registerSort}
            setRegisterSort={setRegisterSort}
            selectedPieceIds={selectedPieceIds}
            setSelectedPieceIds={setSelectedPieceIds}
            canBulkUpdate={canBulkUpdate}
            canArchive={canArchive}
            bulkPending={bulkPending}
            onBulkAssign={(workPackageId) => bulkAssignMutation.mutate(workPackageId)}
            onBulkUnassign={() => bulkUnassignMutation.mutate()}
            onBulkAttrs={(values) => bulkAttrsMutation.mutate(values)}
            onBulkHold={(payload) => bulkHoldMutation.mutate(payload)}
            onArchive={openArchiveDialog}
            selectedPieceId={selectedPieceId}
            selectedPieceThread={selectedPieceThread}
            intelligenceLoading={intelligenceQuery.isLoading}
            intelligenceError={intelligenceQuery.error}
            onRetryIntelligence={() => void intelligenceQuery.refetch()}
            onClosePiece={() => setSelectedPieceIds(new Set())}
            onOpenRelationships={() =>
              setPieceRegisterLocation({
                view: "relationships",
                focus: location.revisionId ? "revision" : null,
                pieceId: selectedPieceId,
              })
            }
            onOpenRelease={(canManageDrawingImpacts
              ? () =>
                  setPieceRegisterLocation({
                    view: "board",
                    focus: "release",
                    pieceId: selectedPieceId,
                  })
              : undefined) as unknown as () => void}
            allFilteredSelected={allFilteredSelected}
            toggleAllFiltered={toggleAllFiltered}
            piecesLoading={piecesQuery.isLoading}
            piecesError={piecesQuery.error}
            onRetryPieces={() => piecesQuery.refetch()}
            onGoImport={() => setActiveView("import")}
          />
        )}

        {activeView === "settings" && (
          <div className="piece-register-embedded-workspace">
            <PieceControlPilotReadiness
              projectId={projectId}
              currentMode={mode}
              onModeChanged={handleModeChanged}
            />
          </div>
        )}

        {activeView === "board" && (
          <section className="piece-register-embedded-workspace">
            {canManageDrawingImpacts && location.focus === "release" ? (
              selectedPieceRecord?.work_package_id ? (
                <CanonicalFabReleasePanel
                  projectId={projectId}
                  workPackageId={selectedPieceRecord.work_package_id}
                  pieceControlMode={mode}
                />
              ) : (
                <div className="piece-operation-state is-error">
                  <strong>Fabrication release work package is unavailable.</strong>
                  <p>Assign this piece to a work package before opening release checks.</p>
                </div>
              )
            ) : null}
            <PackageBoard projectId={projectId} pieceControlMode={mode} />
          </section>
        )}

        {activeView === "relationships" && (
          <section className="piece-register-embedded-workspace">
            <div className="piece-command-actions" style={{ marginBottom: 12 }}>
              <button
                type="button"
                className="cmd-btn cmd-btn--secondary"
                disabled={!projectId || !enabled}
                onClick={() => {
                  void linkModelElementsToPieces(projectId)
                    .then((summary) => {
                      const viaClient = summary.used_client_fallback
                        ? " (client fallback — apply Piece Control migrations when ready)"
                        : "";
                      toast.success(
                        `Linked ${summary.linked ?? 0} · unmatched ${summary.unmatched ?? 0} · ambiguous ${summary.ambiguous ?? 0}${viaClient}`,
                      );
                      // Link coverage shows on Relationships + Overview too.
                      void invalidatePieceControlQueries(queryClient, projectId, "relationships");
                    })
                    .catch((error: Error) =>
                      toast.error(
                        presentPieceControlError(
                          error,
                          "Could not link marks to pieces.",
                        ),
                      ),
                    );
                }}
              >
                Link 3D marks to pieces
              </button>
            </div>
            <PieceRelationshipManager
              projectId={projectId}
              pieceControlMode={mode}
            />
          </section>
        )}

        {activeView === "production" && (
          <div className="piece-register-embedded-workspace">
            <PieceProductionControl
              projectId={projectId}
              pieceControlMode={mode}
            />
          </div>
        )}

        {activeView === "logistics" && (
          <div className="piece-register-embedded-workspace">
            <PieceLogisticsControl
              projectId={projectId}
              pieceControlMode={mode}
            />
          </div>
        )}

        {activeView === "import" && (
          <PieceRegisterImportView
            sourceType={sourceType}
            setSourceType={setSourceType}
            importFile={importFile}
            importRows={importRows}
            handleFile={handleFile}
            stagePending={stageMutation.isPending}
            onStage={() => stageMutation.mutate()}
            batches={batches as any}
            selectedBatch={selectedBatch as any}
            setSelectedBatchId={setSelectedBatchId}
            setApplyConfirmed={setApplyConfirmed}
            applyConfirmed={applyConfirmed}
            approvePending={approveMutation.isPending}
            onApprove={() => approveMutation.mutate()}
            applyPending={applyMutation.isPending}
            onApply={() => applyMutation.mutate()}
            importTargetWorkPackageId={importTargetWorkPackageId}
            setImportTargetWorkPackageId={setImportTargetWorkPackageId}
            workPackages={(workPackagesQuery.data ?? []) as any}
            formatWorkPackageTitle={formatWorkPackageTitle}
            batchRows={(batchRowsQuery.data ?? []) as any}
            decisionTone={IMPORT_DECISION_TONE}
            assignPending={assignImportMutation.isPending}
            onAssignImport={() => assignImportMutation.mutate()}
            appliedAssignment={appliedAssignment}
            sheetHintCount={appliedSheetHintCount}
          />
        )}
      </div>
  );
}
