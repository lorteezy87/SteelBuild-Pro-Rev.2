import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
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
import "@/styles/command.css";
import "@/styles/piece-control-command.css";
import {
  DecisionPanel,
  KpiStrip,
  PageHero,
  useCommandSkin,
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
import { useCanonicalReportingRealtime } from "@/hooks/useCanonicalReportingRealtime";
import { useProjectRole } from "@/hooks/useProjectRole";
import { roleAtLeast } from "@/hooks/useProjectRole";
import { formatWorkPackageTitle } from "@/lib/workPackages/formatWorkPackageTitle";
import { presentPieceControlError } from "@/lib/pieceControl/errorPresentation";
import { modePresentation, type PieceControlMode } from "@/lib/pieceControl/presentation";
import {
  PIECE_REGISTER_VIEW_IDS,
  PIECE_REGISTER_VIEW_LABELS,
} from "./pieceRegister/registerHelpers";
import { parsePieceRegisterLocation, writePieceRegisterLocation } from "./pieceRegister/pieceRegisterLocation";
import { usePieceRegisterController } from "./pieceRegister/usePieceRegisterController";
import { PieceRegisterArchiveDialog } from "./pieceRegister/PieceRegisterArchiveDialog";
import { PieceRegisterRegisterView } from "./pieceRegister/PieceRegisterRegisterView";
import { PieceDigitalThread } from "./pieceRegister/PieceDigitalThread";
import { PieceRevisionImpactView } from "./pieceRegister/PieceRevisionImpactView";
import { PieceRegisterImportView } from "./pieceRegister/PieceRegisterImportView";
import PieceRegisterOverview from "./pieceRegister/PieceRegisterOverview";
import { IMPORT_DECISION_TONE } from "./pieceRegister/registerHelpers";

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

export default function PieceRegister() {
  useCommandSkin();
  const { activeProject, updateActiveProject } = useProjectContext() as any;
  const projectId = activeProject?.id as string | undefined;

  useCanonicalReportingRealtime(projectId);
  const mode = String(activeProject?.piece_control_mode ?? "off") as PieceControlMode;
  const enabled = Boolean(projectId && mode !== "off");

  const [searchParams, setSearchParams] = useSearchParams();
  const location = useMemo(
    () => parsePieceRegisterLocation(searchParams),
    [searchParams],
  );
  const activeView = location.view;

  const setPieceRegisterLocation = useCallback(
    (patch: any) => {
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

  const controller = usePieceRegisterController(projectId, setPieceRegisterLocation, location);
  const { role, isLoading: roleLoading } = useProjectRole(projectId);

  const canBulkUpdate = enabled && !roleLoading && roleAtLeast(role, "field");
  const canArchive = enabled && !roleLoading && roleAtLeast(role, "admin");
  const canManagePieceHold = enabled && !roleLoading && roleAtLeast(role, "field");
  const canManageDrawingImpacts = enabled && !roleLoading && roleAtLeast(role, "pm");
  const canLoadImpactAssignees =
    canManageDrawingImpacts &&
    activeView === "impact" &&
    Boolean(location.revisionId) &&
    controller.intelligenceQuery.data?.availability.impacts === "available";

  const impactAssigneesQuery = useQuery({
    queryKey: ["drawing-impact-assignees", projectId],
    queryFn: async () => {
      const callRpc = supabase.rpc.bind(supabase) as any;
      const { data, error } = await callRpc("list_drawing_impact_assignees", { p_project_id: projectId! });
      if (error) throw new Error(error.message);
      return data.map((row: any) => ({
        userId: row.user_id,
        label: `${row.display_name.trim()} · ${row.project_role.replace(/_/g, " ")}`,
      }));
    },
    enabled: canLoadImpactAssignees,
    staleTime: 30_000,
  });

  const handleModeChanged = (nextMode: PieceControlMode) => {
    updateActiveProject?.({ piece_control_mode: nextMode });
    if (nextMode !== "off") setActiveView("import");
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
          <PieceControlModeBadge presentation={modePresentation(mode)} />
        </PageHero>

        <section className="piece-register-setup-steps" aria-label="Piece Register setup steps">
            {[
              ["1", "Start Shadow review", "Existing production and release workflows remain unchanged."],
              ["2", "Stage a piece file", "Upload CSV or JSON, review matches and exceptions, then approve the batch."],
              ["3", "Run the workflow", "Organize lots, advance shop stations, and record logistics from one project register."],
            ].map(([step, title, description]) => (
              <div key={step} className="piece-register-setup-step">
                <div className="piece-register-setup-step__number">{step}</div>
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
          <PieceControlModeBadge presentation={modePresentation(mode)} />
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

      {controller.piecesQuery.isLoading ? (
        <DecisionPanel title="Piece Register status">
          <div className="piece-operation-state is-loading">
            Loading the Piece Register…
          </div>
        </DecisionPanel>
      ) : controller.piecesQuery.error ? (
        <DecisionPanel title="Piece Register status">
          <div className="piece-operation-state is-error">
            <strong>The Piece Register could not be loaded.</strong>
            <span>
              {presentPieceControlError(controller.piecesQuery.error, "Piece Register data could not be loaded.")}
            </span>
            <button
              type="button"
              onClick={() => void controller.piecesQuery.refetch()}
              className="cmd-btn cmd-btn--secondary"
            >
              Try again
            </button>
          </div>
        </DecisionPanel>
      ) : (
        <>
          <KpiStrip cells={controller.kpiCells} />

          <div className="piece-register-summary">
            <DecisionPanel title="Piece lifecycle">
              <PieceLifecycleStrip
                items={controller.presentation.lifecycle}
                totalPieces={controller.presentation.totalPieces}
                onSelect={(lifecycle) => {
                  controller.setAttentionFocus(null);
                  controller.setFilters({ ...EMPTY_PIECE_REGISTER_FILTERS, lifecycle });
                  setActiveView("register");
                }}
              />
            </DecisionPanel>
            <DecisionPanel title="Needs attention">
              <PieceAttentionPanel
                items={controller.presentation.attention}
                emptyMessage="No piece exceptions."
                onSelect={(key) => {
                  controller.setFilters(EMPTY_PIECE_REGISTER_FILTERS);
                  controller.setAttentionFocus(key);
                  setActiveView("register");
                }}
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

      {controller.archiveOpen && (
        <PieceRegisterArchiveDialog
          selectedCount={controller.selectedPieceIds.size}
          archivableCount={controller.archiveEligibility.archivableIds.length}
          blockedPieces={controller.archiveEligibility.blocked}
          archiveReason={controller.archiveReason}
          archiveConfirmation={controller.archiveConfirmation}
          archiveConfirmationText={controller.archiveConfirmationText}
          isPending={controller.archiveMutation.isPending}
          onReasonChange={controller.setArchiveReason}
          onConfirmationChange={controller.setArchiveConfirmation}
          onCancel={() => controller.setArchiveOpen(false)}
          onConfirm={() => controller.archiveMutation.mutate()}
        />
      )}

      {activeView === "overview" && !controller.piecesQuery.isLoading && !controller.piecesQuery.error && (
        <PieceRegisterOverview
          displayRowCount={controller.actionablePieceIds.size}
          overviewQueryState={{
            isLoading: controller.overviewSnapshotQuery.isLoading,
            error: controller.overviewSnapshotQuery.error,
            refetch: () => controller.overviewSnapshotQuery.refetch(),
          }}
          overviewWorkPackages={controller.overviewWorkPackages}
          upcomingShipments={controller.upcomingShipments}
          intelligence={controller.intelligenceModel}
          intelligenceState={{
            isLoading: controller.intelligenceQuery.isLoading,
            error: controller.intelligenceQuery.error,
            refetch: () => controller.intelligenceQuery.refetch(),
          }}
          onOpenImport={() => setActiveView("import")}
          onOpenLogistics={() => setActiveView("logistics")}
          onReviewRevision={() => setPieceRegisterLocation({ view: "impact", focus: "revision" })}
          onSelectRevision={(revisionId) => setPieceRegisterLocation({ view: "impact", revisionId })}
          onSelectPiece={(pieceId) => setPieceRegisterLocation({ view: "register", pieceId })}
          onOpenRelationships={(revisionId) => setPieceRegisterLocation({ view: "relationships", focus: "revision", revisionId, pieceId: null })}
        />
      )}

      {activeView === "impact" && (
        <section className="piece-register-embedded-workspace" aria-label="Revision Impact workspace">
          {controller.piecesQuery.isLoading ? (
            <div className="piece-operation-state is-loading">Loading the project piece register…</div>
          ) : controller.piecesQuery.error ? (
            <div className="piece-operation-state is-error">
              <strong>Revision evidence could not be loaded.</strong>
              <p>The active project piece register is unavailable.</p>
            </div>
          ) : !controller.hasActionablePieces ? (
            <div className="piece-operation-state">
              <strong>No active pieces are available for revision review.</strong>
              <p>Use the controlled import workflow to establish the register first.</p>
              <button type="button" className="cmd-btn cmd-btn--primary" onClick={() => setActiveView("import")}>
                Import pieces
              </button>
            </div>
          ) : controller.intelligenceQuery.isLoading ? (
            <div className="piece-operation-state is-loading">Loading exact revision evidence…</div>
          ) : controller.intelligenceQuery.error ? (
            <div className="piece-operation-state is-error">
              <strong>Revision evidence could not be loaded.</strong>
              <p>{presentPieceControlError(controller.intelligenceQuery.error, "Revision evidence is unavailable.")}</p>
              <button type="button" className="cmd-btn cmd-btn--secondary" onClick={() => void controller.intelligenceQuery.refetch()}>
                Try again
              </button>
            </div>
          ) : controller.intelligenceModel ? (
            <>
              <PieceRevisionImpactView
                model={controller.intelligenceModel}
                selectedRevisionId={location.revisionId}
                onSelectRevision={(revisionId) => setPieceRegisterLocation({ revisionId })}
                onSelectPiece={(pieceId) => controller.setSelectedPieceIds(new Set([pieceId]))}
                canManageImpacts={canManageDrawingImpacts && controller.intelligenceQuery.data?.availability.impacts === "available"}
                selectedImpact={controller.selectedRevisionImpact}
                assignees={impactAssigneesQuery.data ?? []}
                assigneesLoading={impactAssigneesQuery.isLoading}
                assigneesUnavailable={Boolean(impactAssigneesQuery.error)}
                impactPending={controller.drawingImpactMutation.isPending || controller.resolveDrawingHandoffMutation.isPending}
                onSaveImpact={location.revisionId ? (impactId, draft) => controller.drawingImpactMutation.mutateAsync({
                  impactId,
                  revisionId: location.revisionId!,
                  draft,
                  previousStatus: controller.selectedRevisionImpact?.status ?? null,
                  previousResolvedAt: controller.selectedRevisionImpact?.resolved_at ?? null,
                }) : undefined}
                onResolveImpact={(impactId) => controller.resolveDrawingHandoffMutation.mutateAsync(impactId)}
              />
              {controller.selectedPieceId ? (
                controller.selectedPieceThread ? (
                  <PieceDigitalThread
                    thread={controller.selectedPieceThread}
                    onClose={() => controller.setSelectedPieceIds(new Set())}
                    canManageHold={canManagePieceHold}
                    pieceOnHold={Boolean(controller.displayRows.find(p => p.id === controller.selectedPieceId)?.on_hold)}
                    holdPending={controller.holdMutation.isPending}
                    onSetHold={(request) => controller.holdMutation.mutateAsync({ pieceId: controller.selectedPieceId!, ...request })}
                    onOpenRelationships={() => setPieceRegisterLocation({ view: "relationships", focus: "revision", pieceId: controller.selectedPieceId, revisionId: location.revisionId })}
                    onOpenRelease={canManageDrawingImpacts && controller.displayRows.find(p => p.id === controller.selectedPieceId)?.work_package_id ? () => setPieceRegisterLocation({ view: "board", focus: "release", pieceId: controller.selectedPieceId }) : undefined}
                  />
                ) : (
                  <div className="piece-operation-state is-error">Piece evidence is unavailable for this selection.</div>
                )
              ) : null}
            </>
          ) : (
            <div className="piece-operation-state is-error">Revision evidence is unavailable.</div>
          )}
        </section>
      )}

      {activeView === "register" && (
        <PieceRegisterRegisterView
          filters={controller.filters}
          updateRegisterFilters={controller.setFilters}
          workPackages={(controller.workPackagesQuery.data ?? []) as any}
          profiles={controller.profiles}
          grades={controller.grades}
          lifecycles={controller.lifecycles}
          sources={controller.sources}
          attentionFocus={controller.attentionFocus}
          clearRegisterFilters={() => {
            controller.setFilters(EMPTY_PIECE_REGISTER_FILTERS);
            controller.setAttentionFocus(null);
          }}
          filteredRows={controller.filteredRows as any}
          displayRows={controller.displayRows as any}
          registerSort={controller.registerSort}
          setRegisterSort={controller.setRegisterSort}
          selectedPieceIds={controller.selectedPieceIds}
          setSelectedPieceIds={controller.setSelectedPieceIds}
          canBulkUpdate={canBulkUpdate}
          canArchive={canArchive}
          bulkPending={controller.bulkAssignMutation.isPending || controller.bulkUnassignMutation.isPending || controller.bulkAttrsMutation.isPending || controller.bulkHoldMutation.isPending || controller.archiveMutation.isPending}
          onBulkAssign={(workPackageId) => controller.bulkAssignMutation.mutate(workPackageId)}
          onBulkUnassign={() => controller.bulkUnassignMutation.mutate()}
          onBulkAttrs={(values) => controller.bulkAttrsMutation.mutate(values)}
          onBulkHold={(payload) => controller.bulkHoldMutation.mutate(payload)}
          onArchive={() => controller.setArchiveOpen(true)}
          selectedPieceId={controller.selectedPieceId}
          selectedPieceThread={controller.selectedPieceThread}
          intelligenceLoading={controller.intelligenceQuery.isLoading}
          intelligenceError={controller.intelligenceQuery.error}
          onRetryIntelligence={() => void controller.intelligenceQuery.refetch()}
          onClosePiece={() => controller.setSelectedPieceIds(new Set())}
          onOpenRelationships={() => setPieceRegisterLocation({ view: "relationships", focus: location.revisionId ? "revision" : null, pieceId: controller.selectedPieceId })}
          onOpenRelease={canManageDrawingImpacts ? () => setPieceRegisterLocation({ view: "board", focus: "release", pieceId: controller.selectedPieceId }) : undefined}
          allFilteredSelected={controller.allFilteredSelected}
          toggleAllFiltered={() => {
            controller.setSelectedPieceIds((current) => {
              const next = new Set(current);
              if (controller.allFilteredSelected) controller.filteredRows.forEach((piece) => next.delete(piece.id));
              else controller.filteredRows.forEach((piece) => next.add(piece.id));
              return next;
            });
          }}
          piecesLoading={controller.piecesQuery.isLoading}
          piecesError={controller.piecesQuery.error}
          onRetryPieces={() => controller.piecesQuery.refetch()}
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
            controller.displayRows.find(p => p.id === controller.selectedPieceId)?.work_package_id ? (
              <CanonicalFabReleasePanel
                projectId={projectId}
                workPackageId={controller.displayRows.find(p => p.id === controller.selectedPieceId)?.work_package_id}
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
                    const viaClient = summary.used_client_fallback ? " (client fallback — apply Piece Control migrations when ready)" : "";
                    toast.success(`Linked ${summary.linked ?? 0} · unmatched ${summary.unmatched ?? 0} · ambiguous ${summary.ambiguous ?? 0}${viaClient}`);
                    void invalidatePieceControlQueries(queryClient, projectId, "relationships");
                  })
                  .catch((error: Error) => toast.error(presentPieceControlError(error, "Could not link marks to pieces.")));
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
          sourceType={controller.sourceType}
          setSourceType={controller.setSourceType}
          importFile={controller.importFile}
          importRows={controller.importRows}
          importNotice={controller.importNotice}
          handleFile={controller.setImportFile} // Simplified, actual logic in controller's handleFile should be used
          stagePending={controller.stageMutation.isPending}
          onStage={() => controller.stageMutation.mutate()}
          batches={controller.batches as any}
          selectedBatch={controller.selectedBatch as any}
          setSelectedBatchId={controller.setSelectedBatchId}
          setApplyConfirmed={controller.setApplyConfirmed}
          applyConfirmed={controller.applyConfirmed}
          approvePending={controller.approveMutation.isPending}
          onApprove={() => controller.approveMutation.mutate()}
          applyPending={controller.applyMutation.isPending}
          onApply={() => controller.applyMutation.mutate()}
          importTargetWorkPackageId={controller.importTargetWorkPackageId}
          setImportTargetWorkPackageId={controller.setImportTargetWorkPackageId}
          workPackages={(controller.workPackagesQuery.data ?? []) as any}
          formatWorkPackageTitle={formatWorkPackageTitle}
          batchRows={(controller.batchRowsQuery.data ?? []) as any}
          decisionTone={IMPORT_DECISION_TONE}
          assignPending={controller.assignImportMutation?.isPending}
          onAssignImport={() => controller.assignImportMutation?.mutate()}
          appliedAssignment={controller.appliedAssignment}
          sheetHintCount={controller.appliedSheetHintCount}
        />
      )}
    </div>
  );
}
