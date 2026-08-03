import { useContext, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ProjectContext } from "@/components/shared/ProjectContext";
import { useOrg } from "@/components/shared/OrgContext";
import ActionRegister from "@planner/components/register/ActionRegister";
import type { PlannerAction, PlannerActionFilters } from "@planner/data/plannerTypes";
import type { PlannerActionRecord, PlannerActionUpdate, PlannerBulkCompletionResult } from "@planner/data/actionRepository";
import ActionEditorDrawer from "@planner/features/actions/ActionEditorDrawer";
import NewTaskDialog, { type PlannerProjectOption } from "@planner/features/actions/NewTaskDialog";
import { downloadActionsCsv, plannerActionsQueryKey } from "@planner/features/actions/exportActionsCsv";
import { filterActionsForPlannerMetric, type PlannerMetricFilter } from "@planner/domain/plannerQueueBuckets";
import { usePlannerTodayIso } from "@planner/pages/usePlannerQueueData";
import { usePlannerOffline } from "@planner/offline/PlannerOfflineProvider";

export type PlannerScopedProject = { id: string; name: string; org_id?: string | null; is_deleted?: boolean; on_hold?: boolean };
type ProjectContextValue = { projects: PlannerScopedProject[]; loading: boolean; projectLoadError: string | null };
type PlannerOrganization = { id: string; metadata?: unknown };
const EMPTY_FILTERS: PlannerActionFilters = { search: "" };
const PLANNER_METRIC_FILTERS = new Set<PlannerMetricFilter>(["all", "overdue", "due-today", "next-48", "waiting-on"]);

function isOnline(): boolean { return typeof navigator === "undefined" || navigator.onLine !== false; }
function matchesFilters(action: PlannerAction, filters: PlannerActionFilters): boolean {
  const search = filters.search?.trim().toLocaleLowerCase();
  if (filters.projectId && action.project_id !== filters.projectId) return false;
  if (filters.status && action.status !== filters.status) return false;
  if (filters.priority && action.priority !== filters.priority) return false;
  if (filters.workstream && action.workstream !== filters.workstream) return false;
  if (filters.ownerId && action.assigned_user_id !== filters.ownerId) return false;
  if (filters.waitingOn && !action.waiting_on?.trim()) return false;
  return !search || [action.title, action.project_name, action.workstream, action.waiting_on].some((value) => value?.toLocaleLowerCase().includes(search));
}
export function parsePlannerMetricFilter(search: string | URLSearchParams): PlannerMetricFilter {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const metric = params.get("metric");
  return metric !== null && PLANNER_METRIC_FILTERS.has(metric as PlannerMetricFilter)
    ? metric as PlannerMetricFilter
    : "all";
}
export function filterActionsForMetric(actions: readonly PlannerAction[], metric: PlannerMetricFilter, todayIso: string): PlannerAction[] {
  return filterActionsForPlannerMetric(actions, metric, todayIso);
}
/** Keeps URL-driven Task Register metric filters on the same org-local clock as Command Center. */
export function useTaskRegisterMetricActions(
  actions: readonly PlannerAction[],
  metric: PlannerMetricFilter,
  orgMetadata: unknown,
): PlannerAction[] {
  const todayIso = usePlannerTodayIso(orgMetadata);
  return useMemo(() => filterActionsForMetric(actions, metric, todayIso), [actions, metric, todayIso]);
}
function plannerInvalidations(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: ["planner-actions"] });
  void queryClient.invalidateQueries({ queryKey: ["planner-audit"] });
  void queryClient.invalidateQueries({ queryKey: ["planner-calendar"] });
}
function isFailedBulkResult(value: unknown): boolean {
  return typeof value === "object" && value !== null && "ok" in value && value.ok !== true;
}
export function filterProjectsForCurrentOrg(projects: readonly PlannerScopedProject[], orgId: string | null): PlannerProjectOption[] {
  if (!orgId) return [];
  return projects.filter((project) => project.org_id === orgId && project.is_deleted !== true && project.on_hold !== true).map((project) => ({ id: project.id, name: project.name }));
}
export function bulkCompletionMessage(result: PlannerBulkCompletionResult): string {
  if (result.ok) return `Completed ${result.completed.length} action${result.completed.length === 1 ? "" : "s"}.`;
  const rolledBackIds = new Set(result.rolledBack.map((rollback) => rollback.id));
  const netCompleted = result.completed.filter((completion) => !rolledBackIds.has(completion.id)).length;
  const rolledBack = result.rolledBack.filter((rollback) => rollback.ok).length;
  const rollbackFailures = result.rolledBack.filter((rollback) => !rollback.ok).length;
  return `Bulk completion did not fully succeed. Net completed: ${netCompleted}. Rolled back: ${rolledBack}. Rollback failures: ${rollbackFailures}. Final state uncertain: ${rollbackFailures}. Failed: ${result.failed.length}. Ineligible: ${result.ineligible.length}.`;
}
export function validateSingleProjectBulkSelection(actions: readonly PlannerAction[], selectedIds: readonly string[]): { projectId: string; ids: string[] } | { error: "missing_action" | "multiple_projects" } {
  const projectIds = new Set<string>();
  for (const id of selectedIds) {
    const action = actions.find((candidate) => candidate.id === id);
    if (!action) return { error: "missing_action" };
    projectIds.add(action.project_id);
  }
  if (projectIds.size !== 1) return { error: "multiple_projects" };
  return { projectId: [...projectIds][0], ids: [...selectedIds] };
}
/** Operational task register: repository-only mutations, explicit failure states, and no local fake records. */
export default function TaskRegisterPage() {
  const { projects, loading: isLoadingProjects, projectLoadError } = useContext(ProjectContext) as ProjectContextValue;
  const { currentOrg } = useOrg() as { currentOrg: PlannerOrganization | null };
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState<PlannerActionFilters>(EMPTY_FILTERS);
  const [selectedActionIds, setSelectedActionIds] = useState<string[]>([]);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<PlannerActionRecord | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const offline = usePlannerOffline();
  const orgId = currentOrg?.id ?? null;
  const metricFilter = parsePlannerMetricFilter(searchParams);
  const projectOptions = useMemo<PlannerProjectOption[]>(() => filterProjectsForCurrentOrg(projects, orgId), [projects, orgId]);
  const projectIds = useMemo(() => projectOptions.map((project) => project.id), [projectOptions]);
  const actionsQuery = useQuery({ queryKey: plannerActionsQueryKey(orgId ?? "", filters), enabled: Boolean(orgId) && projectIds.length > 0, queryFn: async () => {
    if (!offline.online) {
      const snapshots = await Promise.all(projectIds.map((projectId) => offline.loadSnapshot(`actions:${projectId}`)));
      return snapshots.flatMap((snapshot) => (snapshot?.rows ?? []).map((row) => row as unknown as PlannerActionRecord));
    }
    const { listPlannerActions } = await import("@planner/data/actionRepository");
    const groups = await Promise.all(projectIds.map(async (projectId) => {
      const rows = await listPlannerActions(projectId);
      await offline.saveSnapshot(`actions:${projectId}`, rows.map((row) => ({ ...row })));
      return rows;
    }));
    offline.markConnectionVerified();
    return groups.flat();
  } });
  const filteredActions = useMemo(() => (actionsQuery.data ?? []).filter((action) => !action.archived_at).filter((action) => matchesFilters(action, filters)), [actionsQuery.data, filters]);
  const actions = useTaskRegisterMetricActions(filteredActions, metricFilter, currentOrg?.metadata);
  const historyQuery = useQuery({ queryKey: ["planner-audit", editingAction?.project_id], enabled: Boolean(editingAction?.project_id), queryFn: async () => (await import("@planner/data/auditRepository")).listPlannerAuditEvents(editingAction?.project_id ?? "") });
  const createActionMutation = useMutation({ mutationFn: async (payload: Parameters<typeof import("@planner/data/actionRepository").createPlannerAction>[0]) => (await import("@planner/data/actionRepository")).createPlannerAction(payload), onSuccess: () => plannerInvalidations(queryClient) });
  const createScheduleMutation = useMutation({ mutationFn: async (payload: Parameters<typeof import("@planner/data/scheduleRepository").createScheduleActivity>[0]) => (await import("@planner/data/scheduleRepository")).createScheduleActivity(payload), onSuccess: () => plannerInvalidations(queryClient) });
  const updateActionMutation = useMutation({ mutationFn: async ({ id, patch, expectedUpdatedAt }: { id: string; patch: PlannerActionUpdate; expectedUpdatedAt: string }) => (await import("@planner/data/actionRepository")).updatePlannerAction(id, patch, expectedUpdatedAt), onSuccess: () => plannerInvalidations(queryClient) });
  const archiveActionMutation = useMutation({ mutationFn: async ({ projectId, id, expectedUpdatedAt }: { projectId: string; id: string; expectedUpdatedAt: string }) => (await import("@planner/data/actionRepository")).archivePlannerAction(projectId, id, expectedUpdatedAt), onSuccess: () => plannerInvalidations(queryClient) });
  const bulkMutation = useMutation({ mutationFn: async ({ projectId, ids }: { projectId: string; ids: readonly string[] }) => (await import("@planner/data/actionRepository")).completePlannerActions(projectId, ids), onSuccess: () => plannerInvalidations(queryClient) });

  useEffect(() => { setSelectedActionIds((current) => current.filter((id) => actions.some((action) => action.id === id))); }, [actions]);
  const runMutation = async <Result,>(operation: () => Promise<Result>): Promise<Result> => { setMutationError(null); try { return await operation(); } catch (error) { setMutationError(error instanceof Error ? error.message : "Planner action operation failed."); throw error; } };
  const completeSelected = async (ids: readonly string[]) => {
    if (!isOnline()) { setMutationError("Bulk completion requires an online connection."); return; }
    const selection = validateSingleProjectBulkSelection(actions, ids);
    if ("error" in selection) { setMutationError(selection.error === "multiple_projects" ? "Bulk completion requires all selected actions to belong to one project. No actions were changed." : "Selected action is no longer authorized in this register."); return; }
    const result: PlannerBulkCompletionResult = await runMutation(() => bulkMutation.mutateAsync({ projectId: selection.projectId, ids: selection.ids }));
    if (isFailedBulkResult(result)) { setMutationError(bulkCompletionMessage(result)); return; }
    setMutationError(bulkCompletionMessage(result));
    setSelectedActionIds([]);
  };
  const mutationBusy = createActionMutation.isPending || createScheduleMutation.isPending || updateActionMutation.isPending || archiveActionMutation.isPending || bulkMutation.isPending;

  return <section className="planner-workspace" aria-labelledby="planner-workspace-heading">
    <h2 id="planner-workspace-heading">Task Register</h2>
    {isLoadingProjects && <p role="status">Loading authorized Planner projects…</p>}
    {projectLoadError && <p role="alert">Unable to load authorized projects: {projectLoadError}</p>}
    {actionsQuery.isError && <p role="alert">Unable to load Planner actions: {actionsQuery.error instanceof Error ? actionsQuery.error.message : "Unknown query error"}</p>}
    {mutationError && <p role="alert">{mutationError}</p>}
    <ActionRegister actions={actions} filters={filters} selectedActionIds={selectedActionIds} onSelectedActionIdsChange={setSelectedActionIds} onFiltersChange={setFilters} onNewAction={() => setIsNewOpen(true)} onExport={() => downloadActionsCsv(actions)} onCompleteSelected={(ids) => void completeSelected(ids)} newActionDisabled={projectOptions.length === 0 || !isOnline()} newActionDisabledReason={projectOptions.length === 0 ? "No authorized active project is available for a new task." : "Creating Planner records requires an online connection."} exportDisabled={actions.length === 0} exportDisabledReason="No authorized rows match the current Planner filters." completeSelectedDisabledReason={!isOnline() ? "Bulk completion requires an online connection." : undefined} />
    {actions.length > 0 && <section aria-label="Open action editor"><h3>Open action</h3><div className="planner-action-open-list">{actions.map((action) => <button className="planner-button" key={action.id} type="button" onClick={() => { const record = (actionsQuery.data ?? []).find((candidate) => candidate.id === action.id); if (record) setEditingAction(record); }}>Edit {action.title?.trim() || "untitled action"}</button>)}</div></section>}
    <NewTaskDialog isOpen={isNewOpen} projects={projectOptions} onClose={() => setIsNewOpen(false)} onCreateAction={(payload) => runMutation(() => createActionMutation.mutateAsync(payload))} onCreateScheduleActivity={(payload) => runMutation(() => createScheduleMutation.mutateAsync(payload))} />
    {editingAction && <ActionEditorDrawer action={editingAction} isOpen history={historyQuery.data ?? []} onClose={() => setEditingAction(null)} onFetchCurrentAction={async (projectId, actionId) => { const { listPlannerActions } = await import("@planner/data/actionRepository"); const fresh = (await listPlannerActions(projectId)).find((candidate) => candidate.id === actionId); if (!fresh) throw new Error("The current action is no longer available."); return fresh; }} onSave={(patch, expectedUpdatedAt) => runMutation(() => updateActionMutation.mutateAsync({ id: editingAction.id, patch, expectedUpdatedAt }))} onArchive={(expectedUpdatedAt) => runMutation(() => archiveActionMutation.mutateAsync({ projectId: editingAction.project_id, id: editingAction.id, expectedUpdatedAt }))} />}
    {mutationBusy && <p role="status">Saving Planner changes…</p>}
  </section>;
}
