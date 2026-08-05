import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Database,
  Download,
  Factory,
  FileUp,
  GitBranch,
  PackageOpen,
  LayoutGrid,
  Scale,
  Search,
  Settings2,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import "@/styles/command.css";
import "@/styles/piece-control-command.css";
import { entities } from "@/api/supabaseClient";
import {
  DecisionPanel,
  KpiStrip,
  PageHero,
  Pill,
  useCommandSkin,
  type KpiCellDef,
  type PillTone,
} from "@/components/command";
import { PieceAttentionPanel } from "@/components/pieceControl/PieceAttentionPanel";
import { PieceControlModeBadge } from "@/components/pieceControl/PieceControlModeBadge";
import { PieceImpactPanel } from "@/components/pieceControl/PieceImpactPanel";
import { PieceLifecycleStrip } from "@/components/pieceControl/PieceLifecycleStrip";
import PieceRegisterBulkBar from "@/components/pieceControl/PieceRegisterBulkBar";
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
  buildPieceImpact,
  currentRevisionCodeForDrawing,
} from "@/lib/pieceControl/drawingReleaseReady";
import { PIECE_IMPORT_SOURCE_OPTIONS, readPieceImportFile } from "@/lib/pieceControl/importAdapters";
import {
  collectAppliedPieceIds,
  collectAppliedPiecesByWpNumber,
} from "@/lib/pieceControl/importAssign";
import {
  applyImportDrawingLinks,
  collectAppliedPieceSheetHints,
  planImportDrawingLinks,
} from "@/lib/pieceControl/importDrawingLink";
import { downloadPieceRegisterCsvTemplate } from "@/lib/pieceControl/pieceRegisterCsvTemplate";
import {
  nextPieceRegisterSort,
  sortPieceRegisterRows,
  type PieceRegisterSort,
} from "@/lib/pieceControl/pieceRegisterSort";
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
import { pieceTons } from "@/lib/pieceControl/tonnage";
import { pieceLifecycleLabel } from "@/lib/pieceControl/lifecycle";
import { formatWorkPackageTitle } from "@/lib/workPackages/formatWorkPackageTitle";
import { presentPieceControlError } from "@/lib/pieceControl/errorPresentation";
import { filterPieceRegisterRows, type PieceRegisterFilters } from "./pieceRegister/filter";
import {
  applyAttentionFocus,
  presentImportReconciliationText,
  uniqueValues,
} from "./pieceRegister/registerHelpers";
import { SelectFilter } from "./pieceRegister/SelectFilter";
import { PieceRegisterArchiveDialog } from "./pieceRegister/PieceRegisterArchiveDialog";
import {
  deriveOverviewWorkPackages,
  selectUpcomingShipments,
} from "./pieceRegister/overviewDerive";
import PieceRegisterOverview from "./pieceRegister/PieceRegisterOverview";

const EMPTY_FILTERS: PieceRegisterFilters = {
  search: "",
  workPackageId: "",
  profile: "",
  grade: "",
  lifecycle: "",
  source: "",
  hold: "all",
};

const REGISTER_VIEWS = [
  { id: "overview", label: "Overview", icon: Boxes },
  { id: "register", label: "Register", icon: PackageOpen },
  { id: "board", label: "Board", icon: LayoutGrid },
  { id: "import", label: "Imports", icon: FileUp },
  { id: "relationships", label: "Lots & links", icon: GitBranch },
  { id: "production", label: "Production", icon: Factory },
  { id: "logistics", label: "Logistics", icon: Truck },
  { id: "settings", label: "Settings", icon: Settings2 },
] as const;

type PieceRegisterView = (typeof REGISTER_VIEWS)[number]["id"];

const decisionTone: Record<string, PillTone> = {
  new: "good",
  unchanged: "neutral",
  update_candidate: "warn",
  conflict: "danger",
  invalid: "danger",
};

export default function PieceRegister() {
  useCommandSkin();
  const { activeProject, updateActiveProject } = useProjectContext() as any;
  const projectId = activeProject?.id as string | undefined;
  const mode = String(activeProject?.piece_control_mode ?? "off") as PieceControlMode;
  const enabled = Boolean(projectId && mode !== "off");
  const queryClient = useQueryClient();
  const { role, isLoading: roleLoading } = useProjectRole(projectId);
  const [activeView, setActiveView] = useState<PieceRegisterView>("overview");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sourceType, setSourceType] = useState<PieceImportSourceType>("csv");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importRows, setImportRows] = useState<ImportPayload[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [applyConfirmed, setApplyConfirmed] = useState(false);
  const [importTargetWorkPackageId, setImportTargetWorkPackageId] = useState("");
  const [selectedPieceIds, setSelectedPieceIds] = useState<Set<string>>(new Set());
  const [registerSort, setRegisterSort] = useState<PieceRegisterSort>({
    key: "work_package",
    direction: "asc",
  });
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveConfirmation, setArchiveConfirmation] = useState("");
  const [attentionFocus, setAttentionFocus] = useState<PieceAttentionItem["key"] | null>(null);

  useEffect(() => {
    setSelectedPieceIds(new Set());
    setArchiveOpen(false);
    setArchiveReason("");
    setArchiveConfirmation("");
    setAttentionFocus(null);
    setImportTargetWorkPackageId("");
    setApplyConfirmed(false);
  }, [projectId]);

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
  const impactSnapshotQuery = useQuery({
    queryKey: ["piece-relationships", projectId],
    queryFn: () => fetchPieceRelationshipSnapshot(projectId!),
    enabled: enabled && Boolean(selectedPieceId),
    staleTime: 15_000,
  });
  const selectedPieceImpact = useMemo(() => {
    if (!selectedPieceId || !impactSnapshotQuery.data) return null;
    const snapshot = impactSnapshotQuery.data;
    const piece = snapshot.pieces.find((row) => row.id === selectedPieceId);
    if (!piece) return null;
    const linkedDrawingIds = snapshot.pieceDrawings
      .filter((link) => link.piece_id === selectedPieceId)
      .map((link) => link.drawing_id);
    const governingId = linkedDrawingIds[0] ?? null;
    const commentDispositions = snapshot.commentDispositions.filter((row) =>
      (row.related_piece_ids ?? []).includes(selectedPieceId),
    );
    return buildPieceImpact({
      piece: {
        id: piece.id,
        piece_mark: piece.piece_mark,
        lifecycle_status: piece.lifecycle_status,
        on_hold: piece.on_hold,
      },
      linkedDrawingIds,
      drawings: snapshot.drawings,
      evidence: {
        drawingSets: snapshot.drawingSets,
        submittals: snapshot.submittals,
        sheetResponses: snapshot.sheetResponses,
        drawingRevisions: snapshot.drawingRevisions,
        drawingReviews: snapshot.drawingReviews,
        drawingSignoffs: snapshot.drawingSignoffs,
      },
      commentDispositions,
      currentRevisionCode: governingId
        ? currentRevisionCodeForDrawing(governingId, snapshot.drawingRevisions)
        : null,
    });
  }, [impactSnapshotQuery.data, selectedPieceId]);

  const batches = batchesQuery.data ?? [];
  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId) ?? batches[0] ?? null;
  const batchRowsQuery = useQuery({
    queryKey: ["piece-import-rows", projectId, selectedBatch?.id],
    queryFn: () => fetchPieceImportRows(projectId!, selectedBatch!.id),
    enabled: enabled && Boolean(selectedBatch?.id),
  });

  const workPackageMap = useMemo(
    () => new Map(
      (workPackagesQuery.data ?? []).map((wp: any) => [
        wp.id,
        formatWorkPackageTitle(wp),
      ]),
    ),
    [workPackagesQuery.data],
  );
  const displayRows = useMemo(
    () => (piecesQuery.data ?? []).map((piece) => ({
      ...piece,
      workPackageLabel:
        piece.work_package_id && workPackageMap.has(piece.work_package_id)
          ? workPackageMap.get(piece.work_package_id)!
          : "Unassigned",
    })),
    [piecesQuery.data, workPackageMap],
  );
  const overviewSnapshotQuery = useQuery({
    queryKey: ["canonical-reporting", projectId],
    queryFn: () => fetchCanonicalDashboardSnapshot(projectId!),
    enabled:
      enabled &&
      activeView === "overview" &&
      piecesQuery.isSuccess &&
      displayRows.length > 0,
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
  const filteredRows = useMemo(() => {
    const rows = applyAttentionFocus(
      filterPieceRegisterRows(displayRows, filters),
      attentionFocus,
    );
    return sortPieceRegisterRows(rows, registerSort);
  }, [attentionFocus, displayRows, filters, registerSort]);
  const canBulkUpdate = enabled && !roleLoading && roleAtLeast(role, "field");
  const canArchive = enabled && !roleLoading && roleAtLeast(role, "admin");
  const allFilteredSelected = filteredRows.length > 0
    && filteredRows.every((piece) => selectedPieceIds.has(piece.id));
  const archiveConfirmationText = selectedPieceIds.size === 1
    ? "ARCHIVE 1 PIECE"
    : `ARCHIVE ${selectedPieceIds.size} PIECES`;

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

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["piece-register", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["piece-import-batches", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["piece-import-rows", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["piece-relationships", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["piece-register-work-packages", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["work-packages", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["workPackages", projectId] }),
      // Piece-mark / lifecycle edits must refresh the 3D link map (fab mode).
      queryClient.invalidateQueries({ queryKey: ["model-elements", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["canonical-pieces-3d", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["canonical-reporting", projectId] }),
    ]);
  };

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

    return { assigned, linked, pieceCount: collectAppliedPieceIds(rows).length };
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
      if (result.assigned === 0 && result.linked === 0) {
        toast.message(
          "No work package or drawing sheet hints found for applied pieces.",
        );
        return;
      }
      const parts: string[] = [];
      if (result.assigned > 0) {
        parts.push(`${result.assigned} piece(s) assigned`);
      }
      if (result.linked > 0) {
        parts.push(`${result.linked} drawing link(s)`);
      }
      toast.success(parts.join(" · "));
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
            displayRowCount={displayRows.length}
            overviewQueryState={{
              isLoading: overviewSnapshotQuery.isLoading,
              error: overviewSnapshotQuery.error,
              refetch: () => overviewSnapshotQuery.refetch(),
            }}
            overviewWorkPackages={overviewWorkPackages}
            upcomingShipments={upcomingShipments}
            onOpenImport={() => setActiveView("import")}
            onOpenRegister={() => setActiveView("register")}
            onOpenLogistics={() => setActiveView("logistics")}
          />
        )}

        {activeView === "register" && (
          <section className="piece-register-workspace">
        <div className="cmd-filterbar piece-register-filters">
            <label htmlFor="piece-register-search" className="piece-register-filter piece-register-filter--search">
              Search
              <span className="cmd-search">
                <Search size={15} />
                <input
                  id="piece-register-search"
                  value={filters.search}
                  onChange={(event) => updateRegisterFilters({ search: event.target.value })}
                  placeholder="Mark, package, profile..."
                  className="cmd-search__input"
                />
              </span>
            </label>
            <SelectFilter
              label="Work package"
              value={filters.workPackageId}
              onChange={(value) => updateRegisterFilters({ workPackageId: value })}
              options={(workPackagesQuery.data ?? []).map((wp: any) => ({
                value: wp.id,
                label: formatWorkPackageTitle(wp),
              }))}
            />
            <SelectFilter label="Profile" value={filters.profile} onChange={(value) => updateRegisterFilters({ profile: value })} options={profiles} />
            <SelectFilter label="Grade" value={filters.grade} onChange={(value) => updateRegisterFilters({ grade: value })} options={grades} />
            <SelectFilter label="Lifecycle" value={filters.lifecycle} onChange={(value) => updateRegisterFilters({ lifecycle: value })} options={lifecycles} />
            <SelectFilter label="Source" value={filters.source} onChange={(value) => updateRegisterFilters({ source: value })} options={sources} />
            <label htmlFor="piece-register-filter-hold" className="piece-register-filter">
              Hold
              <select
                id="piece-register-filter-hold"
                value={filters.hold}
                onChange={(event) => updateRegisterFilters({ hold: event.target.value as PieceRegisterFilters["hold"] })}
                className="piece-register-filter__control"
              >
                <option value="all">All</option>
                <option value="held">Held</option>
                <option value="clear">Clear</option>
              </select>
            </label>
            {attentionFocus ? (
              <button
                type="button"
                className="cmd-chip-btn is-active piece-register-attention-filter"
                onClick={clearRegisterFilters}
              >
                {attentionFocus === "unassigned"
                  ? "Unassigned pieces"
                  : attentionFocus === "missing-weight"
                    ? "Missing weights"
                    : "Held pieces"}
                <span aria-hidden="true">×</span>
              </button>
            ) : null}
        </div>

        <div className="piece-register-table">
          <div className="piece-register-table__head">
            <div>
              <h2>Piece register</h2>
              <p>{filteredRows.length} of {displayRows.length} rows shown</p>
            </div>
            <div className="piece-register-table__head-actions">
              <label className="piece-register-filter" htmlFor="piece-register-sort">
                Sort by
                <select
                  id="piece-register-sort"
                  className="piece-register-filter__control"
                  value={`${registerSort.key}:${registerSort.direction}`}
                  onChange={(event) => {
                    const [key, direction] = event.target.value.split(":") as [
                      PieceRegisterSort["key"],
                      PieceRegisterSort["direction"],
                    ];
                    setRegisterSort({ key, direction });
                  }}
                >
                  <option value="work_package:asc">Work package (A→Z)</option>
                  <option value="work_package:desc">Work package (Z→A)</option>
                  <option value="mark:asc">Mark (A→Z)</option>
                  <option value="mark:desc">Mark (Z→A)</option>
                  <option value="updated_at:desc">Last update (newest)</option>
                  <option value="updated_at:asc">Last update (oldest)</option>
                </select>
              </label>
              <button
                type="button"
                onClick={clearRegisterFilters}
                className="cmd-btn cmd-btn--ghost"
              >
                Clear filters
              </button>
            </div>
          </div>
          {selectedPieceIds.size > 0 ? (
            <PieceRegisterBulkBar
              selectedCount={selectedPieceIds.size}
              workPackages={(workPackagesQuery.data ?? []) as Array<{
                id: string;
                wp_number?: string | null;
                name?: string | null;
              }>}
              canBulkUpdate={canBulkUpdate}
              canArchive={canArchive}
              pending={bulkPending}
              onAssign={(workPackageId) => bulkAssignMutation.mutate(workPackageId)}
              onUnassign={() => bulkUnassignMutation.mutate()}
              onApplyAttributes={(values) => bulkAttrsMutation.mutate(values)}
              onHold={(reason) => bulkHoldMutation.mutate({ onHold: true, reason })}
              onClearHold={() => bulkHoldMutation.mutate({ onHold: false })}
              onArchive={openArchiveDialog}
            />
          ) : null}
          {selectedPieceId ? (
            <DecisionPanel title="Piece impact">
              <PieceImpactPanel
                impact={selectedPieceImpact}
                loading={impactSnapshotQuery.isLoading}
              />
            </DecisionPanel>
          ) : null}
          <div className="cmd-table-wrap piece-register-table__wrap">
            <table className="cmd-table piece-register-table__table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all visible pieces"
                      checked={allFilteredSelected}
                      disabled={!canBulkUpdate || filteredRows.length === 0}
                      onChange={toggleAllFiltered}
                      className="cmd-check"
                    />
                  </th>
                  {(
                    [
                      { label: "Mark / lot", key: "mark" as const },
                      { label: "Qty", key: null },
                      { label: "Profile", key: null },
                      { label: "Grade", key: null },
                      { label: "Wt each", key: null },
                      { label: "Wt total", key: null },
                      { label: "Tons", key: null },
                      { label: "Work package", key: "work_package" as const },
                      { label: "Lifecycle", key: null },
                      { label: "Hold", key: null },
                      { label: "Source", key: null },
                      { label: "Last update", key: "updated_at" as const },
                    ] as const
                  ).map((column) => (
                    <th key={column.label}>
                      {column.key ? (
                        <button
                          type="button"
                          className="piece-register-sort-th"
                          onClick={() =>
                            setRegisterSort((current) =>
                              nextPieceRegisterSort(current, column.key!),
                            )
                          }
                        >
                          {column.label}
                          {registerSort.key === column.key
                            ? registerSort.direction === "asc"
                              ? " ↑"
                              : " ↓"
                            : ""}
                        </button>
                      ) : (
                        column.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {piecesQuery.isLoading && (
                  <tr><td colSpan={13} className="cmd-table__empty">Loading the project piece register...</td></tr>
                )}
                {piecesQuery.error && (
                  <tr>
                    <td colSpan={13} className="cmd-table__empty">
                      <strong className="piece-register-error">The Piece Register could not be loaded.</strong>
                      <div>
                        {presentPieceControlError(
                          piecesQuery.error,
                          "Piece Register data could not be loaded.",
                        )}
                      </div>
                      <button type="button" onClick={() => piecesQuery.refetch()} className="cmd-btn">Try again</button>
                    </td>
                  </tr>
                )}
                {!piecesQuery.isLoading && !piecesQuery.error && filteredRows.map((piece) => (
                  <tr key={piece.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${piece.piece_mark} lot ${piece.lot_code}`}
                        checked={selectedPieceIds.has(piece.id)}
                        disabled={!canBulkUpdate}
                        onChange={() => setSelectedPieceIds((current) => {
                          const next = new Set(current);
                          if (next.has(piece.id)) next.delete(piece.id);
                          else next.add(piece.id);
                          return next;
                        })}
                        className="cmd-check"
                      />
                    </td>
                    <td>
                      <div className="piece-register-mark">{piece.piece_mark}</div>
                      <div className="piece-register-cell-meta">
                        {piece.parent_piece_id ? `Child lot ${piece.lot_code}` : piece.lot_code === "ALL" ? "Root lot ALL" : `Container ${piece.lot_code}`}
                      </div>
                    </td>
                    <td className="piece-register-number">{piece.quantity}</td>
                    <td>{piece.profile || "—"}</td>
                    <td>{piece.material_grade || "—"}</td>
                    <td className="piece-register-number">{piece.weight_each_lbs == null ? "—" : Number(piece.weight_each_lbs).toFixed(1)}</td>
                    <td className="piece-register-number">{piece.weight_total_lbs == null ? "—" : Number(piece.weight_total_lbs).toFixed(1)}</td>
                    <td className="piece-register-number piece-register-number--strong">{pieceTons(piece) == null ? "—" : pieceTons(piece)!.toFixed(3)}</td>
                    <td>{piece.workPackageLabel}</td>
                    <td><span className="cmd-pill cmd-pill--neutral">{pieceLifecycleLabel(piece.lifecycle_status)}</span></td>
                    <td>{piece.on_hold ? <span className="piece-register-hold">Held</span> : <span className="piece-register-cell-meta">Clear</span>}</td>
                    <td>
                      <div>{piece.source_system || "—"}</div>
                      <div className="piece-register-cell-meta piece-register-cell-meta--truncate">{piece.external_ref || ""}</div>
                    </td>
                    <td className="piece-register-updated">{new Date(piece.updated_at).toLocaleString()}</td>
                  </tr>
                ))}
                {!piecesQuery.isLoading && !piecesQuery.error && filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={13} className="cmd-table__empty">
                      <PackageOpen size={28} />
                      <strong>
                        {displayRows.length === 0 ? "No pieces have been imported yet." : "No pieces match these filters."}
                      </strong>
                      <button
                        type="button"
                        onClick={() => displayRows.length === 0 ? setActiveView("import") : clearRegisterFilters()}
                        className="cmd-btn cmd-btn--primary"
                      >
                        {displayRows.length === 0 ? "Import pieces" : "Clear filters"}
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
          </section>
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
                      void queryClient.invalidateQueries({
                        queryKey: ["model-elements", projectId],
                      });
                      void queryClient.invalidateQueries({
                        queryKey: ["canonical-pieces-3d", projectId],
                      });
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
          <section className="piece-register-embedded-workspace piece-import-workspace">
            <DecisionPanel title="Stage import">
              <div className="piece-command-intro">
                <span className="piece-command-intro__icon" aria-hidden="true">
                  <FileUp size={18} />
                </span>
                <p>
                  Download the standard CSV template, fill piece marks / WP / drawing sheet
                  in one file, then stage for review. Staging makes no direct changes to the
                  active register.
                </p>
              </div>
              <div className="piece-command-form">
                <button
                  type="button"
                  className="cmd-btn cmd-btn--ghost"
                  onClick={() => downloadPieceRegisterCsvTemplate()}
                >
                  <Download size={14} aria-hidden="true" />
                  {" "}Download CSV template
                </button>
                <label htmlFor="piece-import-source" className="piece-command-field">
                  Source
                  <select
                    id="piece-import-source"
                    value={sourceType}
                    onChange={(event) => setSourceType(event.target.value as PieceImportSourceType)}
                    className="piece-command-control"
                  >
                    {PIECE_IMPORT_SOURCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label htmlFor="piece-import-file" className="piece-command-field">
                  File
                  <input
                    id="piece-import-file"
                    type="file"
                    accept=".csv,.json,text/csv,application/json"
                    onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
                    className="piece-command-control piece-command-control--file"
                  />
                </label>
                {importFile && (
                  <p className="piece-import-file-summary">
                    <strong>{importFile.name}</strong>
                    <span>{importRows.length} rows ready to stage</span>
                  </p>
                )}
                <button
                  type="button"
                  disabled={importRows.length === 0 || stageMutation.isPending}
                  onClick={() => stageMutation.mutate()}
                  className="cmd-btn cmd-btn--primary piece-import-stage-action"
                >
                  {stageMutation.isPending ? "Reconciling..." : "Stage for review"}
                </button>
              </div>
            </DecisionPanel>

            <DecisionPanel title="Import batches">
              <div className="piece-import-batch-layout">
                <div className="piece-import-batch-list" aria-label="Staged import batches">
                  {batches.map((batch) => (
                    <button
                      type="button"
                      key={batch.id}
                      aria-pressed={selectedBatch?.id === batch.id}
                      onClick={() => {
                        setSelectedBatchId(batch.id);
                        setApplyConfirmed(false);
                      }}
                      className={`piece-import-batch${selectedBatch?.id === batch.id ? " is-selected" : ""}`}
                    >
                      <span className="piece-import-batch__head">
                        <strong>{batch.source_name || batch.source_type}</strong>
                        <Pill tone={batch.status === "applied" ? "good" : batch.status === "approved" ? "info" : "warn"}>
                          {batch.status.replace("_", " ")}
                        </Pill>
                      </span>
                      <span className="piece-import-batch__meta">
                        {batch.row_count} rows · {new Date(batch.created_at).toLocaleDateString()}
                      </span>
                    </button>
                  ))}
                  {batches.length === 0 && (
                    <p className="piece-command-empty">No staged imports yet.</p>
                  )}
                </div>

                <div className="piece-import-batch-detail">
                  {selectedBatch ? (
                    <>
                      <div className="piece-import-batch-summary">
                        <div>
                          <h3>{selectedBatch.source_name || selectedBatch.source_type}</h3>
                          <div className="piece-import-decisions">
                            {Object.entries(selectedBatch.decision_counts ?? {}).map(([decision, count]) => (
                              <Pill key={decision} tone={decisionTone[decision] ?? "neutral"}>
                                {decision.replace("_", " ")}: {count}
                              </Pill>
                            ))}
                          </div>
                        </div>
                        {selectedBatch.status === "pending_review" ? (
                          <button
                            type="button"
                            disabled={approveMutation.isPending}
                            onClick={() => approveMutation.mutate()}
                            className="cmd-btn cmd-btn--primary"
                          >
                            Review complete · Approve
                          </button>
                        ) : selectedBatch.status === "approved" ? (
                          <div className="piece-import-apply">
                            <label
                              className="piece-command-field"
                              htmlFor="piece-import-assign-work-package"
                            >
                              Work package override (optional — or use CSV wp_number)
                              <select
                                id="piece-import-assign-work-package"
                                className="piece-command-control"
                                value={importTargetWorkPackageId}
                                onChange={(event) =>
                                  setImportTargetWorkPackageId(event.target.value)
                                }
                              >
                                <option value="">Use CSV wp_number / leave unassigned</option>
                                {(workPackagesQuery.data ?? []).map((wp: any) => (
                                  <option key={wp.id} value={wp.id}>
                                    {formatWorkPackageTitle(wp)}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label htmlFor="piece-import-apply-confirmation">
                              <input
                                id="piece-import-apply-confirmation"
                                type="checkbox"
                                checked={applyConfirmed}
                                onChange={(event) => setApplyConfirmed(event.target.checked)}
                              />
                              Confirm eligible creates and updates
                            </label>
                            <button
                              type="button"
                              disabled={!applyConfirmed || applyMutation.isPending}
                              onClick={() => applyMutation.mutate()}
                              className="cmd-btn piece-import-apply__button"
                            >
                              {importTargetWorkPackageId
                                ? "Apply, assign WP, and link drawings"
                                : "Apply batch (CSV WP / sheet hints)"}
                            </button>
                          </div>
                        ) : (
                          <div className="piece-import-apply">
                            <Pill tone="good">
                              <CheckCircle2 size={13} />
                              Applied
                            </Pill>
                            <label
                              className="piece-command-field"
                              htmlFor="piece-import-assign-work-package-applied"
                            >
                              Assign imported pieces to work package
                              <select
                                id="piece-import-assign-work-package-applied"
                                className="piece-command-control"
                                value={importTargetWorkPackageId}
                                onChange={(event) =>
                                  setImportTargetWorkPackageId(event.target.value)
                                }
                              >
                                <option value="">Select package</option>
                                {(workPackagesQuery.data ?? []).map((wp: any) => (
                                  <option key={wp.id} value={wp.id}>
                                    {formatWorkPackageTitle(wp)}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="button"
                              className="cmd-btn cmd-btn--primary"
                              disabled={assignImportMutation.isPending}
                              onClick={() => assignImportMutation.mutate()}
                            >
                              {importTargetWorkPackageId
                                ? "Assign + link from import"
                                : "Apply WP / drawing hints from import"}
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="cmd-table-wrap piece-import-results">
                        <table className="cmd-table">
                          <thead>
                            <tr>
                              <th>Row</th>
                              <th>Mark</th>
                              <th>Decision</th>
                              <th>Profile</th>
                              <th>Grade</th>
                              <th>Warnings / resolution</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(batchRowsQuery.data ?? []).map((row) => (
                              <tr key={row.id}>
                                <td>{row.source_row_number}</td>
                                <td><strong>{String(row.normalized_payload.piece_mark ?? "—")}</strong></td>
                                <td>
                                  <Pill tone={decisionTone[row.decision] ?? "neutral"}>
                                    {row.decision.replace("_", " ")}
                                  </Pill>
                                </td>
                                <td>{String(row.normalized_payload.profile ?? "—")}</td>
                                <td>{String(row.normalized_payload.material_grade ?? "—")}</td>
                                <td>
                                  {row.warnings.map(presentImportReconciliationText).join("; ")
                                    || (row.resolution
                                      ? presentImportReconciliationText(row.resolution)
                                      : "No exceptions")}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <div className="piece-command-empty piece-command-empty--detail">
                      <AlertTriangle size={24} />
                      <p>Stage an import to review reconciliation results.</p>
                    </div>
                  )}
                </div>
              </div>
            </DecisionPanel>
          </section>
        )}
      </div>
  );
}
