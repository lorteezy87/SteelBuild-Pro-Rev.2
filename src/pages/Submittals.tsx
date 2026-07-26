import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType, PropsWithChildren } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { ensureCriticalAgingActionItems } from "@/lib/submittalAgingTriggers";
import { localToday } from "@/utils/dates";
import { useProjectContext } from "@/components/shared/ProjectContext";
import {
  BulkActionBar as BulkActionBarRaw,
} from "@/components/design-system";
import { toast } from "sonner";
import DeleteDialog from "@/components/shared/DeleteDialog";
import SubmittalBulkEditModal from "@/components/submittals/SubmittalBulkEditModal";
import SubmittalBulkAddModal from "@/components/submittals/SubmittalBulkAddModal";
import NewRoundModalRaw from "@/components/submittals/NewRoundModal";
import ReleaseGateOverrideModalRaw from "@/components/submittals/ReleaseGateOverrideModal";
import SheetResponseGridRaw from "@/components/submittals/SheetResponseGrid";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import {
  splitCreateSubmittalPayload,
} from "./submittals/submittalMutationHelpers";
import {
  buildNewRoundCarrySeed,
  buildStatusChangeWrite,
  buildVerbCtaAdvanceInput,
} from "./submittals/submittalAdvanceHelpers";
import { forecastPortfolio } from "@/lib/submittalForecast";
import { usePermissions } from "@/services/permissions";
import { useFlag } from "@/hooks/useFeatureFlag";
import { useSubmittalComponents } from "@/hooks/useSubmittalComponents";
import { useAutoOpenEdit } from "@/hooks/useAutoOpenEdit";
import type { DrawingType } from "@/lib/submittalComponents";
import { Dialog, DialogContent } from "./submittals/uiCompat";
import { SubmittalDetail, SubmittalVirtualList } from "./submittals/components";
import SubmittalRegisterPanel from "./submittals/SubmittalRegisterPanel";
import { computeSubmittalStats, filterAndSortSubmittals, getVisibleSelectionState } from "./submittals/submittalRegister.derive";
import SubmittalFormModal from "./submittals/SubmittalFormModal";
import { useSubmittalsPageMutations } from "./submittals/useSubmittalsPageMutations";
import type { DrawingSet, DrawingSetsById, Submittal } from "./submittals/types";

/**
 * Submittals — formal transmittal register.
 *
 * Separate from `drawings` (individual sheets) and `drawing_sets` (a
 * package in review). A submittal is the workflow artifact: what was
 * sent, when, to whom, which round, current status, who the ball is
 * with.
 *
 * The SubmittalRegisterPanel is the canonical route presentation. The page
 * remains the owner of queries, workflow flags, and detail panels; mutations
 * live in useSubmittalsPageMutations (ID 21).
 */

// These modals and the bulk action bar are still .jsx, so TS infers their array
// props from [] defaults; casts keep the typed parent boundary explicit.
type AnyProps = PropsWithChildren<Record<string, unknown>>;
const BulkActionBar = BulkActionBarRaw as unknown as ComponentType<AnyProps>;
const NewRoundModal = NewRoundModalRaw as unknown as ComponentType<AnyProps>;
const ReleaseGateOverrideModal = ReleaseGateOverrideModalRaw as unknown as ComponentType<AnyProps>;
const SheetResponseGrid = SheetResponseGridRaw as unknown as ComponentType<AnyProps>;

export default function Submittals() {
  const qc = useQueryClient();
  const activeProject = useProjectContext().activeProject as any;
  const projectId = activeProject?.id as string | undefined;
  const { can } = usePermissions();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Phase 3 splitting: when set, the create form opens as a "spin off child"
  // with this submittal as the parent (project + drawing sets prefilled).
  const [spinOffParentId, setSpinOffParentId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterBIC, setFilterBIC] = useState("all");
  const [search, setSearch] = useState("");
  // Bulk-op state — mirrors the RFI page. selectedIds is a Set so
  // toggling a single row is O(1) and React's structural compare
  // (we always replace the Set) keeps re-renders predictable.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showNewRound, setShowNewRound] = useState(false);
  // Pending "Release for Fabrication" move blocked by open RFIs — drives the
  // override dialog (the server gate refused; PM can release with a reason).
  const [releaseBlock, setReleaseBlock] = useState<{ input: any; rfis: string[] } | null>(null);
  const [showSheetResponse, setShowSheetResponse] = useState<any>(null); // round object or null

  // Key ["submittals", projectId] matches getQueryKey("submittal", projectId) in useSubmittals.ts — React Query dedupes; no second fetch when embedded in the DCC hub.
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["submittals", projectId],
    queryFn: () => projectId
      ? entities.Submittal.filter({ project_id: projectId }, "-submitted_date")
      : [],
    enabled: !!projectId,
    staleTime: 30_000,
  });
  useAutoOpenEdit(rows, (submittal) => setSelectedId(submittal.id), {
    enabled: !isLoading,
    param: "recordId",
  });

  // Slice 7: draft ActionItems for Critical R&R/OFS/BFA aging (deduped).
  // Honest path — never invents Alerts Center rows / generate-alerts.
  useEffect(() => {
    if (!projectId || isLoading || rows.length === 0) return;
    void ensureCriticalAgingActionItems(
      rows.map((row: any) => ({
        ...row,
        project_id: row.project_id || projectId,
        project_name: activeProject?.name || activeProject?.project_name || null,
      })),
    );
  }, [projectId, isLoading, rows, activeProject?.name, activeProject?.project_name]);

  // Drawing sets for the active project — used by the "Linked drawing
  // sets" picker on the detail panel. Read-only here (the Drawings page
  // owns the create/edit flow), so a longer staleTime is fine.
  const { data: drawingSets = [] } = useQuery({
    queryKey: ["drawing_sets", projectId],
    queryFn: () => projectId
      ? entities.DrawingSet.filter({ project_id: projectId })
      : [],
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const drawingSetsById: DrawingSetsById = useMemo(() => {
    // Bridge the generated DB row to the page's domain `DrawingSet` view (same
    // data, nullable columns modeled as optional). Cast preserves runtime; the
    // map only ever holds real drawing-set rows. Removable once `types` models
    // the nullable columns directly.
    const map = new Map<string, DrawingSet>();
    for (const set of drawingSets) {
      if (set?.id) map.set(set.id, set as DrawingSet);
    }
    return map;
  }, [drawingSets]);

  // ── Rounds for the selected submittal ────────────────────────────
  const { data: allRounds = [] } = useQuery({
    queryKey: ["submittal-rounds", projectId],
    queryFn: () => projectId
      ? entities.SubmittalRound.filter({ project_id: projectId }, "round_number")
      : [],
    enabled: !!projectId,
    staleTime: 30_000,
  });
  const roundsBySubmittal = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const r of allRounds) {
      if (!map[r.submittal_id]) map[r.submittal_id] = [];
      map[r.submittal_id].push(r);
    }
    for (const arr of Object.values(map)) {
      arr.sort((a, b) => (a.round_number || 1) - (b.round_number || 1));
    }
    return map;
  }, [allRounds]);

  // ── RFIs for linked-entity picker ────────────────────────────────
  const { data: allRfis = [] } = useQuery({
    queryKey: ["rfis", projectId],
    queryFn: () => projectId
      ? entities.RFI.filter({ project_id: projectId })
      : [],
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // ── Schedule tasks for linked-entity picker ────────────────────────
  const { data: allTasks = [] } = useQuery({
    queryKey: ["schedule-tasks", projectId],
    queryFn: () => projectId
      ? entities.ScheduleTask.filter({ project_id: projectId })
      : [],
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // ── Drawings for sheet-response grid ─────────────────────────────
  const { data: allDrawings = [] } = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: () => projectId
      ? entities.Drawing.filter({ project_id: projectId })
      : [],
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // ── Sheet responses for the active round ─────────────────────────
  const { data: allSheetResponses = [] } = useQuery({
    queryKey: ["sheet-responses", projectId],
    queryFn: () => projectId
      ? entities.SubmittalSheetResponse.filter({ project_id: projectId })
      : [],
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // Returned-comment dispositions (Slice 5) — gate OFS→IFC / R&R→OFA.
  const { data: allCommentDispositions = [] } = useQuery({
    queryKey: ["comment-dispositions", projectId],
    queryFn: () => projectId
      ? entities.SubmittalCommentDisposition.filter({ project_id: projectId })
      : [],
    enabled: !!projectId,
    staleTime: 30_000,
  });
  const invalidateCommentDispositions = () =>
    qc.invalidateQueries({ queryKey: ["comment-dispositions", projectId] });

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
    rows: rows as any[],
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
  });

  // ── Filter/search ──────────────────────────────────────────────────
  // Pure filter+sort extracted to submittalRegister.derive (Slice 2b, TDD) —
  // byte-identical to the former inline memo (status-group / BIC / search then
  // drawing-set sort). Domain-view bridge cast: same rows, nullable columns
  // modeled as optional — no runtime change.
  const filtered = useMemo(
    () => filterAndSortSubmittals(rows as Submittal[], { filterStatus, filterBIC, search }, drawingSetsById),
    [rows, filterStatus, filterBIC, search, drawingSetsById],
  );

  // KPI counts — same pure derive. `today` is local-today; overdue is identical
  // in sign to the former `daysUntil(required_date) < 0` check.
  const stats = useMemo(() => computeSubmittalStats(rows as Submittal[], localToday()), [rows]);

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

  // ── Selection helpers ─────────────────────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  // toggleAll uses the *filtered* list, not all rows — matches the
  // RFI pattern. Without this, "select all" while a status filter
  // was active would silently grab hidden rows too.
  // `filtered` is the domain `Submittal[]` view (id modeled optional); rows
  // always carry an id at runtime, so cast at the Set boundary — the same
  // `r.id as string` bridge SubmittalVirtualList already uses.
  const { allSelected } = getVisibleSelectionState(filtered, selectedIds);
  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (filtered.length > 0 && filtered.every((r) => prev.has(r.id as string))) return new Set();
      const next = new Set(prev);
      filtered.forEach((r) => next.add(r.id as string));
      return next;
    });
  }, [filtered]);

  const newRoundSeed = showNewRound && selected
    ? buildNewRoundCarrySeed({
        submittalId: selected.id,
        submittalRounds: roundsBySubmittal[selected.id] || [],
        allSheetResponses,
        allCommentDispositions,
      })
    : null;

  // ── Canonical register list + detail elements ───────────────────────────
  // The canonical panel owns presentation; these elements retain the complete
  // operational list/detail behavior — splitting, lineage, type chips,
  // working-day due display, revision, and workflow actions.
  const listEl = (
    <SubmittalVirtualList
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
    <SubmittalDetail
      approvedRoutesToScrub={approvedRoutesToScrub}
      splittingEnabled={splittingEnabled}
      drawingTypesEnabled={drawingTypesEnabled}
      components={selected ? (componentsBySubmittal[selected.id] || []) : []}
      onComponentSetReceived={(args) => {
        if (!selected?.id || !selected?.project_id) return;
        setComponentReceived({
          submittalId: selected.id,
          projectId: selected.project_id,
          drawingType: args.drawingType,
          existing: args.existing,
          date: args.date,
        });
      }}
      onComponentSetReleased={(args) => {
        if (!selected?.id || !selected?.project_id) return;
        setComponentReleased({
          submittalId: selected.id,
          projectId: selected.project_id,
          drawingType: args.drawingType,
          existing: args.existing,
          released: args.released,
        });
      }}
      onComponentAddType={(drawingType) => {
        if (!selected?.id || !selected?.project_id) return;
        addComponentType({ submittalId: selected.id, projectId: selected.project_id, drawingType });
      }}
      onComponentRemoveType={(component) => {
        if (component.id) removeComponentMut.mutate(component.id);
      }}
      onSpinOff={() => selected && setSpinOffParentId(selected.id)}
      onSelectSubmittal={(id) => setSelectedId(id)}
      submittal={selectedView}
      allSubmittals={rowsView}
      drawingSets={drawingSetsView}
      rounds={selected ? (roundsBySubmittal[selected.id] || []) : []}
      sheetResponses={
        selected
          ? allSheetResponses.filter((r: any) =>
              (roundsBySubmittal[selected.id] || []).some(
                (rd: any) => rd.id === r.submittal_round_id,
              ),
            )
          : []
      }
      commentDispositions={
        selected
          ? allCommentDispositions.filter((d: any) => d.submittal_id === selected.id)
          : []
      }
      onCommentDispositionAdd={async (draft) => {
        if (!selected?.id || !selected.project_id) return;
        const rounds = roundsBySubmittal[selected.id] || [];
        const roundId = rounds.at(-1)?.id;
        if (!roundId) {
          toast.error("Add an approval cycle before tracking returned comments.");
          return;
        }
        try {
          await entities.SubmittalCommentDisposition.create(
            withProjectId({
              submittal_id: selected.id,
              submittal_round_id: roundId,
              comment_number: draft.comment_number,
              source: draft.source,
              location: draft.location || null,
              comment_text: draft.comment_text,
              is_required: draft.is_required,
              status: "Unreviewed",
            }, selected.project_id || projectId),
          );
          await invalidateCommentDispositions();
          toast.success("Returned comment added");
        } catch (err: any) {
          toast.error(`Could not add comment: ${toUserErrorMessage(err)}`);
        }
      }}
      onCommentDispositionStatus={async (id, status) => {
        try {
          const patch: Record<string, unknown> = { status };
          if (status === "Complete" || status === "Incorporated" || status === "Not Applicable") {
            patch.completed_at = new Date().toISOString();
          }
          await entities.SubmittalCommentDisposition.update(id, patch as any);
          await invalidateCommentDispositions();
        } catch (err: any) {
          toast.error(`Could not update disposition: ${err?.message || err}`);
        }
      }}
      onCommentDispositionResolution={async (id, resolution) => {
        try {
          await entities.SubmittalCommentDisposition.update(id, { resolution } as any);
          await invalidateCommentDispositions();
        } catch (err: any) {
          toast.error(`Could not save resolution: ${err?.message || err}`);
        }
      }}
      drawings={allDrawings}
      cycleStats={reviewForecast.stats}
      today={today}
      allRfis={allRfis}
      allTasks={allTasks}
      projectName={activeProject?.project_name || activeProject?.name || "Project"}
      project={activeProject}
      onClose={() => setSelectedId(null)}
      onEdit={() => selected && setEditingId(selected.id)}
      onDelete={() => selected && setToDelete(selected.id)}
      onStatusChange={(status) => {
        if (!selected) return;
        const write = buildStatusChangeWrite({
          selected: selected as any,
          status,
          today: localToday(),
          revisionAutoBump,
          workdayDuesEnabled,
          projectMeta: activeProject?.metadata ?? null,
        });
        if (write.kind === "advance") runAdvance(write.input);
        else if (write.kind === "update") updateMut.mutate(write.patch as any);
      }}
      onBICChange={(bic) => selected && updateMut.mutate({ id: selected.id, ball_in_court: bic })}
      // Verb CTA — advance via the audited write path: logs a round +
      // patches atomically. Stamps the submitted date when
      // sending out (→OFA) and the returned date when logging a return
      // (→BFA); never a fake date otherwise (§22).
      onAdvance={(action) => {
        if (!selected) return;
        const input = buildVerbCtaAdvanceInput({
          selected: selected as any,
          action,
          today: localToday(),
          revisionAutoBump,
          workdayDuesEnabled,
          projectMeta: activeProject?.metadata ?? null,
          commentDispositions: allCommentDispositions.filter(
            (d: any) => d.submittal_id === selected.id,
          ),
        });
        if (input) runAdvance(input);
      }}
      // Inline-edit hook — every editable cell in the detail
      // panel calls this with a single-field patch so we don't
      // need to round-trip through the modal for trivial fixes
      // like "fix the date" or "rename this submittal".
      onFieldChange={(patch) => selected && updateMut.mutate({ id: selected.id, ...patch })}
      onNewRound={() => setShowNewRound(true)}
      onReturnRound={(roundId) => {
        const round = allRounds.find((r) => r.id === roundId);
        if (round) setShowSheetResponse(round);
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
        onNewSubmittal={() => setShowCreate(true)}
        onBulkAdd={() => setShowBulkAdd(true)}
        list={listEl}
        detail={detailEl}
      />

      {(showCreate || editing || spinOffParent) && (
        <SubmittalFormModal
          open={showCreate || !!editing || !!spinOffParent}
          // Spin-off: seed from the parent (project + drawing sets carried over).
          // Edit: the row being edited. Plain create: empty.
          initial={editingView || (spinOffParent ? (spinOffInitial as Submittal) : {})}
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
              .filter((r: any) => r.id !== editing?.id)
              .map((r: any) => String(r.submittal_number || "").trim())
              .filter(Boolean),
          )}
          onClose={() => { setShowCreate(false); setEditingId(null); setSpinOffParentId(null); }}
          onSubmit={async (data) => {
            if (editing) {
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

      {/* Bulk actions — bottom-fixed, only renders when ≥1 row is
          selected. Mirrors the RFI page exactly so muscle memory
          carries over. */}
      <BulkActionBar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        actions={[
          ...(can("edit", "submittal") ? [{
            label: "EDIT SELECTED",
            icon: "edit",
            onClick: () => setShowBulkEdit(true),
          }] : []),
          ...(can("delete", "submittal") ? [{
            label: "DELETE",
            icon: "x",
            variant: "danger",
            onClick: () => setShowBulkDelete(true),
          }] : []),
        ]}
      />

      <SubmittalBulkEditModal
        open={showBulkEdit}
        count={selectedIds.size}
        onCancel={() => setShowBulkEdit(false)}
        busy={bulkUpdateMut.isPending}
        onSubmit={async (data) => {
          await bulkUpdateMut.mutateAsync({ ids: [...selectedIds], data });
        }}
      />

      <SubmittalBulkAddModal
        open={showBulkAdd}
        onCancel={() => setShowBulkAdd(false)}
        busy={bulkCreateMut.isPending}
        onSubmit={(newRows) => bulkCreateMut.mutate(newRows)}
      />

      <DeleteDialog
        open={showBulkDelete}
        onClose={() => setShowBulkDelete(false)}
        busy={bulkDeleteMut.isPending}
        onConfirm={() => bulkDeleteMut.mutateAsync([...selectedIds])}
        title={`Delete ${selectedIds.size} submittal${selectedIds.size === 1 ? "" : "s"}`}
        description={`Soft-delete ${selectedIds.size} selected submittal${selectedIds.size === 1 ? "" : "s"}? This cannot be undone from the UI.`}
      />

      {/* New Round modal — creates a new submittal round for the
          selected submittal. Carries forward drawing sets and
          increments the round number automatically. */}
      {showNewRound && selected && newRoundSeed && (
        <NewRoundModal
          open={showNewRound}
          submittal={selected}
          previousRound={newRoundSeed.previousRound}
          carryItems={newRoundSeed.carryItems}
          carryFromRound={newRoundSeed.carryFromRound}
          seededNotes={newRoundSeed.seededNotes}
          busy={createRoundMut.isPending}
          onClose={() => setShowNewRound(false)}
          onSubmit={(data) => createRoundMut.mutateAsync(data)}
        />
      )}

      {/* Fab-release gate override — a "Release for Fabrication" move blocked by
          open RFIs reopens here so a PM can release with a recorded reason. */}
      <ReleaseGateOverrideModal
        open={!!releaseBlock}
        blockingRfiNumbers={releaseBlock?.rfis || []}
        busy={advanceMut.isPending}
        onClose={() => setReleaseBlock(null)}
        onConfirm={(reason: string) =>
          releaseBlock && runAdvance({ ...releaseBlock.input, fabReleaseOverrideReason: reason })
        }
      />

      {/* Sheet response grid — per-sheet response entry when a round
          is returned by the reviewer. Opens when "Mark Returned" is
          clicked on a timeline node. */}
      {showSheetResponse && (
        <Dialog open={!!showSheetResponse} onOpenChange={(o) => !o && setShowSheetResponse(null)}>
          <DialogContent className="sm:max-w-[900px]" style={{ padding: 0 }}>
            <SheetResponseGrid
              round={showSheetResponse}
              drawings={allDrawings.filter((d) => {
                const setIds = showSheetResponse.drawing_set_ids || [];
                return setIds.includes(d.drawing_set_id);
              })}
              existingResponses={allSheetResponses.filter(
                (r) => r.submittal_round_id === showSheetResponse.id
              )}
              onSave={(responses) =>
                saveSheetResponsesMut.mutateAsync({
                  roundId: showSheetResponse.id,
                  responses,
                })
              }
              saving={saveSheetResponsesMut.isPending}
              onClose={() => setShowSheetResponse(null)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
