import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useProjectContext } from "@/components/shared/ProjectContext";
import EmptyState from "@/components/design-system/EmptyState";
import PageLoader from "@/boot/PageLoader";

/**
 * ProjectScopedRoute — route-level guard for project-scoped pages (#14).
 *
 * Pages registered with `projectScoped: true` are wrapped in this guard by
 * AppRoutes. It is purely additive defense-in-depth + clean UX: Supabase RLS
 * remains the real access boundary (a user without access gets empty/blocked
 * data regardless). The guard exists so a *deep link* to a project the user
 * can't access shows an explicit "no access" screen instead of a broken,
 * silently-empty page.
 *
 * What it guards: ONLY an explicit `?projectId=` / `?project=` URL parameter.
 * The accessible-project set is ProjectContext.projects, which is itself
 * RLS-scoped (entities.Project.list only returns projects the user can reach —
 * including org owner/admin org-wide access). So:
 *
 *   - No URL project param → render. Portfolio mode (null) and a
 *     context-selected project (always from the user's own list) keep working
 *     exactly as before — no regression to pages with portfolio views.
 *   - URL project is in the accessible set → make it the active project, then
 *     render. Waiting for that synchronization prevents record-level deep
 *     links from querying the previously selected project's register.
 *   - URL project unknown while the list is still loading → wait (PageLoader),
 *     so we never deny before the list resolves.
 *   - Project list failed to load → render (can't determine access; don't
 *     false-deny — RLS still protects the data).
 *   - URL project definitively NOT accessible → Access-Denied screen.
 */
export default function ProjectScopedRoute({ children }) {
  const [searchParams] = useSearchParams();
  const {
    projects,
    activeProject,
    setActiveProject,
    loading,
    projectLoadError,
  } = useProjectContext();

  // Only an explicit URL param can name a project the user might not own; a
  // context-selected project always comes from their own accessible list.
  const urlProjectId =
    searchParams.get("projectId") || searchParams.get("project") || null;

  // Full accessible set (includes on-hold projects — access ≠ "active"). Keep
  // the matching object so ProjectContext can synchronize the selected project
  // before the page mounts and consumes its recordId query parameter.
  const accessibleProject = useMemo(
    () => (projects || []).find((project) => project?.id === urlProjectId),
    [projects, urlProjectId],
  );

  useEffect(() => {
    if (accessibleProject && activeProject?.id !== accessibleProject.id) {
      setActiveProject(accessibleProject);
    }
  }, [accessibleProject, activeProject?.id, setActiveProject]);

  if (!urlProjectId) return children;
  if (accessibleProject) {
    if (activeProject?.id !== accessibleProject.id) return <PageLoader />;
    return children;
  }
  // Not (yet) in the set: wait for a definitive answer before denying.
  if (loading) return <PageLoader />;
  // List couldn't load — fall back to rendering; RLS is the real guard.
  if (projectLoadError) return children;

  return (
    <div style={{ maxWidth: 520, margin: "48px auto", padding: "0 16px" }}>
      <EmptyState
        icon="alert"
        title="You don't have access to this project"
        body="This project isn't in your workspace, or your access to it was removed. Pick a project you have access to, or contact your project admin if you think this is a mistake."
        cta={
          <Link
            to="/"
            className="sbd-btn sbd-btn-primary"
            style={{ textDecoration: "none" }}
          >
            Go to Dashboard
          </Link>
        }
      />
    </div>
  );
}
