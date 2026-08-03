import { useContext, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProjectContext } from "@/components/shared/ProjectContext";
import { useOrg } from "@/components/shared/OrgContext";

type ProjectContextValue = { projects: Array<{ id: string; name: string; org_id?: string | null; is_deleted?: boolean }> };

export function shouldShowArchiveEmpty(state: { isLoading: boolean; isError: boolean; isSuccess: boolean; count: number }): boolean {
  return !state.isLoading && !state.isError && state.isSuccess && state.count === 0;
}

/** Read-only archive: archived records remain traceable and are never deleted from this UI. */
export default function ArchivePage() {
  const { projects } = useContext(ProjectContext) as ProjectContextValue;
  const { currentOrg } = useOrg() as { currentOrg: { id: string } | null };
  const orgId = currentOrg?.id ?? null;
  const projectIds = useMemo(() => orgId ? projects.filter((project) => project.org_id === orgId && project.is_deleted !== true).map((project) => project.id) : [], [projects, orgId]);
  const archiveQuery = useQuery({ queryKey: ["planner-actions", orgId ?? "", { archived: true }], enabled: Boolean(orgId) && projectIds.length > 0, queryFn: async () => { const { listPlannerActions } = await import("@planner/data/actionRepository"); return (await Promise.all(projectIds.map((projectId) => listPlannerActions(projectId)))).flat().filter((action) => Boolean(action.archived_at)); } });
  return <section className="planner-workspace" aria-labelledby="planner-archive-heading"><h2 id="planner-archive-heading">Archive</h2>{archiveQuery.isLoading && <p role="status">Loading archived Planner actions…</p>}{archiveQuery.isError && <p role="alert">Unable to load the Planner archive.</p>}{shouldShowArchiveEmpty({ isLoading: archiveQuery.isLoading, isError: archiveQuery.isError, isSuccess: archiveQuery.isSuccess, count: archiveQuery.data?.length ?? 0 }) && <p>No archived Planner actions are available in your authorized projects.</p>}{archiveQuery.data && archiveQuery.data.length > 0 && <ul className="planner-archive-list">{archiveQuery.data.map((action) => <li key={action.id}><strong>{action.title || "Untitled action"}</strong> — archived {action.archived_at}</li>)}</ul>}</section>;
}
