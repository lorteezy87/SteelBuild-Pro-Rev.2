import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Database,
  Factory,
  FileUp,
  GitBranch,
  PackageOpen,
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
import { PieceLifecycleStrip } from "@/components/pieceControl/PieceLifecycleStrip";
import PieceRelationshipManager from "@/components/pieceControl/PieceRelationshipManager";
import { PieceProductionControl } from "@/components/pieceControl/PieceProductionControl";
import { PieceLogisticsControl } from "@/components/pieceControl/PieceLogisticsControl";
import { PieceControlPilotReadiness } from "@/components/pieceControl/PieceControlPilotReadiness";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { photoFor } from "@/config/launcherConfig";
import { fetchCanonicalDashboardSnapshot } from "@/lib/pieceControl/canonicalDashboardRepository";
import { rollupCanonicalWorkPackages } from "@/lib/pieceControl/canonicalRollups";
import { PIECE_IMPORT_SOURCE_OPTIONS, readPieceImportFile } from "@/lib/pieceControl/importAdapters";
import {
  buildPieceControlSummary,
  modePresentation,
  type PieceAttentionItem,
  type PieceControlMode,
} from "@/lib/pieceControl/presentation";
import type { ImportPayload, PieceImportSourceType } from "@/lib/pieceControl/reconciliation";
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
import { presentPieceControlError } from "@/lib/pieceControl/errorPresentation";
import { filterPieceRegisterRows, type PieceRegisterFilters } from "./pieceRegister/filter";

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

const naturalSortCollator = new Intl.Collator("en-US", {
  numeric: true,
  sensitivity: "base",
});

function uniqueValues(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
    .sort(naturalSortCollator.compare);
}

function formatPlannedShipDate(value: string): string {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`).toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    },
  );
}

function workPackageStatusLabel(status: string): string {
  return status === "No Canonical Scope" ? "No active pieces" : status;
}

function presentImportReconciliationText(value: string): string {
  return value === "mark has split lots but no active ALL root"
    ? "This piece mark has split lots but no active parent record."
    : value;
}

function SelectFilter({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: Array<string | { value: string; label: string }>;
}) {
  const controlId = `piece-register-filter-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <label className="piece-register-filter" htmlFor={controlId}>
      {label}
      <select
        id={controlId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="piece-register-filter__control"
      >
        <option value="">All</option>
        {options.map((option) => {
          const value = typeof option === "string" ? option : option.value;
          const optionLabel = typeof option === "string" ? option : option.label;
          return <option key={value} value={value}>{optionLabel}</option>;
        })}
      </select>
    </label>
  );
}

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
  const [selectedPieceIds, setSelectedPieceIds] = useState<Set<string>>(new Set());
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
        wp.wp_number || wp.name || wp.title || "Unnamed package",
      ]),
    ),
    [workPackagesQuery.data],
  );
  const displayRows = useMemo(
    () => (piecesQuery.data ?? []).map((piece) => ({
      ...piece,
      workPackageLabel: piece.work_package_id
        ? workPackageMap.get(piece.work_package_id) ?? "Unknown package"
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
  const overviewWorkPackages = useMemo(() => {
    const snapshot = overviewSnapshotQuery.data;
    if (!snapshot) return [];
    const sourceById = new Map(
      snapshot.workPackages.map((workPackage) => [workPackage.id, workPackage]),
    );
    return rollupCanonicalWorkPackages(
      snapshot.workPackages,
      snapshot.pieces,
      snapshot.stations,
      snapshot.completions,
    ).map((rollup) => ({
      ...rollup,
      source: sourceById.get(rollup.workPackageId),
    }));
  }, [overviewSnapshotQuery.data]);
  const upcomingShipments = useMemo(
    () =>
      overviewWorkPackages
        .filter((workPackage) => Boolean(workPackage.plannedShipDate))
        .sort((left, right) =>
          String(left.plannedShipDate).localeCompare(
            String(right.plannedShipDate),
          ),
        )
        .slice(0, 8),
    [overviewWorkPackages],
  );
  const filteredRows = useMemo(() => {
    const rows = filterPieceRegisterRows(displayRows, filters);
    if (attentionFocus === "unassigned") {
      return rows.filter((piece) => !piece.work_package_id);
    }
    if (attentionFocus === "missing-weight") {
      return rows.filter((piece) => pieceTons(piece) == null);
    }
    if (attentionFocus === "held") {
      return rows.filter((piece) => piece.on_hold);
    }
    return rows;
  }, [attentionFocus, displayRows, filters]);
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
    () => buildPieceControlSummary(displayRows),
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
    ]);
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
    mutationFn: () => applyPieceImportBatch(selectedBatch!.id),
    onSuccess: async (summary) => {
      setApplyConfirmed(false);
      await invalidate();
      toast.success(`Import applied: ${summary.created ?? 0} created, ${summary.updated ?? 0} updated`);
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(error, "The import batch could not be applied."),
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
      const rows = await readPieceImportFile(file);
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
          <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/70 p-4"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !archiveMutation.isPending) setArchiveOpen(false);
            }}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="archive-piece-title"
              className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-6 shadow-2xl"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-rose-100 p-2 text-rose-700"><Archive className="h-5 w-5" /></div>
                <div>
                  <h2 id="archive-piece-title" className="text-xl font-black text-slate-950">
                    Archive {selectedPieceIds.size} piece{selectedPieceIds.size === 1 ? "" : "s"}?
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Archived pieces are removed from active Piece Control counts and workflows. Import batches,
                    relationships, and audit history are retained. Split, held, released, or production-started
                    pieces cannot be archived.
                  </p>
                </div>
              </div>
              <label htmlFor="piece-archive-reason" className="mt-5 grid gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
                Reason
                <textarea
                  id="piece-archive-reason"
                  value={archiveReason}
                  onChange={(event) => setArchiveReason(event.target.value)}
                  rows={3}
                  placeholder="Why should these pieces be removed from the active register?"
                  className="resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-900"
                />
              </label>
              <label htmlFor="piece-archive-confirmation" className="mt-4 grid gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
                Type {archiveConfirmationText} to confirm
                <input
                  id="piece-archive-confirmation"
                  value={archiveConfirmation}
                  onChange={(event) => setArchiveConfirmation(event.target.value)}
                  placeholder={archiveConfirmationText}
                  className="h-11 rounded-lg border border-slate-300 px-3 font-mono text-sm font-bold normal-case tracking-normal text-slate-900"
                />
              </label>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={archiveMutation.isPending}
                  onClick={() => setArchiveOpen(false)}
                  className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-bold text-slate-700 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={archiveMutation.isPending
                    || archiveReason.trim().length === 0
                    || archiveConfirmation !== archiveConfirmationText}
                  onClick={() => archiveMutation.mutate()}
                  className="h-10 rounded-lg bg-rose-700 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {archiveMutation.isPending ? "Archiving..." : "Archive pieces"}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeView === "overview" && !piecesQuery.isLoading && !piecesQuery.error && (
          <section className="piece-register-overview">
            <div className="piece-register-overview__head">
              <div>
                <h2>{displayRows.length === 0 ? "Build the project piece record" : "Piece Register workspace"}</h2>
                <p>
                  {displayRows.length === 0
                    ? "A controlled path from source file to erection history."
                    : `${displayRows.length.toLocaleString()} active piece rows are available for assignment, production, and logistics control.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveView(displayRows.length === 0 ? "import" : "register")}
                className="cmd-btn cmd-btn--primary"
              >
                {displayRows.length === 0 ? "Import the first pieces" : "Open the register"}
              </button>
            </div>

            {displayRows.length === 0 ? (
              <div className="piece-register-workflow">
                {[
                  ["01", "Import & reconcile", "Stage source data and resolve conflicts before anything is written."],
                  ["02", "Organize lots", "Assign work packages and split quantities while preserving traceability."],
                  ["03", "Track production", "Advance released lots through controlled shop stations."],
                  ["04", "Move to the field", "Record shipping, delivery, and erection with an immutable history."],
                ].map(([step, title, description]) => (
                  <div key={step} className="piece-register-workflow__step">
                    <div className="piece-register-workflow__number">{step}</div>
                    <div>
                      <strong>{title}</strong>
                      <p>{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="piece-register-overview__status">
                  <CheckCircle2 size={18} />
                  <div>
                    <strong>Register loaded</strong>
                    <p>Use the lifecycle and exception controls above to move directly into focused piece work.</p>
                  </div>
                </div>
                <div className="piece-register-summary">
                  <DecisionPanel title="Work-package readiness">
                    {overviewSnapshotQuery.isLoading ? (
                      <p className="cmd-row__meta">Loading work-package readiness…</p>
                    ) : overviewSnapshotQuery.error ? (
                      <div className="piece-operation-state is-error">
                        <span>Work-package readiness could not be loaded.</span>
                        <button
                          type="button"
                          className="cmd-btn cmd-btn--secondary"
                          onClick={() => void overviewSnapshotQuery.refetch()}
                        >
                          Try again
                        </button>
                      </div>
                    ) : overviewWorkPackages.length === 0 ? (
                      <p className="piece-command-empty">No work packages are in this project.</p>
                    ) : (
                      overviewWorkPackages.map((workPackage) => (
                        <div key={workPackage.workPackageId} className="cmd-row">
                          <div>
                            <strong>
                              {workPackage.source?.wp_number ||
                                workPackage.source?.name ||
                                workPackage.workPackageId}
                            </strong>
                            <div className="cmd-row__meta">
                              {workPackageStatusLabel(workPackage.derivedStatus)}
                              {" · "}
                              {workPackage.pieceCount.toLocaleString()} pieces
                              {" · "}
                              {workPackage.knownTons.toFixed(2)} known tons
                            </div>
                          </div>
                          <span className="cmd-row__num">
                            {workPackage.earnedFabricationPercent == null
                              ? "Weights needed"
                              : `${workPackage.earnedFabricationPercent.toFixed(1)}% shop earned`}
                          </span>
                        </div>
                      ))
                    )}
                  </DecisionPanel>

                  <DecisionPanel title="Upcoming shipments">
                    {overviewSnapshotQuery.isLoading ? (
                      <p className="cmd-row__meta">Loading planned shipments…</p>
                    ) : overviewSnapshotQuery.error ? (
                      <p className="piece-command-empty">Planned shipments are unavailable.</p>
                    ) : upcomingShipments.length === 0 ? (
                      <div className="piece-command-empty piece-register-overview__empty-action">
                        <p>No planned ship dates recorded.</p>
                        <button
                          type="button"
                          className="cmd-btn cmd-btn--secondary"
                          onClick={() => setActiveView("logistics")}
                        >
                          Open Logistics
                        </button>
                      </div>
                    ) : (
                      upcomingShipments.map((workPackage) => (
                        <div key={workPackage.workPackageId} className="cmd-row">
                          <strong>
                            {workPackage.source?.wp_number ||
                              workPackage.source?.name ||
                              workPackage.workPackageId}
                          </strong>
                          <span className="cmd-row__num">
                            {formatPlannedShipDate(workPackage.plannedShipDate!)}
                          </span>
                        </div>
                      ))
                    )}
                  </DecisionPanel>
                </div>
              </>
            )}
          </section>
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
                label: wp.wp_number || wp.name || wp.title || "Unnamed package",
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
            <button
              type="button"
              onClick={clearRegisterFilters}
              className="cmd-btn cmd-btn--ghost"
            >
              Clear filters
            </button>
          </div>
          {selectedPieceIds.size > 0 ? (
            <div className="piece-selection-bar">
              <strong>{selectedPieceIds.size} selected</strong>
              <button
                type="button"
                onClick={openArchiveDialog}
                disabled={!canArchive}
                title={canArchive ? "Archive selected pieces" : "Project admin access is required"}
                className="cmd-btn piece-selection-bar__archive"
              >
                <Archive size={15} />
                Archive selected
              </button>
            </div>
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
                      disabled={!canArchive || filteredRows.length === 0}
                      onChange={toggleAllFiltered}
                      className="cmd-check"
                    />
                  </th>
                  {["Mark / lot", "Qty", "Profile", "Grade", "Wt each", "Wt total", "Tons", "Work package", "Lifecycle", "Hold", "Source", "Last update"].map((label) => (
                    <th key={label}>{label}</th>
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
                        disabled={!canArchive}
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

        {activeView === "relationships" && (
          <section className="piece-register-embedded-workspace">
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
                  Stage CSV or JSON rows for reconciliation. Staging makes no direct changes
                  to the active register.
                </p>
              </div>
              <div className="piece-command-form">
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
                      onClick={() => { setSelectedBatchId(batch.id); setApplyConfirmed(false); }}
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
                              Apply approved batch
                            </button>
                          </div>
                        ) : (
                          <Pill tone="good">
                            <CheckCircle2 size={13} />
                            Applied
                          </Pill>
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
