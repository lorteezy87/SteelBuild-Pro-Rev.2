/**
 * ScheduleBody — the shared Schedule page body (phase-filter tiles → bulk
 * action toolbar). This block was previously duplicated byte-for-byte between
 * the command_ui render path (as `existingBody`) and the legacy return path in
 * Schedule.tsx. It is extracted verbatim here so both paths render one copy.
 *
 * The ONLY difference between the two original copies was the bulk "Set Parent"
 * modal backdrop color, which is passed in via `bulkParentBackdrop`.
 *
 * This component owns no state and fires no mutations of its own — every piece
 * of state, every mutation object, and every handler is passed in from
 * Schedule.tsx so behavior is identical to the inline copies.
 */
import { Suspense } from "react";
import type { ComponentType, PropsWithChildren } from "react";
import { entities } from "@/api/supabaseClient";
import { toast } from "sonner";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import DeleteDialog from "@/components/shared/DeleteDialog";
import LoadingSkeletonRaw from "@/components/shared/LoadingSkeleton";
import { lazyWithRetry } from "@/lib/lazyRetry";
import ScheduleRivetBriefRaw from "@/components/schedule/ScheduleRivetBrief";
import LookaheadPlanner from "@/components/schedule/LookaheadPlanner";
import ScheduleTaskList from "@/components/schedule/ScheduleTaskList";
import TaskDetailDrawerRaw from "@/components/schedule/TaskDetailDrawer";
import { sanitizeScheduleTaskUpdatePayload } from "./wbs";
import { invalidateEntity } from "@/services/cacheRegistry";
import ListTruncationNotice from "@/components/shared/ListTruncationNotice";
import BulkActionToolbar from "./BulkActionToolbar";
import PhaseKpiTiles from "./PhaseKpiTiles";
import ViewTabs from "./ViewTabs";
import BulkParentModal from "./BulkParentModal";
import type { ScheduleTask } from "./types";
import type { ScheduleModals } from "./useScheduleModals";
import type { TaskSelection } from "./useTaskSelection";

// Boundary casts mirror Schedule.tsx — these children are still .jsx.
type AnyProps = PropsWithChildren<Record<string, unknown>>;
const LoadingSkeleton = LoadingSkeletonRaw as unknown as ComponentType<AnyProps>;
const ScheduleRivetBrief = ScheduleRivetBriefRaw as unknown as ComponentType<AnyProps>;
const TaskDetailDrawer = TaskDetailDrawerRaw as unknown as ComponentType<AnyProps>;
const ScheduleGantt = lazyWithRetry(
  () => import("@/components/schedule/ScheduleGantt"),
) as unknown as ComponentType<AnyProps>;
const AddTaskModal = lazyWithRetry(
  () => import("@/components/schedule/AddTaskModal"),
) as unknown as ComponentType<AnyProps>;
const BulkAddTaskModal = lazyWithRetry(
  () => import("@/components/schedule/BulkAddTaskModal"),
) as unknown as ComponentType<AnyProps>;
const BulkDateEditModal = lazyWithRetry(
  () => import("@/components/schedule/BulkDateEditModal"),
) as unknown as ComponentType<AnyProps>;
const BulkDurationEditModal = lazyWithRetry(
  () => import("@/components/schedule/BulkDurationEditModal"),
) as unknown as ComponentType<AnyProps>;
const WbsBuilderModal = lazyWithRetry(
  () => import("@/components/schedule/WbsBuilderModal"),
) as unknown as ComponentType<AnyProps>;

interface ScheduleBodyProps {
  // Backdrop for the bulk "Set Parent" modal — the sole visual difference
  // between the two original body copies.
  bulkParentBackdrop: string;

  // Derived data
  phaseCounts: Record<string, number>;
  tasksWithEffective: ScheduleTask[];
  enrichedTasks: ScheduleTask[];
  // Only `.length` is read (the truncation notice). Structural type so the raw
  // hook rows (RowWithAliases<"schedule_tasks">[]) assign without a cast.
  scheduleTasksRaw: { length: number };
  submittals: any[];
  weatherRisk: any;
  effectiveDatesMap: any;
  selectedProject: any;
  projectId: string | null | undefined;
  qc: any;
  bulkParentOptions: ScheduleTask[];

  // View / filter state
  view: string;
  setView: (v: string) => void;
  phaseFilter: string;
  setPhaseFilter: (p: string) => void;
  setGanttFocus: (v: any) => void;
  ganttFocus: any;
  expandedTask: any;
  setExpandedTask: (v: any) => void;

  // Task drawer / delete state
  selectedTask: ScheduleTask | null;
  setSelectedTask: (t: ScheduleTask | null) => void;
  deleteTarget: ScheduleTask | null;
  setDeleteTarget: (t: ScheduleTask | null) => void;

  // Grouped hooks
  modals: ScheduleModals;
  selection: TaskSelection;

  // Bulk resource input state
  bulkResourceValue: string;
  setBulkResourceValue: (v: string) => void;
  bulkSaving: boolean;

  // Mutations
  updateTaskMut: any;
  reparentMut: any;
  createTaskMut: any;
  deleteTaskMut: any;
  bulkUpdateMut: any;
  bulkDeleteMut: any;
  bulkResourceMut: any;
  bulkDateMut: any;
  bulkDurationMut: any;

  // Handlers
  handleBulkAdd: (rows: any[]) => void;
  bulkUpdateStatus: (status: string) => void;
  bulkDelete: () => void;
  bulkUpdateDates: (fields: Record<string, any>) => void;
  bulkUpdateDuration: (v: { mode: string; days: number }) => void;
  bulkSetParent: (newParentId: string | null) => void;
  confirmBulkDelete: () => void;
}

export default function ScheduleBody(props: ScheduleBodyProps) {
  const {
    bulkParentBackdrop,
    phaseCounts,
    tasksWithEffective,
    enrichedTasks,
    scheduleTasksRaw,
    submittals,
    weatherRisk,
    effectiveDatesMap,
    selectedProject,
    projectId,
    qc,
    bulkParentOptions,
    view,
    setView,
    phaseFilter,
    setPhaseFilter,
    setGanttFocus,
    ganttFocus,
    expandedTask,
    setExpandedTask,
    selectedTask,
    setSelectedTask,
    deleteTarget,
    setDeleteTarget,
    modals,
    selection,
    bulkResourceValue,
    setBulkResourceValue,
    bulkSaving,
    updateTaskMut,
    reparentMut,
    createTaskMut,
    deleteTaskMut,
    bulkUpdateMut,
    bulkDeleteMut,
    bulkResourceMut,
    bulkDateMut,
    bulkDurationMut,
    handleBulkAdd,
    bulkUpdateStatus,
    bulkDelete,
    bulkUpdateDates,
    bulkUpdateDuration,
    bulkSetParent,
    confirmBulkDelete,
  } = props;
  const { selectedIds, setSelectedIds, toggleSelect } = selection;
  const {
    showDrawer,
    setShowDrawer,
    showAddTask,
    setShowAddTask,
    showBulkAdd,
    setShowBulkAdd,
    showWbsBuilder,
    setShowWbsBuilder,
    showBulkResource,
    setShowBulkResource,
    showBulkDates,
    setShowBulkDates,
    showBulkDuration,
    setShowBulkDuration,
    showBulkParent,
    setShowBulkParent,
    showBulkDeleteConfirm,
    setShowBulkDeleteConfirm,
  } = modals;

  return (
    <>
      {/* Phase Filter — click-to-filter KPI tiles (one per lifecycle phase) */}
      <PhaseKpiTiles
        phaseCounts={phaseCounts}
        phaseFilter={phaseFilter}
        onSetPhaseFilter={setPhaseFilter}
      />

      {/* View Tabs */}
      <ViewTabs view={view} onSetView={setView} />

      <ScheduleRivetBrief
        tasks={tasksWithEffective}
        project={selectedProject}
        phaseFilter={phaseFilter}
        onSetPhaseFilter={setPhaseFilter}
        onSetView={setView}
        onSetGanttFocus={(request: any) => {
          const focusRequest = typeof request === "string" ? { filter: request } : (request || {});
          setView("gantt");
          setGanttFocus({ ...focusRequest, requestedAt: Date.now() });
        }}
      />

      {/* Surface the silent 2000-row read cap on useScheduleTasks (raw `scheduleTasksRaw`). */}
      <ListTruncationNotice count={scheduleTasksRaw.length} label="schedule tasks" />

      {/* View Content */}
      <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
        {view === "gantt" && (
          <ErrorBoundary label="Gantt Chart">
            <Suspense fallback={<LoadingSkeleton variant="page" />}>
              <ScheduleGantt
                tasks={enrichedTasks}
                submittals={submittals}
                weatherRisk={weatherRisk}
                expandedTask={expandedTask}
                setExpandedTask={setExpandedTask}
                onTaskClick={(task: ScheduleTask) => { setSelectedTask(task); setShowDrawer(true); }}
                onSave={async (data: ScheduleTask) => {
                  const { id, fields } = sanitizeScheduleTaskUpdatePayload(data);
                  try {
                    if (!id) throw new Error("Cannot update a task without an id");
                    await entities.ScheduleTask.update(id, fields);
                    invalidateEntity(qc, "schedule_task", projectId);
                    toast.success("Task saved");
                  } catch (err: any) {
                    toast.error("Save failed: " + (err?.message || "unknown error"));
                    throw err;
                  }
                }}
                onReparent={(p: { ids: string[]; newParentId: string | null; dropIndex?: number | null }) =>
                  reparentMut.mutate(p)
                }
                phaseFilter={phaseFilter}
                externalFocus={ganttFocus}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {view === "lookahead" && (
          <ErrorBoundary label="Lookahead Planner">
            {/* Lookahead's week-bucket date predicates run against the
                effective dates so cascaded tasks land in the correct
                week — previously a Detailing task whose predecessor
                slipped two weeks would still appear in the original
                week's bucket. */}
            <LookaheadPlanner tasks={tasksWithEffective} />
          </ErrorBoundary>
        )}

        {view === "list" && (
          <ErrorBoundary label="Task List">
            <ScheduleTaskList
              tasks={tasksWithEffective}
              onEdit={(task: ScheduleTask) => {
                // The Task List receives the effective-date overlay so its
                // rows show the cascaded dates. The TaskDetailDrawer must
                // edit STORED dates — opening it with overlaid dates would
                // let the user "save" effective dates as new stored values
                // and silently destroy their original entry. Look the row
                // up in the unmodified enrichedTasks list before opening.
                const original = enrichedTasks.find((t) => t.id === task.id) || task;
                setSelectedTask(original);
                setShowDrawer(true);
              }}
              onDelete={(task: ScheduleTask) => setDeleteTarget(task)}
              onSave={async (data: ScheduleTask) => {
                const { id, fields } = sanitizeScheduleTaskUpdatePayload(data);
                try {
                  if (!id) throw new Error("Cannot update a task without an id");
                  await entities.ScheduleTask.update(id, fields);
                  invalidateEntity(qc, "schedule_task", projectId);
                  toast.success("Task saved");
                } catch (err: any) {
                  toast.error("Save failed: " + (err?.message || "unknown error"));
                  throw err;
                }
              }}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
            />
          </ErrorBoundary>
        )}
      </div>

      {/* Task Detail Drawer */}
      <TaskDetailDrawer
        task={selectedTask}
        open={showDrawer}
        onClose={() => { setShowDrawer(false); setSelectedTask(null); }}
        onUpdate={(data: ScheduleTask) => updateTaskMut.mutate(data)}
        onReparent={(childId: string, newParentId: string | null) => reparentMut.mutate({ ids: [childId], newParentId })}
        onDelete={(id: string) => deleteTaskMut.mutate(id)}
        allTasks={enrichedTasks}
        effectiveDates={effectiveDatesMap}
      />

      {/* Add/bulk/WBS modals are lazy-loaded; gate the mount on the open flag so
          the chunk only fetches on first open. Each renders null when closed,
          so this is behavior-preserving. A null Suspense fallback avoids a
          flash before the (already-overlay) modal paints. */}
      {showAddTask && (
        <Suspense fallback={null}>
          <AddTaskModal
            open={showAddTask}
            onClose={() => setShowAddTask(false)}
            onSubmit={(data: ScheduleTask) =>
              createTaskMut.mutate({
                ...data,
                project_id: projectId,
                percent_complete: 0,
              })
            }
            isSaving={createTaskMut.isPending}
            projectName={selectedProject?.name || ""}
            prefilledDate={new Date().toISOString().split("T")[0]}
            existingTasks={enrichedTasks}
          />
        </Suspense>
      )}

      {showBulkAdd && (
        <Suspense fallback={null}>
          <BulkAddTaskModal
            open={showBulkAdd}
            onClose={() => setShowBulkAdd(false)}
            onSubmit={handleBulkAdd}
            projectName={selectedProject?.name || ""}
            isSaving={bulkSaving}
            existingTasks={enrichedTasks}
          />
        </Suspense>
      )}

      {showBulkDates && (
        <Suspense fallback={null}>
          <BulkDateEditModal
            open={showBulkDates}
            count={selectedIds.size}
            isSaving={bulkDateMut.isPending}
            onClose={() => setShowBulkDates(false)}
            onSubmit={bulkUpdateDates}
          />
        </Suspense>
      )}

      {showBulkDuration && (
        <Suspense fallback={null}>
          <BulkDurationEditModal
            open={showBulkDuration}
            count={selectedIds.size}
            isSaving={bulkDurationMut.isPending}
            onClose={() => setShowBulkDuration(false)}
            onSubmit={bulkUpdateDuration}
          />
        </Suspense>
      )}

      {showBulkParent && (
        <BulkParentModal
          backdrop={bulkParentBackdrop}
          count={selectedIds.size}
          options={bulkParentOptions}
          onClose={() => setShowBulkParent(false)}
          onSelectParent={bulkSetParent}
        />
      )}

      {showWbsBuilder && (
        <Suspense fallback={null}>
          <WbsBuilderModal
            open={showWbsBuilder}
            projectId={projectId}
            onClose={() => setShowWbsBuilder(false)}
          />
        </Suspense>
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTaskMut.isPending && deleteTarget?.id) {
            deleteTaskMut.mutate(deleteTarget.id);
          }
        }}
        title="Delete task?"
        description={deleteTarget ? `This will remove "${deleteTarget.task_name}".` : ""}
      />

      <DeleteDialog
        open={showBulkDeleteConfirm}
        onClose={() => setShowBulkDeleteConfirm(false)}
        onConfirm={confirmBulkDelete}
        title={`Delete ${selectedIds.size} task${selectedIds.size !== 1 ? "s" : ""}?`}
        description={`This will permanently remove ${selectedIds.size} selected task${selectedIds.size !== 1 ? "s" : ""}. This cannot be undone.`}
      />

      {selectedIds.size > 0 && (
        <BulkActionToolbar
          selectedCount={selectedIds.size}
          updatePending={bulkUpdateMut.isPending}
          deletePending={bulkDeleteMut.isPending}
          datePending={bulkDateMut.isPending}
          durationPending={bulkDurationMut.isPending}
          resourcePending={bulkResourceMut.isPending}
          showResourceInput={showBulkResource}
          resourceValue={bulkResourceValue}
          onStatus={bulkUpdateStatus}
          onDelete={bulkDelete}
          onEditDates={() => setShowBulkDates(true)}
          onEditDurations={() => setShowBulkDuration(true)}
          parentPending={reparentMut.isPending}
          onSetParent={() => setShowBulkParent(true)}
          onShowResourceInput={() => setShowBulkResource(true)}
          onResourceValueChange={setBulkResourceValue}
          onApplyResource={() => bulkResourceMut.mutate({ ids: Array.from(selectedIds), resource_names: bulkResourceValue.trim() })}
          onCancelResource={() => { setShowBulkResource(false); setBulkResourceValue(""); }}
          onClear={() => setSelectedIds(new Set())}
        />
      )}
    </>
  );
}
