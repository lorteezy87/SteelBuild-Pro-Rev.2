import { Suspense, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { Box, CalendarCog } from "lucide-react";
import { useAllFlags, useFlag } from "@/hooks/useFeatureFlag";
import { toast } from "sonner";
import ErrorBoundaryRaw from "@/components/shared/ErrorBoundary";
import LoadingSkeletonRaw from "@/components/shared/LoadingSkeleton";
import ListTruncationNotice from "@/components/shared/ListTruncationNotice";
import EscalateModal from "./drawingSubmittalHub/EscalateModal";
import { DetailingCommandShell, DetailingNoProject } from "./drawingSubmittalHub/DetailingCommandShell";
import { DEFAULT_HUB_TAB, canonicalHubSearch, hubHref, nextTabSearch, parseHubTab } from "./drawingSubmittalHub/hubLinks";
import { DocControlMovedNotice } from "./drawingSubmittalHub/DocControlMovedNotice";
import { Model3DGateError, Model3DGateLoading, Model3DGateNotice } from "./drawingSubmittalHub/Model3DGateNotice";
import ModelElementImportModalRaw from "@/components/drawings/ModelElementImportModal";
import {
  TABS,
  buildDrawingKpis,
} from "./drawingSubmittalHub/format";
import { FleetHealthStrip, LeadTimesModal } from "./drawingSubmittalHub/components";
import ControlBoardPanel from "./drawingSubmittalHub/ControlBoardPanel";
import DrawingRegisterPanel from "./drawingSubmittalHub/DrawingRegisterPanel";
import RevisionImpactViews from "./drawingSubmittalHub/RevisionImpactViews";
import { ApprovalMatrixPanel } from "./drawingSubmittalHub/ApprovalMatrixPanel";
import RevisionSummaryCard from "@/components/drawings/RevisionSummaryCard";
import RFIFormModal from "@/components/rfis/RFIFormModal";
import { useDrawingSubmittalHubController } from "./drawingSubmittalHub/useDrawingSubmittalHubController";
import { usePermissions } from "@/services/permissions";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { ComponentType, PropsWithChildren } from "react";

const ProcessBoardPanel = lazyWithRetry(() => import("@/components/submittals/ProcessBoardPanel")) as unknown as ComponentType<AnyProps>;
const HoldsPanel = lazyWithRetry(() => import("@/components/drawings/register/HoldsPanel").then(m => ({ default: m.HoldsPanel })));
const TransmittalLogPanel = lazyWithRetry(() => import("@/components/drawings/register/TransmittalLogPanel").then(m => ({ default: m.TransmittalLogPanel })));
const DetailingValidationPanel = lazyWithRetry(() => import("@/pages/drawingSubmittalHub/DetailingValidationPanel"));
const RevisionCompareModalLazy = lazyWithRetry(() => import("@/components/drawings/RevisionCompareModal")) as unknown as ComponentType<AnyProps>;
const Model3DTab = lazyWithRetry(() => import("@/components/viewer3d/Model3DTab"));
const SubmittalsPage = lazyWithRetry(() => import("@/pages/Submittals"));

type AnyProps = PropsWithChildren<Record<string, any>>;
const ErrorBoundary = ErrorBoundaryRaw as unknown as ComponentType<AnyProps>;
const LoadingSkeleton = LoadingSkeletonRaw as unknown as ComponentType<AnyProps>;
const ModelElementImportModal = ModelElementImportModalRaw as unknown as ComponentType<AnyProps>;

const ALERT_TABS = ["holds"] as const;
const MODEL3D_TAB = { key: "model3d", label: "3D Model", icon: Box };

export default function DrawingSubmittalHub() {
  const location = useLocation();
  const projectCtx = useProjectContext() as any;
  const canonicalSearch = canonicalHubSearch(location.search);
  if (canonicalSearch !== null) {
    const { aliasedFrom } = parseHubTab(new URLSearchParams(location.search).get("hub_tab"));
    return (
      <Navigate
        replace
        to={{ pathname: location.pathname, search: canonicalSearch, hash: location.hash }}
        state={{ hubAliasedFrom: aliasedFrom }}
      />
    );
  }
  const projectId = projectCtx.activeProject?.id as string | undefined;
  if (!projectId) return projectCtx.loading ? <LoadingSkeleton /> : <DetailingNoProject />;
  return <DetailingControlCenter key={projectId} />;
}

function DetailingControlCenter() {
  const projectCtx = useProjectContext() as any;
  const activeProject = projectCtx.activeProject as any;
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [docControlNotice, setDocControlNotice] = useState(
    () => (location.state as { hubAliasedFrom?: unknown } | null)?.hubAliasedFrom === "doccontrol",
  );

  useEffect(() => {
    if ((location.state as { hubAliasedFrom?: unknown } | null)?.hubAliasedFrom === undefined) return;
    navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state: null });
  }, []);

  const controller = useDrawingSubmittalHubController(activeProject?.id);
  const { can } = usePermissions();
  const flagsQuery = useAllFlags();
  const flagsReady = flagsQuery.data !== undefined;
  const flagsFailed = !flagsReady && (flagsQuery.isError || (flagsQuery.isFetching && flagsQuery.errorUpdateCount > 0));
  const show3d = flagsQuery.data?.get("viewer_3d") === true;
  const workdayDues = useFlag("submittal_workday_dues");

  const urlTab = parseHubTab(searchParams.get("hub_tab")).tab;
  const activeTab = urlTab === "model3d" || TABS.some((t) => t.key === urlTab) ? urlTab : DEFAULT_HUB_TAB;
  const tabs = useMemo(
    () => (show3d || activeTab === "model3d" ? [...TABS, MODEL3D_TAB] : TABS),
    [show3d, activeTab],
  );

  if (docControlNotice && activeTab !== "drawings") setDocControlNotice(false);

  const setActiveTab = (key: string) => {
    const { tab } = parseHubTab(key);
    if (tab === activeTab) return;
    setSearchParams((prev) => nextTabSearch(prev, tab));
  };

  const isLoading = controller.drawingsLoading || controller.submittalsLoading;

  const activeTabPanel = (
    <ErrorBoundary>
      <Suspense fallback={<LoadingSkeleton />}>
        {activeTab === "overview" && (
          <>
            <FleetHealthStrip fleet={controller.fleetHealth} onOpenRegister={() => navigate(hubHref("drawings", { hub_view: "sets" }))} />
            <ControlBoardPanel
              triage={controller.triage}
              kpis={controller.kpis}
              drawingKpis={controller.drawingKpis}
              isLoading={isLoading}
              onOpenTab={setActiveTab}
              onOpenHref={(href: string) => navigate(href)}
              onUpdateOwner={can("edit", "drawing_set") ? (item: any, owner: string) => controller.updateOwnerMut.mutate({ item, owner }) : undefined}
              onUpdateDueDate={can("edit", "drawing_set") ? (item: any, date: string) => controller.updateDueDateMut.mutate({ item, date }) : undefined}
              onAdvanceDetailing={can("edit", "drawing_set") ? (item: any, next: string) => controller.updateDetailingStateMut.mutate({ item, next }) : undefined}
              onToggleReadiness={can("edit", "drawing_set") ? (item: any, field: string, value: boolean) => controller.updateReadinessFlagMut.mutate({ item, field, value }) : undefined}
              sequenceReadiness={controller.sequenceReadiness}
              revisionImpact={controller.revisionImpact}
              isSaving={controller.updateOwnerMut.isPending || controller.updateDueDateMut.isPending || controller.updateDetailingStateMut.isPending || controller.updateReadinessFlagMut.isPending}
              onEscalate={can("create", "rfi") || can("create", "change_order") ? (item: any, kind: string) => { controller.setEscalateItem(item); controller.setEscalateKind(kind); } : undefined}
              onCompareRevision={(drawingId: string) => controller.setCompareDrawingId(drawingId)}
              modelMapping={controller.modelMappingSummary}
              modelElementRows={controller.modelElements as any[]}
              modelRosterCount={controller.modelElementCount}
              modelRosterCountLoading={controller.modelElementCountLoading}
              modelRosterLoading={controller.modelElementsLoading}
              onLoadModelRoster={() => controller.setMappingRosterRequested(true)}
              onImportModelElements={() => controller.setImportModelOpen(true)}
            />
          </>
        )}
        {activeTab === "process" && (
          <ProcessBoardPanel
            setPackages={controller.setPackages}
            submittals={controller.submittals}
            isLoading={isLoading}
            onOpenTab={setActiveTab}
            useWorkdays={workdayDues}
            inHub
          />
        )}
        {activeTab === "drawings" && (
          <>
            {docControlNotice && <DocControlMovedNotice onDismiss={() => setDocControlNotice(false)} />}
            <DrawingRegisterPanel
              setPackages={controller.setPackages}
              projectId={activeProject?.id}
              activeProject={activeProject}
              drawingSets={controller.drawingSets}
              isLoading={isLoading}
              healthByKey={controller.healthByKey}
              currentRevByDrawingId={controller.currentRevByDrawingId}
              summariesBySet={controller.summariesBySet}
              onRevisionUploaded={controller.handleRevisionUploaded}
              onOpenSummary={controller.setSummaryCard}
            />
          </>
        )}
        {activeTab === "submittals" && <SubmittalsPage embedded />}
        {activeTab === "matrix" && (
          <ApprovalMatrixPanel
            drawingSets={controller.drawingSets}
            submittals={controller.submittals as any[]}
            roundsBySubmittal={controller.roundsBySubmittal}
            isLoading={isLoading || controller.drawingSetsLoading}
            useWorkdays={workdayDues}
            setPackages={controller.setPackages}
            holds={controller.holds}
            holdsStatus={controller.holdsStatus}
            transmittals={controller.transmittals}
            transmittalsLoading={controller.transmittalsPending}
            currentRevisionIdByDrawingId={controller.currentRevisionIdByDrawingId}
            lastSentStatus={controller.lastSentStatus}
            canCreateSubmittal={can("create", "submittal")}
          />
        )}
        {activeTab === "revimpact" && (
          <RevisionImpactViews
            projectId={activeProject?.id || null}
            rows={controller.revisionImpactRows}
            onCompareRevision={(drawingId: string) => controller.setCompareDrawingId(drawingId)}
            isLoading={isLoading || controller.revisionsLoading}
            rosterLoaded={controller.modelElements.length > 0}
          />
        )}
        {activeTab === "holds" && <HoldsPanel key={activeProject?.id} projectId={activeProject?.id || null} />}
        {activeTab === "transmittals" && <TransmittalLogPanel key={activeProject?.id} projectId={activeProject?.id || null} />}
        {activeTab === "validation" && <DetailingValidationPanel key={activeProject?.id} projectId={activeProject?.id || null} />}
        {activeTab === "model3d" && (
          !flagsReady ? (
            flagsFailed
              ? <Model3DGateError onRetry={() => { void flagsQuery.refetch(); }} retrying={flagsQuery.isFetching} />
              : <Model3DGateLoading />
          )
          : !show3d ? <Model3DGateNotice />
          : <Model3DTab modelMapping={controller.modelMappingSummary} modelElementRows={controller.modelElements as any[]} projectId={activeProject?.id} rosterLoading={controller.modelElementsLoading} rosterError={controller.modelElementsError} />
        )}
      </Suspense>
    </ErrorBoundary>
  );

  const sharedModals = (
    <>
      {controller.leadModalOpen && (
        <LeadTimesModal
          leadDays={activeProject?.metadata?.detailing_lead_days || {}}
          defaults={DEFAULT_LEAD_DAYS}
          saving={controller.saveLeadsMut.isPending}
          onSave={(leads) => controller.saveLeadsMut.mutate(leads)}
          onClose={() => controller.setLeadModalOpen(false)}
        />
      )}
      {controller.escalateItem && (
        <EscalateModal
          item={controller.escalateItem}
          initialKind={controller.escalateKind}
          projectId={activeProject?.id}
          projectName={activeProject?.name}
          onClose={() => controller.setEscalateItem(null)}
        />
      )}
      {controller.compareDrawingId && (
        <Suspense fallback={null}>
          <RevisionCompareModalLazy
            open
            onClose={() => controller.setCompareDrawingId(null)}
            drawing={controller.drawings.find(d => String(d.id) === controller.compareDrawingId)}
          />
        </Suspense>
      )}
      {controller.importModelOpen && (
        <ModelElementImportModal
          open
          projectId={activeProject?.id}
          projectName={activeProject?.name}
          drawings={controller.drawings}
          onClose={() => controller.setImportModelOpen(false)}
        />
      )}
      {controller.summaryCard && (
        <RevisionSummaryCard
          summary={controller.summaryCard}
          onClose={() => controller.setSummaryCard(null)}
          onRunDeepDive={useFlag("revision_ai_diff") ? controller.openDeepDive : undefined}
          onCreateRfi={can("create", "rfi") ? controller.openRfiFromSummary : undefined}
        />
      )}
      {controller.rfiDraft && (
        <RFIFormModal
          projectId={activeProject?.id}
          rfi={null}
          prefill={controller.rfiDraft.prefill}
          saving={controller.savingRfi}
          onClose={() => controller.setRfiDraft(null)}
          onSave={controller.saveRfiFromSummary}
        />
      )}
      {controller.deepDiveSet && (
        <Suspense fallback={null}>
          <RevisionDeepDiveModal open onClose={() => controller.setDeepDiveSet(null)} set={controller.deepDiveSet} projectId={activeProject?.id} />
        </Suspense>
      )}
    </>
  );

  return (
    <>
      <ListTruncationNotice count={controller.drawings.length} label="drawing sheets" />
      <DetailingCommandShell
        tabs={tabs}
        activeTab={activeTab}
        onTab={setActiveTab}
        kpis={{
          totalSets: controller.drawingKpis.totalSets,
          totalSheets: controller.drawingKpis.totalSheets,
          released: controller.drawingKpis.released,
          inReview: controller.drawingKpis.inReview,
          submittalsTotal: controller.kpis.total,
          submittalsPending: controller.kpis.pending,
          needsAction: controller.kpis.rejected,
          overdue: controller.triage.overdueDrawingSets,
          atRisk: controller.triage.atRiskCount,
          overdueDrawingSets: controller.triage.overdueDrawingSets,
          overdueUnlinkedSubmittals: controller.triage.overdueUnlinkedSubmittals,
          fabReadyNumerator: controller.fabReady.numerator,
          fabReadyDenominator: controller.fabReady.denominator,
          fabReadyPercent: controller.fabReady.percent,
          openItems: controller.triage.openItems.length,
          fleetAverageScore: controller.fleetHealth.count > 0 ? controller.fleetHealth.averageScore : null,
        }}
        projectName={activeProject?.name}
        projectNumber={activeProject?.project_number}
        tabCounts={controller.tabCounts}
        alertTabs={ALERT_TABS}
        activeHolds={controller.activeHolds}
        isLoading={isLoading}
        actions={can("edit", "project") ? (
          <button
            type="button"
            className="cmd-btn cmd-btn--ghost"
            onClick={() => controller.setLeadModalOpen(true)}
            title="Set this project's detailing lead times (drives the backward schedule)"
          >
            <CalendarCog size={14} /> Lead Times
          </button>
        ) : undefined}
      >
        {activeTabPanel}
      </DetailingCommandShell>
      <div className="detailing-cc">{sharedModals}</div>
    </>
  );
}

const RevisionDeepDiveModal = lazyWithRetry(() => import("@/components/drawings/RevisionImpactReportModal"));
