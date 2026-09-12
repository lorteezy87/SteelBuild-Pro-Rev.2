import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ensureCriticalAgingActionItems } from "@/lib/submittalAgingTriggers";
import { localToday } from "@/utils/dates";
import {
  buildCreateInitialFromSet,
} from "@/lib/submittalLinkGlue";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { toast } from "sonner";
import DeleteDialog from "@/components/shared/DeleteDialog";
import {
  splitCreateSubmittalPayload,
} from "./submittals/submittalMutationHelpers";
import {
  buildNewRoundCarrySeed,
} from "./submittals/submittalAdvanceHelpers";
import { forecastPortfolio } from "@/lib/submittalForecast";
import { usePermissions } from "@/services/permissions";
import { useFlag } from "@/hooks/useFeatureFlag";
import { useSubmittalComponents } from "@/hooks/useSubmittalComponents";
import { useAutoOpenEdit } from "@/hooks/useAutoOpenEdit";
import type { DrawingType } from "@/lib/submittalComponents";
import SubmittalRegisterPanel from "./submittals/SubmittalRegisterPanel";
import SubmittalFormModal from "./submittals/SubmittalFormModal";
import SubmittalPageOverlays from "./submittals/SubmittalPageOverlays";
import {
  SubmittalDetailSection,
  SubmittalListSection,
} from "./submittals/SubmittalWorkspace";
import { useSubmittalsPageMutations } from "./submittals/useSubmittalsPageMutations";
import { useSubmittalsPageQueries } from "./submittals/useSubmittalsPageQueries";
import { useSubmittalsPageState } from "./submittals/useSubmittalsPageState";
import { useSubmittalRouteController } from "./submittals/useSubmittalRouteController";
import type { DrawingSet, Submittal } from "./submittals/types";

interface ActiveProject {
  id: string;
  name?: string;
  project_name?: string;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}

/**
 * Submittals — formal transmittal register.
 *
 * Separate from `drawings` (individual sheets) and `drawing_sets` (a
 * package in review). A submittal is the workflow artifact: what was
 * sent, when, to whom, which round, current status, who the ball is
 * with.
 *
 * The route owns project/URL wiring and composes typed query, state, workflow,
 * mutation, register, detail, and overlay seams.
 */

export default function Submittals({ embedded = false }: { embedded?: boolean } = {}) {
  const activeProject = useProjectContext().activeProject as ActiveProject | null;
  const projectId = activeProject?.id;
  const { can } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    rows,
    isLoading,
    drawingSets,
    drawingSetsById,
    allRounds,
    roundsBySubmittal,
    allRfis,
    allTasks,
    allDrawings,
    allSheetResponses,
    allCommentDispositions,
  } = useSubmittalsPageQueries(projectId);
  const pageState = useSubmittalsPageState(rows, drawingSetsById);
  const {
    selectedId, setSelectedId,
    showCreate, setShowCreate,
    createFromSet, setCreateFromSet,
    editingId, setEditingId,
    spinOffParentId, setSpinOffParentId,
    toDelete, setToDelete,
    filterStatus, setFilterStatus,
    filterBIC, setFilterBIC,
    search, setSearch,
    selectedIds, setSelectedIds,
    showBulkEdit, setShowBulkEdit,
    showBulkAdd, setShowBulkAdd,
    showBulkDelete, setShowBulkDelete,
    showNewRound, setShowNewRound,
    releaseBlock, setReleaseBlock,
    showSheetResponse, setShowSheetResponse,
    statusSuggest, setStatusSuggest,
    pendingSuggestRef,
    filtered,
    stats,
    allSelected,
    toggleSelect,
    toggleAll,
    settleStatusSuggest,
  } = pageState;

  // Key ["submittals", projectId] matches getQueryKey("submittal", projectId)
  // in useSubmittals.ts, so React Query dedupes the route and hub reads.
  useAutoOpenEdit(rows, (submittal) => {
    if (submittal.id) setSelectedId(submittal.id);
  }, {
    enabled: !isLoading,
    param: "recordId",
  });

  // Event glue: Drawings / Detailing CC navigate with ?targetSetId= (+ optional
  // prefilledStatus). Open create with that set pre-linked, then strip params
  // so refresh doesn't re-open the modal.
  useEffect(() => {
    const targetSetId = searchParams.get("targetSetId");
    if (!targetSetId) return;
    const seeded = buildCreateInitialFromSet(targetSetId, {
      prefilledStatus: searchParams.get("prefilledStatus"),
      prefilledBallInCourt: searchParams.get("prefilledBallInCourt"),
    });
    setCreateFromSet({
      drawing_set_ids: seeded.drawing_set_ids,
      status: seeded.status,
      ball_in_court: seeded.ball_in_court,
      requireLinkedSet: true,
    });
    setShowCreate(true);
    setSpinOffParentId(null);
    setEditingId(null);
    const next = new URLSearchParams(searchParams);
    next.delete("targetSetId");
    next.delete("prefilledStatus");
    next.delete("prefilledBallInCourt");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Slice 7: draft ActionItems for Critical R&R/OFS/BFA aging (deduped).
  // Honest path — never invents Alerts Center rows / generate-alerts.
  useEffect(() => {
    if (!projectId || isLoading || rows.length === 0) return;
    void ensureCriticalAgingActionItems(
      rows
        .filter((row): row is Submittal & { id: string } => typeof row.id === "string")
        .map((row) => ({
          ...row,
          project_id: row.project_id || projectId,
          project_name: activeProject?.name || activeProject?.project_name || null,
        })),
    );
  }, [projectId, isLoading, rows, activeProject?.name, activeProject?.project_name]);

  // Opt-in routing correction: when on, a BFA "Approved" flows through the
  // detailer scrub (OFS → IFC → Released) exactly like "Approved as Noted".
  // Flag defaults ON since Slice 4 — verb CTA routes Approved through OFS.
  const approvedRoutesToScrub = useFlag("submittal_approved_to_scrub");

  // Phase 2 opt-in: when on, opening a NEW round because the prior disposition
  // was Revise & Resubmit / Rejected auto-advances the submittal's text
  // `revision` ('0'→'1', 'A'→'B', 'Rev 2'→'Rev 3'). Default off — revision
  // stays a manual field, unchanged for anyone without the flag.
  const revisionAutoBump = useFlag("submittal_revision_autobump");

  // Phase 3 opt-in: when on, an approved submittal can be "split" into child
  // submittals that link back via parent_submittal_id, with lineage shown in the
  // detail panel + children grouped under the parent in the register. Default
  // off — the register renders flat and no spin-off/lineage UI appears.
  const splittingEnabled = useFlag("submittal_splitting");

  // Phase 4 opt-in: when on, each submittal tracks its drawing types
  // (Shop/Erection/Part) independently — per-type received + released dates via
  // the submittal_components table, with S/E/P chips + a per-type section in the
  // detail panel. Default off — no components query fires and no UI renders.
  // Release-per-type is INDEPENDENT of submittals.status and the fab-release gate.
  const drawingTypesEnabled = useFlag("submittal_drawing_types");

  // Phase 5 opt-in: when on, a move OUT to someone with a clock — into OFA (Out
  // For Approval; ball → EOR/GC) or OFS (Out For Scrub; ball → detailer) —
  // auto-stamps submittals.required_date = today + the project's turnaround lead
  // counted in WORKING days (Mon–Fri), and the hub shows a working-day-aware
  // countdown. Default off — required_date stays manual and the calendar-day
  // display is unchanged. The learned forecast (submittalForecast) is untouched.
  const workdayDuesEnabled = useFlag("submittal_workday_dues");

  const {
    bySubmittal: componentsBySubmittal,
    setReceived: setComponentReceived,
    setReleased: setComponentReleased,
    addType: addComponentType,
    remove: removeComponentMut,
  } = useSubmittalComponents(projectId, drawingTypesEnabled);

  const {
    createMut,
    updateMut,
    advanceMut,
    runAdvance,
    deleteMut,
    bulkUpdateMut,
    bulkDeleteMut,
    bulkCreateMut,
    createRoundMut,
    saveSheetResponsesMut,
  } = useSubmittalsPageMutations({
    projectId,
    rows: rows.filter(
      (row): row is Submittal & { id: string } => typeof row.id === "string",
    ),
    activeProject,
    selectedId,
    setSelectedId,
    setToDelete,
    setReleaseBlock,
    setSelectedIds,
    setShowBulkEdit,
    setShowBulkDelete,
    setShowBulkAdd,
    setShowNewRound,
    setShowSheetResponse,
    onUpdateSettled: settleStatusSuggest,
    onAdvanceSettled: settleStatusSuggest,
    onUpdateError: () => { pendingSuggestRef.current = null; },
    onAdvanceError: () => { pendingSuggestRef.current = null; },
  });

  // Review-return forecast across all submittals — learns the shop's cycle
  // time from history (rounds + completed submittals) and projects each pending
  // review's return + late risk. Stats reused by the detail panel's forecast.
  const today = localToday();
  const reviewForecast = useMemo(
    () => forecastPortfolio({ submittals: rows, rounds: allRounds, today }),
    [rows, allRounds, today],
  );
  const reviewsAtRisk = reviewForecast.summary.atRisk + reviewForecast.summary.late;

  const selected = (selectedId ? rows.find((r) => r.id === selectedId) : null) ?? null;
  const editing = (editingId ? rows.find((r) => r.id === editingId) : null) ?? null;
  // Phase 3 splitting: the parent being spun off from (if any), and the child's
  // prefilled seed — carry the parent's project + drawing sets so the child
  // starts scoped to the same package; everything else (number/title) is fresh.
  const spinOffParent = (spinOffParentId ? rows.find((r) => r.id === spinOffParentId) : null) ?? null;
  const spinOffInitial: Partial<Submittal> = spinOffParent
    ? {
        discipline: spinOffParent.discipline ?? undefined,
        drawing_set_ids: Array.isArray(spinOffParent.drawing_set_ids) ? spinOffParent.drawing_set_ids : [],
      }
    : {};

  // Domain-view bridges for the typed child components. The queries yield
  // generated DB rows (nullable string columns); the child props use the page's
  // `Submittal`/`DrawingSet` interfaces, which model those same columns as
  // optional. These casts bridge that null↔undefined representation gap only —
  // identical data, no runtime change, null preserved. Removable once
  // `./submittals/types` models the nullable columns directly.
  const rowsView = rows as Submittal[];
  const filteredView = filtered as Submittal[];
  const drawingSetsView = drawingSets as DrawingSet[];
  const selectedView = selected as Submittal | null;
  const editingView = editing as Submittal | null;
  const selectedRounds = selected?.id ? (roundsBySubmittal[selected.id] || []) : [];
  const selectedCommentDispositions = selected?.id
    ? allCommentDispositions.filter((disposition) => disposition.submittal_id === selected.id)
    : [];
  const {
    onStatusChange,
    onAdvance,
    onCommentDispositionAdd,
    onCommentDispositionStatus,
    onCommentDispositionResolution,
  } = useSubmittalRouteController({
    projectId,
    selected: selectedView,
    rounds: selectedRounds,
    commentDispositions: selectedCommentDispositions,
    revisionAutoBump,
    workdayDuesEnabled,
    projectMeta: activeProject?.metadata ?? null,
    pendingSuggestRef,
    update: updateMut.mutate,
    runAdvance,
  });

  const newRoundSeed = showNewRound && selected?.id
    ? buildNewRoundCarrySeed({
        submittalId: selected.id,
        submittalRounds: roundsBySubmittal[selected.id] || [],
        allSheetResponses,
        allCommentDispositions,
      })
    : null;
  const selectedSheetResponses = selected
    ? allSheetResponses.filter((response) =>
        selectedRounds.some((round) => round.id === response.submittal_round_id),
      )
    : [];

  // ── Canonical register list + detail elements ───────────────────────────
  // The canonical panel owns presentation; these elements retain the complete
  // operational list/detail behavior — splitting, lineage, type chips,
  // working-day due display, revision, and workflow actions.
  const listEl = (
    <SubmittalListSection
      filtered={filteredView}
      isLoading={isLoading}
      rows={rowsView}
      selectedId={selectedId}
      selectedIds={selectedIds}
      toggleSelect={toggleSelect}
      setSelectedId={setSelectedId}
      drawingSetsById={drawingSetsById}
      groupByLineage={splittingEnabled}
      showTypeChips={drawingTypesEnabled}
      componentsBySubmittal={componentsBySubmittal}
    />
  );

  const detailEl = (
    <SubmittalDetailSection
      statusSuggest={
        statusSuggest && selected && statusSuggest.submittalId === selected.id
          ? {
              patch: statusSuggest.patch,
              busy: updateMut.isPending,
              onDismiss: () => setStatusSuggest(null),
              onApply: async (patch) => {
                try {
                  await updateMut.mutateAsync({
                    id: statusSuggest.submittalId,
                    ...patch,
                  });
                  setStatusSuggest(null);
                  toast.success("Suggested fields applied");
                } catch {
                  /* updateMut toasts */
                }
              },
            }
          : null
      }
      detail={{
        approvedRoutesToScrub,
        splittingEnabled,
        drawingTypesEnabled,
        components: selected?.id ? (componentsBySubmittal[selected.id] || []) : [],
        onComponentSetReceived: (args) => {
          if (!selected?.id || !selected.project_id) return;
          setComponentReceived({
            submittalId: selected.id,
            projectId: selected.project_id,
            drawingType: args.drawingType,
            existing: args.existing,
            date: args.date,
          });
        },
        onComponentSetReleased: (args) => {
          if (!selected?.id || !selected.project_id) return;
          setComponentReleased({
            submittalId: selected.id,
            projectId: selected.project_id,
            drawingType: args.drawingType,
            existing: args.existing,
            released: args.released,
          });
        },
        onComponentAddType: (drawingType) => {
          if (!selected?.id || !selected.project_id) return;
          addComponentType({
            submittalId: selected.id,
            projectId: selected.project_id,
            drawingType,
          });
        },
        onComponentRemoveType: (component) => {
          if (component.id) removeComponentMut.mutate(component.id);
        },
        onSpinOff: () => selected?.id && setSpinOffParentId(selected.id),
        onSelectSubmittal: setSelectedId,
        submittal: selectedView,
        allSubmittals: rowsView,
        drawingSets: drawingSetsView,
        rounds: selectedRounds,
        sheetResponses: selectedSheetResponses,
        commentDispositions: selectedCommentDispositions,
        onCommentDispositionAdd,
        onCommentDispositionStatus,
        onCommentDispositionResolution,
        drawings: allDrawings,
        cycleStats: reviewForecast.stats,
        today,
        allRfis,
        allTasks,
        projectName: activeProject?.project_name || activeProject?.name || "Project",
        project: activeProject,
        onClose: () => {
          setStatusSuggest(null);
          setSelectedId(null);
        },
        onEdit: () => selected?.id && setEditingId(selected.id),
        onDelete: () => selected?.id && setToDelete(selected.id),
        onStatusChange,
        onBICChange: (ballInCourt) => {
          if (selected?.id) updateMut.mutate({ id: selected.id, ball_in_court: ballInCourt });
        },
        onAdvance,
        onFieldChange: (patch) => {
          if (selected?.id) updateMut.mutate({ id: selected.id, ...patch });
        },
        onNewRound: () => setShowNewRound(true),
        onReturnRound: (roundId) => {
          const round = allRounds.find((candidate) => candidate.id === roundId);
          if (round) setShowSheetResponse(round);
        },
      }}
    />
  );

  if (!projectId) return (
    <div className="submittals-page" style={{ textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>
        Select a project to view Submittals
      </div>
    </div>
  );

  return (
    <div className="submittals-page" style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%", overflow: "hidden" }}>
      <SubmittalRegisterPanel
        embedded={embedded}
        filtered={filteredView}
        rows={rowsView}
        stats={stats}
        reviewsAtRisk={reviewsAtRisk}
        filterStatus={filterStatus}
        filterBIC={filterBIC}
        search={search}
        onFilterStatus={setFilterStatus}
        onFilterBIC={setFilterBIC}
        onSearch={setSearch}
        selectedIds={selectedIds}
        allSelected={allSelected}
        toggleAll={toggleAll}
        projectLabel={activeProject?.project_name || "Project"}
        canCreate={can("create", "submittal")}
        onNewSubmittal={() => { setCreateFromSet(null); setShowCreate(true); }}
        onBulkAdd={() => setShowBulkAdd(true)}
        list={listEl}
        detail={detailEl}
      />

      {(showCreate || editing || spinOffParent) && (
        <SubmittalFormModal
          open={showCreate || !!editing || !!spinOffParent}
          // Spin-off: seed from the parent (project + drawing sets carried over).
          // Edit: the row being edited. Plain create: empty.
          initial={
            editingView
              || (spinOffParent ? (spinOffInitial as Submittal) : null)
              || (createFromSet
                ? {
                    drawing_set_ids: createFromSet.drawing_set_ids,
                    ...(createFromSet.status ? { status: createFromSet.status } : {}),
                    ...(createFromSet.ball_in_court ? { ball_in_court: createFromSet.ball_in_court } : {}),
                  }
                : {})
          }
          requireLinkedSet={!!createFromSet?.requireLinkedSet}
          projectId={projectId}
          projectName={activeProject?.project_name || activeProject?.name || ""}
          availableSets={drawingSetsView}
          allDrawings={allDrawings}
          allRfis={allRfis}
          parentSubmittal={spinOffParent as Submittal | null}
          drawingTypesEnabled={drawingTypesEnabled}
          saving={createMut.isPending || updateMut.isPending}
          existingNumbers={new Set(
            rows
              .filter((row) => row.id !== editing?.id)
              .map((row) => String(row.submittal_number || "").trim())
              .filter(Boolean),
          )}
          onClose={() => { setShowCreate(false); setEditingId(null); setSpinOffParentId(null); setCreateFromSet(null); }}
          onSubmit={async (data) => {
            if (editing?.id) {
              await updateMut.mutateAsync({ id: editing.id, ...data });
            } else {
              // Phase 4: `drawing_types` is a UI-only key (the types to start
              // tracking) — split it off the record so it never hits the
              // submittals insert as a phantom column. Component rows are created
              // after the submittal insert (need its id + project_id).
              const { chosenTypes, submittalData } = splitCreateSubmittalPayload(
                data as { drawing_types?: DrawingType[] } & Record<string, unknown>,
              );
              // Covers both a plain create and a spin-off child (the record
              // already carries parent_submittal_id + split_reason when split).
              const created = await createMut.mutateAsync(submittalData);
              let componentWriteAttempted = false;
              // Jump the detail panel to the freshly-created child so its lineage
              // is immediately visible (createMut also selects it, belt+braces).
              if (created?.id) {
                setSelectedId(created.id);
                if (drawingTypesEnabled && Array.isArray(chosenTypes) && chosenTypes.length > 0) {
                  const pid = (created.project_id as string) || projectId;
                  if (pid) {
                    componentWriteAttempted = true;
                    const componentResults = await Promise.allSettled(
                      chosenTypes.map((t) => addComponentType({ submittalId: created.id, projectId: pid, drawingType: t })),
                    );
                    const failedComponents = componentResults.filter((result) => result.status === "rejected").length;
                    if (failedComponents > 0) {
                      toast.warning(`Submittal created, but ${failedComponents} drawing type component${failedComponents === 1 ? "" : "s"} failed. Add them from the detail panel.`);
                    }
                    if (failedComponents < chosenTypes.length) {
                      toast.success(`Submittal created with ${chosenTypes.length - failedComponents} drawing type component${chosenTypes.length - failedComponents === 1 ? "" : "s"}`);
                    }
                  }
                }
              }
              if (!componentWriteAttempted) {
                toast.success("Submittal created");
              }
            }
            setShowCreate(false);
            setEditingId(null);
            setSpinOffParentId(null);
          }}
        />
      )}

      {toDelete && (
        <DeleteDialog
          open={!!toDelete}
          onClose={() => setToDelete(null)}
          busy={deleteMut.isPending}
          onConfirm={() => deleteMut.mutateAsync(toDelete)}
          title="Delete submittal"
          description="This submittal and its comment thread will be soft-deleted. This cannot be undone from the UI."
        />
      )}

      <SubmittalPageOverlays
        selectedIds={selectedIds}
        canEdit={can("edit", "submittal")}
        canDelete={can("delete", "submittal")}
        onClearSelection={() => setSelectedIds(new Set())}
        onOpenBulkEdit={() => setShowBulkEdit(true)}
        onOpenBulkDelete={() => setShowBulkDelete(true)}
        showBulkEdit={showBulkEdit}
        onCloseBulkEdit={() => setShowBulkEdit(false)}
        bulkEditPending={bulkUpdateMut.isPending}
        onBulkEdit={(data) =>
          bulkUpdateMut.mutateAsync({ ids: [...selectedIds], data })
        }
        showBulkAdd={showBulkAdd}
        onCloseBulkAdd={() => setShowBulkAdd(false)}
        bulkAddPending={bulkCreateMut.isPending}
        onBulkAdd={(newRows) => bulkCreateMut.mutate(newRows)}
        showBulkDelete={showBulkDelete}
        onCloseBulkDelete={() => setShowBulkDelete(false)}
        bulkDeletePending={bulkDeleteMut.isPending}
        onBulkDelete={() => bulkDeleteMut.mutateAsync([...selectedIds])}
        showNewRound={showNewRound}
        selected={selectedView}
        newRoundSeed={newRoundSeed}
        createRoundPending={createRoundMut.isPending}
        onCloseNewRound={() => setShowNewRound(false)}
        onCreateRound={(data) => createRoundMut.mutateAsync(data)}
        releaseBlock={releaseBlock}
        advancePending={advanceMut.isPending}
        onCloseReleaseBlock={() => setReleaseBlock(null)}
        onReleaseOverride={(reason) => {
          if (releaseBlock) {
            runAdvance({
              ...releaseBlock.input,
              fabReleaseOverrideReason: reason,
            });
          }
        }}
        sheetResponseRound={showSheetResponse}
        drawings={allDrawings}
        sheetResponses={allSheetResponses}
        saveSheetResponsesPending={saveSheetResponsesMut.isPending}
        onCloseSheetResponses={() => setShowSheetResponse(null)}
        onSaveSheetResponses={saveSheetResponsesMut.mutateAsync}
      />
    </div>
  );
}
